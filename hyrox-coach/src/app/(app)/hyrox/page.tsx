import { ChevronRight, Play, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "@/components/charts/LineChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { ButtonLink, Card, EmptyState, Page, PageHeader, SectionTitle, Stat, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { bestResult, listHyroxResults, toAnalysisInput } from "@/lib/data/hyrox";
import { getProfile, profileToday } from "@/lib/data/profile";
import { diffDays, relativeDayLabel } from "@/lib/domain/dates";
import { formatDuration, formatPace, formatSignedDuration } from "@/lib/domain/format";
import { averageRunSplit, HYROX_DIVISION_LABELS, requiredRunPace, stationSummaries, weakestStations } from "@/lib/domain/hyrox";

export const metadata: Metadata = { title: "HYROX" };

export default async function HyroxPage() {
  const { supabase, userId } = await requireUser();
  const profile = await getProfile(supabase, userId);
  const today = profileToday(profile);
  const results = await listHyroxResults(supabase, userId, { limit: 100 });
  const analysis = toAnalysisInput(results);
  const stations = stationSummaries(analysis);
  const weakest = weakestStations(stations, 2).filter((s) => (s.relativeIndex ?? 0) > 1.05);
  const pb = bestResult(results);
  const latest = results[0] ?? null;
  const goal = profile.hyrox_goal_seconds;
  const needPace = goal && pb ? requiredRunPace(goal, pb) : null;
  const daysToRace = profile.next_race_date ? diffDays(profile.next_race_date, today) : null;

  // PB-at-the-time for each result (chronological), to show progress.
  const chronological = [...results].reverse();
  let runningBest: number | null = null;
  const pbDelta = new Map<string, number | null>();
  for (const r of chronological) {
    pbDelta.set(r.id, runningBest != null && r.total_seconds ? r.total_seconds - runningBest : null);
    if (r.total_seconds && r.event_type !== "partial" && (runningBest == null || r.total_seconds < runningBest)) runningBest = r.total_seconds;
  }

  return (
    <Page>
      <PageHeader
        eyebrow={HYROX_DIVISION_LABELS[profile.hyrox_division] ?? "HYROX"}
        title="HYROX"
        action={<ButtonLink href="/hyrox/new" variant="secondary" size="sm"><Plus className="h-4 w-4" /> Result</ButtonLink>}
      />

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="PB" value={pb ? formatDuration(pb.total_seconds) : "–"} size="lg" sub={pb ? `${pb.event_type === "race" ? "Race" : "Simulation"} · ${relativeDayLabel(pb.date, today)}` : undefined} />
          <Stat label="Latest" value={latest ? formatDuration(latest.total_seconds) : "–"} size="lg" sub={latest ? relativeDayLabel(latest.date, today) : undefined} />
        </div>
        {goal ? (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Stat label="Goal" value={formatDuration(goal)} size="sm" />
            <Stat label="Gap" value={pb?.total_seconds ? formatSignedDuration(pb.total_seconds - goal) : "–"} size="sm" tone={pb?.total_seconds && pb.total_seconds <= goal ? "text-push" : "text-low"} />
            <Stat label="Race in" value={daysToRace != null && daysToRace >= 0 ? `${daysToRace}d` : "–"} size="sm" sub={profile.next_race_name ?? undefined} />
          </div>
        ) : null}
        {needPace && pb ? (
          <p className="mt-3 text-xs text-muted">
            To hit the goal with your PB stations &amp; Roxzone, runs need {formatPace(needPace)}/km avg (PB avg {formatPace(averageRunSplit(analysis.find((a) => a.id === pb.id)!))}).
          </p>
        ) : null}
        <Link href="/hyrox/simulation" className="mt-4 flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-extrabold text-accent-ink active:brightness-90" data-testid="start-simulation">
          <Play className="h-5 w-5 fill-current" /> START SIMULATION
        </Link>
      </Card>

      {pb ? (
        <Card className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="PB · Running" value={formatDuration(pb.run_total_seconds)} size="sm" />
          <Stat label="PB · Stations" value={formatDuration(pb.station_total_seconds)} size="sm" />
          <Stat label="PB · Roxzone" value={formatDuration(pb.roxzone_seconds)} size="sm" />
        </Card>
      ) : null}

      <SectionTitle>8 Stations</SectionTitle>
      {weakest.length ? (
        <p className="mb-2 flex items-start gap-2 rounded-xl bg-low/10 px-3 py-2 text-xs text-low">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {weakest.map((w) => w.label).join(" と ")} が相対的に弱いStationです（Station合計に占める割合が基準より大きい）。
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2" data-testid="stations">
        {stations.map((s) => {
          const weak = weakest.some((w) => w.exerciseId === s.exerciseId);
          const delta = s.latest && s.previous ? s.latest.seconds - s.previous.seconds : null;
          return (
            <div key={s.exerciseId} className={cn("rounded-2xl bg-surface p-3", weak && "ring-1 ring-low/50")}>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{s.label}</p>
                  <p className="text-[10px] text-faint">{s.spec}</p>
                </div>
                <Sparkline values={s.trend} lowerIsBetter />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <div>
                  <p className="label !text-[9px]">PB</p>
                  <p className="num font-bold">{s.pb ? formatDuration(s.pb.seconds) : "–"}</p>
                </div>
                <div>
                  <p className="label !text-[9px]">Latest</p>
                  <p className="num font-bold">
                    {s.latest ? formatDuration(s.latest.seconds) : "–"}
                    {delta != null && delta !== 0 ? <span className={cn("ml-1 text-[10px]", delta < 0 ? "text-push" : "text-low")}>{formatSignedDuration(delta)}</span> : null}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {results.length > 1 ? (
        <>
          <SectionTitle>Finish time trend</SectionTitle>
          <Card>
            <LineChart
              ariaLabel="HYROX finish times over time"
              yFormat={(v) => formatDuration(v)}
              reference={goal ? { y: goal, label: `Goal ${formatDuration(goal)}` } : undefined}
              series={[{ key: "total", label: "Finish time", color: "#d95926", points: chronological.filter((r) => r.total_seconds).map((r) => ({ x: r.date, y: r.total_seconds })) }]}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>Results</SectionTitle>
      {results.length === 0 ? (
        <EmptyState title="No HYROX results yet">Run a simulation or log a race to see PBs and station trends.</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {results.map((r) => {
            const d = pbDelta.get(r.id);
            return (
              <li key={r.id}>
                <Link href={`/hyrox/results/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.name || (r.event_type === "race" ? "Race" : "Simulation")}</span>
                    <span className="block text-xs text-muted">
                      {relativeDayLabel(r.date, today)} · {r.event_type === "race" ? "Race" : r.event_type === "simulation" ? "Simulation" : "Partial"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-bold">{formatDuration(r.total_seconds)}</span>
                    {d != null ? <span className={cn("num block text-[11px]", d < 0 ? "text-push" : "text-muted")}>{d < 0 ? `${formatSignedDuration(d)} PB` : formatSignedDuration(d)}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 text-faint" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
