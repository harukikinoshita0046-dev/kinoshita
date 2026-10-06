"use client";

import { cn } from "./ui";

/** RPE: whole numbers big, half steps small. Tapping the selected value clears it. */
export function RpePicker({
  value,
  onChange,
  testId = "rpe",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  testId?: string;
}) {
  const whole = [6, 7, 8, 9, 10];
  const half = [6.5, 7.5, 8.5, 9.5];
  const btn = (v: number, small: boolean) => (
    <button
      key={v}
      type="button"
      onClick={() => onChange(value === v ? null : v)}
      aria-pressed={value === v}
      data-testid={`${testId}-${v}`}
      className={cn(
        "num flex items-center justify-center rounded-xl font-bold transition",
        small ? "h-8 text-sm" : "h-11 text-xl",
        value === v ? "bg-accent text-accent-ink" : "bg-surface-2 text-text active:bg-surface-3",
      )}
    >
      {v}
    </button>
  );
  return (
    <div className="space-y-1.5" role="group" aria-label="RPE">
      <div className="grid grid-cols-5 gap-1.5">{whole.map((v) => btn(v, false))}</div>
      <div className="grid grid-cols-5 gap-1.5 px-[10%]">
        {half.map((v) => btn(v, true))}
        <span />
      </div>
    </div>
  );
}

/** 1-10 session RPE row. */
export function NumberRow({
  values,
  value,
  onChange,
  testId,
}: {
  values: number[];
  value: number | null;
  onChange: (value: number | null) => void;
  testId?: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
          data-testid={testId ? `${testId}-${v}` : undefined}
          className={cn(
            "num h-12 rounded-xl text-lg font-bold",
            value === v ? "bg-accent text-accent-ink" : "bg-surface-2 active:bg-surface-3",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/** 1-5 tap scale with end labels (soreness, fatigue, motivation). */
export function ScalePicker({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
  name,
  invert = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  lowLabel: string;
  highLabel: string;
  name: string;
  /** true when a high number is bad (soreness, fatigue) — colours the selection accordingly. */
  invert?: boolean;
}) {
  const tone = (v: number) => {
    const good = invert ? v <= 2 : v >= 4;
    const bad = invert ? v >= 4 : v <= 2;
    return good ? "bg-push text-black" : bad ? "bg-low text-black" : "bg-moderate text-black";
  };
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{label}</span>
        <input type="hidden" name={name} value={value ?? ""} />
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(value === v ? null : v)}
            data-testid={`${name}-${v}`}
            className={cn("num h-12 rounded-xl text-lg font-bold", value === v ? tone(v) : "bg-surface-2 active:bg-surface-3")}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
