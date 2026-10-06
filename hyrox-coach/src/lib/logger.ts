import type { PlanExerciseRow } from "./data/plans";
import type { ExerciseHistory } from "./data/stats";
import type { Exercise, UnitType } from "./domain/exercise";
import type { SetLike } from "./domain/strength";

/** Serializable view models shared by the workout page (server) and the logger (client). */
export type LoggerExercise = {
  id: string;
  name: string;
  unit: UnitType;
  increment: number;
  rest: number;
  defaultDistance: number | null;
  category: string;
  isStation: boolean;
};

export type LoggerTarget = {
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  weight: number | null;
  distance: number | null;
  time: number | null;
  rpe: number | null;
  paceMin: number | null;
  paceMax: number | null;
  hrZone: number | null;
  rest: number | null;
  note: string | null;
};

export type LoggerPb = {
  heaviest: { weight: number; reps: number | null } | null;
  e1rm: number | null;
  mostReps: { reps: number; weight: number | null } | null;
  fastest: { time: number; distance: number | null } | null;
};

export type LoggerSlot = {
  planExerciseId: string;
  exercise: LoggerExercise;
  originalExerciseId: string | null;
  target: LoggerTarget;
  previous: { date: string; sets: SetLike[]; avgRpe: number | null } | null;
  pb: LoggerPb;
};

export type LoggedSet = {
  id: string;
  plan_exercise_id: string | null;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  distance: number | null;
  time_seconds: number | null;
  rpe: number | null;
  completed_at: string;
  sync: "saved" | "saving" | "queued";
};

export function toLoggerExercise(e: Exercise): LoggerExercise {
  return {
    id: e.id,
    name: e.name,
    unit: e.unit_type,
    increment: Number(e.weight_increment),
    rest: e.default_rest_seconds,
    defaultDistance: e.default_distance_m,
    category: e.category,
    isStation: e.is_hyrox_station,
  };
}

export function fallbackExercise(id: string): LoggerExercise {
  return { id, name: id, unit: "weight_reps", increment: 2.5, rest: 90, defaultDistance: null, category: "other", isStation: false };
}

export function buildPb(history: ExerciseHistory | undefined): LoggerPb {
  const p = history?.pbs ?? {};
  return {
    heaviest: p.heaviest?.weight != null ? { weight: Number(p.heaviest.weight), reps: p.heaviest.reps } : null,
    e1rm: p.e1rm?.e1rm != null ? Number(p.e1rm.e1rm) : null,
    mostReps: p.most_reps?.reps != null ? { reps: p.most_reps.reps, weight: p.most_reps.weight == null ? null : Number(p.most_reps.weight) } : null,
    fastest:
      p.fastest?.time_seconds != null
        ? { time: p.fastest.time_seconds, distance: p.fastest.distance == null ? null : Number(p.fastest.distance) }
        : null,
  };
}

export function buildSlot(pe: PlanExerciseRow, exercise: LoggerExercise, history: ExerciseHistory | undefined): LoggerSlot {
  const last = history?.sessions[0];
  return {
    planExerciseId: pe.id,
    exercise,
    originalExerciseId: pe.original_exercise_id,
    target: {
      sets: pe.target_sets,
      repsMin: pe.target_reps_min,
      repsMax: pe.target_reps_max,
      weight: pe.target_weight,
      distance: pe.target_distance,
      time: pe.target_time,
      rpe: pe.target_rpe,
      paceMin: pe.target_pace_min,
      paceMax: pe.target_pace_max,
      hrZone: pe.target_hr_zone,
      rest: pe.rest_seconds,
      note: pe.coach_note,
    },
    previous: last
      ? {
          date: last.date,
          sets: last.sets.map((s) => ({
            set_number: s.set_number,
            weight: s.weight,
            reps: s.reps,
            distance: s.distance,
            time_seconds: s.time_seconds,
            rpe: s.rpe,
            is_warmup: s.is_warmup,
          })),
          avgRpe: last.stats.avg_rpe == null ? null : Number(last.stats.avg_rpe),
        }
      : null,
    pb: buildPb(history),
  };
}
