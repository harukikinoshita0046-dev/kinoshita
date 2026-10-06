import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RunForm } from "@/components/run/RunForm";
import { Page, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data/plans";
import { getProfile, profileToday } from "@/lib/data/profile";
import { listRuns } from "@/lib/data/runs";
import { isUuid } from "@/lib/data/util";
import type { RunType } from "@/lib/domain/running";

export const metadata: Metadata = { title: "Log run" };

export default async function NewRunPage({ searchParams }: PageProps<"/run/new">) {
  const { plan: planParam } = await searchParams;
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));
  const [lastRun] = await listRuns(supabase, userId, { limit: 1 });

  const plan = typeof planParam === "string" && isUuid(planParam) ? await getPlan(supabase, userId, planParam) : null;
  const runEx = plan?.exercises.find((e) => e.exercise_id === "running");

  let runType: RunType = (lastRun?.run_type as RunType | undefined) ?? "easy";
  let distanceKm = lastRun ? Number(lastRun.distance_km) : 5;
  let pace = lastRun ? Number(lastRun.average_pace) : 330;
  if (runEx) {
    const reps = runEx.target_sets ?? 1;
    runType = reps > 1 ? "intervals" : runEx.target_hr_zone === 2 ? "zone2" : "easy";
    if (runEx.target_distance) distanceKm = (reps * runEx.target_distance) / 1000;
    if (runEx.target_pace_min && runEx.target_pace_max) pace = (runEx.target_pace_min + runEx.target_pace_max) / 2;
  }

  return (
    <Page>
      <div className="pt-4">
        <Link href="/today" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" /> Today
        </Link>
      </div>
      <PageHeader eyebrow={plan ? plan.title : "Running"} title="LOG RUN" />
      <RunForm
        today={today}
        planId={plan?.id ?? null}
        defaults={{ run_type: runType, distance_km: Math.round(distanceKm * 100) / 100, duration_seconds: Math.round(distanceKm * pace) }}
      />
      <p className="mt-4 text-center text-xs text-faint">
        Apple Watch auto-import is Phase 2 (needs the iOS companion app). Until then, enter the summary from the Workout app.
      </p>
    </Page>
  );
}
