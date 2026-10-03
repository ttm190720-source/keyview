import { query } from "./db";
import { normalizeKeyword } from "./keyword";

const TREND_CACHE_DAYS = 7;
const pending = new Map<string, Promise<SearchTrendResult>>();

export type SearchTrendPoint = {
  period: string;
  estimatedSearches: number;
};

export type SearchTrendResult = {
  points: SearchTrendPoint[];
  fetchedAt: string | null;
  cacheState: "fresh" | "refreshed" | "stale" | "cache-only" | "unavailable";
};

type DailyTrendPoint = {
  period: string;
  ratio: number;
};

type TrendRow = {
  id: string;
  trend_data: SearchTrendPoint[] | null;
  trend_fetched_at: string | null;
  trend_basis_volume: string | null;
};

function ageInDays(value: string | null) {
  if (!value) return Infinity;
  return (Date.now() - new Date(value).getTime()) / 86_400_000;
}

function currentKstParts() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    year: nowKst.getUTCFullYear(),
    month: nowKst.getUTCMonth(),
    day: nowKst.getUTCDate(),
  };
}

function dailyTrendRange() {
  const { year, month, day } = currentKstParts();
  const start = new Date(Date.UTC(year, month - 24, 1));
  const end = new Date(Date.UTC(year, month, day - 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    currentMonth: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

function roundEstimate(value: number) {
  if (value >= 10_000) return Math.round(value / 100) * 100;
  if (value >= 1_000) return Math.round(value / 10) * 10;
  return Math.max(0, Math.round(value));
}

function estimateMonthlyVolumes(daily: DailyTrendPoint[], monthlySearchVolume: number) {
  if (!daily.length || monthlySearchVolume <= 0) return [];

  const calibration = daily.slice(-30);
  const calibrationRatio = calibration.reduce((sum, point) => sum + point.ratio, 0);
  if (calibration.length < 20 || calibrationRatio <= 0) return [];

  const scale = monthlySearchVolume / calibrationRatio;
  const { currentMonth } = dailyTrendRange();
  const monthly = new Map<string, number>();

  for (const point of daily) {
    const month = point.period.slice(0, 7);
    if (month >= currentMonth) continue;
    monthly.set(month, (monthly.get(month) ?? 0) + point.ratio * scale);
  }

  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([period, estimatedSearches]) => ({
      period,
      estimatedSearches: roundEstimate(estimatedSearches),
    }));
}

function isEstimatedPoint(value: unknown): value is SearchTrendPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.period === "string" &&
    Number.isFinite(Number(point.estimatedSearches))
  );
}

async function getStoredTrend(keyword: string) {
  const rows = await query<TrendRow>(
    `SELECT id, trend_data, trend_fetched_at, trend_basis_volume
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
     RETURNING id, trend_data, trend_fetched_at, trend_basis_volume`,
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

async function fetchDailyTrendFromNaver(keyword: string): Promise<DailyTrendPoint[]> {
  const clientId = process.env.NAVER_TREND_CLIENT_ID;
  const clientSecret = process.env.NAVER_TREND_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER Search Trend credentials are not configured");

  const allowed = await reserveDailyCall();
  if (!allowed) throw new Error("Keyview Search Trend daily API budget reached");

  const { startDate, endDate } = dailyTrendRange();
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
      timeUnit: "date",
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

  return (payload.results?.[0]?.data ?? [])
    .filter((item) => typeof item.period === "string" && Number.isFinite(Number(item.ratio)))
    .map((item) => ({
      period: String(item.period),
      ratio: Math.max(0, Number(item.ratio)),
    }));
}

async function refreshTrend(
  keyword: string,
  monthlySearchVolume: number,
): Promise<SearchTrendResult> {
  const normalized = normalizeKeyword(keyword);
  const existing = pending.get(normalized);
  if (existing) return existing;

  const task = (async () => {
    const row = await ensureKeywordRow(keyword);
    const previous = Array.isArray(row.trend_data)
      ? row.trend_data.filter(isEstimatedPoint)
      : [];

    try {
      const daily = await fetchDailyTrendFromNaver(keyword);
      const points = estimateMonthlyVolumes(daily, monthlySearchVolume);

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
         SET trend_data = $2::jsonb,
             trend_fetched_at = $3,
             trend_basis_volume = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, JSON.stringify(points), now, monthlySearchVolume],
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
  options: { allowApi: boolean; monthlySearchVolume: number },
): Promise<SearchTrendResult> {
  const clean = keyword.trim().slice(0, 80);
  const monthlySearchVolume = Math.max(0, Math.round(options.monthlySearchVolume));

  if (monthlySearchVolume <= 0) {
    return {
      points: [],
      fetchedAt: null,
      cacheState: "unavailable",
    };
  }

  const stored = await getStoredTrend(clean);
  const points = Array.isArray(stored?.trend_data)
    ? stored.trend_data.filter(isEstimatedPoint)
    : [];
  const fetchedAt = stored?.trend_fetched_at ?? null;
  const basisVolume = stored?.trend_basis_volume == null ? null : Number(stored.trend_basis_volume);
  const fresh =
    ageInDays(fetchedAt) <= TREND_CACHE_DAYS &&
    points.length >= 12 &&
    basisVolume === monthlySearchVolume;

  if (fresh) {
    return { points, fetchedAt, cacheState: "fresh" };
  }

  if (!options.allowApi) {
    return {
      points,
      fetchedAt,
      cacheState: points.length ? "cache-only" : "unavailable",
    };
  }

  return refreshTrend(clean, monthlySearchVolume);
}
