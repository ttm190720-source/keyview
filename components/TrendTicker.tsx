"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  rank: number;
  keyword: string;
};

export default function TrendTicker({
  items,
  updatedAt,
}: {
  items: Item[];
  updatedAt: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || paused) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  if (!items.length) return null;

  const current = items[index];

  return (
    <div
      className="trendTicker"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link className="trendTickerLabel" href="/trend" prefetch={false}>
        <span aria-hidden="true">🔥</span>
        <strong>지금 뜨는 검색어</strong>
        <span className="trendTickerAll">전체보기 →</span>
      </Link>

      <div className="trendTickerWindow" aria-live="polite">
        <Link
          className="trendTickerKeyword"
          href={`/k/${encodeURIComponent(current.keyword)}`}
          prefetch={false}
          key={current.keyword}
        >
          <span className="trendTickerRank">{current.rank}</span>
          <strong>{current.keyword}</strong>
          <span className="trendTickerGo">검색량 보기 →</span>
        </Link>
      </div>

      <div className="trendTickerMeta">
        <span>{index + 1}/{items.length}</span>
        {updatedAt && <span>{updatedAt} 기준</span>}
      </div>
    </div>
  );
}
