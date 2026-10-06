"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; mode: "signin" | "signup" };

const credentials = z.object({
  email: z.email("正しいメールアドレスを入力してください。"),
  password: z.string().min(8, "パスワードは8文字以上にしてください。"),
});

/** Supabase Auth returns English messages; show the common ones in Japanese. */
function signUpErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered")) return "このメールアドレスはすでに登録されています。ログインしてください。";
  if (m.includes("not allowed") || m.includes("disabled")) return "現在、新規登録は受け付けていません。";
  if (m.includes("rate limit")) return "確認メールの送信回数が上限に達しました。しばらく待ってからもう一度お試しください。";
  if (m.includes("password")) return "このパスワードは使えません。別のパスワードにしてください。";
  return `登録できませんでした（${message}）`;
}

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { mode: "signin", error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { mode: "signin", error: "メールアドレスまたはパスワードが違います。" };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { mode: "signup", error: parsed.error.issues[0]?.message };

  const allowed = (process.env.ALLOWED_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(parsed.data.email.toLowerCase())) {
    return { mode: "signup", error: "このアプリでは新規登録を制限しています。" };
  }

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/today` },
  });
  if (error) return { mode: "signup", error: signUpErrorMessage(error.message) };
  if (data.session) redirect("/today");
  return { mode: "signin", message: "確認メールを送りました。メール内のリンクを開いてから、ログインしてください。" };
}
