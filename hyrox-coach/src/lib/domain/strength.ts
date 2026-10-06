import { formatDuration, formatNumber, mean, round } from "./format";
import type { UnitType } from "./exercise";

export type SetLike = {
  set_number?: number;
  weight: number | null;
  reps: number | null;
  distance?: number | null;
  time_seconds?: number | null;
  rpe: number | null;
  is_warmup?: boolean;
};

/** Epley estimated 1RM; only meaningful for 1-12 rep sets. */
export function epley1RM(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null || !(weight > 0) || reps < 1 || reps > 12) return null;
  return round(weight * (1 + reps / 30), 1);
}

export function workingSets<T extends SetLike>(sets: T[]): T[] {
  return sets.filter((s) => !s.is_warmup);
}

/** One set as text: "80×8", "+10×6", "1000 m 3:52", "152 kg 50 m", "1:30". */
export function formatSet(set: SetLike, unit: UnitType): string {
  const w = set.weight;
  switch (unit) {
    case "weight_reps":
      return `${formatNumber(w ?? 0)}×${set.reps ?? 0}`;
    case "bodyweight_reps":
      return w ? `+${formatNumber(w)}×${set.reps ?? 0}` : `BW×${set.reps ?? 0}`;
    case "reps":
      return `${set.reps ?? 0} reps`;
    case "distance_time":
      return [set.distance ? `${formatNumber(set.distance, 1)} m` : null, set.time_seconds ? formatDuration(set.time_seconds) : null]
        .filter(Boolean)
        .join(" ");
    case "weight_distance":
      return [
        w ? `${formatNumber(w)} kg` : null,
        set.distance ? `${formatNumber(set.distance, 1)} m` : null,
        set.time_seconds ? formatDuration(set.time_seconds) : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "time":
      return formatDuration(set.time_seconds ?? 0);
  }
}

/** "80×8, 80×8, 80×7, 80×6" */
export function summarizeSets(sets: SetLike[], unit: UnitType): string {
  return workingSets(sets)
    .map((s) => formatSet(s, unit))
    .join(", ");
}

/**
 * Shared parts once, the varying part per set:
 *   "80 kg · 8 / 8 / 7 / 6", "24 kg · 50 m · 0:24 / 0:27", "1000 m · 3:52 / 3:58".
 * Falls back to the full list when loads differ.
 */
export function compactSetSummary(sets: SetLike[], unit: UnitType): string {
  const ws = workingSets(sets);
  if (ws.length === 0) return "–";
  const same = <K extends keyof SetLike>(k: K) => ws.every((s) => (s[k] ?? null) === (ws[0][k] ?? null));
  if ((unit === "weight_reps" || unit === "bodyweight_reps") && same("weight")) {
    const load =
      unit === "bodyweight_reps"
        ? ws[0].weight
          ? `BW +${formatNumber(ws[0].weight)} kg`
          : "BW"
        : `${formatNumber(ws[0].weight ?? 0)} kg`;
    return `${load} · ${ws.map((s) => s.reps ?? 0).join(" / ")}`;
  }
  if ((unit === "distance_time" || unit === "weight_distance") && same("distance") && (unit === "distance_time" || same("weight"))) {
    const parts = [
      unit === "weight_distance" && ws[0].weight ? `${formatNumber(ws[0].weight)} kg` : null,
      ws[0].distance ? `${formatNumber(ws[0].distance, 1)} m` : null,
    ].filter(Boolean);
    const times = ws.every((s) => s.time_seconds) ? ws.map((s) => formatDuration(s.time_seconds!)).join(" / ") : `${ws.length} set${ws.length === 1 ? "" : "s"}`;
    return [...parts, times].join(" · ");
  }
  return summarizeSets(ws, unit);
}

export type SessionStats = {
  workingSets: number;
  topWeight: number | null;
  bestE1rm: number | null;
  volumeKg: number;
  totalReps: number;
  totalDistance: number;
  bestTime: number | null;
  avgRpe: number | null;
};

export function sessionStats(sets: SetLike[]): SessionStats {
  const ws = workingSets(sets);
  const weights = ws.map((s) => s.weight).filter((w): w is number => w != null && w > 0);
  const e1rms = ws.map((s) => epley1RM(s.weight, s.reps)).filter((v): v is number => v != null);
  const rpes = ws.map((s) => s.rpe).filter((v): v is number => v != null);
  const times = ws.map((s) => s.time_seconds).filter((v): v is number => v != null && v > 0);
  return {
    workingSets: ws.length,
    topWeight: weights.length ? Math.max(...weights) : null,
    bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
    volumeKg: round(ws.reduce((acc, s) => acc + (s.weight ?? 0) * (s.reps ?? 0), 0), 1),
    totalReps: ws.reduce((acc, s) => acc + (s.reps ?? 0), 0),
    totalDistance: ws.reduce((acc, s) => acc + (s.distance ?? 0), 0),
    bestTime: times.length ? Math.min(...times) : null,
    avgRpe: rpes.length ? round(mean(rpes)!, 1) : null,
  };
}

export type ProgressionTarget = {
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  rpe?: number | null;
};

export type ProgressionSuggestion = {
  action: "increase" | "repeat" | "decrease" | "none";
  weight: number | null;
  reason: string;
};

/**
 * Double progression on the last session's top working weight:
 *   all sets at the top of the rep range and RPE at/under target -> add one increment
 *   any set under the bottom of the range, or RPE >= 9.5 average     -> repeat (or drop if most sets missed)
 *   otherwise                                                         -> repeat and add reps
 * A hint for the coach, not a rule.
 */
export function suggestProgression(
  previousSets: SetLike[],
  target: ProgressionTarget,
  increment: number,
  unit: UnitType,
): ProgressionSuggestion {
  if (unit !== "weight_reps" && unit !== "bodyweight_reps") {
    return { action: "none", weight: null, reason: "Load progression applies to weight × reps exercises." };
  }
  const ws = workingSets(previousSets).filter((s) => s.reps != null);
  if (ws.length === 0) return { action: "none", weight: null, reason: "No previous working sets." };

  const topWeight = Math.max(...ws.map((s) => s.weight ?? 0));
  const atTop = ws.filter((s) => (s.weight ?? 0) === topWeight);
  const reps = atTop.map((s) => s.reps ?? 0);
  const rpes = atTop.map((s) => s.rpe).filter((v): v is number => v != null);
  const avgRpe = rpes.length ? mean(rpes)! : null;
  const repsMax = target.repsMax ?? target.repsMin ?? Math.max(...reps);
  const repsMin = target.repsMin ?? Math.min(...reps);
  const rpeCap = target.rpe ?? 8.5;
  const rpeText = avgRpe != null ? ` @ RPE ${round(avgRpe, 1)}` : "";
  const repsText = reps.join("/");
  const plannedSets = target.sets ?? atTop.length;

  const allAtTopOfRange = atTop.length >= plannedSets && reps.every((r) => r >= repsMax);
  const missedCount = reps.filter((r) => r < repsMin).length;

  if (allAtTopOfRange && (avgRpe == null || avgRpe <= rpeCap)) {
    return {
      action: "increase",
      weight: round(topWeight + increment, 2),
      reason: `${formatNumber(topWeight)} kg × ${repsText}${rpeText}: hit ${repsMax} reps on every set. Add ${formatNumber(increment)} kg.`,
    };
  }
  if (missedCount > atTop.length / 2 && missedCount >= 2) {
    const lower = Math.max(0, round(topWeight - increment, 2));
    return {
      action: "decrease",
      weight: lower,
      reason: `${formatNumber(topWeight)} kg × ${repsText}${rpeText}: most sets below ${repsMin} reps. Drop to ${formatNumber(lower)} kg.`,
    };
  }
  if (avgRpe != null && avgRpe >= 9.5) {
    return {
      action: "repeat",
      weight: topWeight,
      reason: `${formatNumber(topWeight)} kg × ${repsText}${rpeText}: near failure. Repeat and own the reps.`,
    };
  }
  return {
    action: "repeat",
    weight: topWeight,
    reason: `${formatNumber(topWeight)} kg × ${repsText}${rpeText}: repeat ${formatNumber(topWeight)} kg until ${repsMax} reps on all sets.`,
  };
}
