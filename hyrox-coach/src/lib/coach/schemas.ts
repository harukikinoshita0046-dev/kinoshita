import { z } from "zod";
import type { PlanExerciseInput, PlanInput } from "@/lib/data/plans";
import { isIsoDate } from "@/lib/domain/dates";
import { resolveExercise, type Exercise } from "@/lib/domain/exercise";
import { parseClock } from "@/lib/domain/format";
import { isWorkoutType, normalizeWorkoutType, WORKOUT_TYPE_LABELS, type WorkoutType } from "@/lib/domain/workout-types";
import { ApiError } from "./api";

/**
 * The AI client is forgiving about field names ("sets" vs "target_sets",
 * reps "6-8", pace "4:20-4:30"), so plan input is parsed loosely and then
 * normalised here with explicit, index-addressed validation errors.
 */
const looseNumber = z.union([z.number(), z.string()]).nullish();

const rawExercise = z.object({
  exercise_id: z.string().min(1).max(80).optional(),
  exercise: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80).optional(),
  sets: looseNumber,
  target_sets: looseNumber,
  reps: looseNumber,
  reps_min: looseNumber,
  reps_max: looseNumber,
  target_reps_min: looseNumber,
  target_reps_max: looseNumber,
  weight: looseNumber,
  target_weight: looseNumber,
  rpe: looseNumber,
  target_rpe: looseNumber,
  distance: looseNumber,
  distance_m: looseNumber,
  target_distance: looseNumber,
  time: looseNumber,
  time_seconds: looseNumber,
  target_time: looseNumber,
  pace: z.string().max(40).nullish(),
  target_pace: z.string().max(40).nullish(),
  pace_min: looseNumber,
  pace_max: looseNumber,
  target_pace_min: looseNumber,
  target_pace_max: looseNumber,
  hr_zone: looseNumber,
  target_hr_zone: looseNumber,
  rest: looseNumber,
  rest_seconds: looseNumber,
  note: z.string().max(500).nullish(),
  coach_note: z.string().max(500).nullish(),
});

export const createPlanBody = z.object({
  date: z.string().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  workout_type: z.string().min(1).max(40),
  coach_reason: z.string().max(2000).nullish(),
  estimated_duration_min: z.number().int().min(1).max(600).nullish(),
  exercises: z.array(rawExercise).max(30).default([]),
  replace_existing: z.boolean().optional(),
  idempotency_key: z.string().min(1).max(100).optional(),
});

export const updatePlanBody = z.object({
  date: z.string().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  workout_type: z.string().min(1).max(40).optional(),
  coach_reason: z.string().max(2000).nullish(),
  estimated_duration_min: z.number().int().min(1).max(600).nullish(),
  exercises: z.array(rawExercise).max(30).optional(),
});

export const patchPlanBody = z.object({
  status: z.enum(["planned", "skipped", "cancelled"]).optional(),
  coach_reason: z.string().max(2000).nullish(),
});

type Issue = { path: string; message: string };

function num(v: unknown, path: string, issues: Issue[], opts: { min: number; max: number; int?: boolean }): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n < opts.min || n > opts.max || (opts.int && !Number.isInteger(n))) {
    issues.push({ path, message: `must be ${opts.int ? "an integer" : "a number"} between ${opts.min} and ${opts.max}` });
    return null;
  }
  return n;
}

function clock(v: unknown, path: string, issues: Issue[], max: number): number | null {
  if (v == null || v === "") return null;
  const s = parseClock(typeof v === "number" ? v : String(v));
  if (s == null || s > max) {
    issues.push({ path, message: 'must be seconds or a time like "4:25"' });
    return null;
  }
  return s;
}

