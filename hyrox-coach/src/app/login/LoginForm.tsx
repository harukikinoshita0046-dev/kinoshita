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
      <input
        className={inputClass}
        type="email"
        name="email"
        autoComplete="email"
        placeholder="Email"
        required
        aria-label="Email"
      />
      <input
        className={inputClass}
        type="password"
        name="password"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder="Password (8+ characters)"
        required
        minLength={8}
        aria-label="Password"
      />
      <ErrorText>{state.error}</ErrorText>
      {signUpState.message ? <p className="rounded-xl bg-push/10 px-3 py-2 text-sm text-push">{signUpState.message}</p> : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "…" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
      </button>
      <button
        type="button"
        className={buttonClass("ghost", "md", "w-full")}
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "No account yet? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
