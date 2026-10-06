import type { Db, Row } from "@/lib/supabase/types";
import { fetchAll, must } from "./util";

export type BodyMetricRow = Row<"body_metrics">;
export type HealthMetricRow = Row<"health_metrics">;
export type CheckinRow = Row<"readiness_checkins">;
export type MetricSource = "manual" | "apple_health" | "import";

type Range = { from?: string; to?: string };

// --- body ----------------------------------------------------------------------

export type BodyMetricInput = {
  date: string;
  weight?: number | null;
  body_fat_percentage?: number | null;
  muscle_mass?: number | null;
  source?: MetricSource;
};

/** One row per date; only the fields provided are overwritten. */
export async function upsertBodyMetric(db: Db, userId: string, input: BodyMetricInput): Promise<BodyMetricRow> {
  const row = Object.fromEntries(Object.entries({ ...input, user_id: userId }).filter(([, v]) => v !== undefined));
  return must(
    await db
      .from("body_metrics")
      .upsert(row as BodyMetricInput & { user_id: string }, { onConflict: "user_id,date" })
      .select("*")
      .single(),
    "save body metrics",
  );
}

export async function listBodyMetrics(db: Db, userId: string, range: Range = {}): Promise<BodyMetricRow[]> {
  return fetchAll((from, to) => {
    let q = db.from("body_metrics").select("*").eq("user_id", userId).order("date").range(from, to);
    if (range.from) q = q.gte("date", range.from);
    if (range.to) q = q.lte("date", range.to);
    return q;
  }, "load body metrics");
}

export async function deleteBodyMetric(db: Db, userId: string, date: string) {
  must(await db.from("body_metrics").delete().eq("user_id", userId).eq("date", date), "delete body metrics");
}

// --- health (sleep / HRV / resting HR / steps) -----------------------------------

export type HealthMetricInput = {
  date: string;
  sleep_minutes?: number | null;
  hrv?: number | null;
  resting_hr?: number | null;
  steps?: number | null;
  active_calories?: number | null;
  vo2max?: number | null;
  source?: MetricSource;
};

export async function upsertHealthMetric(db: Db, userId: string, input: HealthMetricInput): Promise<HealthMetricRow> {
  const row = Object.fromEntries(Object.entries({ ...input, user_id: userId }).filter(([, v]) => v !== undefined));
  return must(
    await db
      .from("health_metrics")
      .upsert(row as HealthMetricInput & { user_id: string }, { onConflict: "user_id,date" })
      .select("*")
      .single(),
    "save health metrics",
  );
}

export async function listHealthMetrics(db: Db, userId: string, range: Range = {}): Promise<HealthMetricRow[]> {
  return fetchAll((from, to) => {
    let q = db.from("health_metrics").select("*").eq("user_id", userId).order("date").range(from, to);
    if (range.from) q = q.gte("date", range.from);
    if (range.to) q = q.lte("date", range.to);
    return q;
  }, "load health metrics");
}

// --- subjective check-in ---------------------------------------------------------

export type CheckinInput = {
  date: string;
  soreness?: number | null;
  fatigue?: number | null;
  motivation?: number | null;
  note?: string | null;
};

export async function upsertCheckin(db: Db, userId: string, input: CheckinInput): Promise<CheckinRow> {
  const row = Object.fromEntries(Object.entries({ ...input, user_id: userId }).filter(([, v]) => v !== undefined));
  return must(
    await db
      .from("readiness_checkins")
      .upsert(row as CheckinInput & { user_id: string }, { onConflict: "user_id,date" })
      .select("*")
      .single(),
    "save check-in",
  );
}

export async function listCheckins(db: Db, userId: string, range: Range = {}): Promise<CheckinRow[]> {
  let q = db.from("readiness_checkins").select("*").eq("user_id", userId).order("date").limit(1000);
  if (range.from) q = q.gte("date", range.from);
  if (range.to) q = q.lte("date", range.to);
  return must(await q, "load check-ins");
}
