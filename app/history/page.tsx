import type { Metadata } from "next";
import KeywordLibraryPanel from "@/components/KeywordLibraryPanel";
export const metadata: Metadata = { title: "검색기록", robots: { index: false, follow: false } };
export default function HistoryPage() {
  return <div className="shell libraryPage">
    <span className="eyebrow">MY KEYWORD HISTORY</span><h1>검색기록</h1>
    <p className="libraryIntro">최근 분석한 키워드를 다시 살펴보고 중요한 검색어는 관심 키워드로 보관하세요.</p>
    <KeywordLibraryPanel mode="history" />
  </div>;
}
