"use client";

import { Flag, Play, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAlert, useNow, useStoredState, useWakeLock } from "@/components/logger/hooks";
import { buttonClass, cn } from "@/components/ui";
import { formatDuration, formatPace } from "@/lib/domain/format";
import { formatPaceRange, formatPlanDistance } from "@/lib/domain/plan-format";
import { RUN_DRAFT_KEY, type RunDraft } from "./RunForm";

export type RunSessionPlan = {
  planId: string;
  title: string;
  reps: number;
  distanceM: number | null;
  paceMin: number | null;
  paceMax: number | null;
  restSeconds: number;
  hrZone: number | null;
  note: string | null;
};

type Lap = { time_seconds: number; distance_m: number };
type Live = {
  phase: "idle" | "work" | "rest" | "done";
  startedAt: number | null;
  repStartedAt: number | null;
  restEndsAt: number | null;
  laps: Lap[];
};

const INITIAL: Live = { phase: "idle", startedAt: null, repStartedAt: null, restEndsAt: null, laps: [] };

function lapTone(lap: Lap, plan: RunSessionPlan): string {
  if (!plan.paceMin || !plan.paceMax || !lap.distance_m) return "text-text";
  const pace = (lap.time_seconds / lap.distance_m) * 1000;
  if (pace < plan.paceMin - 3) return "text-run"; // faster than target
  if (pace <= plan.paceMax + 3) return "text-push"; // on target
  return "text-low"; // slower
}

