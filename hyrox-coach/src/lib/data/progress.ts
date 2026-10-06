import { startOfWeek } from "@/lib/domain/dates";
import { round } from "@/lib/domain/format";
import { hyroxLoadEntry, runLoadEntry, strengthLoadEntry } from "@/lib/domain/training-load";
import type { Db } from "@/lib/supabase/types";
import { listBodyMetrics, listHealthMetrics } from "./metrics";
import { listExerciseSessionStats } from "./stats";
import { fetchAll } from "./util";

export const RANGES = {
  "7d": { label: "7D", days: 7 },
  "30d": { label: "30D", days: 30 },
  "3m": { label: "3M", days: 91 },
  "6m": { label: "6M", days: 182 },
  "1y": { label: "1Y", days: 365 },
  all: { label: "ALL", days: null },
} as const;
export type RangeKey = keyof typeof RANGES;

export const PROGRESS_LIFTS = ["bench_press", "squat", "deadlift", "pull_up"] as const;

export type WeeklyPoint = { week: string; strength: number; run: number; hyrox: number; km: number; sessions: number; minutes: number };

/** Everything the Progress page charts, for one date range (paged past PostgREST's row cap). */
export async function loadProgressData(db: Db, userId: string, from: string | null, to: string) {
  const range = { from: from ?? undefined, to };
  const [body, health, sessions, runs, hyrox, lifts] = await Promise.all([
    listBodyMetrics(db, userId, range),
    listHealthMetrics(db, userId, range),
    fetchAll((a, b) => {
      let q = db
        .from("workout_sessions")
        .select("id, date, duration_seconds, session_rpe, status, workout_type")
        .eq("user_id", userId)
        .eq("status", "completed")
        .lte("date", to)
        .order("date")
        .range(a, b);
      if (from) q = q.gte("date", from);
      return q;
    }, "load sessions"),
    fetchAll((a, b) => {
      let q = db
        .from("running_sessions")
        .select("id, date, distance_km, duration_seconds, rpe, run_type, average_pace")
        .eq("user_id", userId)
        .lte("date", to)
        .order("date")
        .range(a, b);
      if (from) q = q.gte("date", from);
      return q;
    }, "load runs"),
    fetchAll((a, b) => {
      let q = db
        .from("hyrox_results")
        .select("id, date, total_seconds, event_type")
        .eq("user_id", userId)
        .eq("status", "completed")
        .lte("date", to)
        .order("date")
        .range(a, b);
      if (from) q = q.gte("date", from);
      return q;
    }, "load HYROX results"),
    listExerciseSessionStats(db, userId, [...PROGRESS_LIFTS], range),
  ]);

  const weeks = new Map<string, WeeklyPoint>();
  const week = (date: string) => {
    const key = startOfWeek(date);
    let w = weeks.get(key);
    if (!w) {
      w = { week: key, strength: 0, run: 0, hyrox: 0, km: 0, sessions: 0, minutes: 0 };
      weeks.set(key, w);
    }
    return w;
  };
  for (const s of sessions) {
    const e = strengthLoadEntry(s);
    const w = week(s.date);
    w.strength += e.load;
    w.minutes += e.minutes;
    w.sessions += 1;
  }
  for (const r of runs) {
    const e = runLoadEntry(r);
    const w = week(r.date);
    w.run += e.load;
    w.minutes += e.minutes;
    w.km = round(w.km + Number(r.distance_km), 1);
    w.sessions += 1;
  }
  for (const h of hyrox) {
    const e = hyroxLoadEntry(h);
    const w = week(h.date);
    w.hyrox += e.load;
    w.minutes += e.minutes;
    w.sessions += 1;
  }

  return {
    body,
    health,
    sessions,
    runs,
    hyrox,
    lifts,
    weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
  };
}
