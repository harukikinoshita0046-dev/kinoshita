import { addDays, type IsoDate } from "./dates";
import { round } from "./format";
import { estimatedRunRpe } from "./running";

/**
 * Training load in arbitrary units using session RPE (Foster): RPE × minutes.
 * Strength sessions, runs and HYROX efforts share the same scale.
 */
export type LoadEntry = {
  date: IsoDate;
  kind: "strength" | "run" | "hyrox";
  minutes: number;
  load: number;
};

export const DEFAULT_STRENGTH_RPE = 7;
export const HYROX_RACE_RPE = 9;
export const HYROX_SIMULATION_RPE = 8.5;

export function sessionLoad(rpe: number | null | undefined, durationSeconds: number | null | undefined, fallbackRpe: number) {
  const minutes = Math.max(0, (durationSeconds ?? 0) / 60);
  return { minutes: round(minutes, 1), load: round((rpe ?? fallbackRpe) * minutes, 0) };
}

export function strengthLoadEntry(s: {
  date: IsoDate;
  duration_seconds: number | null;
  session_rpe: number | null;
}): LoadEntry {
  return { date: s.date, kind: "strength", ...sessionLoad(s.session_rpe, s.duration_seconds, DEFAULT_STRENGTH_RPE) };
}

export function runLoadEntry(r: { date: IsoDate; duration_seconds: number; rpe: number | null; run_type: string }): LoadEntry {
  return { date: r.date, kind: "run", ...sessionLoad(r.rpe, r.duration_seconds, estimatedRunRpe(r.run_type)) };
}

export function hyroxLoadEntry(h: { date: IsoDate; total_seconds: number | null; event_type: string }): LoadEntry {
  const rpe = h.event_type === "race" ? HYROX_RACE_RPE : HYROX_SIMULATION_RPE;
  return { date: h.date, kind: "hyrox", ...sessionLoad(rpe, h.total_seconds, rpe) };
}

export function dailyLoads(entries: LoadEntry[]): Map<IsoDate, number> {
  const map = new Map<IsoDate, number>();
  for (const e of entries) map.set(e.date, (map.get(e.date) ?? 0) + e.load);
  return map;
}

function sumWindow(daily: Map<IsoDate, number>, endDate: IsoDate, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += daily.get(addDays(endDate, -i)) ?? 0;
  return total;
}

export type LoadSummary = {
  /** Sum of the 7 days ending at endDate. */
  acute7: number;
  /** Average weekly load over the 28 days ending at endDate. */
  chronicWeekly28: number;
  /** Acute:chronic workload ratio. A heuristic: ~0.8-1.3 is a typical range, >1.5 a spike. */
  acwr: number | null;
  /** Mean load of days with training in the 28-day window. */
  typicalSessionDayLoad: number | null;
  trainingDays7: number;
  daysSinceRest: number;
};

export function summarizeLoad(entries: LoadEntry[], endDate: IsoDate): LoadSummary {
  const daily = dailyLoads(entries);
  const acute7 = sumWindow(daily, endDate, 7);
  const chronic28 = sumWindow(daily, endDate, 28);
  const chronicWeekly28 = chronic28 / 4;

  const trainingDayLoads: number[] = [];
  let trainingDays7 = 0;
  for (let i = 0; i < 28; i++) {
    const load = daily.get(addDays(endDate, -i)) ?? 0;
    if (load > 0) {
      trainingDayLoads.push(load);
      if (i < 7) trainingDays7++;
    }
  }
  let daysSinceRest = 0;
  while (daysSinceRest < 60 && (daily.get(addDays(endDate, -daysSinceRest)) ?? 0) > 0) daysSinceRest++;

  return {
    acute7: round(acute7, 0),
    chronicWeekly28: round(chronicWeekly28, 0),
    acwr: chronicWeekly28 > 0 ? round(acute7 / chronicWeekly28, 2) : null,
    typicalSessionDayLoad: trainingDayLoads.length
      ? round(trainingDayLoads.reduce((a, b) => a + b, 0) / trainingDayLoads.length, 0)
      : null,
    trainingDays7,
    daysSinceRest,
  };
}

export function loadOnDate(entries: LoadEntry[], date: IsoDate): number {
  return entries.filter((e) => e.date === date).reduce((acc, e) => acc + e.load, 0);
}

export function interpretAcwr(acwr: number | null): string {
  if (acwr == null) return "not enough history";
  if (acwr < 0.8) return "below usual load";
  if (acwr <= 1.3) return "within usual range";
  if (acwr <= 1.5) return "above usual load";
  return "load spike";
}
