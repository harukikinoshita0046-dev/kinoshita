import { Dumbbell, Flame, Footprints, Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InsightsList } from "@/components/InsightsList";
import { PlanCard } from "@/components/today/PlanCard";
import { ReadinessCard } from "@/components/today/ReadinessCard";
import { EmptyState, Page, PageHeader, SectionTitle, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listCoachInsights } from "@/lib/data/insights";
import { loadAthleteSnapshot } from "@/lib/data/snapshot";
import { addDays, formatDayLabel } from "@/lib/domain/dates";
import { formatNumber, formatSleepCompact } from "@/lib/domain/format";
import { startQuickWorkout } from "./actions";

export const metadata: Metadata = { title: "今日" };

const quickClass = "flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-[11px] font-bold tracking-wide active:bg-surface-2";

export default async function TodayPage() {
  const { supabase, userId } = await requireUser();
  const snap = await loadAthleteSnapshot(supabase, userId);
  const coachNotes = await listCoachInsights(supabase, userId, { limit: 2, since: addDays(snap.today, -3) });

  const sessionByPlan = new Map(snap.sessions.filter((s) => s.workout_plan_id).map((s) => [s.workout_plan_id!, s.id]));
  const todayHealth = snap.health.today;
  const latestWeight = snap.body.trend.latest;

  return (
    <Page>
      <PageHeader eyebrow={formatDayLabel(snap.today)} title="TODAY" />

      <ReadinessCard
        readiness={snap.readiness}
        checkedIn={Boolean(snap.checkin)}
        metrics={[
          {
            label: "体重",
            value: latestWeight ? formatNumber(latestWeight.weight, 1) : "–",
            unit: "kg",
            sub: snap.body.trend.avg7 != null ? `7日平均 ${formatNumber(snap.body.trend.avg7, 1)}` : undefined,
            href: "/body",
          },
          {
            label: "睡眠",
            value: todayHealth?.sleep_minutes != null ? formatSleepCompact(todayHealth.sleep_minutes) : "–",
            sub: snap.health.sleep7dAvg != null ? `7日平均 ${formatSleepCompact(snap.health.sleep7dAvg)}` : undefined,
            href: "/checkin",
          },
          {
            label: "HRV",
            value: todayHealth?.hrv != null ? formatNumber(todayHealth.hrv, 0) : "–",
            unit: "ms",
            sub: snap.health.hrv7dAvg != null ? `7日平均 ${formatNumber(snap.health.hrv7dAvg, 0)}` : undefined,
            href: "/checkin",
          },
          {
            label: "安静時心拍",
            value: todayHealth?.resting_hr != null ? String(todayHealth.resting_hr) : "–",
            unit: "bpm",
            sub: snap.health.restingHr7dAvg != null ? `7日平均 ${formatNumber(snap.health.restingHr7dAvg, 0)}` : undefined,
            href: "/checkin",
          },
        ]}
      />

      <SectionTitle>今日のメニュー</SectionTitle>
      {snap.todayPlans.length > 0 ? (
        <div className="space-y-3">
          {snap.todayPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} exercises={snap.exercises} sessionId={sessionByPlan.get(plan.id)} />
          ))}
        </div>
      ) : (
        <EmptyState title="まだメニューがありません">
          AIコーチに<span className="font-semibold text-text">「今日トレーニングする」</span>と送ると、ここにメニューが表示されます。
          <form action={startQuickWorkout} className="mt-4">
            <button className="rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-bold text-text active:bg-surface-3">
              メニューなしで始める
            </button>
          </form>
        </EmptyState>
      )}

      <SectionTitle>クイック記録</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <Link href="/checkin" className={quickClass}>
          <Scale className="h-5 w-5 text-accent" aria-hidden="true" /> 体重
        </Link>
        <Link href="/run/new" className={quickClass}>
          <Footprints className="h-5 w-5 text-run" aria-hidden="true" /> ラン
        </Link>
        <Link href="/hyrox/new" className={quickClass}>
          <Flame className="h-5 w-5 text-station" aria-hidden="true" /> HYROX
        </Link>
        <form action={startQuickWorkout} className="contents">
          <button className={cn(quickClass, "w-full")}>
            <Dumbbell className="h-5 w-5 text-text" aria-hidden="true" /> 筋トレ
          </button>
        </form>
      </div>

      <SectionTitle>AIインサイト</SectionTitle>
      <InsightsList coach={coachNotes} rules={snap.insights.slice(0, 3)} />
    </Page>
  );
}
