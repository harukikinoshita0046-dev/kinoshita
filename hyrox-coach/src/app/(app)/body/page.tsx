import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "@/components/charts/LineChart";
import { ButtonLink, Card, Page, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listBodyMetrics } from "@/lib/data/metrics";
import { getProfile, profileToday } from "@/lib/data/profile";
import { lossRateAssessment, rollingAverageSeries, weightTrend } from "@/lib/domain/body";
import { addDays, formatShortDate } from "@/lib/domain/dates";
import { formatNumber, formatPercent, formatSigned } from "@/lib/domain/format";

export const metadata: Metadata = { title: "Body" };

const ASSESSMENT: Record<string, string> = {
  too_fast: "Faster than ~1%/week — watch strength and performance.",
  on_track: "On track (~0.25–1% per week).",
  slow: "Slow or stable.",
  gaining: "Trending up.",
};

export default async function BodyPage() {
  const { supabase, userId } = await requireUser();
  const profile = await getProfile(supabase, userId);
  const today = profileToday(profile);
  const rows = await listBodyMetrics(supabase, userId, { from: addDays(today, -120), to: today });
  const points = rows.filter((r) => r.weight != null).map((r) => ({ date: r.date, weight: Number(r.weight) }));
  const target = profile.target_weight_kg == null ? null : Number(profile.target_weight_kg);
  const trend = weightTrend(points, today, target);
  const avgSeries = rollingAverageSeries(points);
  const assessment = lossRateAssessment(trend.weeklyRatePct);
  const latestComposition = [...rows].reverse().find((r) => r.body_fat_percentage != null || r.muscle_mass != null);
  const chartFrom = addDays(today, -89);

  return (
    <Page>
      <div className="pt-4">
        <Link href="/progress" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" /> Progress
        </Link>
      </div>
      <PageHeader title="BODY" action={<ButtonLink href="/checkin" size="sm">+ Weight</ButtonLink>} />

      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Weight" value={trend.latest ? formatNumber(trend.latest.weight, 1) : "–"} unit="kg" size="lg" />
          <Stat label="7 day avg" value={trend.avg7 != null ? formatNumber(trend.avg7, 1) : "–"} unit="kg" />
          <Stat
            label="This week"
            value={formatSigned(trend.weeklyChange)}
            unit="kg"
            sub={trend.weeklyRatePct != null ? `${formatPercent(trend.weeklyRatePct, 1, true)} / wk` : undefined}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="30 days" value={formatSigned(trend.monthlyChange)} unit="kg" size="sm" />
          <Stat label="Target" value={target != null ? formatNumber(target, 1) : "–"} unit={target != null ? "kg" : undefined} size="sm" sub={trend.toTarget != null ? `${formatSigned(trend.toTarget)} kg to go` : undefined} />
          <Stat label="ETA" value={trend.projectedTargetDate ? formatShortDate(trend.projectedTargetDate) : "–"} size="sm" />
        </div>
        {assessment ? <p className="mt-3 text-xs text-muted">{ASSESSMENT[assessment]}</p> : null}
      </Card>

      <SectionTitle>Last 90 days</SectionTitle>
      <Card>
        <LineChart
          ariaLabel="Body weight, daily values and 7-day average, last 90 days"
          format="dec1"
          reference={target != null ? { y: target, label: `Target ${formatNumber(target, 1)}` } : undefined}
          series={[
            { key: "daily", label: "Daily", color: "var(--muted)", kind: "dots", points: points.filter((p) => p.date >= chartFrom).map((p) => ({ x: p.date, y: p.weight })) },
            { key: "avg", label: "7-day avg", color: "var(--accent)", points: avgSeries.filter((p) => p.date >= chartFrom).map((p) => ({ x: p.date, y: p.weight })) },
          ]}
        />
      </Card>

      {latestComposition ? (
        <>
          <SectionTitle>Composition</SectionTitle>
          <Card className="grid grid-cols-2 gap-3">
            <Stat label="Body fat" value={latestComposition.body_fat_percentage ?? "–"} unit="%" sub={formatShortDate(latestComposition.date)} />
            <Stat label="Muscle mass" value={latestComposition.muscle_mass ?? "–"} unit="kg" sub={formatShortDate(latestComposition.date)} />
          </Card>
        </>
      ) : null}

      <SectionTitle>Recent entries</SectionTitle>
      <Card>
        <ul className="divide-y divide-line">
          {[...rows].reverse().slice(0, 14).map((r) => (
            <li key={r.id} className="num flex items-center justify-between py-2 text-sm">
              <span className="text-muted">{formatShortDate(r.date)}</span>
              <span className="font-bold">{r.weight != null ? `${formatNumber(r.weight, 1)} kg` : "–"}</span>
              <span className="w-24 text-right text-xs text-faint">
                {r.body_fat_percentage != null ? `${r.body_fat_percentage}% fat` : r.source === "manual" ? "" : r.source}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
