import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckinForm } from "@/components/CheckinForm";
import { READINESS_TONE } from "@/components/today/ReadinessCard";
import { Card, Page, PageHeader, SectionTitle, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadAthleteSnapshot } from "@/lib/data/snapshot";
import { formatDayLabel } from "@/lib/domain/dates";
import { READINESS_COMPONENT_LABELS } from "@/lib/domain/readiness";

export const metadata: Metadata = { title: "チェックイン" };

export default async function CheckinPage() {
  const { supabase, userId } = await requireUser();
  const snap = await loadAthleteSnapshot(supabase, userId);
  const today = snap.today;
  const todayBody = snap.body.points.find((p) => p.date === today);
  const th = snap.health.today;
  const prior = [...snap.health.rows].reverse().find((r) => r.date < today);
  const lastWeight = [...snap.body.points].reverse().find((p) => p.date < today)?.weight ?? snap.body.trend.latest?.weight;
  const r = snap.readiness;

  return (
    <Page>
      <div className="pt-4">
        <Link href="/today" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> TODAY
        </Link>
      </div>
      <PageHeader eyebrow={formatDayLabel(today)} title="CHECK-IN" />

      <CheckinForm
        date={today}
        initial={{
          weight: todayBody?.weight ?? null,
          sleep_minutes: th?.sleep_minutes ?? null,
          hrv: th?.hrv ?? null,
          resting_hr: th?.resting_hr ?? null,
          soreness: snap.checkin?.soreness ?? null,
          fatigue: snap.checkin?.fatigue ?? null,
          motivation: snap.checkin?.motivation ?? null,
          note: snap.checkin?.note ?? null,
        }}
        last={{
          weight: lastWeight ?? undefined,
          sleep_minutes: prior?.sleep_minutes ?? undefined,
          hrv: prior?.hrv ?? undefined,
          resting_hr: prior?.resting_hr ?? undefined,
        }}
      />

      <SectionTitle>コンディションの内訳</SectionTitle>
      <Card>
        {r.score != null && r.level ? (
          <p className="mb-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{r.score}</span>
            <span className={cn("font-bold", READINESS_TONE[r.level].text)}>{r.label}</span>
          </p>
        ) : null}
        <ul className="space-y-3">
          {r.components.map((c) => (
            <li key={c.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{c.label}</span>
                <span className="num font-bold">
                  {c.score}
                  <span className="ml-1 text-[10px] font-normal text-faint">× {Math.round(c.weight * 100)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-text/70" style={{ width: `${c.score}%` }} />
              </div>
              <p className="num mt-1 text-xs text-muted">{c.detail}</p>
            </li>
          ))}
        </ul>
        {r.missing.length ? <p className="mt-3 text-xs text-faint">未入力: {r.missing.map((k) => READINESS_COMPONENT_LABELS[k]).join("、")}</p> : null}
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          コンディションは、今日の値をあなた自身の過去28日間の平均と比べたものです。トレーニング判断の目安であり、医学的な診断ではありません。
        </p>
      </Card>
    </Page>
  );
}
