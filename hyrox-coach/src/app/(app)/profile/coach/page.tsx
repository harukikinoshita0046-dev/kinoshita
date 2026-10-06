import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CopyButton, CreateTokenForm } from "@/components/profile/CoachTokens";
import { Card, Page, PageHeader, SectionTitle, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { GPT_INSTRUCTIONS } from "@/lib/coach/gpt-instructions";
import { getProfile, profileTimezone } from "@/lib/data/profile";
import { must } from "@/lib/data/util";
import { revokeTokenAction } from "../actions";

export const metadata: Metadata = { title: "AIコーチ API" };

function formatTime(iso: string | null, timeZone: string) {
  if (!iso) return "なし";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

export default async function CoachApiPage() {
  const { supabase, userId } = await requireUser();
  const tz = profileTimezone(await getProfile(supabase, userId));
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const [tokens, logs] = await Promise.all([
    supabase
      .from("coach_api_tokens")
      .select("id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("api_request_logs")
      .select("id, method, path, status, duration_ms, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const tokenRows = must(tokens, "load tokens");
  const logRows = must(logs, "load API log");
  const isPublic = base.startsWith("https://");

  return (
    <Page>
      <div className="pt-4">
        <Link href="/profile" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> PROFILE
        </Link>
      </div>
      <PageHeader title="AI COACH API" />
      <p className="text-sm leading-relaxed text-muted">
        ChatGPT（ほかの AI でも可）をコーチとしてつなぎます。AI は <code className="text-text">GET /api/coach/context</code> でデータを読み、{" "}
        <code className="text-text">POST /api/coach/workouts</code> でメニューを書き込みます。メニューはすぐに TODAY に表示されます。
      </p>

      <SectionTitle>エンドポイント</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="label block">OpenAPI スキーマ（インポート用 URL）</span>
            <code className="block truncate text-xs">{base}/api/coach/openapi.json</code>
          </span>
          <CopyButton text={`${base}/api/coach/openapi.json`} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="label block">認証ヘッダー</span>
            <code className="block truncate text-xs">Authorization: Bearer hxc_…</code>
          </span>
        </div>
        {!isPublic ? (
          <p className="rounded-lg bg-low/10 px-2 py-1.5 text-xs text-low">
            このアプリは {base} で動いています。ChatGPT が呼び出せるのは公開された HTTPS の URL だけです。先にデプロイ（例: Vercel）して NEXT_PUBLIC_APP_URL を設定してください。
          </p>
        ) : null}
      </Card>

      <SectionTitle>ChatGPT の設定</SectionTitle>
      <Card>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>下の「トークンを発行」で read + write のトークンを作り、コピーします。</li>
          <li>ChatGPT → GPT を探す → 作成する → 構成。</li>
          <li>アクション → 新しいアクションを作成する → URL からインポート → 上の OpenAPI の URL を貼り付け。</li>
          <li>認証 → API キー → 認証タイプ「Bearer」→ トークンを貼り付け。</li>
          <li>下の GPT 指示文を「指示」に貼り付け、公開範囲「私だけ」で保存。</li>
          <li>「今日トレーニングする」と送ります。</li>
        </ol>
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold">
            GPT 指示文 <CopyButton text={GPT_INSTRUCTIONS} />
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs leading-relaxed">{GPT_INSTRUCTIONS}</pre>
        </details>
      </Card>

      <SectionTitle>トークンを発行</SectionTitle>
      <Card>
        <CreateTokenForm />
      </Card>

      <SectionTitle>発行済みトークン</SectionTitle>
      <ul className="space-y-1.5" data-testid="token-list">
        {tokenRows.map((t) => {
          const expired = t.expires_at != null && new Date(t.expires_at) < new Date();
          const inactive = Boolean(t.revoked_at) || expired;
          return (
            <li key={t.id} className={cn("rounded-2xl bg-surface p-3", inactive && "opacity-50")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{t.name}</p>
                  <p className="font-mono text-xs text-muted">{t.token_prefix}…</p>
                  <p className="text-[11px] text-faint">
                    {t.scopes.join(" + ")} · 最終利用 {formatTime(t.last_used_at, tz)}
                    {t.expires_at ? ` · 有効期限 ${formatTime(t.expires_at, tz)}` : ""}
                  </p>
                </div>
                {inactive ? (
                  <span className="text-xs font-bold text-recover">{t.revoked_at ? "無効化済み" : "期限切れ"}</span>
                ) : (
                  <form action={revokeTokenAction.bind(null, t.id)}>
                    <button className="min-h-9 rounded-lg bg-recover/15 px-3 text-xs font-bold text-recover">無効化</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
        {tokenRows.length === 0 ? <li className="text-sm text-muted">まだトークンはありません。</li> : null}
      </ul>

      <SectionTitle>最近の API アクセス</SectionTitle>
      <Card>
        <ul className="num divide-y divide-line text-xs">
          {logRows.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-1.5">
              <span className={cn("w-9 font-bold", l.status < 400 ? "text-push" : "text-low")}>{l.status}</span>
              <span className="w-12 text-muted">{l.method}</span>
              <span className="min-w-0 flex-1 truncate">{l.path}</span>
              <span className="text-faint">{formatTime(l.created_at, tz)}</span>
            </li>
          ))}
          {logRows.length === 0 ? <li className="py-1 text-muted">まだアクセスはありません。</li> : null}
        </ul>
      </Card>
    </Page>
  );
}
