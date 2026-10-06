"use client";

import { useEffect, useRef } from "react";
import { formatDuration } from "@/lib/domain/format";
import { useNow } from "./hooks";

/** Big rest countdown. Calls onDone once when it reaches zero. */
export function RestPanel({
  endsAt,
  total,
  nextLabel,
  onAdjust,
  onSkip,
  onDone,
}: {
  endsAt: number;
  total: number;
  nextLabel: string | null;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const now = useNow(250);
  const remaining = now === 0 ? total : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (remaining === 0 && fired.current !== endsAt) {
      fired.current = endsAt;
      onDone();
    }
  }, [remaining, endsAt, onDone]);

  const progress = total > 0 ? Math.min(1, 1 - remaining / total) : 1;
  return (
    <div className="rounded-3xl bg-surface-2 p-3" data-testid="rest-timer" aria-live="polite">
      <div className="flex items-center justify-between">
        <span className="label text-accent">Rest</span>
        {nextLabel ? <span className="num truncate pl-3 text-xs text-muted">Next: {nextLabel}</span> : null}
      </div>
      <p className="num mt-1 text-center text-6xl font-extrabold leading-none" data-testid="rest-remaining">
        {formatDuration(remaining)}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => onAdjust(-15)} className="num h-11 rounded-xl bg-surface-3 font-bold active:brightness-125">
          −15s
        </button>
        <button type="button" onClick={onSkip} className="h-11 rounded-xl bg-accent font-extrabold text-accent-ink active:brightness-90" data-testid="rest-skip">
          SKIP
        </button>
        <button type="button" onClick={() => onAdjust(15)} className="num h-11 rounded-xl bg-surface-3 font-bold active:brightness-125">
          +15s
        </button>
      </div>
    </div>
  );
}
