import type { WorkoutType } from "@/lib/domain/workout-types";
import type { Db, Row } from "@/lib/supabase/types";
import { DataError, must } from "./util";

export type PlanRow = Row<"workout_plans">;
export type PlanExerciseRow = Row<"workout_plan_exercises">;
export type Plan = PlanRow & { exercises: PlanExerciseRow[] };
export type PlanStatus = "planned" | "in_progress" | "completed" | "skipped" | "cancelled";

const PLAN_SELECT = "*, exercises:workout_plan_exercises(*)";

export type PlanExerciseInput = {
  exercise_id: string;
  target_sets?: number | null;
  target_reps_min?: number | null;
  target_reps_max?: number | null;
  target_weight?: number | null;
  target_distance?: number | null;
  target_time?: number | null;
  target_rpe?: number | null;
  target_pace_min?: number | null;
  target_pace_max?: number | null;
  target_hr_zone?: number | null;
  rest_seconds?: number | null;
  coach_note?: string | null;
};

export type PlanInput = {
  date: string;
  title: string;
  workout_type: WorkoutType;
  created_by: "AI" | "USER";
  coach_reason?: string | null;
  estimated_duration_min?: number | null;
  source?: string | null;
  idempotency_key?: string | null;
  exercises: PlanExerciseInput[];
};

function sortExercises(plan: Plan): Plan {
  return { ...plan, exercises: [...(plan.exercises ?? [])].sort((a, b) => a.order_index - b.order_index) };
}

const toRpcExercises = (exercises: PlanExerciseInput[]) =>
  exercises.map((e, i) => ({
    order_index: i,
    exercise_id: e.exercise_id,
    target_sets: e.target_sets ?? null,
    target_reps_min: e.target_reps_min ?? null,
    target_reps_max: e.target_reps_max ?? null,
    target_weight: e.target_weight ?? null,
    target_distance: e.target_distance ?? null,
    target_time: e.target_time ?? null,
    target_rpe: e.target_rpe ?? null,
    target_pace_min: e.target_pace_min ?? null,
    target_pace_max: e.target_pace_max ?? null,
    target_hr_zone: e.target_hr_zone ?? null,
    rest_seconds: e.rest_seconds ?? null,
    coach_note: e.coach_note ?? null,
  }));

/** Creates a plan atomically. With an idempotency key, a retried request returns the original plan. */
export async function createPlan(
  db: Db,
  userId: string,
  input: PlanInput,
  opts: { replaceExisting?: boolean } = {},
): Promise<{ planId: string; created: boolean }> {
  const rows = must(
    await db.rpc("create_workout_plan", {
      p_user_id: userId,
      p_plan: {
        date: input.date,
        title: input.title,
        workout_type: input.workout_type,
        created_by: input.created_by,
        coach_reason: input.coach_reason ?? null,
        estimated_duration_min: input.estimated_duration_min ?? null,
        source: input.source ?? null,
        idempotency_key: input.idempotency_key ?? null,
      },
      p_exercises: toRpcExercises(input.exercises),
      p_replace_existing: opts.replaceExisting ?? false,
    }),
    "create workout plan",
  );
  const row = rows?.[0];
  if (!row) throw new DataError("create workout plan: no result");
  return { planId: row.plan_id, created: row.created };
}

export async function replacePlan(
  db: Db,
  userId: string,
  planId: string,
  patch: Partial<Pick<PlanInput, "date" | "title" | "workout_type" | "coach_reason" | "estimated_duration_min">>,
  exercises: PlanExerciseInput[] | null,
): Promise<void> {
  const res = await db.rpc("replace_workout_plan", {
    p_user_id: userId,
    p_plan_id: planId,
    p_plan: patch,
    p_exercises: exercises ? toRpcExercises(exercises) : null,
  });
  if (res.error?.code === "P0002") throw new DataError("Workout plan not found or already started.", 409);
  must(res, "replace workout plan");
}

export async function getPlan(db: Db, userId: string, planId: string): Promise<Plan | null> {
  const plan = must(
    await db.from("workout_plans").select(PLAN_SELECT).eq("user_id", userId).eq("id", planId).maybeSingle(),
    "load workout plan",
  );
  return plan ? sortExercises(plan as Plan) : null;
}

const STATUS_ORDER: Record<string, number> = { in_progress: 0, planned: 1, completed: 2, skipped: 3, cancelled: 4 };

export async function getPlansForDate(db: Db, userId: string, date: string): Promise<Plan[]> {
  const plans = must(
    await db
      .from("workout_plans")
      .select(PLAN_SELECT)
      .eq("user_id", userId)
      .eq("date", date)
      .neq("status", "cancelled")
      .order("created_at"),
    "load plans",
  ) as Plan[];
  return plans.map(sortExercises).sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

export async function listPlans(
  db: Db,
  userId: string,
  range: { from: string; to: string; includeCancelled?: boolean },
): Promise<Plan[]> {
  let query = db
    .from("workout_plans")
    .select(PLAN_SELECT)
    .eq("user_id", userId)
    .gte("date", range.from)
    .lte("date", range.to)
    .order("date")
    .order("created_at")
    .limit(200);
  if (!range.includeCancelled) query = query.neq("status", "cancelled");
  return (must(await query, "list plans") as Plan[]).map(sortExercises);
}

export async function setPlanStatus(db: Db, userId: string, planId: string, status: PlanStatus): Promise<void> {
  must(await db.from("workout_plans").update({ status }).eq("user_id", userId).eq("id", planId), "update plan status");
}

/** Appends an exercise to a plan from inside a running session. */
export async function addExerciseToPlan(
  db: Db,
  userId: string,
  planId: string,
  exercise: PlanExerciseInput,
): Promise<PlanExerciseRow> {
  const last = must(
    await db
      .from("workout_plan_exercises")
      .select("order_index")
      .eq("user_id", userId)
      .eq("workout_plan_id", planId)
      .order("order_index", { ascending: false })
      .limit(1),
    "load plan exercises",
  );
  const orderIndex = (last[0]?.order_index ?? -1) + 1;
  return must(
    await db
      .from("workout_plan_exercises")
      .insert({
        workout_plan_id: planId,
        user_id: userId,
        order_index: orderIndex,
        added_in_session: true,
        ...exercise,
      })
      .select("*")
      .single(),
    "add exercise",
  );
}

/** Swaps the exercise in a plan slot (e.g. bench occupied), remembering what the coach prescribed. */
export async function swapPlanExercise(
  db: Db,
  userId: string,
  planExercise: Pick<PlanExerciseRow, "id" | "exercise_id" | "original_exercise_id">,
  newExerciseId: string,
): Promise<void> {
  must(
    await db
      .from("workout_plan_exercises")
      .update({
        exercise_id: newExerciseId,
        original_exercise_id: planExercise.original_exercise_id ?? planExercise.exercise_id,
      })
      .eq("user_id", userId)
      .eq("id", planExercise.id),
    "swap exercise",
  );
}
