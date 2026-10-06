"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { abandonSession, finishSession } from "@/lib/data/sessions";
import { assertUuid } from "@/lib/data/util";

const finishInput = z.object({
  sessionRpe: z.number().min(1).max(10).nullable(),
  notes: z.string().max(2000).nullable(),
});

export async function finishWorkout(sessionId: string, input: { sessionRpe: number | null; notes: string | null }) {
  assertUuid(sessionId, "session id");
  const { sessionRpe, notes } = finishInput.parse(input);
  const { supabase, userId } = await requireUser();
  await finishSession(supabase, userId, sessionId, { session_rpe: sessionRpe, notes: notes?.trim() || null });
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
