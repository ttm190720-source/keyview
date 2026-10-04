import { query } from "./db";
import { normalizeKeyword } from "./keyword";

const SHOPPING_CACHE_DAYS = 7;
const pending = new Map<string, Promise<ShoppingInsightResult>>();

export const SHOPPING_CATEGORIES = [
  { code: "50000000", name: "패션의류" },
  { code: "50000001", name: "패션잡화" },
  { code: "50000002", name: "화장품/미용" },
  { code: "50000003", name: "디지털/가전" },
  { code: "50000004", name: "가구/인테리어" },
  { code: "50000005", name: "출산/육아" },
  { code: "50000006", name: "식품" },
  { code: "50000007", name: "스포츠/레저" },
  { code: "50000008", name: "생활/건강" },
  { code: "50000009", name: "여가/생활편의" },
  { code: "50000010", name: "면세점" },
  { code: "50005542", name: "도서" },
] as const;

export type ShoppingTrendPoint = {
  period: string;
  ratio: number;
};

export type ShoppingGroupPoint = {
  group: string;
  ratio: number;
};

export type ShoppingInsightResult = {
  categoryCode: string;
  categoryName: string;
  trend: ShoppingTrendPoint[];
  device: ShoppingGroupPoint[];
  age: ShoppingGroupPoint[];
  fetchedAt: string | null;
  cacheState: "fresh" | "refreshed" | "stale" | "cache-only" | "unavailable" | "disabled";
};

type ShoppingRow = {
  trend_data: ShoppingTrendPoint[] | null;
  device_data: ShoppingGroupPoint[] | null;
  age_data: ShoppingGroupPoint[] | null;
  fetched_at: string | null;
  category_name: string;
};

function ageInDays(value: string | null) {
  if (!value) return Infinity;
  return (Date.now() - new Date(value).getTime()) / 86_400_000;
}

export function getShoppingCategory(code: string) {
  return SHOPPING_CATEGORIES.find((item) => item.code === code) ?? null;
}

