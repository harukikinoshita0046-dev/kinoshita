"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProfile, profileTimezone, profileToday } from "@/lib/data/profile";
import { setPlanStatus } from "@/lib/data/plans";
import { deleteRun } from "@/lib/data/runs";
import { deleteSession, startQuickSession } from "@/lib/data/sessions";
import { zonedTimeToIso } from "@/lib/domain/dates";
import { WORKOUT_TYPES } from "@/lib/domain/workout-types";
import { isoDate } from "@/lib/validation";
import { assertUuid, must } from "@/lib/data/util";

export async function deleteWorkout(sessionId: string) {
  assertUuid(sessionId, "session id");
  const { supabase, userId } = await requireUser();
  const session = must(
    await supabase.from("workout_sessions").select("workout_plan_id").eq("user_id", userId).eq("id", sessionId).maybeSingle(),
    "load session",
  );
  await deleteSession(supabase, userId, sessionId);
  if (session?.workout_plan_id) await setPlanStatus(supabase, userId, session.workout_plan_id, "planned");
  revalidatePath("/history");
  revalidatePath("/today");
  redirect("/history");
}

export async function deleteRunAction(runId: string) {
  assertUuid(runId, "run id");
  const { supabase, userId } = await requireUser();
  await deleteRun(supabase, userId, runId);
  revalidatePath("/history");
  redirect("/history?type=runs");
}

const pastWorkoutInput = z.object({
  date: isoDate,
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  title: z.string().trim().min(1).max(120),
  workout_type: z.enum(WORKOUT_TYPES),
});

export type PastWorkoutState = { error?: string };

/** Opens the logger for a workout on an earlier day; the sets are entered as usual and saved on that date. */
export async function startPastWorkout(_prev: PastWorkoutState, form: FormData): Promise<PastWorkoutState> {
  const parsed = pastWorkoutInput.safeParse({
    date: form.get("date"),
    start_time: form.get("start_time"),
    title: form.get("title"),
    workout_type: form.get("workout_type"),
  });
  if (!parsed.success) return { error: "日付・開始時刻・タイトルを確認してください。" };
  const { date, start_time, title, workout_type } = parsed.data;

  const { supabase, userId } = await requireUser();
  const profile = await getProfile(supabase, userId);
  const today = profileToday(profile);
  if (date > today) return { error: "未来の日付は選べません。" };

  const startedAt = date === today ? undefined : zonedTimeToIso(date, start_time, profileTimezone(profile));
  const sessionId = await startQuickSession(supabase, userId, date, title, workout_type, startedAt);
  redirect(`/workout/${sessionId}`);
}
