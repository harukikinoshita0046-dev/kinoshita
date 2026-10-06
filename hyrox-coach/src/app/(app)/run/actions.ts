"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createRun } from "@/lib/data/runs";
import { firstIssue, runInputSchema } from "@/lib/validation";

export type SaveRunState = { error?: string };

export async function saveRun(input: unknown): Promise<SaveRunState> {
  const parsed = runInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  const run = await createRun(supabase, userId, { ...parsed.data, source: "manual" });
  revalidatePath("/today");
  revalidatePath("/history");
  redirect(`/history/run/${run.id}?saved=1`);
}
