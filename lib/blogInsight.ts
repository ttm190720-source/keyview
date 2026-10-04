import { query } from "./db";
import { normalizeKeyword } from "./keyword";

const BLOG_CACHE_DAYS = 7;
const pending = new Map<string, Promise<BlogInsightResult>>();

export type BlogInsightResult = {
  total: number | null;
  postsPerDay: number | null;
  sampleDays: number | null;
  sampleSize: number | null;
  fetchedAt: string | null;
  cacheState: "fresh" | "refreshed" | "stale" | "cache-only" | "unavailable" | "disabled";
};

type BlogRow = {
  id: string;
  blog_total: string | null;
  blog_posts_per_day: string | null;
  blog_sample_days: number | null;
  blog_sample_size: number | null;
  blog_fetched_at: string | null;
};

function ageInDays(value: string | null) {
  if (!value) return Infinity;
  return (Date.now() - new Date(value).getTime()) / 86_400_000;
}

function toResult(row: BlogRow | null, cacheState: BlogInsightResult["cacheState"]): BlogInsightResult {
  return {
    total: row?.blog_total == null ? null : Number(row.blog_total),
    postsPerDay: row?.blog_posts_per_day == null ? null : Number(row.blog_posts_per_day),
    sampleDays: row?.blog_sample_days ?? null,
    sampleSize: row?.blog_sample_size ?? null,
    fetchedAt: row?.blog_fetched_at ?? null,
    cacheState,
  };
}

async function getStored(keyword: string) {
  const rows = await query<BlogRow>(
    `SELECT id, blog_total, blog_posts_per_day, blog_sample_days, blog_sample_size, blog_fetched_at
     FROM keywords
     WHERE normalized_keyword = $1
     LIMIT 1`,
    [normalizeKeyword(keyword)],
  );
  return rows[0] ?? null;
}

async function ensureKeywordRow(keyword: string) {
  const clean = keyword.trim().slice(0, 80);
  const normalized = normalizeKeyword(clean);
  const rows = await query<BlogRow>(
    `INSERT INTO keywords (normalized_keyword, display_keyword)
     VALUES ($1, $2)
     ON CONFLICT (normalized_keyword)
     DO UPDATE SET display_keyword = EXCLUDED.display_keyword
     RETURNING id, blog_total, blog_posts_per_day, blog_sample_days, blog_sample_size, blog_fetched_at`,
    [normalized, clean],
  );
  return rows[0];
}

async function reserveDailyCall() {
  const budget = Math.max(1, Number(process.env.KEYVIEW_BLOG_DAILY_API_BUDGET || 500));
  const rows = await query<{ call_count: number }>(
    `INSERT INTO blog_api_daily_usage (usage_day, call_count, updated_at)
     VALUES (CURRENT_DATE, 1, NOW())
     ON CONFLICT (usage_day)
     DO UPDATE SET
       call_count = blog_api_daily_usage.call_count + 1,
       updated_at = NOW()
     WHERE blog_api_daily_usage.call_count < $1
     RETURNING call_count`,
    [budget],
  );
  return rows.length > 0;
}

function parsePostDate(value: unknown) {
  const text = String(value || "");
  if (!/^\d{8}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6)) - 1;
  const day = Number(text.slice(6, 8));
  const time = Date.UTC(year, month, day);
  return Number.isFinite(time) ? time : null;
}

async function fetchBlogInsight(keyword: string) {
  const clientId = process.env.NAVER_TREND_CLIENT_ID;
  const clientSecret = process.env.NAVER_TREND_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER API HUB credentials are not configured");

  const allowed = await reserveDailyCall();
  if (!allowed) throw new Error("Keyview blog API daily budget reached");

  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/blog");
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "100");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "date");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("[blog-insight] NAVER API error", response.status, message.slice(0, 300));
    throw new Error(`NAVER Blog Search request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    total?: number;
    items?: Array<{ postdate?: string }>;
  };

  const dates = (payload.items ?? [])
    .map((item) => parsePostDate(item.postdate))
    .filter((value): value is number => value != null)
    .sort((a, b) => b - a);

  let sampleDays = 0;
  let postsPerDay = 0;
  if (dates.length) {
    const newest = dates[0];
    const oldest = dates[dates.length - 1];
    sampleDays = Math.max(1, Math.floor((newest - oldest) / 86_400_000) + 1);
    postsPerDay = Number((dates.length / sampleDays).toFixed(3));
  }

  return {
    total: Math.max(0, Number(payload.total || 0)),
    postsPerDay,
    sampleDays,
    sampleSize: dates.length,
  };
}

async function refresh(keyword: string): Promise<BlogInsightResult> {
  const normalized = normalizeKeyword(keyword);
  const existing = pending.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    const row = await ensureKeywordRow(keyword);

    try {
      const data = await fetchBlogInsight(keyword);
      const now = new Date().toISOString();
      await query(
        `UPDATE keywords
         SET blog_total = $2,
             blog_posts_per_day = $3,
             blog_sample_days = $4,
             blog_sample_size = $5,
             blog_fetched_at = $6,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, data.total, data.postsPerDay, data.sampleDays, data.sampleSize, now],
      );

      return {
        total: data.total,
        postsPerDay: data.postsPerDay,
        sampleDays: data.sampleDays,
        sampleSize: data.sampleSize,
        fetchedAt: now,
        cacheState: "refreshed",
      } satisfies BlogInsightResult;
    } catch (error) {
      console.error("[blog-insight] refresh failed", error instanceof Error ? error.message : error);
      const stored = await getStored(keyword);
      return toResult(stored, stored?.blog_fetched_at ? "stale" : "unavailable");
    }
  })().finally(() => pending.delete(normalized));

  pending.set(normalized, task);
  return task;
}

export async function getBlogInsight(
  keyword: string,
  options: { allowApi: boolean },
): Promise<BlogInsightResult> {
  const clean = keyword.trim().slice(0, 80);
  const stored = await getStored(clean);
  const fresh = ageInDays(stored?.blog_fetched_at ?? null) <= BLOG_CACHE_DAYS;

  if (fresh && stored?.blog_fetched_at) {
    return toResult(stored, "fresh");
  }

  if (process.env.KEYVIEW_BLOG_INSIGHT_ENABLED !== "true") {
    return toResult(stored, stored?.blog_fetched_at ? "stale" : "disabled");
  }

  if (!options.allowApi) {
    return toResult(stored, stored?.blog_fetched_at ? "cache-only" : "unavailable");
  }

  return refresh(clean);
}

export function blogActivityLabel(postsPerDay: number | null) {
  if (postsPerDay == null) return "데이터 없음";
  if (postsPerDay >= 20) return "매우 활발";
  if (postsPerDay >= 5) return "활발";
  if (postsPerDay >= 1) return "보통";
  if (postsPerDay > 0) return "낮음";
  return "데이터 없음";
}
