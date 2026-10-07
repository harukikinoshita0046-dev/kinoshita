import { coachRoute } from "@/lib/coach/api";
import { logSessionBody, toLoggedSession } from "@/lib/coach/schemas";
import { profileTimezone } from "@/lib/data/profile";
import { dateRange, intParam } from "@/lib/coach/dto";
import { indexExercises, listExercises } from "@/lib/data/exercises";
import { logCompletedSession, listSessions } from "@/lib/data/sessions";
import { fetchAll, must } from "@/lib/data/util";
import { formatPlanTarget } from "@/lib/domain/plan-format";
import { summarizeSets } from "@/lib/domain/strength";

/** Completed (and in-progress) workouts with every set vs its target — "今日の結果どうだった？" */
export const GET = coachRoute("read", async ({ db, userId, today, req }) => {
  const { from, to } = dateRange(req.nextUrl.searchParams, today, { back: 14, forward: 0 });
  const limit = intParam(req.nextUrl.searchParams, "limit", 20, 1, 60);
  const [sessions, exercises] = await Promise.all([listSessions(db, userId, { from, to, limit }), listExercises(db, userId, { includeInactive: true })]);
  const byId = indexExercises(exercises);
  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? await fetchAll(
        (a, b) => db.from("workout_sets").select("*").eq("user_id", userId).in("session_id", ids).order("set_number").range(a, b),
        "load sets",
      )
    : [];
  const slotIds = [...new Set(sets.map((s) => s.plan_exercise_id).filter((x): x is string => !!x))];
  const slots = slotIds.length
    ? must(await db.from("workout_plan_exercises").select("*").eq("user_id", userId).in("id", slotIds), "load targets")
    : [];
  const slotById = new Map(slots.map((s) => [s.id, s]));

  return {
    from,
    to,
    sessions: sessions.map((s) => {
      const own = sets.filter((x) => x.session_id === s.id);
      const groups = new Map<string, typeof own>();
      for (const x of own) {
        const key = x.plan_exercise_id ?? x.exercise_id;
        groups.set(key, [...(groups.get(key) ?? []), x]);
      }
      return {
        id: s.id,
        date: s.date,
        title: s.title,
        workout_type: s.workout_type,
        status: s.status,
        duration_min: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
        session_rpe: s.session_rpe,
        training_load_au: s.duration_seconds && s.session_rpe ? Math.round((s.duration_seconds / 60) * s.session_rpe) : null,
        total_sets: s.totalSets,
        total_volume_kg: s.totalVolumeKg,
        notes: s.notes,
        exercises: [...groups.values()].map((list) => {
          const ex = byId.get(list[0].exercise_id);
          const unit = ex?.unit_type ?? "weight_reps";
          const slot = list[0].plan_exercise_id ? slotById.get(list[0].plan_exercise_id) : undefined;
          const target = slot ? formatPlanTarget(slot, unit) : null;
          const rpes = list.map((x) => x.rpe).filter((v): v is number => v != null);
          return {
            exercise_id: list[0].exercise_id,
            name: ex?.name ?? list[0].exercise_id,
            target: target ? [target.main, ...target.details].join(" · ") : null,
            target_sets: slot?.target_sets ?? null,
            completed_sets: list.length,
            sets: summarizeSets(list, unit),
            avg_rpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
          };
        }),
      };
    }),
  };
});

/**
 * Logs a finished workout with its sets, usually a past one the athlete reports
 * ("10/3 ベンチ 80kg×8,8,7"). It shows up in history, PBs and training load.
 */
export const POST = coachRoute("write", async ({ db, userId, today, profile, body }) => {
  const parsed = logSessionBody.parse(body ?? {});
  const exercises = await listExercises(db, userId, { includeInactive: true });
  const input = toLoggedSession(parsed, exercises, today, profileTimezone(profile));
  const { session, replaced } = await logCompletedSession(db, userId, input, { replaceExisting: parsed.replace_existing });
  const byId = indexExercises(exercises);
  const perExercise = new Map<string, typeof input.sets>();
  for (const s of input.sets) perExercise.set(s.exercise_id, [...(perExercise.get(s.exercise_id) ?? []), s]);
  return Response.json(
    {
      created: true,
      replaced,
      session: {
        id: session.id,
        date: session.date,
        title: session.title,
        workout_type: session.workout_type,
        duration_min: session.duration_seconds ? Math.round(session.duration_seconds / 60) : null,
        session_rpe: session.session_rpe,
        total_sets: input.sets.length,
        exercises: [...perExercise.entries()].map(([id, list]) => ({
          exercise_id: id,
          name: byId.get(id)?.name ?? id,
          sets: summarizeSets(list, byId.get(id)?.unit_type ?? "weight_reps"),
        })),
      },
    },
    { status: 201 },
  );
});
