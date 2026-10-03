"use client";

import { useMemo, useState } from "react";
import type { SearchTrendPoint } from "@/lib/searchTrend";

function monthLabel(period: string) {
  const [year, month] = period.split("-");
  return `${year.slice(2)}.${month}`;
}

function fullMonthLabel(period: string) {
  const [year, month] = period.split("-");
  return `${year}년 ${Number(month)}월`;
}

function compactNumber(value: number) {
  if (value >= 100_000_000) {
    const n = value / 100_000_000;
    return `${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "")}억`;
  }
  if (value >= 10_000) {
    const n = value / 10_000;
    return `${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "")}만`;
  }
  if (value >= 1_000) {
    const n = value / 1_000;
    return `${n.toFixed(1).replace(/\.0$/, "")}천`;
  }
  return Math.round(value).toLocaleString("ko-KR");
}

function niceCeiling(value: number) {
  if (value <= 0) return 100;
  const exponent = Math.floor(Math.log10(value));
  const power = 10 ** exponent;
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export default function SearchTrendChart({ points }: { points: SearchTrendPoint[] }) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));

  const chart = useMemo(() => {
    const width = 760;
    const height = 260;
    const padLeft = 52;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 34;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;
    const maxValue = Math.max(...points.map((point) => point.estimatedSearches), 1);
    const ceiling = niceCeiling(maxValue);

    const coords = points.map((point, index) => {
      const x = points.length <= 1
        ? width / 2
        : padLeft + (innerWidth * index) / (points.length - 1);
      const y = padTop + innerHeight * (1 - Math.min(point.estimatedSearches, ceiling) / ceiling);
      return { x, y, ...point };
    });

    const path = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerHeight,
      coords,
      path,
      ceiling,
    };
  }, [points]);

  if (!points.length) return null;

  const active = points[Math.min(activeIndex, points.length - 1)];
  const tickIndexes = Array.from(
    new Set([
      0,
      Math.floor((points.length - 1) / 4),
      Math.floor((points.length - 1) / 2),
      Math.floor(((points.length - 1) * 3) / 4),
      points.length - 1,
    ]),
  );

  return (
    <div className="searchTrendChart">
      <div className="searchTrendActive">
        <span>{fullMonthLabel(active.period)}</span>
        <strong>약 {active.estimatedSearches.toLocaleString("ko-KR")}</strong>
        <small>회</small>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="최근 24개월 월별 추정 검색량"
        onMouseLeave={() => setActiveIndex(points.length - 1)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = chart.ceiling * ratio;
          const y = chart.padTop + chart.innerHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                className="trendGridLine"
                x1={chart.padLeft}
                x2={chart.width - chart.padRight}
                y1={y}
                y2={y}
              />
              <text
                className="trendGridLabel"
                x={chart.padLeft - 8}
                y={y + 3}
                textAnchor="end"
              >
                {compactNumber(value)}
              </text>
            </g>
          );
        })}

        <path className="trendLine" d={chart.path} fill="none" />

        {chart.coords.map((point, index) => (
          <g
            key={point.period}
            onMouseEnter={() => setActiveIndex(index)}
            onTouchStart={() => setActiveIndex(index)}
          >
            <circle
              className={index === activeIndex ? "trendPoint active" : "trendPoint"}
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 5 : 3.2}
            />
            <circle className="trendHitArea" cx={point.x} cy={point.y} r="13" />
          </g>
        ))}

        {tickIndexes.map((index) => {
          const point = chart.coords[index];
          return (
            <text
              key={point.period}
              className="trendAxisLabel"
              x={point.x}
              y={chart.height - 8}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            >
              {monthLabel(point.period)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
