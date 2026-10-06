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

export const metadata: Metadata = { title: "体重・体組成" };

const ASSESSMENT: Record<string, string> = {
  too_fast: "週1%を超えるペースで減っています。筋力やパフォーマンスの低下に注意してください。",
  on_track: "順調です（週0.25〜1%）。",
  slow: "ゆっくり、または横ばいです。",
  gaining: "増加傾向です。",
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
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> PROGRESS
        </Link>
      </div>
      <PageHeader title="BODY" action={<ButtonLink href="/checkin" size="sm">+ 体重を記録</ButtonLink>} />

      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="体重" value={trend.latest ? formatNumber(trend.latest.weight, 1) : "–"} unit="kg" size="lg" />
          <Stat label="7日平均" value={trend.avg7 != null ? formatNumber(trend.avg7, 1) : "–"} unit="kg" />
          <Stat
            label="今週の変化"
            value={formatSigned(trend.weeklyChange)}
            unit="kg"
            sub={trend.weeklyRatePct != null ? `週 ${formatPercent(trend.weeklyRatePct, 1, true)}` : undefined}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="30日間" value={formatSigned(trend.monthlyChange)} unit="kg" size="sm" />
          <Stat label="目標" value={target != null ? formatNumber(target, 1) : "–"} unit={target != null ? "kg" : undefined} size="sm" sub={trend.toTarget != null ? `あと ${formatSigned(trend.toTarget)} kg` : undefined} />
          <Stat label="到達予想" value={trend.projectedTargetDate ? formatShortDate(trend.projectedTargetDate) : "–"} size="sm" />
        </div>
        {assessment ? <p className="mt-3 text-xs text-muted">{ASSESSMENT[assessment]}</p> : null}
      </Card>

      <SectionTitle>直近90日</SectionTitle>
      <Card>
        <LineChart
          ariaLabel="体重の推移（日ごとの値と7日平均、直近90日）"
          format="dec1"
          reference={target != null ? { y: target, label: `目標 ${formatNumber(target, 1)}` } : undefined}
          series={[
            { key: "daily", label: "日ごと", color: "var(--muted)", kind: "dots", points: points.filter((p) => p.date >= chartFrom).map((p) => ({ x: p.date, y: p.weight })) },
            { key: "avg", label: "7日平均", color: "var(--accent)", points: avgSeries.filter((p) => p.date >= chartFrom).map((p) => ({ x: p.date, y: p.weight })) },
          ]}
        />
      </Card>

      {latestComposition ? (
        <>
          <SectionTitle>体組成</SectionTitle>
          <Card className="grid grid-cols-2 gap-3">
            <Stat label="体脂肪率" value={latestComposition.body_fat_percentage ?? "–"} unit="%" sub={formatShortDate(latestComposition.date)} />
            <Stat label="筋肉量" value={latestComposition.muscle_mass ?? "–"} unit="kg" sub={formatShortDate(latestComposition.date)} />
          </Card>
        </>
      ) : null}

      <SectionTitle>最近の記録</SectionTitle>
      <Card>
        <ul className="divide-y divide-line">
          {[...rows].reverse().slice(0, 14).map((r) => (
            <li key={r.id} className="num flex items-center justify-between py-2 text-sm">
              <span className="text-muted">{formatShortDate(r.date)}</span>
              <span className="font-bold">{r.weight != null ? `${formatNumber(r.weight, 1)} kg` : "–"}</span>
              <span className="w-24 text-right text-xs text-faint">
                {r.body_fat_percentage != null ? `体脂肪 ${r.body_fat_percentage}%` : r.source === "manual" ? "" : r.source === "apple_health" ? "ヘルスケア" : "インポート"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
