"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { createTokenAction, type TokenState } from "@/app/(app)/profile/actions";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";

export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-surface-3 px-3 text-xs font-bold text-text active:brightness-125"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-push" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copied ? "コピーしました" : label}
    </button>
  );
}

export function CreateTokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(createTokenAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="名前">
        <input name="name" required maxLength={60} defaultValue="ChatGPT Coach" className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="scopes" value="read" defaultChecked className="h-5 w-5 accent-[var(--accent)]" /> read（読み取り）
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="scopes" value="write" defaultChecked className="h-5 w-5 accent-[var(--accent)]" /> write（メニュー作成・記録）
        </label>
      </div>
      <Field label="有効期限">
        <select name="expires_in_days" defaultValue={0} className={inputClass}>
          <option value={0}>なし（手動で無効化）</option>
          <option value={30}>30日</option>
          <option value={90}>90日</option>
          <option value={365}>1年</option>
        </select>
      </Field>
      <ErrorText>{state.error}</ErrorText>
      {state.token ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3" data-testid="new-token">
          <p className="text-xs font-bold text-accent">今すぐコピーしてください。このトークンは二度と表示されません。</p>
          <code className="mt-2 block break-all font-mono text-sm" data-testid="new-token-value">
            {state.token}
          </code>
          <div className="mt-2">
            <CopyButton text={state.token} label="トークンをコピー" />
          </div>
        </div>
      ) : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")} data-testid="create-token">
        {pending ? "発行中…" : "トークンを発行"}
      </button>
    </form>
  );
}
