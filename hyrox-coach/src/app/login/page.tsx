import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 pt-safe">
      <p className="label text-accent">HYROX AI COACH</p>
      <h1 className="mt-2 text-4xl font-extrabold leading-tight tracking-tight">
        Just train.
        <br />
        <span className="text-muted">The coach does the rest.</span>
      </h1>
      <div className="mt-10">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
