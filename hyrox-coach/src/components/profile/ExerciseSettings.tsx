"use client";

import { useActionState } from "react";
import { createExerciseAction, saveExerciseSettingsAction, type FormState } from "@/app/(app)/profile/actions";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";
import type { UnitType } from "@/lib/domain/exercise";

const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10];
const RESTS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const UNIT_LABEL: Record<UnitType, string> = {
  weight_reps: "Weight × reps",
  bodyweight_reps: "Bodyweight (+load) × reps",
  reps: "Reps only",
  distance_time: "Distance + time",
  weight_distance: "Weight + distance",
  time: "Time",
};

export function ExerciseSettingsRow({
  exercise,
}: {
  exercise: { id: string; name: string; unit_type: UnitType; weight_increment: number; default_rest_seconds: number; hidden: boolean; is_custom: boolean };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExerciseSettingsAction, {});
  const increments = INCREMENTS.includes(exercise.weight_increment) ? INCREMENTS : [...INCREMENTS, exercise.weight_increment].sort((a, b) => a - b);
  const rests = RESTS.includes(exercise.default_rest_seconds) ? RESTS : [...RESTS, exercise.default_rest_seconds].sort((a, b) => a - b);
  return (
    <details className="group rounded-xl bg-surface-2 open:bg-surface-3/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0">
          <span className={exercise.hidden ? "text-faint line-through" : "font-semibold"}>{exercise.name}</span>
          {exercise.is_custom ? <span className="ml-2 text-[10px] font-bold text-accent">CUSTOM</span> : null}
          <span className="block font-mono text-[10px] text-faint">{exercise.id}</span>
        </span>
        <span className="num shrink-0 text-xs text-muted">
          {exercise.weight_increment} kg · {exercise.default_rest_seconds}s
        </span>
      </summary>
      <form action={action} className="space-y-3 px-3 pb-3">
        <input type="hidden" name="exercise_id" value={exercise.id} />
        <p className="text-xs text-muted">{UNIT_LABEL[exercise.unit_type]}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Weight step">
            <select name="weight_increment" defaultValue={exercise.weight_increment} className={inputClass}>
              {increments.map((v) => (
                <option key={v} value={v}>
                  {v} kg
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default rest">
            <select name="default_rest_seconds" defaultValue={exercise.default_rest_seconds} className={inputClass}>
              {rests.map((v) => (
                <option key={v} value={v}>
                  {v}s
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hidden" defaultChecked={exercise.hidden} className="h-4 w-4 accent-[var(--accent)]" /> Hide from exercise picker
        </label>
        <ErrorText>{state.error}</ErrorText>
        <button disabled={pending} className={buttonClass("secondary", "sm", "w-full")}>
          {pending ? "…" : state.ok ? "SAVED ✓" : "SAVE"}
        </button>
      </form>
    </details>
  );
}

export function CustomExerciseForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createExerciseAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Name">
        <input name="name" required maxLength={80} className={inputClass} placeholder="e.g. Sled Drag" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select name="category" className={inputClass} defaultValue="other">
            {["push", "pull", "legs", "hinge", "core", "carry", "hyrox_station", "cardio", "run", "other"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Logged as">
          <select name="unit_type" className={inputClass} defaultValue="weight_reps">
            {(Object.keys(UNIT_LABEL) as UnitType[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight step">
          <select name="weight_increment" className={inputClass} defaultValue={2.5}>
            {INCREMENTS.map((v) => (
              <option key={v} value={v}>
                {v} kg
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default rest">
          <select name="default_rest_seconds" className={inputClass} defaultValue={90}>
            {RESTS.map((v) => (
              <option key={v} value={v}>
                {v}s
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      {state.message ? <p className="text-sm font-semibold text-push">{state.message}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? "…" : "ADD EXERCISE"}
      </button>
    </form>
  );
}
