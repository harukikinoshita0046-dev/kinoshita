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
          <span className="label">体重</span>
          {last.weight != null ? <span className="num text-[11px] text-faint">前回 {formatNumber(last.weight, 1)} kg</span> : null}
        </div>
        <Stepper label="体重" value={v.weight} onChange={(x) => set("weight", x)} step={0.1} min={20} max={300} unit="kg" format={(x) => formatNumber(x, 1)} startAt={last.weight} testId="checkin-weight" />
      </div>

      <div className={card}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="label">睡眠</span>
          <span className="text-[11px] text-faint">昨夜</span>
        </div>
        <Stepper
          label="睡眠時間"
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
          <span className="label">HRV（ミリ秒）</span>
          <div className="mt-1">
            <Stepper label="HRV" value={v.hrv} onChange={(x) => set("hrv", Math.round(x))} step={1} min={1} max={300} size="md" startAt={last.hrv} inputMode="numeric" testId="checkin-hrv" />
          </div>
        </div>
        <div className={card}>
          <span className="label">安静時心拍</span>
          <div className="mt-1">
            <Stepper label="安静時心拍" value={v.resting_hr} onChange={(x) => set("resting_hr", Math.round(x))} step={1} min={25} max={150} size="md" startAt={last.resting_hr} inputMode="numeric" testId="checkin-rhr" />
          </div>
        </div>
      </div>

      <div className={`${card} space-y-4`}>
        <ScalePicker label="筋肉痛" name="soreness" value={v.soreness} onChange={(x) => set("soreness", x)} lowLabel="1 なし" highLabel="5 とても強い" invert />
        <ScalePicker label="疲労" name="fatigue" value={v.fatigue} onChange={(x) => set("fatigue", x)} lowLabel="1 元気" highLabel="5 ヘトヘト" invert />
        <ScalePicker label="やる気" name="motivation" value={v.motivation} onChange={(x) => set("motivation", x)} lowLabel="1 低い" highLabel="5 高い" />
        <div>
          <label htmlFor="checkin-note" className="label mb-1.5 block">
            コーチへのメモ（任意）
          </label>
          <input
            id="checkin-note"
            className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base focus:border-accent focus:outline-none"
            placeholder="例：昨日飲んだ、脚が重い"
            value={v.note ?? ""}
            maxLength={500}
            onChange={(e) => set("note", e.target.value || null)}
          />
        </div>
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
        {pending ? "保存中…" : "チェックインを保存"}
      </button>
      <p className="text-center text-[11px] text-faint">
        Apple ヘルスケアとの自動同期（睡眠・HRV・安静時心拍・体重）は Phase 2 の iOS アプリで対応予定です。iOS ショートカットから送ることもできます（PROFILE → Apple Health）。
      </p>
    </div>
  );
}
