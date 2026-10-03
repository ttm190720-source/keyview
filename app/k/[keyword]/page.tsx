import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import SearchBox from "@/components/SearchBox";
import RelatedTable from "@/components/RelatedTable";
import SearchTrendChart from "@/components/SearchTrendChart";
import { getKeywordResult } from "@/lib/data";
import { getSearchTrend } from "@/lib/searchTrend";
import { displayCount, isKnownBot, isPrefetchRequest, totalCount } from "@/lib/keyword";

type Props = { params: Promise<{ keyword: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  return {
    title: `${decoded} 검색량·관련 키워드`,
    description: `${decoded}의 네이버 월간 검색량, 최근 24개월 월별 추정 검색량과 관련 검색어를 확인하세요.`,
  };
}

export const dynamic = "force-dynamic";

function formatMonth(period: string) {
  const [year, month] = period.split("-");
  return `${year}년 ${Number(month)}월`;
}

function trendSummary(points: Array<{ period: string; estimatedSearches: number }>) {
  if (!points.length) return null;

  const peak = points.reduce(
    (best, point) => (point.estimatedSearches > best.estimatedSearches ? point : best),
    points[0],
  );

  if (points.length < 6) {
    return {
      peakMonth: formatMonth(peak.period),
      movement: "데이터 축적 중",
    };
  }

  const recent = points.slice(-3);
  const previous = points.slice(-6, -3);
  const average = (items: typeof recent) =>
    items.reduce((sum, item) => sum + item.estimatedSearches, 0) / items.length;

  const recentAverage = average(recent);
  const previousAverage = average(previous);

  if (previousAverage <= 0) {
    return {
      peakMonth: formatMonth(peak.period),
      movement: "비교 데이터 부족",
    };
  }

  const change = ((recentAverage - previousAverage) / previousAverage) * 100;
  const abs = Math.abs(change);

  return {
    peakMonth: formatMonth(peak.period),
    movement:
      abs < 3
        ? "최근 3개월 평균 비슷함"
        : change > 0
          ? `최근 3개월 평균 +${abs.toFixed(0)}%`
          : `최근 3개월 평균 -${abs.toFixed(0)}%`,
  };
}

export default async function KeywordPage({ params }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword).trim();
  const headerList = await headers();
  const bot = isKnownBot(headerList.get("user-agent") || "");
  const prefetch = isPrefetchRequest(headerList);
  const realVisit = !bot && !prefetch;

  const result = await getKeywordResult(decoded, { allowApi: realVisit });
  const total = totalCount(result.pc, result.mobile);
  const searchTrend = await getSearchTrend(decoded, {
    allowApi: realVisit,
    monthlySearchVolume: total,
  });

  const isStale = result.cacheState === "stale" || result.cacheState === "cache-only";
  const summary = trendSummary(searchTrend.points);

  return (
    <div className="shell resultPage">
      <div className="resultSearch"><SearchBox initial={decoded} compact /></div>

      <nav className="crumbs"><Link href="/" prefetch={false}>홈</Link><span>›</span><strong>{decoded}</strong></nav>

      <section className="keywordHero">
        <div>
          <span className="eyebrow">MONTHLY SEARCH</span>
          <h1>{decoded}</h1>
          <p>월간 예상 검색량</p>
        </div>
        <div className="bigNumber">{total ? total.toLocaleString("ko-KR") : "10 미만"}</div>
      </section>

      <section className="volumeGrid">
        <article><span>PC 검색량</span><strong>{displayCount(result.pc, result.pcLow)}</strong></article>
        <article><span>모바일 검색량</span><strong>{displayCount(result.mobile, result.mobileLow)}</strong></article>
        <article><span>데이터 상태</span><strong>{isStale ? "저장 데이터" : "최신 조회"}</strong></article>
      </section>

      {searchTrend.points.length > 1 && summary && (
        <section className="searchTrendSection">
          <div className="sectionHeading">
            <div>
              <h2>월별 추정 검색량</h2>
              <p>현재 월간 검색량과 네이버 검색 트렌드를 결합해 최근 24개월 규모를 추정했습니다.</p>
            </div>
            <span className="trendCacheBadge">
              {searchTrend.cacheState === "refreshed" ? "방금 업데이트" : "저장 데이터"}
            </span>
          </div>

          <div className="searchTrendStats">
            <article>
              <span>최고 검색 월</span>
              <strong>{summary.peakMonth}</strong>
            </article>
            <article>
              <span>최근 흐름</span>
              <strong>{summary.movement}</strong>
            </article>
          </div>

          <SearchTrendChart points={searchTrend.points} />
          <p className="searchTrendNote">
            월별 검색량은 네이버 검색광고의 현재 월간 검색량과 검색어 트렌드의 일별 상대지수를 결합해 환산한 추정치입니다.
            실제 과거 검색량과 차이가 있을 수 있으며, 완료된 월만 표시합니다.
          </p>
        </section>
      )}

      {result.related.length ? (
        <RelatedTable items={result.related} />
      ) : (
        <section className="emptyResult">
          <h2>관련 키워드 데이터가 아직 없습니다.</h2>
          <p>{!realVisit ? "자동 미리보기 요청에서는 외부 API를 호출하지 않습니다." : "네이버 키워드 도구 응답이 지연되었거나 일시적으로 사용할 수 없습니다."}</p>
        </section>
      )}

      <p className="dataNote">검색량은 네이버 검색광고 키워드 도구의 월간 예상 데이터를 기반으로 하며 실제 검색량과 차이가 있을 수 있습니다.</p>
    </div>
  );
}
