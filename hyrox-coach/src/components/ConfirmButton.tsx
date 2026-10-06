"use client";

import type { ReactNode } from "react";
import { buttonClass } from "./ui";

/** Submit button for destructive server actions; asks before submitting. */
export function ConfirmButton({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className ?? buttonClass("danger", "md", "w-full")}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
