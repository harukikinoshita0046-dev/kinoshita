"use client";

import { useActionState } from "react";
import { createExerciseAction, saveExerciseSettingsAction, type FormState } from "@/app/(app)/profile/actions";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";
import type { UnitType } from "@/lib/domain/exercise";

const INCREMENTS = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10];
const RESTS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const UNIT_LABEL: Record<UnitType, string> = {
  weight_reps: "重量 × 回数",
  bodyweight_reps: "自重（+加重）× 回数",
  reps: "回数のみ",
  distance_time: "距離 + タイム",
  weight_distance: "重量 + 距離",
  time: "タイム",
};
const CATEGORY_LABEL: Record<string, string> = {
  push: "プッシュ（押す）",
  pull: "プル（引く）",
  legs: "脚",
  hinge: "ヒンジ",
  core: "体幹",
  carry: "キャリー",
  hyrox_station: "HYROX ステーション",
  cardio: "有酸素",
  run: "ランニング",
  other: "その他",
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
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0">
          <span className={exercise.hidden ? "text-faint line-through" : "font-semibold"}>{exercise.name}</span>
          {exercise.is_custom ? <span className="ml-2 text-[11px] font-bold text-accent">オリジナル</span> : null}
          <span className="block font-mono text-[11px] text-faint">{exercise.id}</span>
        </span>
        <span className="num shrink-0 text-xs text-muted">
          {exercise.weight_increment} kg · {exercise.default_rest_seconds}秒
        </span>
      </summary>
      <form action={action} className="space-y-3 px-3 pb-3">
        <input type="hidden" name="exercise_id" value={exercise.id} />
        <p className="text-xs text-muted">{UNIT_LABEL[exercise.unit_type]}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="重量の刻み">
            <select name="weight_increment" defaultValue={exercise.weight_increment} className={inputClass}>
              {increments.map((v) => (
                <option key={v} value={v}>
                  {v} kg
                </option>
              ))}
            </select>
          </Field>
          <Field label="標準レスト">
            <select name="default_rest_seconds" defaultValue={exercise.default_rest_seconds} className={inputClass}>
              {rests.map((v) => (
                <option key={v} value={v}>
                  {v}秒
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="hidden" defaultChecked={exercise.hidden} className="h-5 w-5 accent-[var(--accent)]" /> 種目の選択肢に表示しない
        </label>
        <ErrorText>{state.error}</ErrorText>
        <button disabled={pending} className={buttonClass("secondary", "sm", "w-full")}>
          {pending ? "保存中…" : state.ok ? "保存しました ✓" : "保存"}
        </button>
      </form>
    </details>
  );
}

export function CustomExerciseForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createExerciseAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="種目名">
        <input name="name" required maxLength={80} className={inputClass} placeholder="例: Sled Drag" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="カテゴリ">
          <select name="category" className={inputClass} defaultValue="other">
            {["push", "pull", "legs", "hinge", "core", "carry", "hyrox_station", "cardio", "run", "other"].map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c] ?? c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="記録のしかた">
          <select name="unit_type" className={inputClass} defaultValue="weight_reps">
            {(Object.keys(UNIT_LABEL) as UnitType[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="重量の刻み">
          <select name="weight_increment" className={inputClass} defaultValue={2.5}>
            {INCREMENTS.map((v) => (
              <option key={v} value={v}>
                {v} kg
              </option>
            ))}
          </select>
        </Field>
        <Field label="標準レスト">
          <select name="default_rest_seconds" className={inputClass} defaultValue={90}>
            {RESTS.map((v) => (
              <option key={v} value={v}>
                {v}秒
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      {state.message ? <p className="text-sm font-semibold text-push">{state.message}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? "追加中…" : "種目を追加"}
      </button>
    </form>
  );
}
