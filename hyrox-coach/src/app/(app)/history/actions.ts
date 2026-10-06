"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { setPlanStatus } from "@/lib/data/plans";
import { deleteRun } from "@/lib/data/runs";
import { deleteSession } from "@/lib/data/sessions";
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
