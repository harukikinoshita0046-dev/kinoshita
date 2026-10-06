"use client";

import { Pause, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { RpePicker } from "@/components/Pickers";
import { Stepper } from "@/components/Stepper";
import { usesDistance, usesReps, usesTime, usesWeight } from "@/lib/domain/exercise";
import { formatDuration, formatNumber, parseClock } from "@/lib/domain/format";
import type { LoggerExercise } from "@/lib/logger";

export type Draft = {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  time_seconds: number | null;
  rpe: number | null;
};

export function distanceStep(defaultDistance: number | null): number {
  if (!defaultDistance) return 10;
  if (defaultDistance >= 500) return 50;
  if (defaultDistance >= 100) return 10;
  return 5;
}

export function isDraftValid(unit: LoggerExercise["unit"], d: Draft): boolean {
  switch (unit) {
    case "weight_reps":
    case "bodyweight_reps":
    case "reps":
      return (d.reps ?? 0) > 0;
    case "distance_time":
      return (d.distance ?? 0) > 0 || (d.time_seconds ?? 0) > 0;
    case "weight_distance":
      return (d.distance ?? 0) > 0;
    case "time":
      return (d.time_seconds ?? 0) > 0;
  }
}

/** Live stopwatch that writes its result into the TIME field. */
function Stopwatch({ onStop }: { onStop: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt == null) {
    return (
      <button
        type="button"
        onClick={() => {
          const t = Date.now();
          setStartedAt(t);
          setNow(t);
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs font-bold text-muted active:bg-surface-3"
        data-testid="stopwatch-start"
      >
        <Timer className="h-4 w-4" /> TIMER
      </button>
    );
  }
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <button
      type="button"
      onClick={() => {
        onStop(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
        setStartedAt(null);
      }}
      className="num flex h-8 items-center gap-1.5 rounded-lg bg-recover px-2.5 text-sm font-bold text-white"
      data-testid="stopwatch-stop"
    >
      <Pause className="h-4 w-4 fill-current" /> {formatDuration(elapsed)} STOP
    </button>
  );
}

function Row({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex min-h-6 items-center justify-between">
        <span className="label">{label}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}

/** The inputs for one set, chosen by the exercise's unit type. */
export function SetFields({
  exercise,
  draft,
  onChange,
  showRpe = true,
}: {
  exercise: LoggerExercise;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  showRpe?: boolean;
}) {
  const unit = exercise.unit;
  return (
    <div className="space-y-3">
      {usesWeight(unit) ? (
        <Row label={unit === "bodyweight_reps" ? "Added weight" : "Weight"}>
          <Stepper
            label="weight"
            value={draft.weight ?? 0}
            onChange={(weight) => onChange({ weight })}
            step={exercise.increment}
            max={500}
            unit="kg"
            format={(v) => (unit === "bodyweight_reps" ? `+${formatNumber(v)}` : formatNumber(v))}
            parse={(t) => {
              const n = Number(t.replace("+", "").replace(",", "."));
              return Number.isFinite(n) ? n : null;
            }}
            testId="weight"
          />
        </Row>
      ) : null}
      {usesReps(unit) ? (
        <Row label="Reps">
          <Stepper
            label="reps"
            value={draft.reps ?? 0}
            onChange={(reps) => onChange({ reps: Math.round(reps) })}
            step={1}
            max={500}
            inputMode="numeric"
            testId="reps"
          />
        </Row>
      ) : null}
      {usesDistance(unit) ? (
        <Row label="Distance">
          <Stepper
            label="distance"
            value={draft.distance ?? 0}
            onChange={(distance) => onChange({ distance })}
            step={distanceStep(exercise.defaultDistance)}
            max={50000}
            unit="m"
            format={(v) => formatNumber(v, 1)}
            testId="distance"
          />
        </Row>
      ) : null}
      {usesTime(unit) ? (
        <Row label={unit === "weight_distance" ? "Time (optional)" : "Time"} extra={<Stopwatch onStop={(s) => onChange({ time_seconds: s })} />}>
          <Stepper
            label="time"
            value={draft.time_seconds ?? 0}
            onChange={(t) => onChange({ time_seconds: Math.round(t) })}
            step={5}
            max={36000}
            format={(v) => formatDuration(v)}
            parse={(t) => parseClock(t)}
            inputMode="text"
            testId="time"
          />
        </Row>
      ) : null}
      {showRpe ? (
        <Row label="RPE">
          <RpePicker value={draft.rpe} onChange={(rpe) => onChange({ rpe })} />
        </Row>
      ) : null}
    </div>
  );
}