export function RunSession({ plan }: { plan: RunSessionPlan }) {
  const router = useRouter();
  const [live, setLive] = useStoredState<Live>(`hx:run-live:${plan.planId}`, INITIAL);
  const now = useNow(250);
  const { prime, alert } = useAlert();
  useWakeLock(live.phase === "work" || live.phase === "rest");
  const alerted = useRef<number | null>(null);

  const distance = plan.distanceM ?? 1000;

  // Rest over -> beep and start the next rep automatically.
  useEffect(() => {
    if (live.phase === "rest" && live.restEndsAt && now > 0 && now >= live.restEndsAt && alerted.current !== live.restEndsAt) {
      alerted.current = live.restEndsAt;
      alert();
      setLive({ ...live, phase: "work", repStartedAt: live.restEndsAt, restEndsAt: null });
    }
  }, [now, live, alert, setLive]);

  const start = () => {
    prime();
    const t = Date.now();
    setLive({ phase: "work", startedAt: t, repStartedAt: t, restEndsAt: null, laps: [] });
  };

  const lap = () => {
    prime();
    if (!live.repStartedAt) return;
    const t = Date.now();
    const laps = [...live.laps, { time_seconds: Math.max(1, Math.round((t - live.repStartedAt) / 1000)), distance_m: distance }];
    if (laps.length >= plan.reps) setLive({ ...live, laps, phase: "done", repStartedAt: null });
    else if (plan.restSeconds > 0) setLive({ ...live, laps, phase: "rest", repStartedAt: null, restEndsAt: t + plan.restSeconds * 1000 });
    else setLive({ ...live, laps, phase: "work", repStartedAt: t });
  };

  const skipRest = () => setLive({ ...live, phase: "work", repStartedAt: Date.now(), restEndsAt: null });
  const endEarly = () => setLive({ ...live, phase: "done", repStartedAt: null, restEndsAt: null });

  const save = () => {
    const totalSeconds = live.startedAt ? Math.round((Date.now() - live.startedAt) / 1000) : 0;
    const draft: RunDraft = {
      distance_km: live.laps.reduce((a, l) => a + l.distance_m, 0) / 1000,
      duration_seconds: totalSeconds,
      splits: live.laps,
      started_at: live.startedAt ? new Date(live.startedAt).toISOString() : undefined,
    };
    sessionStorage.setItem(RUN_DRAFT_KEY, JSON.stringify(draft));
    setLive(INITIAL);
    router.push(`/run/new?plan=${plan.planId}`);
  };

  const repElapsed = live.repStartedAt && now ? Math.max(0, Math.floor((now - live.repStartedAt) / 1000)) : 0;
  const restLeft = live.restEndsAt ? (now ? Math.max(0, Math.ceil((live.restEndsAt - now) / 1000)) : plan.restSeconds) : 0;
  const total = live.startedAt && now ? Math.max(0, Math.floor((now - live.startedAt) / 1000)) : 0;
  const repNo = Math.min(plan.reps, live.laps.length + 1);
  const targetTime =
    plan.paceMin && plan.paceMax ? `${formatDuration((plan.paceMin * distance) / 1000)}–${formatDuration((plan.paceMax * distance) / 1000)}` : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-safe">
      <header className="flex items-center justify-between py-3">
        <button type="button" onClick={() => router.push("/today")} aria-label="Close" className="rounded-full bg-surface-2 p-2.5 text-muted">
          <X className="h-5 w-5" />
        </button>
        <p className="font-bold">{plan.title}</p>
        <span className="num w-16 text-right text-sm text-muted">{formatDuration(total)}</span>
      </header>

      <section className="rounded-2xl bg-surface p-4">
        <p className="num text-3xl font-extrabold">
          {plan.reps > 1 ? `${plan.reps} × ` : ""}
          {formatPlanDistance(distance)}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="label">Target pace</p>
            <p className="num font-bold">{formatPaceRange(plan.paceMin, plan.paceMax) ?? "–"}</p>
          </div>
          <div>
            <p className="label">Rest</p>
            <p className="num font-bold">{plan.restSeconds ? `${plan.restSeconds} sec` : "–"}</p>
          </div>
          <div>
            <p className="label">Target HR</p>
            <p className="num font-bold">{plan.hrZone ? `Zone ${plan.hrZone}` : "–"}</p>
          </div>
        </div>
        {plan.note ? <p className="mt-2 text-sm text-muted">{plan.note}</p> : null}
      </section>

      <section className="flex flex-1 flex-col items-center justify-center py-6 text-center" aria-live="polite">
        {live.phase === "idle" ? (
          <p className="text-muted">Start your watch workout too — heart rate import comes with the iOS app (Phase 2).</p>
        ) : live.phase === "work" ? (
          <>
            <p className="label text-run">
              REP {repNo} / {plan.reps}
            </p>
            <p className="num mt-2 text-8xl font-extrabold leading-none" data-testid="rep-clock">
              {formatDuration(repElapsed)}
            </p>
            {targetTime ? <p className="num mt-3 text-muted">target {targetTime}</p> : null}
          </>
        ) : live.phase === "rest" ? (
          <>
            <p className="label text-accent">REST · next rep {repNo}</p>
            <p className="num mt-2 text-8xl font-extrabold leading-none text-accent">{formatDuration(restLeft)}</p>
          </>
        ) : (
          <>
            <p className="label text-push">DONE</p>
            <p className="num mt-2 text-6xl font-extrabold">{formatDuration(total)}</p>
            <p className="mt-1 text-sm text-muted">{live.laps.length} laps</p>
          </>
        )}
      </section>

      {live.laps.length ? (
        <ol className="mb-4 grid grid-cols-3 gap-1.5" data-testid="laps">
          {live.laps.map((l, i) => (
            <li key={i} className="num rounded-xl bg-surface px-2 py-2 text-center">
              <span className="block text-[10px] text-faint">#{i + 1}</span>
              <span className={cn("text-lg font-bold", lapTone(l, plan))}>{formatDuration(l.time_seconds)}</span>
              <span className="block text-[10px] text-muted">{formatPace((l.time_seconds / l.distance_m) * 1000)}/km</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="pb-safe space-y-2 pb-4">
        {live.phase === "idle" ? (
          <button type="button" onClick={start} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="run-start">
            <Play className="h-6 w-6 fill-current" /> START
          </button>
        ) : live.phase === "work" ? (
          <>
            <button type="button" onClick={lap} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="run-lap">
              <Flag className="h-6 w-6" /> {live.laps.length + 1 >= plan.reps ? "FINISH REP" : "LAP"}
            </button>
            <button type="button" onClick={endEarly} className={buttonClass("ghost", "md", "w-full")}>
              <Square className="h-4 w-4" /> End early
            </button>
          </>
        ) : live.phase === "rest" ? (
          <button type="button" onClick={skipRest} className={buttonClass("secondary", "lg", "h-20 w-full text-xl")} data-testid="run-skip-rest">
            SKIP REST · GO
          </button>
        ) : (
          <>
            <button type="button" onClick={save} className={buttonClass("primary", "lg", "h-20 w-full text-xl")} data-testid="run-save">
              SAVE RUN
            </button>
            <button type="button" onClick={() => setLive(INITIAL)} className={buttonClass("ghost", "md", "w-full")}>
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
