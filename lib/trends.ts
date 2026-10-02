export type TrendItem = {
  rank: number;
  keyword: string;
};

export type TrendSnapshot = {
  items: TrendItem[];
  updatedAt: string | null;
  source: "Daum";
};

const DAUM_HOME = "https://www.daum.net/";
const CACHE_SECONDS = 600;

function extractArray(text: string, start: number) {
  const open = text.indexOf("[", start);
  if (open < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }

  return null;
}

export async function getTrendingKeywords(limit = 10): Promise<TrendSnapshot> {
  try {
    const response = await fetch(DAUM_HOME, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; KeyviewTrend/1.0; +https://keyview-production.up.railway.app)",
        accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: CACHE_SECONDS },
    });

    if (!response.ok) throw new Error(`Daum trend fetch failed: ${response.status}`);

    const html = await response.text();
    const marker = '"uiType":"REALTIME_TREND_TOP"';
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) throw new Error("Daum realtime trend marker not found");

    const segment = html.slice(markerIndex, markerIndex + 80_000);
    const updatedMatch = segment.match(/"updatedAt"\s*:\s*"([^"]+)"/);
    const keywordsIndex = segment.indexOf('"keywords"');
    if (keywordsIndex < 0) throw new Error("Daum realtime trend keywords not found");

    const arrayText = extractArray(segment, keywordsIndex);
    if (!arrayText) throw new Error("Daum realtime trend array not found");

    const raw = JSON.parse(arrayText) as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    const items: TrendItem[] = [];

    for (const item of raw) {
      const value = item.keyword ?? item.text ?? item.title;
      if (typeof value !== "string") continue;

      const keyword = value.trim();
      if (!keyword || seen.has(keyword)) continue;

      seen.add(keyword);
      items.push({ rank: items.length + 1, keyword });
      if (items.length >= Math.max(1, limit)) break;
    }

    return {
      items,
      updatedAt: updatedMatch?.[1] ?? null,
      source: "Daum",
    };
  } catch {
    return {
      items: [],
      updatedAt: null,
      source: "Daum",
    };
  }
}

export function formatTrendUpdatedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
