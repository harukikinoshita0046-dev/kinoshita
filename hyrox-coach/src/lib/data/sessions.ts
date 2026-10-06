import { workingSets } from "@/lib/domain/strength";
import type { WorkoutType } from "@/lib/domain/workout-types";
import type { Db, Insert, Row, ViewRow } from "@/lib/supabase/types";
import { createPlan, getPlan, setPlanStatus, type Plan } from "./plans";
import { DataError, must } from "./util";

export type SessionRow = Row<"workout_sessions">;
export type SetRow = Row<"workout_sets">;
export type SetInsert = Insert<"workout_sets">;
export type ExerciseSessionStat = ViewRow<"exercise_session_stats">;

/** Starts (or resumes) the session for a plan. Safe against double taps. */
export async function startSessionForPlan(db: Db, userId: string, planId: string, today: string): Promise<string> {
  const findActive = async () =>
    must(
      await db
        .from("workout_sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("workout_plan_id", planId)
        .eq("status", "in_progress")
        .maybeSingle(),
      "find active session",
    );

  const active = await findActive();
  if (active) return active.id;

  const plan = await getPlan(db, userId, planId);
  if (!plan) throw new DataError("Workout plan not found.", 404);

  const res = await db
    .from("workout_sessions")
    .insert({
      user_id: userId,
      workout_plan_id: planId,
      date: today,
      title: plan.title,
      workout_type: plan.workout_type,
      status: "in_progress",
    })
    .select("id")
    .single();
  if (res.error?.code === "23505") {
    const again = await findActive();
    if (again) return again.id;
  }
  const session = must(res, "start session");
  await setPlanStatus(db, userId, planId, "in_progress");
  return session.id;
}

/** "Quick start": an empty user plan for today plus its session; exercises are added while training. */
export async function startQuickSession(
  db: Db,
  userId: string,
  today: string,
  title = "Workout",
  workoutType: WorkoutType = "other",
): Promise<string> {
  const { planId } = await createPlan(db, userId, {
    date: today,
    title,
    workout_type: workoutType,
    created_by: "USER",
    source: "app",
    exercises: [],
  });
  return startSessionForPlan(db, userId, planId, today);
}

export type SessionDetail = { session: SessionRow; plan: Plan | null; sets: SetRow[] };

export async function getSessionDetail(db: Db, userId: string, sessionId: string): Promise<SessionDetail | null> {
  const session = must(
    await db.from("workout_sessions").select("*").eq("user_id", userId).eq("id", sessionId).maybeSingle(),
    "load session",
  );
  if (!session) return null;
  const [plan, sets] = await Promise.all([
    session.workout_plan_id ? getPlan(db, userId, session.workout_plan_id) : Promise.resolve(null),
    db
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("completed_at")
      .limit(1000),
  ]);
  return { session, plan, sets: must(sets, "load sets") };
}

export async function finishSession(
  db: Db,
  userId: string,
  sessionId: string,
  input: { session_rpe?: number | null; notes?: string | null; finished_at?: string },
): Promise<SessionRow> {
  const session = must(
    await db
      .from("workout_sessions")
      .update({
        status: "completed",
        finished_at: input.finished_at ?? new Date().toISOString(),
        session_rpe: input.session_rpe ?? null,
        notes: input.notes ?? null,
      })
      .eq("user_id", userId)
      .eq("id", sessionId)
      .eq("status", "in_progress")
      .select("*")
      .maybeSingle(),
    "finish session",
  );
  if (!session) throw new DataError("Session not found or already finished.", 409);
  if (session.workout_plan_id) await setPlanStatus(db, userId, session.workout_plan_id, "completed");
  return session;
}

/** Discards an in-progress session: sets are kept for the record but the plan goes back to "planned". */
export async function abandonSession(db: Db, userId: string, sessionId: string): Promise<void> {
  const session = must(
    await db
      .from("workout_sessions")
      .update({ status: "abandoned", finished_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", sessionId)
      .eq("status", "in_progress")
      .select("workout_plan_id")
      .maybeSingle(),
    "abandon session",
  );
  if (session?.workout_plan_id) await setPlanStatus(db, userId, session.workout_plan_id, "planned");
}

export async function deleteSession(db: Db, userId: string, sessionId: string): Promise<void> {
  must(await db.from("workout_sessions").delete().eq("user_id", userId).eq("id", sessionId), "delete session");
}

export type SessionSummary = SessionRow & {
  exercises: ExerciseSessionStat[];
  totalSets: number;
  totalVolumeKg: number;
};

export async function listSessions(
  db: Db,
  userId: string,
  opts: { from?: string; to?: string; limit?: number; status?: "completed" | "in_progress" } = {},
): Promise<SessionSummary[]> {
  let query = db
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "abandoned")
    .order("started_at", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.from) query = query.gte("date", opts.from);
  if (opts.to) query = query.lte("date", opts.to);
  if (opts.status) query = query.eq("status", opts.status);
  const sessions = must(await query, "list sessions");
  if (sessions.length === 0) return [];

  const stats = must(
    await db
      .from("exercise_session_stats")
      .select("*")
      .eq("user_id", userId)
      .in(
        "session_id",
        sessions.map((s) => s.id),
      )
      .limit(1000),
    "load session stats",
  );
  const bySession = new Map<string, ExerciseSessionStat[]>();
  for (const st of stats) {
    const list = bySession.get(st.session_id!) ?? [];
    list.push(st);
    bySession.set(st.session_id!, list);
  }
  return sessions.map((s) => {
    const ex = bySession.get(s.id) ?? [];
    return {
      ...s,
      exercises: ex,
      totalSets: ex.reduce((a, e) => a + (e.working_sets ?? 0), 0),
      totalVolumeKg: Math.round(ex.reduce((a, e) => a + Number(e.volume_kg ?? 0), 0)),
    };
  });
}

export async function upsertSet(db: Db, set: SetInsert): Promise<SetRow> {
  return must(await db.from("workout_sets").upsert(set, { onConflict: "id" }).select("*").single(), "save set");
}

export async function deleteSet(db: Db, userId: string, setId: string): Promise<void> {
  must(await db.from("workout_sets").delete().eq("user_id", userId).eq("id", setId), "delete set");
}

export function countWorkingSets(sets: SetRow[]): number {
  return workingSets(sets).length;
}
