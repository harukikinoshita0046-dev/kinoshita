"use client";

import { useEffect, useState, useTransition } from "react";
import { saveRun } from "@/app/(app)/run/actions";
import { NumberRow } from "@/components/Pickers";
import { Stepper } from "@/components/Stepper";
import { buttonClass, cn, ErrorText, Field, inputClass } from "@/components/ui";
import { formatDuration, formatNumber, formatPace, parseClock } from "@/lib/domain/format";
import { RUN_TYPE_LABELS, RUN_TYPES, type RunType } from "@/lib/domain/running";

export type RunDraft = {
  distance_km?: number;
  duration_seconds?: number;
  splits?: Array<{ distance_m: number; time_seconds: number }>;
  started_at?: string;
};

export const RUN_DRAFT_KEY = "hx:run-draft";

export function RunForm({
  today,
  planId,
  defaults,
}: {
  today: string;
  planId: string | null;
  defaults: { run_type: RunType; distance_km: number; duration_seconds: number };
}) {
  const [runType, setRunType] = useState<RunType>(defaults.run_type);
  const [date, setDate] = useState(today);
  const [distance, setDistance] = useState<number | null>(defaults.distance_km);
  const [duration, setDuration] = useState<number | null>(defaults.duration_seconds);
  const [avgHr, setAvgHr] = useState<number | null>(null);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [cadence, setCadence] = useState<number | null>(null);
  const [zones, setZones] = useState<string[]>(["", "", "", "", ""]);
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<RunDraft["splits"]>(undefined);
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  // A live interval session hands over its laps via sessionStorage.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RUN_DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(RUN_DRAFT_KEY);
      const draft = JSON.parse(raw) as RunDraft;
      /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from sessionStorage */
      if (draft.distance_km) setDistance(Math.round(draft.distance_km * 100) / 100);
      if (draft.duration_seconds) setDuration(draft.duration_seconds);
      if (draft.splits?.length) setSplits(draft.splits);
      if (draft.started_at) setStartedAt(draft.started_at);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore malformed drafts
    }
  }, []);

  const pace = distance && duration ? duration / distance : null;

  const submit = () => {
    setError(undefined);
    const zoneSeconds = zones.map((z) => (z.trim() === "" ? null : Math.round(Number(z) * 60)));
    startTransition(async () => {
      const res = await saveRun({
        date,
        run_type: runType,
        distance_km: distance ?? 0,
        duration_seconds: duration ?? 0,
        started_at: startedAt ?? null,
        workout_plan_id: planId,
        average_hr: avgHr,
        max_hr: maxHr,
        rpe,
        calories,
        cadence,
        zone1_seconds: zoneSeconds[0],
        zone2_seconds: zoneSeconds[1],
        zone3_seconds: zoneSeconds[2],
        zone4_seconds: zoneSeconds[3],
        zone5_seconds: zoneSeconds[4],
        splits: splits ?? null,
        notes: notes.trim() || null,
      });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label mb-2">Run type</p>
        <div className="grid grid-cols-4 gap-1.5">
          {RUN_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRunType(t)}
              aria-pressed={runType === t}
              className={cn("h-11 rounded-xl text-xs font-bold", runType === t ? "bg-run text-black" : "bg-surface-2 text-muted")}
            >
              {RUN_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-surface p-4">
        <p className="label mb-1">Distance</p>
        <Stepper label="distance" value={distance} onChange={setDistance} step={0.1} min={0} max={200} unit="km" format={(v) => formatNumber(v, 2)} testId="run-distance" />
        <p className="label mb-1 mt-4">Time</p>
        <Stepper
          label="time"
          value={duration}
          onChange={(v) => setDuration(Math.round(v))}
          step={30}
          min={0}
          max={172800}
          format={formatDuration}
          parse={parseClock}
          inputMode="text"
          testId="run-duration"
        />
        <p className="num mt-4 text-center text-sm text-muted">
          Pace <span className="text-lg font-bold text-text">{pace ? formatPace(pace) : "–"}</span> /km
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-3">
          <p className="label mb-1">Avg HR</p>
          <Stepper label="average heart rate" value={avgHr} onChange={setAvgHr} step={1} min={40} max={230} size="md" startAt={145} inputMode="numeric" />
        </div>
        <div className="rounded-2xl bg-surface p-3">
          <p className="label mb-1">Max HR</p>
          <Stepper label="max heart rate" value={maxHr} onChange={setMaxHr} step={1} min={40} max={240} size="md" startAt={170} inputMode="numeric" />
        </div>
      </div>

      <div>
        <p className="label mb-2">RPE</p>
        <NumberRow values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={rpe} onChange={setRpe} testId="run-rpe" />
      </div>

      {splits?.length ? (
        <div className="rounded-2xl bg-surface p-3">
          <p className="label mb-2">Laps from live session</p>
          <ol className="num grid grid-cols-3 gap-1 text-sm">
            {splits.map((s, i) => (
              <li key={i}>
                <span className="text-faint">{i + 1}.</span> {formatDuration(s.time_seconds)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <details className="rounded-2xl bg-surface p-3">
        <summary className="cursor-pointer text-sm font-semibold text-muted">More (date, cadence, calories, HR zones, notes)</summary>
        <div className="mt-3 space-y-3">
          <Field label="Date">
            <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cadence (spm)">
              <input className={inputClass} inputMode="numeric" value={cadence ?? ""} onChange={(e) => setCadence(e.target.value ? Number(e.target.value) : null)} />
            </Field>
            <Field label="Calories">
              <input className={inputClass} inputMode="numeric" value={calories ?? ""} onChange={(e) => setCalories(e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
          <div>
            <p className="label">HR zones (minutes)</p>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {zones.map((z, i) => (
                <input
                  key={i}
                  className={cn(inputClass, "px-2 text-center")}
                  inputMode="decimal"
                  placeholder={`Z${i + 1}`}
                  aria-label={`Zone ${i + 1} minutes`}
                  value={z}
                  onChange={(e) => setZones(zones.map((x, k) => (k === i ? e.target.value : x)))}
                />
              ))}
            </div>
          </div>
          <Field label="Notes">
            <textarea className={cn(inputClass, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </Field>
        </div>
      </details>

      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={submit} disabled={pending || !distance || !duration} className={buttonClass("primary", "lg", "w-full")} data-testid="save-run">
        {pending ? "SAVING…" : "SAVE RUN"}
      </button>
    </div>
  );
}
