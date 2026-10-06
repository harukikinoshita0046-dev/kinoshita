"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Current time, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
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

/** JSON state mirrored to localStorage (survives reloads mid-workout). */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        if (next == null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );
  return [value, set];
}