function completed12MonthRange() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();
  const month = nowKst.getUTCMonth();

  const end = new Date(Date.UTC(year, month, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function toResult(
  row: ShoppingRow | null,
  categoryCode: string,
  categoryName: string,
  cacheState: ShoppingInsightResult["cacheState"],
): ShoppingInsightResult {
  return {
    categoryCode,
    categoryName,
    trend: Array.isArray(row?.trend_data) ? row!.trend_data : [],
    device: Array.isArray(row?.device_data) ? row!.device_data : [],
    age: Array.isArray(row?.age_data) ? row!.age_data : [],
    fetchedAt: row?.fetched_at ?? null,
    cacheState,
  };
}

async function getKeywordId(keyword: string) {
  const clean = keyword.trim().slice(0, 80);
  const normalized = normalizeKeyword(clean);
  const rows = await query<{ id: string }>(
    `INSERT INTO keywords (normalized_keyword, display_keyword)
     VALUES ($1, $2)
     ON CONFLICT (normalized_keyword)
     DO UPDATE SET display_keyword = EXCLUDED.display_keyword
     RETURNING id`,
    [normalized, clean],
  );
  return rows[0].id;
}

async function getStored(keywordId: string, categoryCode: string) {
  const rows = await query<ShoppingRow>(
    `SELECT trend_data, device_data, age_data, fetched_at, category_name
     FROM shopping_insights
     WHERE keyword_id = $1 AND category_code = $2
     LIMIT 1`,
    [keywordId, categoryCode],
  );
  return rows[0] ?? null;
}

async function reserveCalls(count: number) {
  const budget = Math.max(3, Number(process.env.KEYVIEW_SHOPPING_DAILY_API_BUDGET || 300));
  const rows = await query<{ call_count: number }>(
    `INSERT INTO shopping_api_daily_usage (usage_day, call_count, updated_at)
     VALUES (CURRENT_DATE, $1, NOW())
     ON CONFLICT (usage_day)
     DO UPDATE SET
       call_count = shopping_api_daily_usage.call_count + EXCLUDED.call_count,
       updated_at = NOW()
     WHERE shopping_api_daily_usage.call_count + EXCLUDED.call_count <= $2
     RETURNING call_count`,
    [count, budget],
  );
  return rows.length > 0;
}

async function postShopping(path: string, body: Record<string, unknown>) {
  const clientId = process.env.NAVER_TREND_CLIENT_ID;
  const clientSecret = process.env.NAVER_TREND_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER API HUB credentials are not configured");

  const response = await fetch(`https://naverapihub.apigw.ntruss.com${path}`, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("[shopping-insight] NAVER API error", response.status, path, message.slice(0, 300));
    throw new Error(`NAVER Shopping Insight request failed: ${response.status}`);
  }

  return (await response.json()) as {
    results?: Array<{
      data?: Array<{ period?: string; ratio?: number; group?: string }>;
    }>;
  };
}

function compactTrend(payload: Awaited<ReturnType<typeof postShopping>>) {
  return (payload.results?.[0]?.data ?? [])
    .filter((item) => typeof item.period === "string" && Number.isFinite(Number(item.ratio)))
    .map((item) => ({
      period: String(item.period).slice(0, 7),
      ratio: Number(Number(item.ratio).toFixed(2)),
    }))
    .slice(-12);
}

function compactGroups(payload: Awaited<ReturnType<typeof postShopping>>) {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const item of payload.results?.[0]?.data ?? []) {
    const group = String(item.group || "");
    const ratio = Number(item.ratio);
    if (!group || !Number.isFinite(ratio)) continue;
    const current = sums.get(group) ?? { sum: 0, count: 0 };
    current.sum += ratio;
    current.count += 1;
    sums.set(group, current);
  }

  return Array.from(sums.entries())
    .map(([group, value]) => ({
      group,
      ratio: Number((value.sum / Math.max(1, value.count)).toFixed(2)),
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

async function refresh(
  keyword: string,
  categoryCode: string,
  categoryName: string,
): Promise<ShoppingInsightResult> {
  const key = `${normalizeKeyword(keyword)}:${categoryCode}`;
  const existing = pending.get(key);
  if (existing) return existing;

  const task = (async () => {
    const keywordId = await getKeywordId(keyword);
    const previous = await getStored(keywordId, categoryCode);

    try {
      const allowed = await reserveCalls(3);
      if (!allowed) throw new Error("Keyview shopping API daily budget reached");

      const { startDate, endDate } = completed12MonthRange();
      const common = {
        startDate,
        endDate,
        timeUnit: "month",
        category: categoryCode,
      };

      const [trendPayload, devicePayload, agePayload] = await Promise.all([
        postShopping("/shopping/v1/category/keywords", {
          ...common,
          keyword: [{ name: keyword, param: [keyword] }],
        }),
        postShopping("/shopping/v1/category/keyword/device", {
          ...common,
          keyword,
        }),
        postShopping("/shopping/v1/category/keyword/age", {
          ...common,
          keyword,
        }),
      ]);

      const trend = compactTrend(trendPayload);
      const device = compactGroups(devicePayload);
      const age = compactGroups(agePayload);
      const now = new Date().toISOString();

      await query(
        `INSERT INTO shopping_insights (
           keyword_id, category_code, category_name,
           trend_data, device_data, age_data, fetched_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (keyword_id, category_code)
         DO UPDATE SET
           category_name = EXCLUDED.category_name,
           trend_data = EXCLUDED.trend_data,
           device_data = EXCLUDED.device_data,
           age_data = EXCLUDED.age_data,
           fetched_at = EXCLUDED.fetched_at`,
        [
          keywordId,
          categoryCode,
          categoryName,
          JSON.stringify(trend),
          JSON.stringify(device),
          JSON.stringify(age),
          now,
        ],
      );

      return {
        categoryCode,
        categoryName,
        trend,
        device,
        age,
        fetchedAt: now,
        cacheState: "refreshed",
      } satisfies ShoppingInsightResult;
    } catch (error) {
      console.error("[shopping-insight] refresh failed", error instanceof Error ? error.message : error);
      return toResult(previous, categoryCode, categoryName, previous?.fetched_at ? "stale" : "unavailable");
    }
  })().finally(() => pending.delete(key));

  pending.set(key, task);
  return task;
}

export async function getShoppingInsight(
  keyword: string,
  categoryCode: string,
  options: { allowApi: boolean },
): Promise<ShoppingInsightResult | null> {
  const category = getShoppingCategory(categoryCode);
  if (!category) return null;

  const keywordId = await getKeywordId(keyword);
  const stored = await getStored(keywordId, categoryCode);
  const fresh = ageInDays(stored?.fetched_at ?? null) <= SHOPPING_CACHE_DAYS;

  if (fresh && stored?.fetched_at) {
    return toResult(stored, category.code, category.name, "fresh");
  }

  if (process.env.KEYVIEW_SHOPPING_INSIGHT_ENABLED !== "true") {
    return toResult(stored, category.code, category.name, stored?.fetched_at ? "stale" : "disabled");
  }

  if (!options.allowApi) {
    return toResult(stored, category.code, category.name, stored?.fetched_at ? "cache-only" : "unavailable");
  }

  return refresh(keyword.trim().slice(0, 80), category.code, category.name);
}

export function shoppingDeviceShare(device: ShoppingGroupPoint[]) {
  const pc = device.find((item) => item.group === "pc")?.ratio ?? 0;
  const mo = device.find((item) => item.group === "mo")?.ratio ?? 0;
  const total = pc + mo;
  return total > 0 ? Math.round((mo / total) * 100) : null;
}

export function shoppingTopAges(age: ShoppingGroupPoint[]) {
  const labels: Record<string, string> = {
    "10": "10대",
    "20": "20대",
    "30": "30대",
    "40": "40대",
    "50": "50대",
    "60": "60대+",
  };

  return age
    .slice()
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 2)
    .map((item) => labels[item.group] ?? item.group);
}
