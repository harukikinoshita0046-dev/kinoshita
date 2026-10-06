"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createHyroxResult, deleteHyroxResult } from "@/lib/data/hyrox";
import { assertUuid } from "@/lib/data/util";
import { firstIssue, hyroxResultSchema } from "@/lib/validation";

export async function saveHyroxResult(input: unknown): Promise<{ error?: string }> {
  const parsed = hyroxResultSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  const id = await createHyroxResult(supabase, userId, parsed.data);
  revalidatePath("/hyrox");
  revalidatePath("/today");
  redirect(`/hyrox/results/${id}?new=1`);
}

export async function deleteHyroxResultAction(id: string) {
  assertUuid(id, "result id");
  const { supabase, userId } = await requireUser();
  await deleteHyroxResult(supabase, userId, id);
  revalidatePath("/hyrox");
  redirect("/hyrox");
}
