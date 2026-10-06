"use client";

import { useId, useState } from "react";
import { useWidth } from "./useWidth";

export type ColumnCategory = { key: string; label: string; color: string };
export type Column = { x: string; label: string; values: Record<string, number> };

/**
 * Stacked columns (<= 24px wide, 4px rounded tops, 2px surface gaps between
 * segments). Each column is its own hover/focus target.
 */
export function ColumnChart({
  columns,
  categories,
  height = 160,
  yFormat = (v) => String(Math.round(v)),
  ariaLabel,
}: {
  columns: Column[];
  categories: ColumnCategory[];
  height?: number;
  yFormat?: (v: number) => string;
  ariaLabel: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const totals = columns.map((c) => categories.reduce((a, cat) => a + (c.values[cat.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const top = 14;
  const bottom = 20;
  const innerH = height - top - bottom;
  const slot = width / Math.max(1, columns.length);
  const barW = Math.min(24, slot * 0.6);
  const yAt = (v: number) => top + innerH - (v / max) * innerH;

  return (
    <div ref={ref} className="relative">
      {categories.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
          {categories.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
              {c.label}
            </li>
          ))}
        </ul>
      ) : null}
      <svg width={width} height={height} role="img" aria-label={ariaLabel} aria-describedby={tableId} className="block">
        <line x1={0} x2={width} y1={top + innerH} y2={top + innerH} stroke="var(--line)" strokeWidth={1} />
        {columns.map((col, i) => {
          const cx = slot * i + slot / 2;
          let acc = 0;
          const segments = categories
            .map((cat) => ({ cat, v: col.values[cat.key] ?? 0 }))
            .filter((s) => s.v > 0);
          return (
            <g
              key={col.x}
              tabIndex={0}
              role="button"
              aria-label={`${col.label}: ${categories.map((c) => `${c.label} ${yFormat(col.values[c.key] ?? 0)}`).join(", ")}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="outline-none"
            >
              <rect x={slot * i} y={0} width={slot} height={height} fill="transparent" />
              {segments.map((s, k) => {
                const y0 = yAt(acc);
                acc += s.v;
                const y1 = yAt(acc);
                const isTop = k === segments.length - 1;
                const h = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0));
                const r = isTop ? Math.min(4, h) : 0;
                const x = cx - barW / 2;
                const yTop = y1;
                const path = `M${x},${yTop + h} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + barW - r},${yTop} Q${x + barW},${yTop} ${x + barW},${yTop + r} L${x + barW},${yTop + h} Z`;
                return <path key={s.cat.key} d={path} fill={s.cat.color} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              <text x={cx} y={height - 6} fontSize={10} fill="var(--faint)" textAnchor="middle">
                {col.label}
              </text>
            </g>
          );
        })}
        {totals.length ? (
          <text x={slot * (columns.length - 1) + slot / 2} y={yAt(totals[totals.length - 1]) - 4} fontSize={10} fill="var(--muted)" textAnchor="middle" className="num">
            {yFormat(totals[totals.length - 1])}
          </text>
        ) : null}
      </svg>
      {hover != null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 w-36 rounded-xl border border-line bg-surface-2 px-2.5 py-2 shadow-lg"
          style={{ left: Math.min(Math.max(slot * hover + slot / 2 - 72, 0), width - 144) }}
        >
          <p className="text-[10px] text-muted">{columns[hover].label}</p>
          <p className="num text-sm font-bold">{yFormat(totals[hover])}</p>
          {categories.map((c) => (
            <p key={c.key} className="num flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />
              <span className="font-semibold">{yFormat(columns[hover].values[c.key] ?? 0)}</span>
              <span className="text-muted">{c.label}</span>
            </p>
          ))}
        </div>
      ) : null}
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-faint">Data</summary>
        <table id={tableId} className="num mt-1 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-semibold">Week</th>
              {categories.map((c) => (
                <th key={c.key} className="text-right font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.x} className="border-t border-line">
                <td className="py-0.5">{col.x}</td>
                {categories.map((c) => (
                  <td key={c.key} className="text-right">
                    {yFormat(col.values[c.key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
