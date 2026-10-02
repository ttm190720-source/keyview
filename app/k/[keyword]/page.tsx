import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import SearchBox from "@/components/SearchBox";
import RelatedTable from "@/components/RelatedTable";
import { getKeywordResult, logSearch } from "@/lib/data";
import { displayCount, isKnownBot, isPrefetchRequest, totalCount } from "@/lib/keyword";

type Props = { params: Promise<{ keyword: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword);
  return {
    title: `${decoded} 검색량·관련 키워드`,
    description: `${decoded}의 네이버 월간 검색량과 관련 검색어를 검색량 순으로 확인하세요.`,
  };
}

export const dynamic = "force-dynamic";

export default async function KeywordPage({ params }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword).trim();
  const headerList = await headers();
  const bot = isKnownBot(headerList.get("user-agent") || "");
  const prefetch = isPrefetchRequest(headerList);
  const realVisit = !bot && !prefetch;

  if (realVisit) await logSearch(decoded);
  const result = await getKeywordResult(decoded, { allowApi: realVisit });
  const total = totalCount(result.pc, result.mobile);
  const isStale = result.cacheState === "stale" || result.cacheState === "cache-only";

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
