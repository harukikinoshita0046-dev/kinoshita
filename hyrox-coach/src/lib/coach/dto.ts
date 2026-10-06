import "server-only";

import type { Plan } from "@/lib/data/plans";
import { addDays, isIsoDate } from "@/lib/domain/dates";
import type { Exercise } from "@/lib/domain/exercise";
import { formatPlanTarget } from "@/lib/domain/plan-format";
import { ApiError } from "./api";

export function planDto(plan: Plan, exercises: Map<string, Exercise>) {
  return {
    id: plan.id,
    date: plan.date,
    title: plan.title,
    workout_type: plan.workout_type,
    status: plan.status,
    created_by: plan.created_by,
    coach_reason: plan.coach_reason,
    estimated_duration_min: plan.estimated_duration_min,
    created_at: plan.created_at,
    exercises: plan.exercises.map((e) => {
      const ex = exercises.get(e.exercise_id);
      const { main, details } = formatPlanTarget(e, ex?.unit_type ?? "weight_reps");
      return {
        order: e.order_index + 1,
        exercise_id: e.exercise_id,
        name: ex?.name ?? e.exercise_id,
        target: [main, ...details].filter(Boolean).join(" · "),
        target_sets: e.target_sets,
        target_reps_min: e.target_reps_min,
        target_reps_max: e.target_reps_max,
        target_weight: e.target_weight,
        target_distance: e.target_distance,
        target_time: e.target_time,
        target_rpe: e.target_rpe,
        target_pace_min: e.target_pace_min,
        target_pace_max: e.target_pace_max,
        target_hr_zone: e.target_hr_zone,
        rest_seconds: e.rest_seconds,
        coach_note: e.coach_note,
        added_in_session: e.added_in_session,
        original_exercise_id: e.original_exercise_id,
      };
    }),
  };
}

/** from/to query params with defaults and a maximum span. */
export function dateRange(params: URLSearchParams, today: string, defaults: { back: number; forward: number }, maxDays = 366) {
  const from = params.get("from") ?? addDays(today, -defaults.back);
  const to = params.get("to") ?? addDays(today, defaults.forward);
  if (!isIsoDate(from) || !isIsoDate(to)) throw new ApiError(400, "validation_error", "from/to must be YYYY-MM-DD.");
  if (from > to) throw new ApiError(400, "validation_error", "from must be on or before to.");
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86400000 > maxDays) {
    throw new ApiError(400, "validation_error", `Date range is limited to ${maxDays} days.`);
  }
  return { from, to };
}

export function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw == null) return fallback;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new ApiError(400, "validation_error", `${name} must be an integer between ${min} and ${max}.`);
  return v;
}

export function appUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}
