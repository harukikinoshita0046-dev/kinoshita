"use client";

import { useEffect, useRef, useState } from "react";

/** Container width via ResizeObserver, so SVG marks render at real pixels (2px stays 2px). */
export function useWidth<T extends HTMLElement>(fallback = 343) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? fallback);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return { ref, width };
}
