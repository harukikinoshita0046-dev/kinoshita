"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatShortDate } from "@/lib/domain/dates";
import { useWidth } from "./useWidth";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  /** "line" = 2px line with end dot; "dots" = small recessive markers (raw daily values). */
  kind?: "line" | "dots";
  points: Array<{ x: string; y: number | null }>;
};

type Props = {
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  /** Horizontal reference (target, baseline). */
  reference?: { y: number; label: string };
  /** Lower values are better (e.g. times) — only affects nothing visual; kept for tooltips. */
  ariaLabel: string;
  emptyText?: string;
};

const PAD = { top: 12, right: 44, bottom: 22, left: 8 };

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/**
 * Single-axis time-series chart. Crosshair snaps to the nearest date and the
 * tooltip lists every series at that date. Arrow keys move the crosshair.
 */
export function LineChart({ series, height = 180, yFormat = (v) => String(Math.round(v * 10) / 10), reference, ariaLabel, emptyText = "No data yet" }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const values = series.flatMap((s) => s.points.map((p) => p.y).filter((v): v is number => v != null));
  if (reference) values.push(reference.y);

  if (xs.length === 0 || values.length === 0) {
    return (
      <div ref={ref} className="flex h-24 items-center justify-center text-sm text-faint">
        {emptyText}
      </div>
    );
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  const padY = (max - min || Math.abs(max) || 1) * 0.12;
  min -= padY;
  max += padY;
  const ticks = niceTicks(min, max);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const xAt = (i: number) => PAD.left + (xs.length === 1 ? innerW / 2 : (i / (xs.length - 1)) * innerW);
  const yAt = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;
  const index = new Map(xs.map((x, i) => [x, i]));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD.left;
    const i = xs.length === 1 ? 0 : Math.round((px / innerW) * (xs.length - 1));
    setHover(Math.min(xs.length - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? xs.length) - 1));
    if (e.key === "ArrowRight") setHover((h) => Math.min(xs.length - 1, (h ?? -1) + 1));
    if (e.key === "Escape") setHover(null);
  };

  const lines = series.filter((s) => (s.kind ?? "line") === "line");
  const tooltipRows = hover == null ? [] : series.map((s) => ({ s, p: s.points.find((p) => p.x === xs[hover]) })).filter((r) => r.p?.y != null);
  const tooltipLeft = hover == null ? 0 : Math.min(Math.max(xAt(hover) - 60, 0), width - 128);
  const year = Number(xs[xs.length - 1].slice(0, 4));

  return (
    <div ref={ref} className="relative">
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              {(s.kind ?? "line") === "line" ? (
                <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              ) : (
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              )}
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={tableId}
        tabIndex={0}
        className="block touch-pan-y outline-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={width - PAD.right + 6} y={yAt(t) + 4} fontSize={10} fill="var(--faint)" className="num">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {reference ? (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={yAt(reference.y)} y2={yAt(reference.y)} stroke="var(--muted)" strokeWidth={1} />
            <text x={PAD.left + 2} y={yAt(reference.y) - 4} fontSize={10} fill="var(--muted)">
              {reference.label}
            </text>
          </g>
        ) : null}
        <text x={PAD.left} y={height - 6} fontSize={10} fill="var(--faint)">
          {formatShortDate(xs[0], year)}
        </text>
        <text x={width - PAD.right} y={height - 6} fontSize={10} fill="var(--faint)" textAnchor="end">
          {formatShortDate(xs[xs.length - 1], year)}
        </text>

        {series
          .filter((s) => s.kind === "dots")
          .map((s) =>
            s.points.map((p) =>
              p.y == null ? null : <circle key={`${s.key}-${p.x}`} cx={xAt(index.get(p.x)!)} cy={yAt(p.y)} r={2.5} fill={s.color} opacity={0.55} />,
            ),
          )}
        {lines.map((s) => {
          const pts = s.points.filter((p) => p.y != null);
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(index.get(p.x)!).toFixed(1)},${yAt(p.y!).toFixed(1)}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last ? <circle cx={xAt(index.get(last.x)!)} cy={yAt(last.y!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null}
            </g>
          );
        })}

        {hover != null ? (
          <g pointerEvents="none">
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--muted)" strokeWidth={1} />
            {tooltipRows.map(({ s, p }) => (
              <circle key={s.key} cx={xAt(hover)} cy={yAt(p!.y!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        ) : null}
      </svg>

      {hover != null && tooltipRows.length ? (
        <div className="pointer-events-none absolute top-0 z-10 w-32 rounded-xl border border-line bg-surface-2 px-2.5 py-2 shadow-lg" style={{ left: tooltipLeft }}>
          <p className="text-[10px] text-muted">{formatShortDate(xs[hover], year)}</p>
          {tooltipRows.map(({ s, p }) => (
            <p key={s.key} className="num flex items-center gap-1.5 text-sm font-bold text-text">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              {yFormat(p!.y!)}
              <span className="truncate text-[10px] font-normal text-muted">{s.label}</span>
            </p>
          ))}
        </div>
      ) : null}

      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-faint">Data</summary>
        <table id={tableId} className="num mt-1 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-semibold">Date</th>
              {series.map((s) => (
                <th key={s.key} className="text-right font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...xs].reverse().slice(0, 60).map((x) => (
              <tr key={x} className="border-t border-line">
                <td className="py-0.5">{x}</td>
                {series.map((s) => {
                  const p = s.points.find((q) => q.x === x);
                  return (
                    <td key={s.key} className="text-right">
                      {p?.y != null ? yFormat(p.y) : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
