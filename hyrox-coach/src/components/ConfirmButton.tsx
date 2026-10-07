"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";

/** Submit button for destructive server actions; asks before submitting. */
export function ConfirmButton({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={className ?? buttonClass("danger", "md", "w-full")}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
