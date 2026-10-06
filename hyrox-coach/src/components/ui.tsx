import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-md px-4 pt-safe", className)}>{children}</main>;
}

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-6">
      <div className="min-w-0">
        {eyebrow ? <p className="label">{eyebrow}</p> : null}
        <h1 className="truncate text-3xl font-extrabold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-2xl bg-surface p-4", className)} {...rest}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="label">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: string;
  size?: "sm" | "md" | "lg";
}) {
  const valueSize = size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-2xl";
  return (
    <div className="min-w-0">
      <p className="label leading-snug">{label}</p>
      <p className={cn("num mt-1 font-bold leading-none", valueSize, tone)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-semibold text-muted">{unit}</span> : null}
      </p>
      {sub ? <p className="num mt-1 truncate text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-accent text-accent-ink active:brightness-90",
  secondary: "bg-surface-2 text-text active:bg-surface-3",
  ghost: "bg-transparent text-muted active:text-text",
  danger: "bg-recover/15 text-recover active:bg-recover/25",
} as const;

type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "lg" | "sm" = "md", extra?: string) {
  const sizes = {
    sm: "h-9 rounded-xl px-3 text-sm",
    md: "h-12 rounded-2xl px-4 text-base",
    lg: "h-16 rounded-2xl px-5 text-lg",
  };
  return cn(
    "inline-flex items-center justify-center gap-2 font-bold tracking-wide transition disabled:opacity-40",
    sizes[size],
    BUTTON_VARIANTS[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "md" | "lg" | "sm" }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "lg" | "sm" }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted", className)}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-5 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "num h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text placeholder:text-faint focus:border-accent focus:outline-none";

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 rounded-xl bg-recover/10 px-3 py-2 text-sm text-recover">{children}</p>;
}
