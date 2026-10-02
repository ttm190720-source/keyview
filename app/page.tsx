import SearchBox from "@/components/SearchBox";
import TrendTicker from "@/components/TrendTicker";
import { formatTrendUpdatedAt, getTrendingKeywords } from "@/lib/trends";

export const dynamic = "force-dynamic";

export default async function Home() {
  const trend = await getTrendingKeywords(10);
  const updatedAt = formatTrendUpdatedAt(trend.updatedAt);

  return (
    <div className="shell home">
      <section className="hero">
        <span className="eyebrow">KEYWORD DISCOVERY</span>
        <h1>검색어 하나에서<br />다음 검색어를 발견하세요.</h1>
        <p>네이버 월간 검색량과 관련 키워드를 검색량 순으로 보고, 클릭하면서 계속 탐색할 수 있습니다.</p>
        <SearchBox />

        <TrendTicker items={trend.items} updatedAt={updatedAt} />

        <div className="promiseRow">
          <span>무료</span><span>회원가입 없음</span><span>캐시 우선 조회</span>
        </div>
      </section>

      <section className="how">
        <article><b>1</b><h3>검색</h3><p>궁금한 검색어 하나만 입력합니다.</p></article>
        <article><b>2</b><h3>비교</h3><p>관련 검색어를 월 검색량 순으로 확인합니다.</p></article>
        <article><b>3</b><h3>탐색</h3><p>키워드를 클릭해 다음 관련어로 계속 이동합니다.</p></article>
      </section>
    </div>
  );
}
