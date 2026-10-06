"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Bottom sheet: thumb-reachable modal for secondary actions. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="閉じる" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="pb-safe relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface px-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full bg-surface-2 p-2 text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
