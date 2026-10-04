import Link from "next/link";
import type { BlogInsightResult } from "@/lib/blogInsight";
import { blogActivityLabel } from "@/lib/blogInsight";

function formatCount(value: number | null) {
  if (value == null) return "연결 후 표시";
  return value.toLocaleString("ko-KR");
}

function ratioLabel(monthlySearchVolume: number, blogTotal: number | null) {
  if (!blogTotal || blogTotal <= 0 || monthlySearchVolume <= 0) return "—";
  const value = monthlySearchVolume / blogTotal;
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

export default function AnalysisCards({
  keyword,
  monthlySearchVolume,
  blog,
}: {
  keyword: string;
  monthlySearchVolume: number;
  blog: BlogInsightResult;
}) {
  const encoded = encodeURIComponent(keyword);
  const activity = blogActivityLabel(blog.postsPerDay);
  const ratio = ratioLabel(monthlySearchVolume, blog.total);

  return (
    <section className="analysisCards" aria-label="키워드 확장 분석">
      <article className="analysisCard blogAnalysisCard">
        <div className="analysisCardTop">
          <div>
            <span className="analysisKind">BLOG</span>
            <h2>블로그 분석</h2>
            <p>블로그 콘텐츠 현황과 검색 경쟁을 함께 확인하세요.</p>
          </div>
          <span className="analysisPill">콘텐츠 경쟁 참고용</span>
        </div>

        <div className="analysisMetrics">
          <div>
            <span>블로그 문서수</span>
            <strong>{formatCount(blog.total)}</strong>
          </div>
          <div>
            <span>최근 게시 활동</span>
            <strong>{blog.total == null ? "연결 대기" : activity}</strong>
          </div>
          <div>
            <span>검색량 ÷ 문서수</span>
            <strong>{ratio}</strong>
          </div>
        </div>

        <div className="analysisCardBottom">
          <p>
            {blog.sampleSize
              ? `최신 ${blog.sampleSize}개 게시물 · 약 ${blog.sampleDays ?? 0}일 범위 표본`
              : "블로그 API를 연결하면 최신 게시 활동도 함께 분석합니다."}
          </p>
          <Link className="analysisButton blogButton" href={`/k/${encoded}/blog`} prefetch={false}>
            블로그 분석 보기 <span>→</span>
          </Link>
        </div>
      </article>

      <article className="analysisCard shoppingAnalysisCard">
        <div className="analysisCardTop">
          <div>
            <span className="analysisKind">SHOPPING</span>
            <h2>쇼핑 분석</h2>
            <p>쇼핑 클릭 트렌드와 사용자 관심층을 카테고리별로 확인하세요.</p>
          </div>
          <span className="analysisPill">카테고리 선택 후 분석</span>
        </div>

        <div className="analysisMetrics">
          <div>
            <span>쇼핑 카테고리</span>
            <strong>선택 필요</strong>
          </div>
          <div>
            <span>클릭 추이</span>
            <strong>최근 12개월</strong>
          </div>
          <div>
            <span>기기 · 연령</span>
            <strong>상세 제공</strong>
          </div>
        </div>

        <div className="analysisCardBottom">
          <p>카드를 여는 것만으로는 쇼핑 API를 호출하지 않습니다.</p>
          <Link className="analysisButton shoppingButton" href={`/k/${encoded}/shopping`} prefetch={false}>
            쇼핑 분석 보기 <span>→</span>
          </Link>
        </div>
      </article>
    </section>
  );
}
