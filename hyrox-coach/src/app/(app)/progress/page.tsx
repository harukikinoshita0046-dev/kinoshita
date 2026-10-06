import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { LineChart } from "@/components/charts/LineChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { InsightsList } from "@/components/InsightsList";
import { READINESS_TONE } from "@/components/today/ReadinessCard";
import { Card, Page, PageHeader, SectionTitle, Stat, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCoachInsights } from "@/lib/data/insights";
import { loadProgressData, PROGRESS_LIFTS, RANGES, type RangeKey } from "@/lib/data/progress";
import { loadAthleteSnapshot } from "@/lib/data/snapshot";
import { rollingAverageSeries } from "@/lib/domain/body";
import { addDays, formatShortDate } from "@/lib/domain/dates";
import { formatDuration, formatMinutes, formatNumber, formatPace, formatSigned, formatSignedDuration, formatSleepCompact } from "@/lib/domain/format";

export const metadata: Metadata = { title: "Progress" };

const KIND_COLORS = { strength: "#199e70", run: "#3987e5", hyrox: "#d95926" };
const LIFT_LABEL: Record<string, string> = { bench_press: "Bench Press", squat: "Squat", deadlift: "Deadlift", pull_up: "Pull Up" };

function DashRow({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  const body = (
    <Card className="active:bg-surface-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="label">{title}</h3>
        {href ? <ChevronRight className="h-4 w-4 text-faint" /> : null}
      </div>
      {children}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  const { range: rangeParam } = await searchParams;
  const range: RangeKey = typeof rangeParam === "string" && rangeParam in RANGES ? (rangeParam as RangeKey) : "30d";
  const { supabase, userId } = await requireUser();
  const snap = await loadAthleteSnapshot(supabase, userId);
  const days = RANGES[range].days;
  const from = days ? addDays(snap.today, -(days - 1)) : null;
  const [data, coachNotes] = await Promise.all([
    loadProgressData(supabase, userId, from, snap.today),
    listCoachInsights(supabase, userId, { limit: 3, since: addDays(snap.today, -7) }),
  ]);

  const weights = data.body.filter((b) => b.weight != null).map((b) => ({ date: b.date, weight: Number(b.weight) }));
  const avg = rollingAverageSeries(weights);
  const hrv = data.health.filter((h) => h.hrv != null).map((h) => ({ date: h.date, weight: Number(h.hrv) }));
  const hrvAvg = rollingAverageSeries(hrv);

  const liftSeries = PROGRESS_LIFTS.map((id) => {
    const rows = data.lifts.filter((l) => l.exercise_id === id);
    const metric = id === "pull_up" ? "max_reps" : "best_e1rm";
    const points = rows.map((r) => ({ x: r.date!, y: r[metric] == null ? null : Number(r[metric]) })).filter((p) => p.y != null);
    const first = points[0]?.y ?? null;
    const last = points[points.length - 1]?.y ?? null;
    return { id, label: LIFT_LABEL[id], metric, points, change: first != null && last != null ? last - first : null, last };
  }).filter((l) => l.points.length > 0);

  const hyroxInRange = data.hyrox.filter((h) => h.total_seconds);
  const hyroxImprovement =
    hyroxInRange.length >= 2 ? Math.min(...hyroxInRange.map((h) => h.total_seconds!)) - hyroxInRange[0].total_seconds! : null;
  const tone = snap.readiness.level ? READINESS_TONE[snap.readiness.level].text : "text-text";

  return (
    <Page>
      <PageHeader title="PROGRESS" />
      <nav className="mb-2 flex gap-1.5" aria-label="Date range">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link
            key={k}
            href={`/progress?range=${k}`}
            aria-current={k === range ? "page" : undefined}
            className={cn("flex-1 rounded-full py-1.5 text-center text-xs font-bold", k === range ? "bg-text text-black" : "bg-surface-2 text-muted")}
          >
            {RANGES[k].label}
          </Link>
        ))}
      </nav>

      <SectionTitle>AI Insights · This week</SectionTitle>
      <InsightsList coach={coachNotes} rules={snap.insights} />

      <SectionTitle>Dashboard</SectionTitle>
      <div className="space-y-2">
        <DashRow title="Body" href="/body">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Weight" value={snap.body.trend.latest ? formatNumber(snap.body.trend.latest.weight, 1) : "–"} unit="kg" />
            <Stat label="7 day avg" value={snap.body.trend.avg7 != null ? formatNumber(snap.body.trend.avg7, 1) : "–"} unit="kg" />
            <Stat label="This week" value={formatSigned(snap.body.trend.weeklyChange)} unit="kg" />
          </div>
        </DashRow>
        <DashRow title="Recovery" href="/checkin">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Readiness" value={snap.readiness.score ?? "–"} tone={tone} />
            <Stat label="Sleep 7d" value={formatSleepCompact(snap.health.sleep7dAvg)} size="sm" />
            <Stat label="HRV 7d" value={snap.health.hrv7dAvg != null ? formatNumber(snap.health.hrv7dAvg, 0) : "–"} size="sm" />
            <Stat label="RHR 7d" value={snap.health.restingHr7dAvg != null ? formatNumber(snap.health.restingHr7dAvg, 0) : "–"} size="sm" />
          </div>
        </DashRow>
        <DashRow title="Training · this week" href="/history">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Sessions" value={snap.week.sessions} />
            <Stat label="Volume" value={snap.week.volumeKg ? formatNumber(snap.week.volumeKg / 1000, 1) : "0"} unit="t" />
            <Stat label="Time" value={formatMinutes(snap.week.trainingMinutes)} />
          </div>
          <p className="num mt-2 text-xs text-muted">
            Load 7d {snap.load.acute7} AU · ACWR {snap.load.acwr ?? "–"}
          </p>
        </DashRow>
        <DashRow title="Running" href="/history?type=runs">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="This week" value={formatNumber(snap.running.weekKm, 1)} unit="km" />
            <Stat label="Last 7d" value={formatNumber(snap.running.km7, 1)} unit="km" />
            <Stat label="Avg pace" value={formatPace(snap.running.avgPace7)} unit="/km" />
          </div>
        </DashRow>
        <DashRow title="HYROX" href="/hyrox">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="PB" value={formatDuration(snap.hyrox.pb?.total_seconds)} />
            <Stat label="Latest" value={formatDuration(snap.hyrox.latest?.total_seconds)} />
            <Stat
              label="Improvement"
              value={hyroxImprovement != null ? formatSignedDuration(hyroxImprovement) : "–"}
              tone={hyroxImprovement != null && hyroxImprovement < 0 ? "text-push" : undefined}
              sub={RANGES[range].label}
            />
          </div>
        </DashRow>
        <DashRow title="Strength">
          <ul className="space-y-2">
            {liftSeries.map((l) => (
              <li key={l.id} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm font-semibold">{l.label}</span>
                <span className="num flex-1 text-sm">
                  <span className="font-bold">{l.last != null ? formatNumber(l.last, 1) : "–"}</span>
                  <span className="ml-1 text-xs text-muted">{l.metric === "max_reps" ? "reps" : "kg e1RM"}</span>
                  {l.change ? <span className={cn("ml-2 text-xs", l.change > 0 ? "text-push" : "text-low")}>{formatSigned(l.change, 1)}</span> : null}
                </span>
                <Sparkline values={l.points.map((p) => p.y!)} />
              </li>
            ))}
            {liftSeries.length === 0 ? <li className="text-sm text-muted">No strength sessions in this range.</li> : null}
          </ul>
        </DashRow>
      </div>

      <SectionTitle>Body weight</SectionTitle>
      <Card>
        <LineChart
          ariaLabel={`Body weight, ${RANGES[range].label}`}
          yFormat={(v) => formatNumber(v, 1)}
          series={[
            { key: "daily", label: "Daily", color: "var(--muted)", kind: "dots", points: weights.map((p) => ({ x: p.date, y: p.weight })) },
            { key: "avg", label: "7-day avg", color: "var(--accent)", points: avg.map((p) => ({ x: p.date, y: p.weight })) },
          ]}
        />
      </Card>

      <SectionTitle>Training load per week</SectionTitle>
      <Card>
        <ColumnChart
          ariaLabel="Weekly training load (session RPE × minutes) by type"
          categories={[
            { key: "strength", label: "Strength", color: KIND_COLORS.strength },
            { key: "run", label: "Running", color: KIND_COLORS.run },
            { key: "hyrox", label: "HYROX", color: KIND_COLORS.hyrox },
          ]}
          columns={data.weekly.slice(-16).map((w) => ({ x: w.week, label: formatShortDate(w.week), values: { strength: w.strength, run: w.run, hyrox: w.hyrox } }))}
          yFormat={(v) => `${Math.round(v)}`}
        />
        <p className="mt-1 text-[11px] text-faint">Load = session RPE × minutes (AU).</p>
      </Card>

      <SectionTitle>Running volume per week</SectionTitle>
      <Card>
        <ColumnChart
          ariaLabel="Weekly running distance in km"
          categories={[{ key: "km", label: "km", color: KIND_COLORS.run }]}
          columns={data.weekly.slice(-16).map((w) => ({ x: w.week, label: formatShortDate(w.week), values: { km: w.km } }))}
          yFormat={(v) => `${formatNumber(v, 1)}`}
        />
      </Card>

      <SectionTitle>Strength</SectionTitle>
      <div className="space-y-2">
        {liftSeries.map((l) => (
          <Card key={l.id}>
            <p className="mb-1 text-sm font-semibold">
              {l.label} <span className="text-xs font-normal text-muted">{l.metric === "max_reps" ? "max reps per session" : "best e1RM per session (kg)"}</span>
            </p>
            <LineChart ariaLabel={`${l.label} trend`} height={130} series={[{ key: l.id, label: l.label, color: KIND_COLORS.strength, points: l.points }]} />
          </Card>
        ))}
      </div>

      <SectionTitle>Recovery · HRV</SectionTitle>
      <Card>
        <LineChart
          ariaLabel={`Heart rate variability, ${RANGES[range].label}`}
          yFormat={(v) => `${Math.round(v)}`}
          series={[
            { key: "daily", label: "Daily (ms)", color: "var(--muted)", kind: "dots", points: hrv.map((p) => ({ x: p.date, y: p.weight })) },
            { key: "avg", label: "7-day avg", color: "#3987e5", points: hrvAvg.map((p) => ({ x: p.date, y: p.weight })) },
          ]}
        />
      </Card>
    </Page>
  );
}
