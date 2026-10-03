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
    description: `${decoded}의 네이버 월간 검색량, 최근 검색 트렌드와 관련 검색어를 확인하세요.`,
  };
}

export const dynamic = "force-dynamic";

function formatMonth(period: string) {
  const [year, month] = period.split("-");
  return `${year}년 ${Number(month)}월`;
}

function trendSummary(points: Array<{ period: string; ratio: number }>) {
  if (!points.length) return null;

  const peak = points.reduce((best, point) => (point.ratio > best.ratio ? point : best), points[0]);

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentMonth = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, "0")}`;
  const completed = points.filter((point) => !point.period.startsWith(currentMonth));
  const basis = completed.length >= 6 ? completed : points;

  if (basis.length < 6) {
    return {
      peakMonth: formatMonth(peak.period),
      movement: "데이터 축적 중",
    };
  }

  const recent = basis.slice(-3);
  const previous = basis.slice(-6, -3);
  const average = (items: typeof recent) => items.reduce((sum, item) => sum + item.ratio, 0) / items.length;
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
        ? "최근 3개월 비슷함"
        : change > 0
          ? `최근 3개월 +${abs.toFixed(0)}%`
          : `최근 3개월 -${abs.toFixed(0)}%`,
  };
}

export default async function KeywordPage({ params }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword).trim();
  const headerList = await headers();
  const bot = isKnownBot(headerList.get("user-agent") || "");
  const prefetch = isPrefetchRequest(headerList);
  const realVisit = !bot && !prefetch;

  const [result, searchTrend] = await Promise.all([
    getKeywordResult(decoded, { allowApi: realVisit }),
    getSearchTrend(decoded, { allowApi: realVisit }),
  ]);

  const total = totalCount(result.pc, result.mobile);
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
              <h2>검색 트렌드</h2>
              <p>최근 24개월 네이버 통합검색의 월별 검색 관심도 추이입니다.</p>
            </div>
            <span className="trendCacheBadge">
              {searchTrend.cacheState === "refreshed" ? "방금 업데이트" : "저장 데이터"}
            </span>
          </div>

          <div className="searchTrendStats">
            <article>
              <span>최고 관심 월</span>
              <strong>{summary.peakMonth}</strong>
            </article>
            <article>
              <span>최근 흐름</span>
              <strong>{summary.movement}</strong>
            </article>
          </div>

          <SearchTrendChart points={searchTrend.points} />
          <p className="searchTrendNote">
            검색 관심도는 조회 기간 중 가장 높은 검색량을 100으로 환산한 상대 지수입니다.
            현재 월 데이터는 진행 중인 기간이라 변동될 수 있습니다.
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
