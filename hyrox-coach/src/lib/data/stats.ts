import type { Db, ViewRow } from "@/lib/supabase/types";
import type { SetRow } from "./sessions";
import { must } from "./util";

export type ExerciseSessionStat = ViewRow<"exercise_session_stats">;
export type PersonalBestRow = ViewRow<"exercise_personal_bests">;

export type ExerciseSessionHistory = {
  sessionId: string;
  date: string;
  stats: ExerciseSessionStat;
  sets: SetRow[];
};

export type ExerciseHistory = {
  exerciseId: string;
  /** Most recent first. */
  sessions: ExerciseSessionHistory[];
  pbs: Partial<Record<"heaviest" | "e1rm" | "most_reps" | "fastest", PersonalBestRow>>;
};

/**
 * Recent sessions (with their sets) and all-time PBs for several exercises in
 * three queries. Used by the workout logger ("Previous", "PB") and the coach context.
 */
export async function getExerciseHistories(
  db: Db,
  userId: string,
  exerciseIds: string[],
  opts: { sessions?: number; excludeSessionId?: string; sinceDate?: string } = {},
): Promise<Map<string, ExerciseHistory>> {
  const ids = [...new Set(exerciseIds)];
  const result = new Map<string, ExerciseHistory>(ids.map((id) => [id, { exerciseId: id, sessions: [], pbs: {} }]));
  if (ids.length === 0) return result;
  const perExercise = opts.sessions ?? 3;

  let statsQuery = db
    .from("exercise_session_stats")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_id", ids)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (opts.excludeSessionId) statsQuery = statsQuery.neq("session_id", opts.excludeSessionId);
  if (opts.sinceDate) statsQuery = statsQuery.gte("date", opts.sinceDate);

  const [statsRes, pbRes] = await Promise.all([
    statsQuery,
    db.from("exercise_personal_bests").select("*").eq("user_id", userId).in("exercise_id", ids),
  ]);
  const stats = must(statsRes, "load exercise stats");
  for (const pb of must(pbRes, "load personal bests")) {
    const h = result.get(pb.exercise_id!);
    if (h && pb.pb_type) h.pbs[pb.pb_type as keyof ExerciseHistory["pbs"]] = pb;
  }

  const picked: ExerciseSessionStat[] = [];
  for (const id of ids) picked.push(...stats.filter((s) => s.exercise_id === id).slice(0, perExercise));
  if (picked.length === 0) return result;

  const sets = must(
    await db
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .in("session_id", [...new Set(picked.map((p) => p.session_id!))])
      .in("exercise_id", ids)
      .order("set_number")
      .limit(1000),
    "load previous sets",
  );

  for (const stat of picked) {
    result.get(stat.exercise_id!)!.sessions.push({
      sessionId: stat.session_id!,
      date: stat.date!,
      stats: stat,
      sets: sets
        .filter((s) => s.session_id === stat.session_id && s.exercise_id === stat.exercise_id)
        .sort((a, b) => a.set_number - b.set_number || a.completed_at.localeCompare(b.completed_at)),
    });
  }
  return result;
}

/** Per-session stats for charts/trends (e.g. bench e1RM over 3 months). */
export async function listExerciseSessionStats(
  db: Db,
  userId: string,
  exerciseIds: string[],
  range: { from?: string; to?: string } = {},
): Promise<ExerciseSessionStat[]> {
  let q = db
    .from("exercise_session_stats")
    .select("*")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .order("started_at")
    .limit(1000);
  if (range.from) q = q.gte("date", range.from);
  if (range.to) q = q.lte("date", range.to);
  return must(await q, "load exercise trend");
}
