import type { Metadata } from "next";
import KeywordLibraryPanel from "@/components/KeywordLibraryPanel";
export const metadata: Metadata = { title: "관심 키워드", robots: { index: false, follow: false } };
export default function SavedPage() {
  return <div className="shell libraryPage">
    <span className="eyebrow">MY WATCHLIST</span><h1>관심 키워드</h1>
    <p className="libraryIntro">지속적으로 확인할 키워드를 등록하고 클릭 한 번으로 분석을 다시 열어보세요.</p>
    <KeywordLibraryPanel mode="favorites" />
  </div>;
}
