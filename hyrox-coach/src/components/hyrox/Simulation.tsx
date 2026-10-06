"use client";

import { Check, Play, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveHyroxResult } from "@/app/(app)/hyrox/actions";
import { useAlert, useNow, useStoredState, useWakeLock } from "@/components/logger/hooks";
import { buttonClass, cn, ErrorText } from "@/components/ui";
import { formatDuration, formatSignedDuration } from "@/lib/domain/format";
import { compareToBest, computeTotals, HYROX_SEGMENTS } from "@/lib/domain/hyrox";

type Split = { segment_index: number; duration_seconds: number; roxzone_seconds: number | null; startedAt: number };
type SimState = {
  phase: "idle" | "segment" | "roxzone" | "done";
  trackRox: boolean;
  startedAt: number | null;
  segStartedAt: number | null;
  roxStartedAt: number | null;
  splits: Split[];
  finishedAt: number | null;
};

const INITIAL: SimState = { phase: "idle", trackRox: true, startedAt: null, segStartedAt: null, roxStartedAt: null, splits: [], finishedAt: null };

export type PbReference = { total: number | null; splits: Record<number, number> };

export function Simulation({ today, planId, pb }: { today: string; planId: string | null; pb: PbReference }) {
  const router = useRouter();
  const [s, setS] = useStoredState<SimState>("hx:hyrox-sim", INITIAL);
  const now = useNow(250);
  const { prime } = useAlert();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  useWakeLock(s.phase === "segment" || s.phase === "roxzone");

  const segIdx = s.splits.length; // 0-based index of the current/next segment
  const seg = HYROX_SEGMENTS[segIdx];
  const nextSeg = HYROX_SEGMENTS[segIdx + (s.phase === "roxzone" ? 0 : 1)];
  const since = (start: number | null) => (start && now ? Math.max(0, Math.floor((now - start) / 1000)) : 0);
  const elapsedSeg = since(s.segStartedAt);
  const elapsedRox = since(s.roxStartedAt);
  const total = s.startedAt ? (s.finishedAt ? Math.floor((s.finishedAt - s.startedAt) / 1000) : since(s.startedAt)) : 0;
  const totals = computeTotals(s.splits.map((x) => ({ ...x, segment_type: HYROX_SEGMENTS[x.segment_index - 1].type, exercise_id: HYROX_SEGMENTS[x.segment_index - 1].exerciseId })));

  const start = () => {
    prime();
    const t = Date.now();
    setS({ ...INITIAL, trackRox: s.trackRox, phase: "segment", startedAt: t, segStartedAt: t });
  };

  const finishSegment = () => {
    prime();
    if (!s.segStartedAt || !seg) return;
    const t = Date.now();
    const split: Split = { segment_index: seg.index, duration_seconds: Math.max(1, Math.round((t - s.segStartedAt) / 1000)), roxzone_seconds: null, startedAt: s.segStartedAt };
    const splits = [...s.splits, split];
    if (splits.length === HYROX_SEGMENTS.length) {
      setS({ ...s, splits, phase: "done", segStartedAt: null, finishedAt: t });
    } else if (s.trackRox) {
      setS({ ...s, splits, phase: "roxzone", segStartedAt: null, roxStartedAt: t });
    } else {
      setS({ ...s, splits, phase: "segment", segStartedAt: t });
    }
  };

  const startNext = () => {
    prime();
    if (!s.roxStartedAt) return;
    const t = Date.now();
    const splits = [...s.splits];
    splits[splits.length - 1] = { ...splits[splits.length - 1], roxzone_seconds: Math.round((t - s.roxStartedAt) / 1000) };
    setS({ ...s, splits, phase: "segment", roxStartedAt: null, segStartedAt: t });
  };

  const undo = () => {
    const last = s.splits[s.splits.length - 1];
    if (!last) return;
    setS({ ...s, splits: s.splits.slice(0, -1), phase: "segment", segStartedAt: last.startedAt, roxStartedAt: null, finishedAt: null });
  };

  const save = () => {
    setError(undefined);
    // The action redirects on success, so clear the stored run now and restore it on error.
    const stored = JSON.stringify(s);
    try {
      localStorage.removeItem("hx:hyrox-sim");
    } catch {}
    startTransition(async () => {
      const res = await saveHyroxResult({
        date: today,
        event_type: s.splits.length === 16 ? "simulation" : "partial",
        name: "Simulation",
        workout_plan_id: planId,
        started_at: s.startedAt ? new Date(s.startedAt).toISOString() : null,
        finished_at: s.finishedAt ? new Date(s.finishedAt).toISOString() : null,
        splits: s.splits.map(({ segment_index, duration_seconds, roxzone_seconds }) => ({ segment_index, duration_seconds, roxzone_seconds })),
      });
      if (res?.error) {
        setError(res.error);
        try {
          localStorage.setItem("hx:hyrox-sim", stored);
        } catch {}
      }
    });
  };

  const pbSplit = seg ? pb.splits[seg.index] : undefined;
  const cmp = s.phase === "done" ? compareToBest(totals.total, pb.total) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-safe">
      <header className="flex items-center justify-between py-3">
        <button type="button" onClick={() => router.push("/hyrox")} aria-label="Close" className="rounded-full bg-surface-2 p-2.5 text-muted">
          <X className="h-5 w-5" />
        </button>
        <p className="font-bold">HYROX SIMULATION</p>
        <span className="num w-16 text-right text-sm font-bold" data-testid="sim-total">
          {formatDuration(total)}
        </span>
      </header>

      {/* Segment progress */}
      <ol className="grid grid-cols-16 gap-0.5" aria-label="Segments" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {HYROX_SEGMENTS.map((x, i) => (
          <li
            key={x.index}
            className={cn(
              "h-1.5 rounded-full",
              i < s.splits.length ? "bg-push" : i === segIdx && s.phase === "segment" ? "bg-accent" : x.type === "run" ? "bg-surface-3" : "bg-surface-2",
            )}
          />
        ))}
      </ol>

      <section className="flex flex-1 flex-col items-center justify-center py-6 text-center" aria-live="polite">
        {s.phase === "idle" ? (
          <>
            <p className="text-5xl font-extrabold">8 × 1 km</p>
            <p className="mt-1 text-muted">+ 8 stations in race order</p>
            {pb.total ? <p className="num mt-4 text-sm text-muted">PB {formatDuration(pb.total)}</p> : null}
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.trackRox} onChange={(e) => setS({ ...s, trackRox: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
              Track Roxzone transitions (tap again when the next segment starts)
            </label>
          </>
        ) : s.phase === "segment" && seg ? (
          <>
            <p className={cn("label", seg.type === "run" ? "text-run" : "text-station")}>
              {segIdx + 1} / 16 · {seg.type === "run" ? "RUN" : "STATION"}
            </p>
            <p className="mt-1 text-4xl font-extrabold uppercase" data-testid="sim-segment">
              {seg.label}
            </p>
            <p className="text-sm text-muted">{seg.spec}</p>
            <p className="num mt-4 text-8xl font-extrabold leading-none">{formatDuration(elapsedSeg)}</p>
            {pbSplit ? <p className="num mt-3 text-sm text-muted">PB split {formatDuration(pbSplit)}</p> : null}
          </>
        ) : s.phase === "roxzone" ? (
          <>
            <p className="label text-accent">ROXZONE</p>
            <p className="num mt-2 text-7xl font-extrabold leading-none text-accent">{formatDuration(elapsedRox)}</p>
            <p className="mt-4 text-sm text-muted">Next: {nextSeg?.label}</p>
          </>
        ) : (
          <>
            <p className="label">TODAY</p>
            <p className="num text-6xl font-extrabold" data-testid="sim-final">
              {formatDuration(totals.total)}
            </p>
            {pb.total ? (
              <>
                <p className="label mt-4">PB</p>
                <p className="num text-2xl font-bold text-muted">{formatDuration(pb.total)}</p>
                {cmp?.diff != null ? (
                  <p className={cn("num mt-2 text-2xl font-extrabold", cmp.isPb ? "text-push" : "text-low")} data-testid="sim-diff">
                    {formatSignedDuration(cmp.diff)} {cmp.isPb ? "PB" : ""}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 font-bold text-push">First simulation — this is your PB.</p>
            )}
            <div className="num mt-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="label">Running</p>
                <p className="font-bold">{formatDuration(totals.runTotal)}</p>
              </div>
              <div>
                <p className="label">Stations</p>
                <p className="font-bold">{formatDuration(totals.stationTotal)}</p>
              </div>
              <div>
                <p className="label">Roxzone</p>
                <p className="font-bold">{formatDuration(totals.roxzone)}</p>
              </div>
            </div>
          </>
        )}
      </section>

      {s.splits.length ? (
        <ol className="mb-3 max-h-36 overflow-y-auto rounded-2xl bg-surface p-2 text-sm" data-testid="sim-splits">
          {[...s.splits].reverse().map((x) => {
            const segInfo = HYROX_SEGMENTS[x.segment_index - 1];
            const ref = pb.splits[x.segment_index];
            return (
              <li key={x.segment_index} className="num flex items-center justify-between px-1 py-0.5">
                <span className="text-muted">{segInfo.label}</span>
                <span>
                  <span className="font-bold">{formatDuration(x.duration_seconds)}</span>
                  {ref ? <span className={cn("ml-2 text-xs", x.duration_seconds <= ref ? "text-push" : "text-low")}>{formatSignedDuration(x.duration_seconds - ref)}</span> : null}
                  {x.roxzone_seconds != null ? <span className="ml-2 text-xs text-faint">+{x.roxzone_seconds}s</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <div className="pb-safe space-y-2 pb-4">
        {s.phase === "idle" ? (
          <button type="button" onClick={start} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="sim-start">
            <Play className="h-6 w-6 fill-current" /> START · RUN 1
          </button>
        ) : s.phase === "segment" && seg ? (
          <button type="button" onClick={finishSegment} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="sim-done">
            <Check className="h-6 w-6" strokeWidth={3} /> {seg.label.toUpperCase()} DONE
          </button>
        ) : s.phase === "roxzone" ? (
          <button type="button" onClick={startNext} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="sim-next">
            <Play className="h-6 w-6 fill-current" /> START {nextSeg?.label.toUpperCase()}
          </button>
        ) : (
          <button type="button" onClick={save} disabled={pending} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="sim-save">
            {pending ? "SAVING…" : "SAVE RESULT"}
          </button>
        )}
        {s.phase !== "idle" ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={undo} disabled={s.splits.length === 0} className={buttonClass("secondary", "md")}>
              <Undo2 className="h-4 w-4" /> Undo
            </button>
            {s.phase === "done" ? (
              <button type="button" onClick={() => setS(INITIAL)} className={buttonClass("ghost", "md")}>
                Discard
              </button>
            ) : (
              <button type="button" onClick={() => setS({ ...s, phase: "done", finishedAt: Date.now(), segStartedAt: null, roxStartedAt: null })} className={buttonClass("ghost", "md")}>
                End here
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
