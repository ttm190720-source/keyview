"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function HeaderNavigation() {
  const path = usePathname();
  const links = [{ href: "/", label: "키워드 검색" }, { href: "/history", label: "검색기록" }, { href: "/saved", label: "관심 키워드" }];
  return (
    <nav className="headerNav" aria-label="주 메뉴">
      {links.map(link => {
        const active = link.href === "/" ? path === "/" || path.startsWith("/k/") : path === link.href;
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
          className={active ? "active" : ""}>{link.label}</Link>;
      })}
    </nav>
  );
}
