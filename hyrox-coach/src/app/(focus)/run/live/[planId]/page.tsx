import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunSession } from "@/components/run/RunSession";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data/plans";
import { isUuid } from "@/lib/data/util";

export const metadata: Metadata = { title: "ラン" };

export default async function LiveRunPage({ params }: PageProps<"/run/live/[planId]">) {
  const { planId } = await params;
  if (!isUuid(planId)) notFound();
  const { supabase, userId } = await requireUser();
  const plan = await getPlan(supabase, userId, planId);
  if (!plan) notFound();
  const run = plan.exercises.find((e) => e.exercise_id === "running") ?? plan.exercises[0];

  return (
    <RunSession
      plan={{
        planId: plan.id,
        title: plan.title,
        reps: Math.max(1, run?.target_sets ?? 1),
        distanceM: run?.target_distance ?? null,
        paceMin: run?.target_pace_min ?? null,
        paceMax: run?.target_pace_max ?? null,
        restSeconds: run?.rest_seconds ?? 0,
        hrZone: run?.target_hr_zone ?? null,
        note: run?.coach_note ?? plan.coach_reason,
      }}
    />
  );
}
