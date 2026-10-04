import Link from "next/link";
import { headers } from "next/headers";
import SearchBox from "@/components/SearchBox";
import ShoppingTrendChart from "@/components/ShoppingTrendChart";
import {
  SHOPPING_CATEGORIES,
  getShoppingCategory,
  getShoppingInsight,
  shoppingDeviceShare,
  shoppingTopAges,
} from "@/lib/shoppingInsight";
import { isKnownBot, isPrefetchRequest } from "@/lib/keyword";

type Props = {
  params: Promise<{ keyword: string }>;
  searchParams: Promise<{ category?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ShoppingAnalysisPage({ params, searchParams }: Props) {
  const { keyword } = await params;
  const { category: requestedCategory } = await searchParams;
  const decoded = decodeURIComponent(keyword).trim();
  const category = requestedCategory ? getShoppingCategory(requestedCategory) : null;

  const headerList = await headers();
  const bot = isKnownBot(headerList.get("user-agent") || "");
  const prefetch = isPrefetchRequest(headerList);
  const realVisit = !bot && !prefetch;

  const insight = category
    ? await getShoppingInsight(decoded, category.code, { allowApi: realVisit })
    : null;

  const mobileShare = insight ? shoppingDeviceShare(insight.device) : null;
  const topAges = insight ? shoppingTopAges(insight.age) : [];

  return (
    <div className="shell resultPage analysisDetailPage">
      <div className="resultSearch"><SearchBox initial={decoded} compact /></div>

      <nav className="crumbs">
        <Link href="/" prefetch={false}>홈</Link><span>›</span>
        <Link href={"/k/" + encodeURIComponent(decoded)} prefetch={false}>{decoded}</Link><span>›</span>
        <strong>쇼핑 분석</strong>
      </nav>

      <section className="analysisDetailHeader">
        <span className="analysisKind">SHOPPING ANALYSIS</span>
        <h1>{decoded} 쇼핑 분석</h1>
        <p>카테고리를 선택하면 네이버 쇼핑의 클릭 관심도와 주요 이용층을 분석합니다.</p>
      </section>

      <section className="shoppingCategoryCard">
        <div className="sectionHeading">
          <div>
            <h2>쇼핑 카테고리 선택</h2>
            <p>분석할 상품 분야를 한 번만 선택하세요. 선택 전에는 쇼핑 API를 호출하지 않습니다.</p>
          </div>
        </div>
        <div className="shoppingCategoryGrid">
          {SHOPPING_CATEGORIES.map((item) => (
            <Link
              key={item.code}
              href={"/k/" + encodeURIComponent(decoded) + "/shopping?category=" + item.code}
              prefetch={false}
              className={category?.code === item.code ? "active" : ""}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </section>

      {category && insight?.trend.length ? (
        <>
          <section className="shoppingSummaryGrid">
            <article>
              <span>선택 카테고리</span>
              <strong>{category.name}</strong>
            </article>
            <article>
              <span>모바일 클릭 관심 비중</span>
              <strong>{mobileShare == null ? "—" : mobileShare + "%"}</strong>
            </article>
            <article>
              <span>주요 관심 연령대</span>
              <strong>{topAges.length ? topAges.join(" · ") : "—"}</strong>
            </article>
          </section>

          <section className="shoppingTrendSection">
            <div className="sectionHeading">
              <div>
                <h2>쇼핑 클릭 트렌드</h2>
                <p>최근 완료된 12개월의 상대 클릭 관심도입니다. 가장 높은 구간을 100으로 봅니다.</p>
              </div>
              <span className="trendCacheBadge">
                {insight.cacheState === "refreshed" ? "방금 업데이트" : "저장 데이터"}
              </span>
            </div>
            <ShoppingTrendChart points={insight.trend} />
          </section>
        </>
      ) : category && insight?.cacheState === "disabled" ? (
        <section className="emptyResult">
          <h2>쇼핑 인사이트 API 연결 대기</h2>
          <p>
            카테고리 선택 화면과 캐시 구조는 준비되어 있습니다. NAVER API HUB에서 쇼핑인사이트 API 권한을 추가하면
            선택한 카테고리에 대해서만 상세 데이터를 호출합니다.
          </p>
        </section>
      ) : category ? (
        <section className="emptyResult">
          <h2>쇼핑 데이터를 불러오지 못했습니다.</h2>
          <p>저장 데이터가 없거나 NAVER 쇼핑 인사이트 응답을 일시적으로 사용할 수 없습니다.</p>
        </section>
      ) : (
        <section className="shoppingIntroCard">
          <div>
            <strong>카테고리를 선택하면 표시됩니다.</strong>
            <p>쇼핑 클릭 추이 · 모바일/PC 관심 비중 · 주요 연령대를 한 화면에서 확인할 수 있습니다.</p>
          </div>
        </section>
      )}

      <p className="dataNote">
        쇼핑 인사이트는 네이버 통합검색 쇼핑 영역과 네이버쇼핑의 클릭 상대지수입니다. 판매량이나 주문량을 의미하지 않습니다.
      </p>
    </div>
  );
}
