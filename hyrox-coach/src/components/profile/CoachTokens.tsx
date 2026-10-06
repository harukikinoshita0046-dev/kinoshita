"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { createTokenAction, type TokenState } from "@/app/(app)/profile/actions";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-2 py-1 text-xs font-bold text-text active:brightness-125"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-push" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : label}
    </button>
  );
}

export function CreateTokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(createTokenAction, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Name">
        <input name="name" required maxLength={60} defaultValue="ChatGPT Coach" className={inputClass} />
      </Field>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="scopes" value="read" defaultChecked className="h-4 w-4 accent-[var(--accent)]" /> read
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="scopes" value="write" defaultChecked className="h-4 w-4 accent-[var(--accent)]" /> write (create plans, log data)
        </label>
      </div>
      <Field label="Expires">
        <select name="expires_in_days" defaultValue={0} className={inputClass}>
          <option value={0}>Never (revoke manually)</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>1 year</option>
        </select>
      </Field>
      <ErrorText>{state.error}</ErrorText>
      {state.token ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3" data-testid="new-token">
          <p className="text-xs font-bold text-accent">Copy it now — it will not be shown again.</p>
          <code className="mt-2 block break-all font-mono text-sm" data-testid="new-token-value">
            {state.token}
          </code>
          <div className="mt-2">
            <CopyButton text={state.token} label="Copy token" />
          </div>
        </div>
      ) : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")} data-testid="create-token">
        {pending ? "…" : "CREATE TOKEN"}
      </button>
    </form>
  );
}
