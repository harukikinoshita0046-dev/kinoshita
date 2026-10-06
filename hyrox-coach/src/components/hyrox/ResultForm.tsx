"use client";

import { useState, useTransition } from "react";
import { saveHyroxResult } from "@/app/(app)/hyrox/actions";
import { buttonClass, cn, ErrorText, Field, inputClass } from "@/components/ui";
import { formatDuration, parseClock } from "@/lib/domain/format";
import { HYROX_DIVISION_LABELS, HYROX_SEGMENTS } from "@/lib/domain/hyrox";

/**
 * Manual entry for an official race result (or a simulation timed elsewhere).
 * Times are typed as m:ss — copied from the results page, not logged mid-workout.
 */
export function ResultForm({ today, division }: { today: string; division: string }) {
  const [eventType, setEventType] = useState<"race" | "simulation">("race");
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [div, setDiv] = useState(division);
  const [times, setTimes] = useState<string[]>(Array(16).fill(""));
  const [roxzone, setRoxzone] = useState("");
  const [official, setOfficial] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const parsed = times.map((t) => (t.trim() ? parseClock(t) : null));
  const sum = parsed.reduce<number>((a, v) => a + (v ?? 0), 0) + (parseClock(roxzone) ?? 0);

  const submit = () => {
    setError(undefined);
    if (parsed.some((v, i) => times[i].trim() !== "" && v == null)) {
      setError("スプリットは「分:秒」の形式で入力してください（例: 4:25）。");
      return;
    }
    startTransition(async () => {
      const res = await saveHyroxResult({
        date,
        event_type: eventType,
        division: div,
        name: name.trim() || null,
        splits: parsed
          .map((v, i) => (v == null ? null : { segment_index: i + 1, duration_seconds: v }))
          .filter((x): x is { segment_index: number; duration_seconds: number } => x != null),
        roxzone_total_seconds: roxzone.trim() ? roxzone.trim() : null,
        total_seconds: official.trim() ? official.trim() : null,
      });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5">
        {(["race", "simulation"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setEventType(t)}
            aria-pressed={eventType === t}
            className={cn("h-11 rounded-xl text-sm font-bold", eventType === t ? "bg-station text-black" : "bg-surface-2 text-muted")}
          >
            {t === "race" ? "レース" : "シミュレーション"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="日付">
          <input type="date" className={inputClass} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="部門">
          <select className={inputClass} value={div} onChange={(e) => setDiv(e.target.value)}>
            {Object.entries(HYROX_DIVISION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="大会名">
        <input className={inputClass} placeholder="HYROX Tokyo" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>

      <div className="rounded-2xl bg-surface p-3">
        <p className="label mb-2">スプリット（分:秒）</p>
        <div className="grid grid-cols-2 gap-2">
          {HYROX_SEGMENTS.map((seg, i) => (
            <label key={seg.index} className="block">
              <span className={cn("text-[11px] font-semibold", seg.type === "run" ? "text-muted" : "text-text")}>{seg.label}</span>
              <input
                className={cn(inputClass, "mt-1 h-10")}
                inputMode="numeric"
                placeholder={seg.type === "run" ? "4:30" : "4:00"}
                value={times[i]}
                onChange={(e) => setTimes(times.map((t, k) => (k === i ? e.target.value : t)))}
                aria-label={`${seg.label} のタイム`}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Roxzone 合計">
            <input className={cn(inputClass, "h-10")} inputMode="numeric" placeholder="5:10" value={roxzone} onChange={(e) => setRoxzone(e.target.value)} />
          </Field>
          <Field label="公式タイム（任意）">
            <input className={cn(inputClass, "h-10")} inputMode="numeric" placeholder="1:05:12" value={official} onChange={(e) => setOfficial(e.target.value)} />
          </Field>
        </div>
        <p className="num mt-2 text-xs text-muted">スプリット + Roxzone の合計: {sum ? formatDuration(sum) : "–"}</p>
      </div>

      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={submit} disabled={pending} className={buttonClass("primary", "lg", "w-full")} data-testid="save-result">
        {pending ? "保存中…" : "結果を保存"}
      </button>
    </div>
  );
}
