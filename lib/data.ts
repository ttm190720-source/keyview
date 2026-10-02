import { query, withClient } from "./db";
import { normalizeKeyword } from "./keyword";
import { fetchRelatedKeywords, NaverRateLimitError, parseNaverCount } from "./naver";

const FRESH_DAYS = 7;
const MAX_STALE_DAYS = 30;
const pending = new Map<string, Promise<void>>();

export class ApiBudgetExceededError extends Error {}

type KeywordRow = {
  id: string;
  normalized_keyword: string;
  display_keyword: string;
  monthly_pc: string | null;
  monthly_mobile: string | null;
  pc_low: boolean;
  mobile_low: boolean;
  relations_fetched_at: string | null;
};

export type RelatedKeyword = {
  keyword: string;
  pc: number | null;
  mobile: number | null;
  pcLow: boolean;
  mobileLow: boolean;
  total: number;
};

export type KeywordResult = {
  keyword: string;
  pc: number | null;
  mobile: number | null;
  pcLow: boolean;
  mobileLow: boolean;
  related: RelatedKeyword[];
  cacheState: "fresh" | "stale" | "refreshed" | "cache-only" | "unavailable";
  fetchedAt: string | null;
};

function ageInDays(date: string | null) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / 86_400_000;
}

async function ensureKeyword(keyword: string) {
  const normalized = normalizeKeyword(keyword);
  const rows = await query<KeywordRow>(
    `INSERT INTO keywords (normalized_keyword, display_keyword)
     VALUES ($1, $2)
     ON CONFLICT (normalized_keyword)
     DO UPDATE SET display_keyword = EXCLUDED.display_keyword
     RETURNING *`,
    [normalized, keyword.trim()],
  );
  return rows[0];
}

async function getKeyword(keyword: string) {
  const rows = await query<KeywordRow>(
    `SELECT * FROM keywords WHERE normalized_keyword = $1 LIMIT 1`,
    [normalizeKeyword(keyword)],
  );
  return rows[0] ?? null;
}

async function getRelated(parentId: string) {
  const rows = await query<{
    display_keyword: string;
    monthly_pc: string | null;
    monthly_mobile: string | null;
    pc_low: boolean;
    mobile_low: boolean;
  }>(
    `SELECT k.display_keyword, k.monthly_pc, k.monthly_mobile, k.pc_low, k.mobile_low
     FROM keyword_relations r
     JOIN keywords k ON k.id = r.child_keyword_id
     WHERE r.parent_keyword_id = $1
     ORDER BY (COALESCE(k.monthly_pc, 0) + COALESCE(k.monthly_mobile, 0)) DESC, r.rank ASC
     LIMIT 100`,
    [parentId],
  );

  return rows.map((row) => {
    const pc = row.monthly_pc == null ? null : Number(row.monthly_pc);
    const mobile = row.monthly_mobile == null ? null : Number(row.monthly_mobile);
    return {
      keyword: row.display_keyword,
      pc,
      mobile,
      pcLow: row.pc_low,
      mobileLow: row.mobile_low,
      total: (pc ?? 0) + (mobile ?? 0),
    };
  });
}

