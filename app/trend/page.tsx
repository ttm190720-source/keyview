import type { Metadata } from "next";
import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { formatTrendUpdatedAt, getTrendingKeywords } from "@/lib/trends";

export const metadata: Metadata = {
  title: "지금 뜨는 검색어",
  description: "현재 관심이 빠르게 늘고 있는 검색어를 확인하고 키뷰에서 네이버 월간 검색량과 관련 키워드를 바로 분석해보세요.",
};

export const dynamic = "force-dynamic";

export default async function TrendPage() {
  const trend = await getTrendingKeywords(10);
  const updatedAt = formatTrendUpdatedAt(trend.updatedAt);

  return (
    <div className="shell trendPage">
      <div className="trendSearch">
        <SearchBox compact />
      </div>

      <header className="trendPageHeader">
        <span className="eyebrow">REALTIME TREND</span>
        <h1>지금 뜨는 검색어</h1>
        <p>
          최근 관심이 빠르게 늘어난 검색어입니다. 키워드를 누르면 네이버 월간 검색량과 관련 키워드를 바로 확인할 수 있습니다.
        </p>
        <div className="trendMeta">
          <span>출처: Daum 실시간 트렌드</span>
          {updatedAt && <span>{updatedAt} 기준</span>}
          <span>약 10분 단위 갱신</span>
        </div>
      </header>

      {trend.items.length > 0 ? (
        <section className="trendListCard" aria-label="실시간 급상승 키워드">
          {trend.items.map((item) => (
            <Link
              className="trendListRow"
              href={`/k/${encodeURIComponent(item.keyword)}`}
              key={item.keyword}
              prefetch={false}
            >
              <span className="trendRank">{item.rank}</span>
              <strong>{item.keyword}</strong>
              <span className="trendAnalyze">검색량 보기 →</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="emptyResult">
          <h2>현재 트렌드 데이터를 불러오지 못했습니다.</h2>
          <p>외부 트렌드 제공처가 일시적으로 응답하지 않는 경우입니다. 일반 키워드 검색은 정상적으로 사용할 수 있습니다.</p>
        </section>
      )}

      <p className="trendSourceNote">
        이 순위는 네이버가 제공하는 실시간 검색어 순위가 아닙니다. 실시간 이슈 탐색용으로 제공하며,
        네이버 검색량 데이터는 키워드를 실제로 조회할 때만 키뷰의 캐시/API 정책에 따라 불러옵니다.
      </p>
    </div>
  );
}
