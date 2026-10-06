import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReadinessLevel, ReadinessResult } from "@/lib/domain/readiness";
import { cn } from "../ui";

export const READINESS_TONE: Record<ReadinessLevel, { text: string; bg: string }> = {
  push: { text: "text-push", bg: "bg-push" },
  good: { text: "text-good", bg: "bg-good" },
  moderate: { text: "text-moderate", bg: "bg-moderate" },
  low: { text: "text-low", bg: "bg-low" },
  recover: { text: "text-recover", bg: "bg-recover" },
};

export type HeaderMetric = { label: string; value: string; unit?: string; sub?: string; href: string };

/** Readiness score plus the four morning numbers (weight, sleep, HRV, resting HR). */
export function ReadinessCard({
  readiness,
  checkedIn,
  metrics,
}: {
  readiness: ReadinessResult;
  checkedIn: boolean;
  metrics: HeaderMetric[];
}) {
  const tone = readiness.level ? READINESS_TONE[readiness.level] : null;
  return (
    <section className="rounded-2xl bg-surface p-4" data-testid="readiness-card">
      <div className="flex items-start justify-between">
        <p className="label">コンディション</p>
        <Link href="/checkin" className="flex items-center gap-0.5 text-xs font-semibold text-muted active:text-text">
          {checkedIn ? "チェックイン済み" : "朝のチェックイン"}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {readiness.score != null && tone ? (
        <Link href="/checkin" className="block">
          <div className="mt-1 flex items-end gap-3">
            <p className="num text-6xl font-extrabold leading-none" data-testid="readiness-score">
              {readiness.score}
              <span className="text-xl font-bold text-faint"> / 100</span>
            </p>
            <p className={cn("pb-1 text-lg font-extrabold tracking-wide", tone.text)}>{readiness.label}</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", tone.bg)} style={{ width: `${readiness.score}%` }} />
          </div>
        </Link>
      ) : (
        <Link href="/checkin" className="mt-2 block">
          <p className="text-2xl font-extrabold">CHECK IN</p>
          <p className="mt-1 text-sm text-muted">睡眠・HRV・安静時心拍・体感からコンディションを算出します。20秒で完了。</p>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-4 gap-1 border-t border-line pt-3" data-testid="today-metrics">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} className="min-w-0 rounded-xl px-1 py-1 active:bg-surface-2">
            <p className="truncate text-[11px] font-semibold tracking-wide text-muted">{m.label}</p>
            <p className="num mt-1 truncate text-lg font-bold leading-none">
              {m.value}
              {m.unit && m.value !== "–" ? <span className="ml-0.5 text-[11px] font-semibold text-muted">{m.unit}</span> : null}
            </p>
            {m.sub ? <p className="num mt-1 truncate text-[10px] text-faint">{m.sub}</p> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
