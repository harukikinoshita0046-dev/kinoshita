"use client";

import type { Db, Insert } from "@/lib/supabase/types";

/**
 * Set logging must survive bad gym Wi-Fi. Writes that fail are kept in
 * localStorage and replayed later. Set ids are generated on the device and
 * writes are upserts, so replaying is idempotent.
 */
export type QueueItem =
  | { kind: "upsert_set"; set: Insert<"workout_sets"> }
  | { kind: "delete_set"; id: string; userId: string };

const KEY = "hx:queue:v1";
const listeners = new Set<(count: number) => void>();

function read(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueueItem[];
  } catch {
    return [];
  }
}

function write(items: QueueItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: nothing more we can do offline.
  }
  for (const l of listeners) l(items.length);
}

export function pendingCount(): number {
  return typeof window === "undefined" ? 0 : read().length;
}

/** Subscribe to queue size changes (shape matches useSyncExternalStore). */
export function onQueueChange(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function enqueue(item: QueueItem) {
  const items = read().filter((i) =>
    item.kind === "upsert_set" && i.kind === "upsert_set" ? i.set.id !== item.set.id : true,
  );
  write([...items, item]);
}

async function run(db: Db, item: QueueItem): Promise<boolean> {
  if (item.kind === "upsert_set") {
    const { error } = await db.from("workout_sets").upsert(item.set, { onConflict: "id" });
    // 23503 = the session was deleted meanwhile; drop the write instead of retrying forever.
    return !error || error.code === "23503";
  }
  const { error } = await db.from("workout_sets").delete().eq("user_id", item.userId).eq("id", item.id);
  return !error;
}

let flushing = false;

/** Replays queued writes in order; stops at the first failure to keep ordering. */
export async function flushQueue(db: Db): Promise<number> {
  if (flushing) return pendingCount();
  flushing = true;
  try {
    let items = read();
    while (items.length > 0) {
      const ok = await run(db, items[0]).catch(() => false);
      if (!ok) break;
      items = read().slice(1);
      write(items);
    }
    return items.length;
  } finally {
    flushing = false;
  }
}

/** Tries the write now; queues it if the network or API is unavailable. */
export async function saveOrQueue(db: Db, item: QueueItem): Promise<"saved" | "queued"> {
  if (pendingCount() === 0) {
    const ok = await run(db, item).catch(() => false);
    if (ok) return "saved";
  }
  enqueue(item);
  return "queued";
}
