import Link from "next/link";
import { headers } from "next/headers";
import SearchBox from "@/components/SearchBox";
import { getKeywordResult } from "@/lib/data";
import { getBlogInsight, blogActivityLabel } from "@/lib/blogInsight";
import { isKnownBot, isPrefetchRequest, totalCount } from "@/lib/keyword";

type Props = { params: Promise<{ keyword: string }> };

export const dynamic = "force-dynamic";

function ratioLabel(monthlySearchVolume: number, blogTotal: number | null) {
  if (!blogTotal || blogTotal <= 0 || monthlySearchVolume <= 0) return "—";
  const value = monthlySearchVolume / blogTotal;
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

export default async function BlogAnalysisPage({ params }: Props) {
  const { keyword } = await params;
  const decoded = decodeURIComponent(keyword).trim();
  const headerList = await headers();
  const bot = isKnownBot(headerList.get("user-agent") || "");
  const prefetch = isPrefetchRequest(headerList);
  const realVisit = !bot && !prefetch;

  const result = await getKeywordResult(decoded, { allowApi: realVisit });
  const monthlySearchVolume = totalCount(result.pc, result.mobile);
  const blog = await getBlogInsight(decoded, { allowApi: realVisit });
  const activity = blogActivityLabel(blog.postsPerDay);
  const ratio = ratioLabel(monthlySearchVolume, blog.total);

  return (
    <div className="shell resultPage analysisDetailPage">
      <div className="resultSearch"><SearchBox initial={decoded} compact /></div>

      <nav className="crumbs">
        <Link href="/" prefetch={false}>홈</Link><span>›</span>
        <Link href={"/k/" + encodeURIComponent(decoded)} prefetch={false}>{decoded}</Link><span>›</span>
        <strong>블로그 분석</strong>
      </nav>

      <section className="analysisDetailHeader">
        <span className="analysisKind">BLOG ANALYSIS</span>
        <h1>{decoded} 블로그 분석</h1>
        <p>네이버 블로그 검색 결과의 문서 규모와 최신 게시 활동을 함께 봅니다.</p>
      </section>

      {blog.total != null ? (
        <>
          <section className="analysisDetailMetrics">
            <article>
              <span>블로그 검색 문서수</span>
              <strong>{blog.total.toLocaleString("ko-KR")}</strong>
            </article>
            <article>
              <span>최근 게시 활동</span>
              <strong>{activity}</strong>
            </article>
            <article>
              <span>검색량 ÷ 문서수</span>
              <strong>{ratio}</strong>
            </article>
            <article>
              <span>최신 표본</span>
              <strong>{blog.sampleSize ?? 0}개</strong>
            </article>
          </section>

          <section className="analysisExplainCard">
            <h2>어떻게 보는 지표인가요?</h2>
            <p>
              블로그 문서수는 해당 키워드의 네이버 블로그 검색 결과 수입니다.
              최근 게시 활동은 최신 최대 100개 게시물의 작성일 분포를 바탕으로 계산하며,
              월별 전체 발행량을 의미하지 않습니다.
            </p>
            <dl>
              <div><dt>월간 검색량</dt><dd>{monthlySearchVolume.toLocaleString("ko-KR")}</dd></div>
              <div><dt>최근 게시 표본 기간</dt><dd>{blog.sampleDays ? "약 " + blog.sampleDays + "일" : "—"}</dd></div>
              <div><dt>표본 기준 하루 게시 속도</dt><dd>{blog.postsPerDay == null ? "—" : "약 " + blog.postsPerDay.toFixed(1) + "개/일"}</dd></div>
            </dl>
          </section>
        </>
      ) : (
        <section className="emptyResult">
          <h2>블로그 분석 API 연결 대기</h2>
          <p>
            화면 구성과 캐시 구조는 준비되어 있습니다. NAVER API HUB에서 블로그 API 권한을 추가하면
            같은 인증키로 분석을 시작할 수 있습니다.
          </p>
        </section>
      )}

      <p className="dataNote">
        블로그 검색 결과 수와 최신 게시물 표본을 이용한 참고 지표이며, 네이버 전체 블로그의 정확한 기간별 발행량 통계는 아닙니다.
      </p>
    </div>
  );
}