async function refreshKeyword(keyword: string) {
  const normalized = normalizeKeyword(keyword);
  const existing = pending.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    const budget = Math.max(1, Number(process.env.KEYVIEW_DAILY_API_BUDGET || 1000));
    const usageRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM api_call_events WHERE requested_at >= NOW() - INTERVAL '24 hours'`,
    );
    if (Number(usageRows[0]?.count || 0) >= budget) {
      throw new ApiBudgetExceededError("Keyview daily upstream API budget reached");
    }

    let list;
    try {
      list = await fetchRelatedKeywords(keyword);
      await query(`INSERT INTO api_call_events (normalized_keyword, status) VALUES ($1, 'ok')`, [normalized]);
    } catch (error) {
      const status = error instanceof NaverRateLimitError ? "429" : "error";
      await query(`INSERT INTO api_call_events (normalized_keyword, status) VALUES ($1, $2)`, [normalized, status]);
      throw error;
    }

    const now = new Date();

    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const parentResult = await client.query<KeywordRow>(
          `INSERT INTO keywords (normalized_keyword, display_keyword, relations_fetched_at, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (normalized_keyword)
           DO UPDATE SET display_keyword = EXCLUDED.display_keyword,
                         relations_fetched_at = EXCLUDED.relations_fetched_at,
                         updated_at = NOW()
           RETURNING *`,
          [normalized, keyword.trim(), now],
        );
        const parent = parentResult.rows[0];

        await client.query(`DELETE FROM keyword_relations WHERE parent_keyword_id = $1`, [parent.id]);

        let rank = 0;
        for (const item of list) {
          const childKeyword = String(item.relKeyword || "").trim();
          if (!childKeyword) continue;
          const childNormalized = normalizeKeyword(childKeyword);
          const pc = parseNaverCount(item.monthlyPcQcCnt);
          const mobile = parseNaverCount(item.monthlyMobileQcCnt);

          const childResult = await client.query<{ id: string }>(
            `INSERT INTO keywords (
               normalized_keyword, display_keyword, monthly_pc, monthly_mobile,
               pc_low, mobile_low, volume_fetched_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (normalized_keyword)
             DO UPDATE SET display_keyword = EXCLUDED.display_keyword,
                           monthly_pc = EXCLUDED.monthly_pc,
                           monthly_mobile = EXCLUDED.monthly_mobile,
                           pc_low = EXCLUDED.pc_low,
                           mobile_low = EXCLUDED.mobile_low,
                           volume_fetched_at = EXCLUDED.volume_fetched_at,
                           updated_at = NOW()
             RETURNING id`,
            [childNormalized, childKeyword, pc.value, mobile.value, pc.low, mobile.low, now],
          );

          const childId = childResult.rows[0].id;
          await client.query(
            `INSERT INTO keyword_relations (parent_keyword_id, child_keyword_id, rank, fetched_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (parent_keyword_id, child_keyword_id)
             DO UPDATE SET rank = EXCLUDED.rank, fetched_at = EXCLUDED.fetched_at`,
            [parent.id, childId, rank++, now],
          );
        }

        const self = list.find((item) => normalizeKeyword(item.relKeyword || "") === normalized);
        if (self) {
          const pc = parseNaverCount(self.monthlyPcQcCnt);
          const mobile = parseNaverCount(self.monthlyMobileQcCnt);
          await client.query(
            `UPDATE keywords
             SET monthly_pc = $2, monthly_mobile = $3, pc_low = $4, mobile_low = $5,
                 volume_fetched_at = $6, updated_at = NOW()
             WHERE id = $1`,
            [parent.id, pc.value, mobile.value, pc.low, mobile.low, now],
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  })().finally(() => pending.delete(normalized));

  pending.set(normalized, task);
  return task;
}

export async function getKeywordResult(keyword: string, options: { allowApi: boolean }): Promise<KeywordResult> {
  const clean = keyword.trim().slice(0, 80);
  let row = await getKeyword(clean);

  if (!row && !options.allowApi) {
    return {
      keyword: clean,
      pc: null,
      mobile: null,
      pcLow: false,
      mobileLow: false,
      related: [],
      cacheState: "cache-only",
      fetchedAt: null,
    };
  }

  row = row ?? (await ensureKeyword(clean));
  const age = ageInDays(row.relations_fetched_at);
  let cacheState: KeywordResult["cacheState"] = age <= FRESH_DAYS ? "fresh" : "stale";

  if (options.allowApi && age > MAX_STALE_DAYS) {
    try {
      await refreshKeyword(clean);
      cacheState = "refreshed";
    } catch (error) {
      if (error instanceof NaverRateLimitError) cacheState = "stale";
      else cacheState = "unavailable";
    }
    row = (await getKeyword(clean)) ?? row;
  } else if (!options.allowApi && age > FRESH_DAYS) {
    cacheState = "cache-only";
  }

  const related = await getRelated(row.id);
  return {
    keyword: row.display_keyword,
    pc: row.monthly_pc == null ? null : Number(row.monthly_pc),
    mobile: row.monthly_mobile == null ? null : Number(row.monthly_mobile),
    pcLow: row.pc_low,
    mobileLow: row.mobile_low,
    related,
    cacheState,
    fetchedAt: row.relations_fetched_at,
  };
}

export async function logSearch(keyword: string) {
  const row = await ensureKeyword(keyword);
  await query(`INSERT INTO search_events (keyword_id) VALUES ($1)`, [row.id]);
}

export async function getPopularKeywords(limit = 12) {
  try {
    return await query<{ display_keyword: string; searches: string }>(
      `SELECT k.display_keyword, COUNT(*)::text AS searches
       FROM search_events s
       JOIN keywords k ON k.id = s.keyword_id
       WHERE s.searched_at >= NOW() - INTERVAL '7 days'
       GROUP BY k.id, k.display_keyword
       ORDER BY COUNT(*) DESC, MAX(s.searched_at) DESC
       LIMIT $1`,
      [limit],
    );
  } catch {
    return [];
  }
}
