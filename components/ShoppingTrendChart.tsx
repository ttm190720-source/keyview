"use client";

import { useMemo, useState } from "react";
import type { ShoppingTrendPoint } from "@/lib/shoppingInsight";

function monthLabel(period: string) {
  const [year, month] = period.split("-");
  return `${year.slice(2)}.${month}`;
}

export default function ShoppingTrendChart({ points }: { points: ShoppingTrendPoint[] }) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));

  const chart = useMemo(() => {
    const width = 760;
    const height = 230;
    const padLeft = 38;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 34;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;

    const coords = points.map((point, index) => {
      const x = points.length <= 1
        ? width / 2
        : padLeft + (innerWidth * index) / (points.length - 1);
      const y = padTop + innerHeight * (1 - Math.max(0, Math.min(100, point.ratio)) / 100);
      return { x, y, ...point };
    });

    const path = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return { width, height, padLeft, padRight, padTop, innerHeight, coords, path };
  }, [points]);

  if (!points.length) return null;

  const active = points[Math.min(activeIndex, points.length - 1)];
  const tickIndexes = Array.from(
    new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1]),
  );

  return (
    <div className="shoppingTrendChart">
      <div className="shoppingTrendActive">
        <span>{active.period}</span>
        <strong>{active.ratio.toFixed(active.ratio % 1 === 0 ? 0 : 1)}</strong>
        <small>/ 100</small>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label="최근 12개월 쇼핑 클릭 관심도"
        onMouseLeave={() => setActiveIndex(points.length - 1)}
      >
        {[0, 25, 50, 75, 100].map((value) => {
          const y = chart.padTop + chart.innerHeight * (1 - value / 100);
          return (
            <g key={value}>
              <line className="trendGridLine" x1={chart.padLeft} x2={chart.width - chart.padRight} y1={y} y2={y} />
              <text className="trendGridLabel" x={chart.padLeft - 8} y={y + 3} textAnchor="end">{value}</text>
            </g>
          );
        })}

        <path className="shoppingTrendLine" d={chart.path} fill="none" />

        {chart.coords.map((point, index) => (
          <g
            key={point.period}
            onMouseEnter={() => setActiveIndex(index)}
            onTouchStart={() => setActiveIndex(index)}
          >
            <circle
              className={index === activeIndex ? "shoppingTrendPoint active" : "shoppingTrendPoint"}
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 5 : 3}
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
