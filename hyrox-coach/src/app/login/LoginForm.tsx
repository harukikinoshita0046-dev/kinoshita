"use client";

import { useActionState, useState } from "react";
import { ErrorText, buttonClass, inputClass } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useActionState<AuthState, FormData>(signIn, { mode: "signin" });
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, { mode: "signup" });
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <form action={mode === "signin" ? signInAction : signUpAction} className="space-y-3">
      <input type="hidden" name="next" value={next ?? "/today"} />
      <label className="block">
        <span className="label">メールアドレス</span>
        <input
          className={`${inputClass} mt-1.5`}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          required
        />
      </label>
      <label className="block">
        <span className="label">パスワード（8文字以上）</span>
        <input
          className={`${inputClass} mt-1.5`}
          type="password"
          name="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
      </label>
      <ErrorText>{state.error}</ErrorText>
      {signUpState.message ? <p className="rounded-xl bg-push/10 px-3 py-2 text-sm text-push">{signUpState.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "処理中…" : mode === "signin" ? "ログイン" : "アカウントを作成"}
      </button>
      <button
        type="button"
        className={buttonClass("ghost", "md", "w-full")}
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "はじめての方は新規登録" : "登録済みの方はログイン"}
      </button>
    </form>
  );
}
