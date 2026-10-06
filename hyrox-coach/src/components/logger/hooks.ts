"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/*
 * Time and localStorage are read through useSyncExternalStore so the server
 * render and hydration use a fixed value (0 / the initial state) and the real
 * value arrives right after hydration — no hydration mismatches.
 */

type Ticker = { now: number; listeners: Set<() => void>; id: ReturnType<typeof setInterval> | null };
const tickers = new Map<number, Ticker>();

function ticker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), id: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

function subscribeTicker(intervalMs: number, listener: () => void) {
  const t = ticker(intervalMs);
  t.listeners.add(listener);
  if (!t.id) {
    t.now = Date.now();
    t.id = setInterval(() => {
      t.now = Date.now();
      for (const l of t.listeners) l();
    }, intervalMs);
  }
  return () => {
    t.listeners.delete(listener);
    if (t.listeners.size === 0 && t.id) {
      clearInterval(t.id);
      t.id = null;
    }
  };
}

/** Current time in ms, re-rendering every `intervalMs`. Returns 0 on the server and during hydration. */
export function useNow(intervalMs = 1000): number {
  const subscribe = useCallback((listener: () => void) => subscribeTicker(intervalMs, listener), [intervalMs]);
  const getSnapshot = useCallback(() => ticker(intervalMs).now, [intervalMs]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen on while training (Screen Wake Lock API, where supported). */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible") {
        wakeLock
          .request("screen")
          .then((s) => (sentinel = s))
          .catch(() => {});
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

/**
 * Short beeps + vibration when rest ends. Browsers only allow audio after a
 * user gesture, so `prime()` is called from the COMPLETE SET tap.
 */
export function useAlert() {
  const ctx = useRef<AudioContext | null>(null);

  const prime = useCallback(() => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current ??= new Ctor();
      if (ctx.current.state === "suspended") void ctx.current.resume();
    } catch {
      // Audio is a nice-to-have.
    }
  }, []);

  const alert = useCallback(() => {
    navigator.vibrate?.([200, 100, 200]);
    const ac = ctx.current;
    if (!ac) return;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, ac.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + offset + 0.18);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + offset);
      osc.stop(ac.currentTime + offset + 0.2);
    });
  }, []);

  return { prime, alert };
}

const memoryStore = new Map<string, string | null>();
const storeListeners = new Map<string, Set<() => void>>();

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeStored(key: string, raw: string | null) {
  try {
    if (raw == null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    memoryStore.set(key, raw);
  }
  for (const l of storeListeners.get(key) ?? []) l();
}

/** JSON state mirrored to localStorage (survives reloads mid-workout). */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [fallback] = useState(initial);
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = storeListeners.get(key);
      if (!set) {
        set = new Set();
        storeListeners.set(key, set);
      }
      set.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }, [raw, fallback]);
  const set = useCallback((next: T) => writeStored(key, next == null ? null : JSON.stringify(next)), [key]);
  return [value, set];
}
