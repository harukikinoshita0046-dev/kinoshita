"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPlan, setPlanStatus } from "@/lib/data/plans";
import { getProfile, profileToday } from "@/lib/data/profile";
import { startQuickSession, startSessionForPlan } from "@/lib/data/sessions";
import { assertUuid } from "@/lib/data/util";

export async function startWorkout(planId: string) {
  assertUuid(planId, "plan id");
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));
  const plan = await getPlan(supabase, userId, planId);
  if (!plan) redirect("/today");
  const sessionId = await startSessionForPlan(supabase, userId, planId, plan.date > today ? plan.date : today);
  redirect(`/workout/${sessionId}`);
}

export async function startQuickWorkout() {
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));
  const sessionId = await startQuickSession(supabase, userId, today, "Quick Workout", "other");
  redirect(`/workout/${sessionId}`);
}

export async function skipPlan(planId: string) {
  assertUuid(planId, "plan id");
  const { supabase, userId } = await requireUser();
  await setPlanStatus(supabase, userId, planId, "skipped");
  revalidatePath("/today");
}

export async function restorePlan(planId: string) {
  assertUuid(planId, "plan id");
  const { supabase, userId } = await requireUser();
  await setPlanStatus(supabase, userId, planId, "planned");
  revalidatePath("/today");
}
