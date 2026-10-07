import { BookOpen, PencilLine, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Page } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { appOrigin, MCP_PATH, validateAuthorizeRequest } from "@/lib/oauth/config";
import { approveAuthorization, denyAuthorization } from "./actions";

export const metadata: Metadata = { title: "ChatGPT との連携" };

const PASS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const raw = await searchParams;
  const params = Object.fromEntries(PASS.map((k) => [k, typeof raw[k] === "string" ? (raw[k] as string) : undefined]));
  const { email } = await requireUser();
  const h = await headers();
  const origin = appOrigin(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);
  const result = validateAuthorizeRequest(params, `${origin}${MCP_PATH}`);

  if (!result.ok && "redirect" in result) redirect(result.redirect);
  if (!result.ok) {
    return (
      <Page className="flex min-h-dvh flex-col justify-center">
        <div className="rounded-2xl bg-surface p-5" role="alert">
          <p className="flex items-center gap-2 font-bold text-recover">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" /> 連携を始められませんでした
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{"fatal" in result ? result.fatal : ""}</p>
        </div>
      </Page>
    );
  }

  const { request } = result;
  const canWrite = request.scopes.includes("write");
  const appName = request.client.name?.trim() || "ChatGPT";

  return (
    <Page className="flex min-h-dvh flex-col justify-center pb-10">
      <p className="label text-accent">HYROX AI COACH</p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight">{appName} と連携しますか？</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        許可すると、{appName} があなたの HYROX Coach アカウント（{email ?? "ログイン中のアカウント"}）に次のことを行えるようになります。
      </p>

      <ul className="mt-5 space-y-2">
        <li className="flex gap-3 rounded-2xl bg-surface p-4">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-sm leading-relaxed">トレーニング・体重・睡眠などのコンディション・ラン・HYROX の記録を読む</span>
        </li>
        {canWrite ? (
          <li className="flex gap-3 rounded-2xl bg-surface p-4">
            <PencilLine className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="text-sm leading-relaxed">今日のメニューを作る・変更する、トレーニングや体重などの記録を保存する</span>
          </li>
        ) : null}
      </ul>

      <p className="mt-4 flex gap-2 text-xs leading-relaxed text-faint">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        許可すると PROFILE → AIコーチ API に「ChatGPT プラグイン」のトークンが追加されます。そこで無効化すれば、いつでも連携を止められます。
      </p>

      <form action={approveAuthorization} className="mt-6 space-y-2">
        {PASS.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
        <SubmitButton className={buttonClass("primary", "lg", "w-full")} pendingText="連携しています…" data-testid="oauth-approve">
          許可する
        </SubmitButton>
      </form>
      <form action={denyAuthorization} className="mt-2">
        {PASS.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
        <SubmitButton className={buttonClass("ghost", "md", "w-full")} pendingText="キャンセルしています…">
          キャンセル
        </SubmitButton>
      </form>
    </Page>
  );
}
