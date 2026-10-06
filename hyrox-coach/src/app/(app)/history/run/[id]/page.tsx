import { ArrowLeft, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Page, SectionTitle, Stat, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getRun, type RunSplit } from "@/lib/data/runs";
import { isUuid } from "@/lib/data/util";
import { formatDayLabel } from "@/lib/domain/dates";
import { formatDuration, formatMinutes, formatNumber, formatPace } from "@/lib/domain/format";
import { runTypeLabel, zoneDistribution } from "@/lib/domain/running";
import { deleteRunAction } from "../../actions";

export const metadata: Metadata = { title: "ラン" };

const ZONE_COLORS = ["bg-[#5ac8fa]", "bg-[#34c759]", "bg-[#ffd60a]", "bg-[#ff9f0a]", "bg-[#ff453a]"];

export default async function RunDetailPage({ params, searchParams }: PageProps<"/history/run/[id]">) {
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase, userId } = await requireUser();
  const run = await getRun(supabase, userId, id).catch(() => null);
  if (!run) notFound();

  const zones = zoneDistribution(run);
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const splits = (Array.isArray(run.splits) ? run.splits : []) as RunSplit[];

  return (
    <Page>
      <div className="pt-4">
        <Link href="/history?type=runs" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> HISTORY
        </Link>
      </div>
      {saved ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-push/10 px-4 py-3 font-bold text-push" data-testid="saved-banner">
          <Check className="h-5 w-5" aria-hidden="true" /> ランを保存しました
        </div>
      ) : null}
      <header className="pb-3 pt-4">
        <p className="label">
          {formatDayLabel(run.date)} · {run.source === "manual" ? "手入力" : run.source === "apple_health" ? "Apple ヘルスケア" : "インポート"}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{runTypeLabel(run.run_type)}</h1>
      </header>

      <Card className="grid grid-cols-3 gap-4">
        <Stat label="距離" value={formatNumber(run.distance_km, 2)} unit="km" size="lg" />
        <Stat label="タイム" value={formatDuration(run.duration_seconds)} />
        <Stat label="ペース" value={formatPace(run.average_pace)} unit="/km" />
        <Stat label="平均心拍" value={run.average_hr ?? "–"} unit={run.average_hr ? "bpm" : undefined} size="sm" />
        <Stat label="最大心拍" value={run.max_hr ?? "–"} unit={run.max_hr ? "bpm" : undefined} size="sm" />
        <Stat label="RPE" value={run.rpe ?? "–"} size="sm" />
        <Stat label="ピッチ" value={run.cadence ?? "–"} unit={run.cadence ? "spm" : undefined} size="sm" />
        <Stat label="消費カロリー" value={run.calories ?? "–"} unit={run.calories ? "kcal" : undefined} size="sm" />
        <Stat label="獲得標高" value={run.elevation_gain_m ?? "–"} unit={run.elevation_gain_m ? "m" : undefined} size="sm" />
      </Card>

      {zoneTotal > 0 ? (
        <>
          <SectionTitle>心拍ゾーン</SectionTitle>
          <Card>
            <div className="flex h-3 overflow-hidden rounded-full">
              {zones.map((z, i) => (z > 0 ? <div key={i} className={ZONE_COLORS[i]} style={{ width: `${(z / zoneTotal) * 100}%` }} /> : null))}
            </div>
            <ul className="mt-3 grid grid-cols-5 gap-1 text-center">
              {zones.map((z, i) => (
                <li key={i} className="num text-xs">
                  <span className={cn("mx-auto mb-1 block h-1.5 w-6 rounded-full", ZONE_COLORS[i])} />
                  <span className="font-bold">Z{i + 1}</span>
                  <span className="block text-muted">{formatMinutes(z / 60)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {splits.length ? (
        <>
          <SectionTitle>スプリット</SectionTitle>
          <Card>
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-semibold">#</th>
                  <th className="pb-2 font-semibold">距離</th>
                  <th className="pb-2 font-semibold">タイム</th>
                  <th className="pb-2 font-semibold">ペース</th>
                  <th className="pb-2 text-right font-semibold">心拍</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 text-faint">{i + 1}</td>
                    <td>{formatNumber(s.distance_m)} m</td>
                    <td className="font-bold">{formatDuration(s.time_seconds)}</td>
                    <td>{formatPace((s.time_seconds / s.distance_m) * 1000)}</td>
                    <td className="text-right">{s.average_hr ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      {run.notes ? (
        <>
          <SectionTitle>メモ</SectionTitle>
          <Card>
            <p className="whitespace-pre-line text-sm">{run.notes}</p>
          </Card>
        </>
      ) : null}

      <form action={deleteRunAction.bind(null, run.id)} className="mt-8">
        <ConfirmButton message="このランを削除しますか？">ランを削除</ConfirmButton>
      </form>
    </Page>
  );
}
