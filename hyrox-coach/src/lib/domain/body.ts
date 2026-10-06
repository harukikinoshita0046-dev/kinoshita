import { addDays, diffDays, type IsoDate } from "./dates";
import { mean, round } from "./format";

export type WeightPoint = { date: IsoDate; weight: number };

/** Mean of the entries in the `days`-day window ending at `endDate` (needs >= minPoints entries). */
export function windowAverage(points: WeightPoint[], endDate: IsoDate, days = 7, minPoints = 2): number | null {
  const start = addDays(endDate, -(days - 1));
  const values = points.filter((p) => p.date >= start && p.date <= endDate).map((p) => p.weight);
  return values.length >= minPoints ? round(mean(values)!, 2) : null;
}

export type WeightTrend = {
  latest: WeightPoint | null;
  avg7: number | null;
  /** 7-day average now minus the 7-day average one week earlier. */
  weeklyChange: number | null;
  /** 7-day average now minus the 7-day average 30 days earlier. */
  monthlyChange: number | null;
  /** Weekly change as % of body weight (negative = losing). */
  weeklyRatePct: number | null;
  trend: "losing" | "stable" | "gaining" | null;
  toTarget: number | null;
  /** Projected date to reach target at the current weekly rate (only when moving toward it). */
  projectedTargetDate: IsoDate | null;
};

export function weightTrend(points: WeightPoint[], today: IsoDate, targetWeight?: number | null): WeightTrend {
  const sorted = [...points].filter((p) => p.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] ?? null;
  const avg7 = windowAverage(sorted, today, 7);
  const avgPrevWeek = windowAverage(sorted, addDays(today, -7), 7);
  const avgPrevMonth = windowAverage(sorted, addDays(today, -30), 7);

  const weeklyChange = avg7 != null && avgPrevWeek != null ? round(avg7 - avgPrevWeek, 2) : null;
  const monthlyChange = avg7 != null && avgPrevMonth != null ? round(avg7 - avgPrevMonth, 2) : null;
  const weeklyRatePct = weeklyChange != null && avgPrevWeek ? round((weeklyChange / avgPrevWeek) * 100, 2) : null;
  const trend =
    weeklyChange == null ? null : weeklyChange <= -0.15 ? "losing" : weeklyChange >= 0.15 ? "gaining" : "stable";

  const current = avg7 ?? latest?.weight ?? null;
  const toTarget = targetWeight != null && current != null ? round(current - targetWeight, 2) : null;
  let projectedTargetDate: IsoDate | null = null;
  if (toTarget != null && weeklyChange != null && toTarget !== 0 && Math.sign(weeklyChange) === -Math.sign(toTarget)) {
    const weeks = Math.abs(toTarget / weeklyChange);
    if (weeks < 104) projectedTargetDate = addDays(today, Math.round(weeks * 7));
  }

  return { latest, avg7, weeklyChange, monthlyChange, weeklyRatePct, trend, toTarget, projectedTargetDate };
}

/** Rolling 7-day average series for charts (one value per entry date). */
export function rollingAverageSeries(points: WeightPoint[], days = 7): WeightPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted
    .map((p) => ({ date: p.date, weight: windowAverage(sorted, p.date, days, 1) }))
    .filter((p): p is WeightPoint => p.weight != null);
}

/** Healthy-pace heuristic for fat loss while training hard: ~0.5-1.0% of body weight per week. */
export function lossRateAssessment(weeklyRatePct: number | null): "too_fast" | "on_track" | "slow" | "gaining" | null {
  if (weeklyRatePct == null) return null;
  if (weeklyRatePct < -1.0) return "too_fast";
  if (weeklyRatePct <= -0.25) return "on_track";
  if (weeklyRatePct <= 0.1) return "slow";
  return "gaining";
}

export function daysOfData(points: WeightPoint[], today: IsoDate): number {
  if (points.length === 0) return 0;
  const first = [...points].sort((a, b) => a.date.localeCompare(b.date))[0];
  return diffDays(today, first.date) + 1;
}
