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
        action={<ButtonLink href="/hyrox/new" variant="secondary" size="sm"><Plus className="h-4 w-4" aria-hidden="true" /> 結果を記録</ButtonLink>}
      />

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="PB" value={pb ? formatDuration(pb.total_seconds) : "–"} size="lg" sub={pb ? `${pb.event_type === "race" ? "レース" : "シミュレーション"} · ${relativeDayLabel(pb.date, today)}` : undefined} />
          <Stat label="最新" value={latest ? formatDuration(latest.total_seconds) : "–"} size="lg" sub={latest ? relativeDayLabel(latest.date, today) : undefined} />
        </div>
        {goal ? (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Stat label="目標" value={formatDuration(goal)} size="sm" />
            <Stat label="目標との差" value={pb?.total_seconds ? formatSignedDuration(pb.total_seconds - goal) : "–"} size="sm" tone={pb?.total_seconds && pb.total_seconds <= goal ? "text-push" : "text-low"} />
            <Stat label="レースまで" value={daysToRace != null && daysToRace >= 0 ? `${daysToRace}日` : "–"} size="sm" sub={profile.next_race_name ?? undefined} />
          </div>
        ) : null}
        {needPace && pb ? (
          <p className="mt-3 text-xs text-muted">
            PB のステーションと Roxzone のままで目標を切るには、ランを平均 {formatPace(needPace)}/km で走る必要があります（PB 時の平均 {formatPace(averageRunSplit(analysis.find((a) => a.id === pb.id)!))}）。
          </p>
        ) : null}
        <Link href="/hyrox/simulation" className="mt-4 flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-extrabold text-accent-ink active:brightness-90" data-testid="start-simulation">
          <Play className="h-5 w-5 fill-current" aria-hidden="true" /> シミュレーションを開始
        </Link>
      </Card>

      {pb ? (
        <Card className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="PB · ラン" value={formatDuration(pb.run_total_seconds)} size="sm" />
          <Stat label="PB · ステーション" value={formatDuration(pb.station_total_seconds)} size="sm" />
          <Stat label="PB · Roxzone" value={formatDuration(pb.roxzone_seconds)} size="sm" />
        </Card>
      ) : null}

      <SectionTitle>8 ステーション</SectionTitle>
      {weakest.length ? (
        <p className="mb-2 flex items-start gap-2 rounded-xl bg-low/10 px-3 py-2 text-xs text-low">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {weakest.map((w) => w.label).join(" と ")} が相対的に弱いステーションです（ステーション合計に占める割合が基準より大きい）。
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2" data-testid="stations">
        {stations.map((s) => {
          const weak = weakest.some((w) => w.exerciseId === s.exerciseId);
          const delta = s.latest && s.previous ? s.latest.seconds - s.previous.seconds : null;
          return (
            <div key={s.exerciseId} className={cn("rounded-2xl bg-surface p-3", weak && "ring-1 ring-low/50")}>
              <p className="text-sm font-bold leading-tight">{s.label}</p>
              <p className="text-[11px] text-faint">{s.spec}</p>
              <div className="mt-1.5 h-[22px]">
                <Sparkline values={s.trend} width={140} height={22} lowerIsBetter />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <div>
                  <p className="label !text-[10px]">PB</p>
                  <p className="num font-bold">{s.pb ? formatDuration(s.pb.seconds) : "–"}</p>
                </div>
                <div>
                  <p className="label !text-[10px]">最新</p>
                  <p className="num font-bold">
                    {s.latest ? formatDuration(s.latest.seconds) : "–"}
                    {delta != null && delta !== 0 ? <span className={cn("ml-1 text-[11px]", delta < 0 ? "text-push" : "text-low")}>{formatSignedDuration(delta)}</span> : null}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {results.length > 1 ? (
        <>
          <SectionTitle>フィニッシュタイムの推移</SectionTitle>
          <Card>
            <LineChart
              ariaLabel="HYROX フィニッシュタイムの推移"
              format="duration"
              reference={goal ? { y: goal, label: `目標 ${formatDuration(goal)}` } : undefined}
              series={[{ key: "total", label: "フィニッシュタイム", color: "#d95926", points: chronological.filter((r) => r.total_seconds).map((r) => ({ x: r.date, y: r.total_seconds })) }]}
            />
          </Card>
        </>
      ) : null}

      <SectionTitle>結果一覧</SectionTitle>
      {results.length === 0 ? (
        <EmptyState title="まだ HYROX の結果がありません">シミュレーションを行うか、レース結果を記録すると、PB とステーションごとの推移が表示されます。</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {results.map((r) => {
            const d = pbDelta.get(r.id);
            return (
              <li key={r.id}>
                <Link href={`/hyrox/results/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.name || (r.event_type === "race" ? "レース" : "シミュレーション")}</span>
                    <span className="block text-xs text-muted">
                      {relativeDayLabel(r.date, today)} · {r.event_type === "race" ? "レース" : r.event_type === "simulation" ? "シミュレーション" : "一部のみ"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-bold">{formatDuration(r.total_seconds)}</span>
                    {d != null ? <span className={cn("num block text-[11px]", d < 0 ? "text-push" : "text-muted")}>{d < 0 ? `${formatSignedDuration(d)} PB` : formatSignedDuration(d)}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 text-faint" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
