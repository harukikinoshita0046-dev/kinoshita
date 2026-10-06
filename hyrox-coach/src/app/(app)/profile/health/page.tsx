import { ArrowLeft, CircleCheck, CircleDashed, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { must } from "@/lib/data/util";

export const metadata: Metadata = { title: "Apple ヘルスケア" };

export default async function HealthPage() {
  const { supabase, userId } = await requireUser();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sources = must(
    await supabase.from("health_metrics").select("source, date").eq("user_id", userId).order("date", { ascending: false }).limit(30),
    "load sources",
  );
  const latestImport = sources.find((s) => s.source !== "manual");

  return (
    <Page>
      <div className="pt-4">
        <Link href="/profile" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> PROFILE
        </Link>
      </div>
      <PageHeader title="APPLE HEALTH" />

      <Card className="space-y-3">
        <div className="flex gap-3">
          <CircleCheck className="h-5 w-5 shrink-0 text-push" aria-hidden="true" />
          <div>
            <p className="font-bold">Phase 1 · 手入力と取り込み（利用可能）</p>
            <p className="text-sm text-muted">
              アプリの朝のチェックイン、AIコーチへのメッセージ、またはヘルスケアのデータを取り込み API に送る iOS ショートカットで記録できます。
            </p>
            <p className="mt-1 text-xs text-faint">最後に取り込んだデータ（手入力以外）: {latestImport ? `${latestImport.date}（${latestImport.source}）` : "まだありません"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <CircleDashed className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <p className="font-bold">Phase 2 · HealthKit との自動同期（未対応）</p>
            <p className="text-sm text-muted">
              Web アプリは HealthKit を直接読めません（Apple が iOS / watchOS のネイティブアプリにだけ公開しているため）。睡眠・HRV・安静時心拍・ワークアウト・心拍を
              バックグラウンドで自動同期するには、この API に書き込む iOS アプリが必要です。
            </p>
          </div>
        </div>
      </Card>

      <SectionTitle>iOS ショートカットで取り込む（任意）</SectionTitle>
      <Card className="text-sm leading-relaxed">
        <div className="mb-2 flex items-center gap-2 font-bold">
          <Smartphone className="h-4 w-4 text-accent" aria-hidden="true" /> 毎朝の自動化
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>ショートカット App → オートメーション → 時刻（例: 7:00）→「すぐに実行」。</li>
          <li>「ヘルスケアサンプルを検索」を追加し、心拍変動・安静時心拍数・睡眠・体重（最新 / 昨夜）を取得。</li>
          <li>「URL の内容を取得」を追加し、下の URL に POST。本文は JSON（date, sleep_minutes, hrv, resting_hr, weight）、ヘッダーは Authorization: Bearer &lt;トークン&gt;。</li>
        </ol>
        <code className="mt-3 block break-all rounded-lg bg-surface-2 p-2 text-xs">POST {base}/api/coach/health</code>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">{`{
  "date": "2026-10-06",
  "sleep_minutes": 462,
  "hrv": 61,
  "resting_hr": 52,
  "weight": 78.4,
  "source": "apple_health"
}`}</pre>
        <p className="mt-2 text-xs text-faint">
          実機での動作はまだ確認していません。iPhone で一度作って、TODAY に値が出るか確かめてください。アプリが公開 HTTPS の URL で動いている必要があります。
        </p>
      </Card>
    </Page>
  );
}
