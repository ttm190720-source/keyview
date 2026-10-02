import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "키뷰 - 검색어를 타고 발견하는 키워드", template: "%s | 키뷰" },
  description: "네이버 월간 검색량과 관련 키워드를 검색량 순으로 빠르게 탐색하세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="siteHeader">
          <div className="shell headerInner">
            <Link href="/" className="brand">키뷰</Link>
            <span className="brandHint">KEYVIEW</span>
          </div>
        </header>
        <main>{children}</main>
        <footer className="siteFooter">
          <div className="shell">키뷰 · 검색어를 더 빠르게 발견하는 무료 키워드 도구</div>
        </footer>
      </body>
    </html>
  );
}
