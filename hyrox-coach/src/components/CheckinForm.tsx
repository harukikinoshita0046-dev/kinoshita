"use client";

import { useState, useTransition } from "react";
import { saveCheckin } from "@/app/(app)/checkin/actions";
import { ScalePicker } from "@/components/Pickers";
import { Stepper } from "@/components/Stepper";
import { buttonClass, ErrorText } from "@/components/ui";
import { formatNumber, formatSleep } from "@/lib/domain/format";

/** "7h42m", "7h 42", "7:42" (h:mm), "7.5" (hours) or "462" (minutes) -> minutes. */
function parseSleep(text: string): number | null {
  const s = text.trim();
  const hm = /^(\d{1,2})\s*h\s*(\d{1,2})?\s*m?$/i.exec(s) ?? /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n <= 24 ? Math.round(n * 60) : Math.round(n);
}

type Values = {
  weight: number | null;
  sleep_minutes: number | null;
  hrv: number | null;
  resting_hr: number | null;
  soreness: number | null;
  fatigue: number | null;
  motivation: number | null;
  note: string | null;
};

/**
 * Morning check-in. Fields start with today's saved values; empty fields show
 * "–" and the first +/− tap starts from the last known value, so yesterday's
 * numbers are never saved as today's by accident.
 */
export function CheckinForm({ date, initial, last }: { date: string; initial: Values; last: Partial<Record<keyof Values, number>> }) {
  const [v, setV] = useState<Values>(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((prev) => ({ ...prev, [k]: value }));

  const card = "rounded-2xl bg-surface p-3";
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Weight</span>
          {last.weight != null ? <span className="num text-[11px] text-faint">last {formatNumber(last.weight, 1)} kg</span> : null}
        </div>
        <Stepper label="weight" value={v.weight} onChange={(x) => set("weight", x)} step={0.1} min={20} max={300} unit="kg" format={(x) => formatNumber(x, 1)} startAt={last.weight} testId="checkin-weight" />
      </div>

      <div className={card}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">Sleep</span>
          <span className="text-[11px] text-faint">last night</span>
        </div>
        <Stepper
          label="sleep"
          value={v.sleep_minutes}
          onChange={(x) => set("sleep_minutes", Math.round(x))}
          step={5}
          min={0}
          max={1440}
          format={formatSleep}
          parse={parseSleep}
          inputMode="text"
          startAt={last.sleep_minutes ?? 450}
          testId="checkin-sleep"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <span className="label">HRV (ms)</span>
          <div className="mt-1">
            <Stepper label="HRV" value={v.hrv} onChange={(x) => set("hrv", Math.round(x))} step={1} min={1} max={300} size="md" startAt={last.hrv} inputMode="numeric" testId="checkin-hrv" />
          </div>
        </div>
        <div className={card}>
          <span className="label">Resting HR</span>
          <div className="mt-1">
            <Stepper label="resting heart rate" value={v.resting_hr} onChange={(x) => set("resting_hr", Math.round(x))} step={1} min={25} max={150} size="md" startAt={last.resting_hr} inputMode="numeric" testId="checkin-rhr" />
          </div>
        </div>
      </div>

      <div className={`${card} space-y-4`}>
        <ScalePicker label="Muscle soreness · 筋肉痛" name="soreness" value={v.soreness} onChange={(x) => set("soreness", x)} lowLabel="1 none" highLabel="5 very sore" invert />
        <ScalePicker label="Fatigue · 疲労" name="fatigue" value={v.fatigue} onChange={(x) => set("fatigue", x)} lowLabel="1 fresh" highLabel="5 exhausted" invert />
        <ScalePicker label="Motivation · やる気" name="motivation" value={v.motivation} onChange={(x) => set("motivation", x)} lowLabel="1 low" highLabel="5 high" />
        <input
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none"
          placeholder="Note for your coach (e.g. 昨日飲んだ, 脚が重い)"
          value={v.note ?? ""}
          maxLength={500}
          onChange={(e) => set("note", e.target.value || null)}
        />
      </div>

      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("primary", "lg", "w-full")}
        data-testid="checkin-save"
        onClick={() =>
          startTransition(async () => {
            const res = await saveCheckin({ date, ...v });
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? "SAVING…" : "SAVE CHECK-IN"}
      </button>
      <p className="text-center text-[11px] text-faint">
        Apple Health sync (sleep, HRV, resting HR, weight) needs the Phase 2 iOS companion. You can also push values with an iOS Shortcut — see Profile → Apple Health.
      </p>
    </div>
  );
}
