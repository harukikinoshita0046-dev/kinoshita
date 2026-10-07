"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button for server-action forms. Shows a spinner and disables itself
 * the moment it is tapped, so the athlete sees the tap landed while the server works.
 */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  ...rest
}: Omit<ComponentProps<"button">, "type"> & { pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} {...rest}>
      {pending ? (
        <>
          <LoaderCircle className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
