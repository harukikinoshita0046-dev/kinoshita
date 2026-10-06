"use client";

import { CloudOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { flushQueue, onQueueChange, pendingCount } from "@/lib/offline-queue";
import { createClient } from "@/lib/supabase/client";

/** Replays queued offline writes whenever the app is open and online. Shows a badge while pending. */
export function QueueSync({ compact = false }: { compact?: boolean }) {
  const pending = useSyncExternalStore(onQueueChange, pendingCount, () => 0);

  useEffect(() => {
    const db = createClient();
    const flush = () => {
      if (pendingCount() > 0 && navigator.onLine !== false) void flushQueue(db);
    };
    flush();
    window.addEventListener("online", flush);
    const id = setInterval(flush, 15000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(id);
    };
  }, []);

  if (pending === 0) return null;
  return (
    <span
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full bg-low/15 px-2 py-0.5 text-[10px] font-bold text-low"
          : "fixed left-1/2 top-2 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-low px-3 py-1 text-xs font-bold text-black"
      }
      role="status"
      data-testid="offline-badge"
    >
      <CloudOff className="h-3.5 w-3.5" /> {pending} pending
    </span>
  );
}
