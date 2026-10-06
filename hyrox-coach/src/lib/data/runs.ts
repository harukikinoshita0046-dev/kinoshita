import type { RunType } from "@/lib/domain/running";
import type { Db, Row } from "@/lib/supabase/types";
import { DataError, must } from "./util";

export type RunRow = Row<"running_sessions">;

export type RunSplit = { distance_m: number; time_seconds: number; average_hr?: number | null };

export type RunInput = {
  date: string;
  run_type: RunType;
  distance_km: number;
  duration_seconds: number;
  started_at?: string | null;
  workout_plan_id?: string | null;
  average_hr?: number | null;
  max_hr?: number | null;
  cadence?: number | null;
  calories?: number | null;
  elevation_gain_m?: number | null;
  rpe?: number | null;
  zone1_seconds?: number | null;
  zone2_seconds?: number | null;
  zone3_seconds?: number | null;
  zone4_seconds?: number | null;
  zone5_seconds?: number | null;
  splits?: RunSplit[] | null;
  notes?: string | null;
  source?: "manual" | "apple_health" | "import";
  external_id?: string | null;
};

export async function createRun(db: Db, userId: string, input: RunInput): Promise<RunRow> {
  const row = { ...input, user_id: userId, source: input.source ?? "manual" };
  const res =
    input.external_id != null
      ? await db.from("running_sessions").upsert(row, { onConflict: "user_id,source,external_id" }).select("*").single()
      : await db.from("running_sessions").insert(row).select("*").single();
  const run = must(res, "save run");
  if (input.workout_plan_id) {
    must(
      await db
        .from("workout_plans")
        .update({ status: "completed" })
        .eq("user_id", userId)
        .eq("id", input.workout_plan_id),
      "complete run plan",
    );
  }
  return run;
}

export async function listRuns(db: Db, userId: string, opts: { from?: string; to?: string; limit?: number } = {}) {
  let q = db
    .from("running_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.from) q = q.gte("date", opts.from);
  if (opts.to) q = q.lte("date", opts.to);
  return must(await q, "list runs");
}

export async function getRun(db: Db, userId: string, id: string): Promise<RunRow> {
  const run = must(await db.from("running_sessions").select("*").eq("user_id", userId).eq("id", id).maybeSingle(), "load run");
  if (!run) throw new DataError("Run not found.", 404);
  return run;
}

export async function deleteRun(db: Db, userId: string, id: string) {
  must(await db.from("running_sessions").delete().eq("user_id", userId).eq("id", id), "delete run");
}