function repRange(v: unknown): { min: number; max: number } | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return { min: v, max: v };
  const m = /^\s*(\d+)\s*(?:[-–~〜]\s*(\d+))?\s*$/.exec(String(v));
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function paceRange(v: string | null | undefined): { min: number; max: number } | null {
  if (!v) return null;
  const parts = v.replace(/\/\s*km/i, "").split(/[-–~〜]/).map((p) => parseClock(p.trim()));
  if (parts.some((p) => p == null) || parts.length === 0 || parts.length > 2) return null;
  const [a, b = a] = parts as number[];
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function normalizeExercises(raw: z.infer<typeof rawExercise>[], exercises: Exercise[], basePath = "exercises"): PlanExerciseInput[] {
  const issues: Issue[] = [];
  const unknown: string[] = [];
  const out: PlanExerciseInput[] = raw.map((e, i) => {
    const p = `${basePath}.${i}`;
    const query = e.exercise_id ?? e.exercise ?? e.name;
    const ex = query ? resolveExercise(exercises, query) : undefined;
    if (!query) issues.push({ path: `${p}.exercise_id`, message: "is required" });
    else if (!ex) unknown.push(query);

    const range = repRange(e.reps);
    if (e.reps != null && !range) issues.push({ path: `${p}.reps`, message: 'must be a number or a range like "6-8"' });
    const repsMin = num(e.target_reps_min ?? e.reps_min, `${p}.reps_min`, issues, { min: 0, max: 1000, int: true }) ?? range?.min ?? null;
    const repsMax = num(e.target_reps_max ?? e.reps_max, `${p}.reps_max`, issues, { min: 0, max: 1000, int: true }) ?? range?.max ?? null;
    if (repsMin != null && repsMax != null && repsMin > repsMax) issues.push({ path: `${p}.reps_min`, message: "must be <= reps_max" });

    const paceText = paceRange(e.target_pace ?? e.pace);
    if ((e.target_pace ?? e.pace) && !paceText) issues.push({ path: `${p}.pace`, message: 'must look like "4:20-4:30"' });
    const paceMin = clock(e.target_pace_min ?? e.pace_min, `${p}.pace_min`, issues, 1200) ?? paceText?.min ?? null;
    const paceMax = clock(e.target_pace_max ?? e.pace_max, `${p}.pace_max`, issues, 1200) ?? paceText?.max ?? null;
    for (const [v, key] of [[paceMin, "pace_min"], [paceMax, "pace_max"]] as const) {
      if (v != null && (v < 120 || v > 1200)) issues.push({ path: `${p}.${key}`, message: "must be a pace between 2:00 and 20:00 per km" });
    }

    return {
      exercise_id: ex?.id ?? String(query ?? ""),
      target_sets: num(e.target_sets ?? e.sets, `${p}.sets`, issues, { min: 1, max: 50, int: true }),
      target_reps_min: repsMin,
      target_reps_max: repsMax,
      target_weight: num(e.target_weight ?? e.weight, `${p}.target_weight`, issues, { min: 0, max: 500 }),
      target_distance: num(e.target_distance ?? e.distance_m ?? e.distance, `${p}.target_distance`, issues, { min: 0, max: 100000 }),
      target_time: clock(e.target_time ?? e.time_seconds ?? e.time, `${p}.target_time`, issues, 36000),
      target_rpe: num(e.target_rpe ?? e.rpe, `${p}.target_rpe`, issues, { min: 1, max: 10 }),
      target_pace_min: paceMin,
      target_pace_max: paceMax,
      target_hr_zone: num(e.target_hr_zone ?? e.hr_zone, `${p}.hr_zone`, issues, { min: 1, max: 5, int: true }),
      rest_seconds: clock(e.rest_seconds ?? e.rest, `${p}.rest_seconds`, issues, 1800),
      coach_note: e.coach_note ?? e.note ?? null,
    };
  });

  if (unknown.length) {
    throw new ApiError(422, "unknown_exercise", `Unknown exercise: ${unknown.join(", ")}. Use an id from GET /api/coach/exercises.`, {
      unknown,
      valid_ids: exercises.filter((e) => e.active).map((e) => e.id),
    });
  }
  if (issues.length) throw new ApiError(400, "validation_error", "Request validation failed.", issues);
  return out;
}

export function resolveDate(input: string | undefined, today: string): string {
  if (!input) return today;
  if (!isIsoDate(input)) throw new ApiError(400, "validation_error", "date must be YYYY-MM-DD.");
  return input;
}

export function resolveWorkoutType(input: string): WorkoutType {
  const t = isWorkoutType(input) ? input : normalizeWorkoutType(input);
  return t;
}

export function toPlanInput(body: z.infer<typeof createPlanBody>, exercises: Exercise[], today: string): PlanInput {
  const workoutType = resolveWorkoutType(body.workout_type);
  return {
    date: resolveDate(body.date, today),
    title: body.title ?? (workoutType === "other" ? body.workout_type : `${WORKOUT_TYPE_LABELS[workoutType]}トレーニング`),
    workout_type: workoutType,
    created_by: "AI",
    coach_reason: body.coach_reason ?? null,
    estimated_duration_min: body.estimated_duration_min ?? null,
    source: "coach_api",
    idempotency_key: body.idempotency_key ?? null,
    exercises: normalizeExercises(body.exercises, exercises),
  };
}
