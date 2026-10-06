import { ApiError, coachRoute, notFound } from "@/lib/coach/api";
import { intParam } from "@/lib/coach/dto";
import { listExercises } from "@/lib/data/exercises";
import { getExerciseHistories } from "@/lib/data/stats";
import { must } from "@/lib/data/util";
import { resolveExercise } from "@/lib/domain/exercise";
import { formatDuration } from "@/lib/domain/format";
import { compactSetSummary, suggestProgression, summarizeSets } from "@/lib/domain/strength";

const n = (v: number | null | undefined) => (v == null ? null : Number(v));

/** Progressive-overload view of one exercise: recent sessions, PBs, e1RM, volume, RPE and a progression hint. */
export const GET = coachRoute<{ id: string }>("read", async ({ db, userId, req }, { id }) => {
  const sessions = intParam(req.nextUrl.searchParams, "sessions", 5, 1, 20);
  const exercises = await listExercises(db, userId, { includeInactive: true });
  const ex = resolveExercise(exercises, decodeURIComponent(id));
  if (!ex) notFound(`Exercise '${id}'`);

  const history = (await getExerciseHistories(db, userId, [ex.id], { sessions })).get(ex.id);
  if (!history) throw new ApiError(500, "internal_error", "History unavailable.");
  const last = history.sessions[0];
  const slotId = last?.sets.find((s) => s.plan_exercise_id)?.plan_exercise_id;
  const target = slotId
    ? must(
        await db
          .from("workout_plan_exercises")
          .select("target_sets, target_reps_min, target_reps_max, target_rpe, target_weight")
          .eq("user_id", userId)
          .eq("id", slotId)
          .maybeSingle(),
        "load target",
      )
    : null;

  return {
    exercise: { id: ex.id, name: ex.name, unit_type: ex.unit_type, weight_increment_kg: Number(ex.weight_increment) },
    sessions: history.sessions.map((s) => ({
      date: s.date,
      sets: summarizeSets(s.sets, ex.unit_type),
      summary: compactSetSummary(s.sets, ex.unit_type),
      working_sets: s.stats.working_sets,
      top_weight_kg: n(s.stats.top_weight),
      best_e1rm_kg: n(s.stats.best_e1rm),
      volume_kg: n(s.stats.volume_kg),
      total_reps: s.stats.total_reps,
      total_distance_m: n(s.stats.total_distance_m),
      best_time: s.stats.best_time_seconds ? formatDuration(s.stats.best_time_seconds) : null,
      avg_rpe: n(s.stats.avg_rpe),
    })),
    personal_bests: Object.fromEntries(
      Object.entries(history.pbs).map(([type, pb]) => [
        type,
        { date: pb.date, weight_kg: n(pb.weight), reps: pb.reps, distance_m: n(pb.distance), time: pb.time_seconds ? formatDuration(pb.time_seconds) : null, e1rm_kg: n(pb.e1rm) },
      ]),
    ),
    last_target: target,
    suggestion: last
      ? suggestProgression(
          last.sets,
          { sets: target?.target_sets, repsMin: target?.target_reps_min, repsMax: target?.target_reps_max, rpe: n(target?.target_rpe) },
          Number(ex.weight_increment),
          ex.unit_type,
        )
      : null,
  };
});
