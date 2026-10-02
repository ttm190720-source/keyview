"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RelatedKeyword } from "@/lib/data";
import { displayCount } from "@/lib/keyword";

export default function RelatedTable({ items }: { items: RelatedKeyword[] }) {
  const [filter, setFilter] = useState("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");

  const rows = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase("ko-KR");
    return items
      .filter((item) => !needle || item.keyword.toLocaleLowerCase("ko-KR").includes(needle))
      .sort((a, b) => (order === "desc" ? b.total - a.total : a.total - b.total));
  }, [filter, items, order]);

  return (
    <section className="relatedSection">
      <div className="sectionHeading">
        <div>
          <h2>관련 키워드</h2>
          <p>{rows.length.toLocaleString("ko-KR")}개의 검색어</p>
        </div>
        <div className="tools">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="결과에서 포함어 찾기"
            aria-label="관련 키워드 필터"
          />
          <button type="button" onClick={() => setOrder((v) => (v === "desc" ? "asc" : "desc"))}>
            검색량 {order === "desc" ? "높은순" : "낮은순"}
          </button>
        </div>
      </div>

      <div className="keywordTable" role="table">
        <div className="keywordRow header" role="row">
          <span>키워드</span><span>PC</span><span>모바일</span><span>월 검색량</span>
        </div>
        {rows.map((item) => (
          <Link className="keywordRow" role="row" href={`/k/${encodeURIComponent(item.keyword)}`} key={item.keyword}>
            <strong>{item.keyword}</strong>
            <span>{displayCount(item.pc, item.pcLow)}</span>
            <span>{displayCount(item.mobile, item.mobileLow)}</span>
            <span className="total">{item.total ? item.total.toLocaleString("ko-KR") : "10 미만"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
