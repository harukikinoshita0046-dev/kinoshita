"use client";

import { useActionState } from "react";
import { startPastWorkout, type PastWorkoutState } from "@/app/(app)/history/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";
import { WORKOUT_TYPE_LABELS, type WorkoutType } from "@/lib/domain/workout-types";

const TYPES: WorkoutType[] = ["upper", "lower", "full_body", "hyrox", "conditioning", "recovery", "other"];

export function PastWorkoutForm({ today, defaultDate }: { today: string; defaultDate: string }) {
  const [state, action] = useActionState<PastWorkoutState, FormData>(startPastWorkout, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="日付">
          <input type="date" name="date" required className={inputClass} defaultValue={defaultDate} max={today} data-testid="past-date" />
        </Field>
        <Field label="開始時刻">
          <input type="time" name="start_time" required className={inputClass} defaultValue="18:00" />
        </Field>
      </div>
      <Field label="タイトル">
        <input name="title" required maxLength={120} className={inputClass} defaultValue="トレーニング" placeholder="例: HYROX Upper" />
      </Field>
      <Field label="種類">
        <select name="workout_type" className={inputClass} defaultValue="other">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {WORKOUT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <SubmitButton className={buttonClass("primary", "lg", "w-full")} pendingText="準備しています…" data-testid="past-start">
        記録画面を開く
      </SubmitButton>
    </form>
  );
}
