import type { UnitType } from "./exercise";
import { usesDistance, usesReps, usesTime, usesWeight } from "./exercise";
import { workingSets, type SetLike } from "./strength";

export type PrefillTarget = {
  weight?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  distance?: number | null;
  time?: number | null;
};

export type SetValues = {
  weight: number | null;
  reps: number | null;
  distance: number | null;
  time_seconds: number | null;
};

export type PrefillInput = {
  unit: UnitType;
  target: PrefillTarget;
  /** Working sets of the previous session for this exercise, in set order. */
  previousSets: SetLike[];
  /** 0-based index of the set being prefilled. */
  setIndex: number;
  /** The set just completed in this session (same exercise slot), if any. */
  lastCompleted: SetLike | null;
  defaultDistance?: number | null;
};

const clampToRange = (value: number, min?: number | null, max?: number | null) => {
  let v = value;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
};

/**
 * Default values for the next set so the athlete can usually just tap ✓:
 *   1. a set already completed in this slot -> repeat it
 *   2. otherwise: the coach's target weight, else last session's matching set,
 *      reps clamped into the target range.
 */
export function prefillSetValues(input: PrefillInput): SetValues {
  const { unit, target, setIndex, lastCompleted, defaultDistance } = input;
  const prev = workingSets(input.previousSets);
  const prevSame = prev[setIndex] ?? prev[prev.length - 1] ?? null;

  const pick = <K extends keyof SetValues>(enabled: boolean, value: number | null | undefined): SetValues[K] =>
    (enabled && value != null ? value : null) as SetValues[K];

  if (lastCompleted) {
    return {
      weight: pick(usesWeight(unit), lastCompleted.weight),
      reps: pick(usesReps(unit), lastCompleted.reps),
      distance: pick(usesDistance(unit), lastCompleted.distance),
      time_seconds: pick(usesTime(unit), lastCompleted.time_seconds),
    };
  }

  let weight: number | null = null;
  if (usesWeight(unit)) {
    weight = target.weight ?? prevSame?.weight ?? prev[0]?.weight ?? (unit === "bodyweight_reps" ? 0 : null);
  }

  let reps: number | null = null;
  if (usesReps(unit)) {
    const sameLoadAsBefore = prevSame != null && (prevSame.weight ?? 0) === (weight ?? 0);
    if (sameLoadAsBefore && prevSame?.reps != null) {
      reps = clampToRange(prevSame.reps, target.repsMin, target.repsMax);
    } else {
      reps = target.repsMax ?? target.repsMin ?? prevSame?.reps ?? 8;
    }
  }

  return {
    weight,
    reps,
    distance: usesDistance(unit) ? (target.distance ?? prevSame?.distance ?? defaultDistance ?? null) : null,
    time_seconds: usesTime(unit) ? (target.time ?? prevSame?.time_seconds ?? null) : null,
  };
}
