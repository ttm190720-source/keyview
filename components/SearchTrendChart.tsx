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

export default function SearchTrendChart({ points }: { points: SearchTrendPoint[] }) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));

  const chart = useMemo(() => {
    const width = 760;
    const height = 250;
    const padX = 24;
    const padTop = 18;
    const padBottom = 34;
    const innerWidth = width - padX * 2;
    const innerHeight = height - padTop - padBottom;

    const coords = points.map((point, index) => {
      const x = points.length <= 1 ? width / 2 : padX + (innerWidth * index) / (points.length - 1);
      const y = padTop + innerHeight * (1 - Math.max(0, Math.min(100, point.ratio)) / 100);
      return { x, y, ...point };
    });

    const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    return { width, height, padX, padTop, padBottom, innerHeight, coords, path };
  }, [points]);

  if (!points.length) return null;

  const active = points[Math.min(activeIndex, points.length - 1)];
  const tickIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor(((points.length - 1) * 3) / 4), points.length - 1]));

  return (
    <div className="searchTrendChart">
      <div className="searchTrendActive">
        <span>{fullMonthLabel(active.period)}</span>
        <strong>{active.ratio.toFixed(active.ratio % 1 === 0 ? 0 : 1)}</strong>
        <small>/ 100</small>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="최근 24개월 네이버 검색 관심도 추이"
        onMouseLeave={() => setActiveIndex(points.length - 1)}
      >
        {[0, 25, 50, 75, 100].map((value) => {
          const y = chart.padTop + chart.innerHeight * (1 - value / 100);
          return (
            <g key={value}>
              <line className="trendGridLine" x1={chart.padX} x2={chart.width - chart.padX} y1={y} y2={y} />
              <text className="trendGridLabel" x={chart.padX} y={y - 5}>{value}</text>
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
