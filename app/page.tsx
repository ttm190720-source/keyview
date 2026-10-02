import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { getPopularKeywords } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const popular = await getPopularKeywords();

  return (
    <div className="shell home">
      <section className="hero">
        <span className="eyebrow">KEYWORD DISCOVERY</span>
        <h1>검색어 하나에서<br />다음 검색어를 발견하세요.</h1>
        <p>네이버 월간 검색량과 관련 키워드를 검색량 순으로 보고, 클릭하면서 계속 탐색할 수 있습니다.</p>
        <SearchBox />
        <div className="promiseRow">
          <span>무료</span><span>회원가입 없음</span><span>캐시 우선 조회</span>
        </div>
      </section>

      <section className="popularCard">
        <div className="sectionHeading simple">
          <div><h2>최근 많이 찾은 키워드</h2><p>키뷰 안에서 최근 7일간 많이 탐색된 검색어입니다.</p></div>
        </div>
        {popular.length ? (
          <div className="chips">
            {popular.map((item) => (
              <Link
                href={`/k/${encodeURIComponent(item.display_keyword)}`}
                key={item.display_keyword}
                prefetch={false}
              >
                {item.display_keyword}
              </Link>
            ))}
          </div>
        ) : (
          <p className="empty">아직 검색 기록이 없습니다. 첫 키워드를 검색해보세요.</p>
        )}
      </section>

      <section className="how">
        <article><b>1</b><h3>검색</h3><p>궁금한 검색어 하나만 입력합니다.</p></article>
        <article><b>2</b><h3>비교</h3><p>관련 검색어를 월 검색량 순으로 확인합니다.</p></article>
        <article><b>3</b><h3>탐색</h3><p>키워드를 클릭해 다음 관련어로 계속 이동합니다.</p></article>
      </section>
    </div>
  );
}
