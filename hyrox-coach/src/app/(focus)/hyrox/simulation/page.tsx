import type { Metadata } from "next";
import { Simulation } from "@/components/hyrox/Simulation";
import { requireUser } from "@/lib/auth";
import { bestResult, listHyroxResults } from "@/lib/data/hyrox";
import { getProfile, profileToday } from "@/lib/data/profile";
import { isUuid } from "@/lib/data/util";

export const metadata: Metadata = { title: "HYROX Simulation" };

export default async function SimulationPage({ searchParams }: PageProps<"/hyrox/simulation">) {
  const { plan } = await searchParams;
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));
  const results = await listHyroxResults(supabase, userId, { limit: 100 });
  const complete = results.filter((r) => r.splits.length === 16);
  const pb = bestResult(complete) ?? bestResult(results);

  return (
    <Simulation
      today={today}
      planId={typeof plan === "string" && isUuid(plan) ? plan : null}
      pb={{
        total: pb?.total_seconds ?? null,
        splits: Object.fromEntries((pb?.splits ?? []).map((s) => [s.segment_index, s.duration_seconds])),
      }}
    />
  );
}
