import type { UnitType } from "./exercise";
import { formatDuration, formatNumber, formatPace } from "./format";

export type PlanTarget = {
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  target_distance: number | null;
  target_time: number | null;
  target_rpe: number | null;
  target_pace_min: number | null;
  target_pace_max: number | null;
  target_hr_zone: number | null;
  rest_seconds: number | null;
};

/** 1000 -> "1 km", 1500 -> "1.5 km", 50 -> "50 m" */
export function formatPlanDistance(meters: number): string {
  return meters >= 1000 ? `${formatNumber(meters / 1000, 2)} km` : `${formatNumber(meters, 1)} m`;
}

export function formatRepRange(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? String(min) : `${min}-${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return String(max);
  return null;
}

export function formatPaceRange(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return min === max ? `${formatPace(min)} /km` : `${formatPace(min)}-${formatPace(max)} /km`;
  if (min != null) return `${formatPace(min)} /km`;
  if (max != null) return `${formatPace(max)} /km`;
  return null;
}

/** "4 × 6-8" + ["82.5 kg", "RPE 8"]; "6 × 1 km" + ["4:20-4:30 /km", "Z4", "レスト90秒"]. */
export function formatPlanTarget(t: PlanTarget, unit: UnitType): { main: string; details: string[] } {
  const sets = t.target_sets ?? null;
  const reps = formatRepRange(t.target_reps_min, t.target_reps_max);
  let work: string | null = null;
  if (unit === "distance_time" || unit === "weight_distance") {
    work = t.target_distance ? formatPlanDistance(t.target_distance) : t.target_time ? formatDuration(t.target_time) : null;
  } else if (unit === "time") {
    work = t.target_time ? formatDuration(t.target_time) : null;
  } else {
    work = reps;
  }
  const main = sets && work ? `${sets} × ${work}` : sets ? `${sets}セット` : (work ?? "");

  const details: string[] = [];
  if (t.target_weight != null && unit !== "distance_time") {
    details.push(unit === "bodyweight_reps" ? (t.target_weight > 0 ? `+${formatNumber(t.target_weight)} kg` : "BW") : `${formatNumber(t.target_weight)} kg`);
  }
  if ((unit === "distance_time" || unit === "weight_distance") && t.target_time && t.target_distance) {
    details.push(`≤ ${formatDuration(t.target_time)}`);
  }
  const pace = formatPaceRange(t.target_pace_min, t.target_pace_max);
  if (pace) details.push(pace);
  if (t.target_hr_zone) details.push(`Z${t.target_hr_zone}`);
  if (t.target_rpe) details.push(`RPE ${formatNumber(t.target_rpe, 1)}`);
  if (t.rest_seconds != null) details.push(`レスト${t.rest_seconds >= 120 && t.rest_seconds % 60 === 0 ? `${t.rest_seconds / 60}分` : `${t.rest_seconds}秒`}`);
  return { main, details };
}
