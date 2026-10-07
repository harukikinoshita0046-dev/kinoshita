"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { abandonSession, finishSession } from "@/lib/data/sessions";
import { assertUuid, must } from "@/lib/data/util";

const finishInput = z.object({
  sessionRpe: z.number().min(1).max(10).nullable(),
  notes: z.string().max(2000).nullable(),
  /** Only for a past workout entered after the fact: how long it took. */
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
});

export async function finishWorkout(sessionId: string, input: { sessionRpe: number | null; notes: string | null; durationMin?: number | null }) {
  assertUuid(sessionId, "session id");
  const { sessionRpe, notes, durationMin } = finishInput.parse(input);
  const { supabase, userId } = await requireUser();
  let finishedAt: string | undefined;
  if (durationMin) {
    const started = must(
      await supabase.from("workout_sessions").select("started_at").eq("user_id", userId).eq("id", sessionId).maybeSingle(),
      "load session",
    );
    if (started) finishedAt = new Date(Date.parse(started.started_at) + durationMin * 60_000).toISOString();
  }
  await finishSession(supabase, userId, sessionId, { session_rpe: sessionRpe, notes: notes?.trim() || null, finished_at: finishedAt });
  revalidatePath("/today");
  revalidatePath("/history");
  redirect(`/history/${sessionId}?done=1`);
}

export async function discardWorkout(sessionId: string) {
  assertUuid(sessionId, "session id");
  const { supabase, userId } = await requireUser();
  await abandonSession(supabase, userId, sessionId);
  revalidatePath("/today");
  redirect("/today");
}
