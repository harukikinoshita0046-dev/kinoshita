import { cn, Page } from "./ui";

export function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-2xl bg-surface motion-safe:animate-pulse", className)} />;
}

/**
 * Shown instantly by loading.tsx while a screen's data loads, so a tap is
 * answered right away instead of the old screen sitting still.
 */
export function ScreenSkeleton({ title, back = false }: { title?: string; back?: boolean }) {
  return (
    <Page>
      <div role="status" aria-label="読み込み中">
        {back ? (
          <div className="pt-4">
            <Bone className="h-5 w-24 rounded-lg" />
          </div>
        ) : null}
        <header className="pb-4 pt-6">
          <Bone className="h-3 w-24 rounded" />
          {title ? (
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
          ) : (
            <Bone className="mt-2 h-8 w-44 rounded-lg" />
          )}
        </header>
        <div className="space-y-3">
          <Bone className="h-44" />
          <Bone className="h-28" />
          <Bone className="h-28" />
        </div>
        <span className="sr-only">読み込み中…</span>
      </div>
    </Page>
  );
}

/** Full-screen placeholder for the training screens (logger, live run, simulation). */
export function FocusSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pt-safe" role="status" aria-label="読み込み中">
      <div className="flex items-center justify-between py-3">
        <Bone className="h-11 w-11 rounded-full" />
        <Bone className="h-5 w-32 rounded" />
        <Bone className="h-11 w-16" />
      </div>
      <Bone className="h-8 w-48 rounded-lg" />
      <Bone className="h-24" />
      <Bone className="h-72 rounded-3xl" />
      <span className="sr-only">読み込み中…</span>
    </div>
  );
}
