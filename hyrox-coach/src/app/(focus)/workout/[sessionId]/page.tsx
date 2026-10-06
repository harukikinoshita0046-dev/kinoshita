import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WorkoutLogger } from "@/components/logger/WorkoutLogger";
import { requireUser } from "@/lib/auth";
import { indexExercises, listExercises } from "@/lib/data/exercises";
import { getSessionDetail } from "@/lib/data/sessions";
import { getExerciseHistories } from "@/lib/data/stats";
import { isUuid } from "@/lib/data/util";
import { buildSlot, fallbackExercise, toLoggerExercise, type LoggedSet } from "@/lib/logger";

export const metadata: Metadata = { title: "トレーニング" };

export default async function WorkoutPage({ params }: PageProps<"/workout/[sessionId]">) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();
  const { supabase, userId } = await requireUser();

  const detail = await getSessionDetail(supabase, userId, sessionId);
  if (!detail) notFound();
  if (detail.session.status !== "in_progress") redirect(`/history/${sessionId}`);

  const exercises = await listExercises(supabase, userId);
  const byId = indexExercises(exercises);
  const planExercises = detail.plan?.exercises ?? [];
  const histories = await getExerciseHistories(
    supabase,
    userId,
    planExercises.map((p) => p.exercise_id),
    { sessions: 1, excludeSessionId: sessionId },
  );

  const slots = planExercises.map((pe) => {
    const ex = byId.get(pe.exercise_id);
    return buildSlot(pe, ex ? toLoggerExercise(ex) : fallbackExercise(pe.exercise_id), histories.get(pe.exercise_id));
  });

  const sets: LoggedSet[] = detail.sets.map((s) => ({
    id: s.id,
    plan_exercise_id: s.plan_exercise_id,
    exercise_id: s.exercise_id,
    set_number: s.set_number,
    weight: s.weight,
    reps: s.reps,
    distance: s.distance,
    time_seconds: s.time_seconds,
    rpe: s.rpe,
    completed_at: s.completed_at,
    sync: "saved",
  }));

  return (
    <WorkoutLogger
      userId={userId}
      session={{
        id: detail.session.id,
        title: detail.session.title,
        started_at: detail.session.started_at,
        workout_plan_id: detail.session.workout_plan_id,
      }}
      initialSlots={slots}
      initialSets={sets}
      catalog={exercises.filter((e) => !e.hidden).map(toLoggerExercise)}
    />
  );
}
