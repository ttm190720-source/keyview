import { query } from "./db";
import { normalizeKeyword } from "./keyword";

const TREND_CACHE_DAYS = 7;
const pending = new Map<string, Promise<SearchTrendResult>>();

export type SearchTrendPoint = {
  period: string;
  ratio: number;
};

export type SearchTrendResult = {
  points: SearchTrendPoint[];
  fetchedAt: string | null;
  cacheState: "fresh" | "refreshed" | "stale" | "cache-only" | "unavailable";
};

type TrendRow = {
  id: string;
  trend_data: SearchTrendPoint[] | null;
  trend_fetched_at: string | null;
};

function ageInDays(value: string | null) {
  if (!value) return Infinity;
  return (Date.now() - new Date(value).getTime()) / 86_400_000;
}

function dateRange24Months() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth();
  const day = nowKst.getUTCDate();

  const start = new Date(Date.UTC(year, month - 23, 1));
  const end = new Date(Date.UTC(year, month, day));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function getStoredTrend(keyword: string) {
  const rows = await query<TrendRow>(
    `SELECT id, trend_data, trend_fetched_at
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
  const rows = await query<TrendRow>(
    `INSERT INTO keywords (normalized_keyword, display_keyword)
     VALUES ($1, $2)
     ON CONFLICT (normalized_keyword)
     DO UPDATE SET display_keyword = EXCLUDED.display_keyword
     RETURNING id, trend_data, trend_fetched_at`,
    [normalized, clean],
  );
  return rows[0];
}

async function reserveDailyCall() {
  const budget = Math.max(1, Number(process.env.KEYVIEW_TREND_DAILY_API_BUDGET || 500));
  const rows = await query<{ call_count: number }>(
    `INSERT INTO trend_api_daily_usage (usage_day, call_count, updated_at)
     VALUES (CURRENT_DATE, 1, NOW())
     ON CONFLICT (usage_day)
     DO UPDATE SET
       call_count = trend_api_daily_usage.call_count + 1,
       updated_at = NOW()
     WHERE trend_api_daily_usage.call_count < $1
     RETURNING call_count`,
    [budget],
  );

  return rows.length > 0;
}

async function fetchTrendFromNaver(keyword: string): Promise<SearchTrendPoint[]> {
  const clientId = process.env.NAVER_TREND_CLIENT_ID;
  const clientSecret = process.env.NAVER_TREND_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER Search Trend credentials are not configured");

  const allowed = await reserveDailyCall();
  if (!allowed) throw new Error("Keyview Search Trend daily API budget reached");

  const { startDate, endDate } = dateRange24Months();
  const response = await fetch("https://naverapihub.apigw.ntruss.com/search-trend/v1/search", {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      timeUnit: "month",
      keywordGroups: [
        {
          groupName: keyword,
          keywords: [keyword],
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("[search-trend] NAVER API error", response.status, message.slice(0, 300));
    throw new Error(`NAVER Search Trend request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      data?: Array<{ period?: string; ratio?: number }>;
    }>;
  };

  const points = (payload.results?.[0]?.data ?? [])
    .filter((item) => typeof item.period === "string" && Number.isFinite(Number(item.ratio)))
    .map((item) => ({
      period: String(item.period),
      ratio: Number(Number(item.ratio).toFixed(2)),
    }))
    .slice(-24);

  return points;
}

async function refreshTrend(keyword: string): Promise<SearchTrendResult> {
  const normalized = normalizeKeyword(keyword);
  const existing = pending.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    const row = await ensureKeywordRow(keyword);
    const previous = Array.isArray(row.trend_data) ? row.trend_data : [];

    try {
      const points = await fetchTrendFromNaver(keyword);
      if (!points.length) {
        return {
          points: previous,
          fetchedAt: row.trend_fetched_at,
          cacheState: previous.length ? "stale" : "unavailable",
        } satisfies SearchTrendResult;
      }

      const now = new Date().toISOString();
      await query(
        `UPDATE keywords
         SET trend_data = $2::jsonb, trend_fetched_at = $3, updated_at = NOW()
         WHERE id = $1`,
        [row.id, JSON.stringify(points), now],
      );

      return {
        points,
        fetchedAt: now,
        cacheState: "refreshed",
      } satisfies SearchTrendResult;
    } catch (error) {
      console.error("[search-trend] refresh failed", error instanceof Error ? error.message : error);
      return {
        points: previous,
        fetchedAt: row.trend_fetched_at,
        cacheState: previous.length ? "stale" : "unavailable",
      } satisfies SearchTrendResult;
    }
  })().finally(() => pending.delete(normalized));

  pending.set(normalized, task);
  return task;
}

export async function getSearchTrend(
  keyword: string,
  options: { allowApi: boolean },
): Promise<SearchTrendResult> {
  const clean = keyword.trim().slice(0, 80);
  const stored = await getStoredTrend(clean);
  const points = Array.isArray(stored?.trend_data) ? stored.trend_data : [];
  const fetchedAt = stored?.trend_fetched_at ?? null;
  const fresh = ageInDays(fetchedAt) <= TREND_CACHE_DAYS;

  if (fresh && points.length) {
    return { points, fetchedAt, cacheState: "fresh" };
  }

  if (!options.allowApi) {
    return {
      points,
      fetchedAt,
      cacheState: points.length ? "cache-only" : "unavailable",
    };
  }

  return refreshTrend(clean);
}
