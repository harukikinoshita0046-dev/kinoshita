import { ApiError, coachRoute, notFound } from "@/lib/coach/api";
import { planDto } from "@/lib/coach/dto";
import { normalizeExercises, patchPlanBody, resolveDate, resolveWorkoutType, updatePlanBody } from "@/lib/coach/schemas";
import { indexExercises, listExercises } from "@/lib/data/exercises";
import { getPlan, replacePlan, setPlanStatus } from "@/lib/data/plans";
import { isUuid, must } from "@/lib/data/util";
import { formatDuration } from "@/lib/domain/format";
import { compactSetSummary } from "@/lib/domain/strength";

type Params = { id: string };

function requireId(id: string) {
  if (!isUuid(id)) notFound("Workout plan");
  return id;
}

/** The plan plus what actually happened (sets logged against it, linked runs / HYROX results). */
export const GET = coachRoute<Params>("read", async ({ db, userId }, { id }) => {
  const plan = await getPlan(db, userId, requireId(id));
  if (!plan) notFound("Workout plan");
  const [exercises, sessions, runs, hyrox] = await Promise.all([
    listExercises(db, userId, { includeInactive: true }),
    db.from("workout_sessions").select("*").eq("user_id", userId).eq("workout_plan_id", plan.id).order("started_at"),
    db.from("running_sessions").select("*").eq("user_id", userId).eq("workout_plan_id", plan.id),
    db.from("hyrox_results").select("id, date, event_type, total_seconds").eq("user_id", userId).eq("workout_plan_id", plan.id),
  ]);
  const byId = indexExercises(exercises);
  const sessionRows = must(sessions, "load sessions");
  const sets = sessionRows.length
    ? must(
        await db
          .from("workout_sets")
          .select("*")
          .eq("user_id", userId)
          .in(
            "session_id",
            sessionRows.map((s) => s.id),
          )
          .order("set_number"),
        "load sets",
      )
    : [];

  return {
    plan: planDto(plan, byId),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      status: s.status,
      started_at: s.started_at,
      finished_at: s.finished_at,
      duration_min: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
      session_rpe: s.session_rpe,
      notes: s.notes,
      results: plan.exercises.map((pe) => {
        const own = sets.filter((x) => x.session_id === s.id && x.plan_exercise_id === pe.id);
        const unit = byId.get(pe.exercise_id)?.unit_type ?? "weight_reps";
        return {
          exercise_id: pe.exercise_id,
          name: byId.get(pe.exercise_id)?.name ?? pe.exercise_id,
          target_sets: pe.target_sets,
          completed_sets: own.length,
          actual: compactSetSummary(own, unit),
          rpe: own.map((x) => x.rpe),
        };
      }),
    })),
    runs: must(runs, "load runs").map((r) => ({ id: r.id, date: r.date, distance_km: r.distance_km, duration: formatDuration(r.duration_seconds), splits: r.splits })),
    hyrox_results: must(hyrox, "load HYROX").map((h) => ({ ...h, total: formatDuration(h.total_seconds) })),
  };
});

/** Replaces a not-yet-started plan (fields and/or the full exercise list). */
export const PUT = coachRoute<Params>("write", async ({ db, userId, today, body }, { id }) => {
  const parsed = updatePlanBody.parse(body);
  const exercises = await listExercises(db, userId, { includeInactive: true });
  await replacePlan(
    db,
    userId,
    requireId(id),
    {
      ...(parsed.date ? { date: resolveDate(parsed.date, today) } : {}),
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.workout_type ? { workout_type: resolveWorkoutType(parsed.workout_type) } : {}),
      ...(parsed.coach_reason !== undefined ? { coach_reason: parsed.coach_reason } : {}),
      ...(parsed.estimated_duration_min !== undefined ? { estimated_duration_min: parsed.estimated_duration_min } : {}),
    },
    parsed.exercises ? normalizeExercises(parsed.exercises, exercises) : null,
  );
  const plan = await getPlan(db, userId, id);
  return { plan: plan ? planDto(plan, indexExercises(exercises)) : null };
});

/** Status change (skip / cancel / restore) or a new coach_reason. */
export const PATCH = coachRoute<Params>("write", async ({ db, userId, body }, { id }) => {
  const parsed = patchPlanBody.parse(body);
  const plan = await getPlan(db, userId, requireId(id));
  if (!plan) notFound("Workout plan");
  if (parsed.status) {
    if (plan.status === "in_progress" || plan.status === "completed") {
      throw new ApiError(409, "conflict", `Plan is ${plan.status}; it can no longer be ${parsed.status}.`);
    }
    await setPlanStatus(db, userId, plan.id, parsed.status);
  }
  if (parsed.coach_reason !== undefined) {
    must(await db.from("workout_plans").update({ coach_reason: parsed.coach_reason }).eq("user_id", userId).eq("id", plan.id), "update plan");
  }
  const updated = await getPlan(db, userId, plan.id);
  const exercises = await listExercises(db, userId, { includeInactive: true });
  return { plan: updated ? planDto(updated, indexExercises(exercises)) : null };
});

/** Cancels a plan that has not been started. */
export const DELETE = coachRoute<Params>("write", async ({ db, userId }, { id }) => {
  const plan = await getPlan(db, userId, requireId(id));
  if (!plan) notFound("Workout plan");
  if (plan.status === "in_progress" || plan.status === "completed") {
    throw new ApiError(409, "conflict", `Plan is ${plan.status} and cannot be cancelled.`);
  }
  await setPlanStatus(db, userId, plan.id, "cancelled");
  return { cancelled: true, id: plan.id };
});
