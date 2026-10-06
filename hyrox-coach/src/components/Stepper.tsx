"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./ui";

type StepperProps = {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  format?: (value: number) => string;
  /** Parses typed input; defaults to Number(). */
  parse?: (text: string) => number | null;
  inputMode?: "decimal" | "numeric" | "text";
  size?: "lg" | "md";
  testId?: string;
  /** First value set when the field is empty (e.g. 150 bpm), instead of stepping from 0. */
  startAt?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Big [-] value [+] control for one-handed use in the gym. Press and hold to
 * repeat (accelerates). Tap the number to type an exact value instead.
 */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = 100000,
  unit,
  format = (v) => String(round2(v)),
  parse = (t) => (t.trim() === "" || Number.isNaN(Number(t)) ? null : Number(t)),
  inputMode = "decimal",
  size = "lg",
  testId,
  startAt,
}: StepperProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const valueRef = useRef<number | null>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticks = useRef(0);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ticks.current = 0;
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => stop, [stop]);

  const apply = (direction: 1 | -1) => {
    const base = valueRef.current;
    const next =
      base == null
        ? (startAt ?? min)
        : Math.min(max, Math.max(min, round2(base + direction * step)));
    valueRef.current = next;
    onChange(next);
  };

  const start = (direction: 1 | -1) => {
    stop();
    apply(direction);
    const repeat = () => {
      ticks.current += 1;
      apply(direction);
      timer.current = setTimeout(repeat, ticks.current > 10 ? 50 : 110);
    };
    timer.current = setTimeout(repeat, 380);
  };

  const commit = () => {
    const parsed = parse(text);
    if (parsed != null && Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, round2(parsed))));
    setEditing(false);
  };

  const btn = cn(
    "flex shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-text active:bg-surface-3",
    size === "lg" ? "h-14 w-16" : "h-12 w-12",
  );

  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <button
        type="button"
        aria-label={`${label}を減らす`}
        className={btn}
        onPointerDown={(e) => {
          e.preventDefault();
          start(-1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && apply(-1)}
        data-testid={testId ? `${testId}-dec` : undefined}
      >
        <Minus className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1 text-center">
        {editing ? (
          <input
            autoFocus
            className="num w-full rounded-xl bg-surface-2 py-2 text-center text-4xl font-bold outline-none ring-2 ring-accent"
            inputMode={inputMode}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label={label}
            data-testid={testId ? `${testId}-input` : undefined}
          />
        ) : (
          <button
            type="button"
            className="w-full"
            onClick={() => {
              setText(value == null ? "" : format(value));
              setEditing(true);
            }}
            aria-label={`${label}: ${value == null ? "未設定" : format(value)}${unit ? ` ${unit}` : ""}（タップして入力）`}
          >
            <span
              className={cn("num font-extrabold leading-none", size === "lg" ? "text-[44px]" : "text-3xl")}
              data-testid={testId ? `${testId}-value` : undefined}
            >
              {value == null ? "–" : format(value)}
            </span>
            {unit ? <span className="ml-1 text-base font-semibold text-muted">{unit}</span> : null}
          </button>
        )}
      </div>

      <button
        type="button"
        aria-label={`${label}を増やす`}
        className={btn}
        onPointerDown={(e) => {
          e.preventDefault();
          start(1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && apply(1)}
        data-testid={testId ? `${testId}-inc` : undefined}
      >
        <Plus className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} strokeWidth={3} />
      </button>
    </div>
  );
}
