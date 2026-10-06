"use client";

import { ChartLine, Flame, History, User, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const ITEMS = [
  { href: "/history", label: "HISTORY", icon: History },
  { href: "/hyrox", label: "HYROX", icon: Flame },
  { href: "/today", label: "TODAY", icon: Zap, primary: true },
  { href: "/progress", label: "PROGRESS", icon: ChartLine },
  { href: "/profile", label: "PROFILE", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black/90 backdrop-blur" aria-label="Main">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
        {ITEMS.map(({ href, label, icon: Icon, primary }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex justify-center">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 text-[10px] font-bold tracking-wider",
                  primary ? "-mt-5" : "py-1",
                  active ? "text-accent" : "text-faint",
                )}
              >
                {primary ? (
                  <span
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-full border-4 border-black",
                      active ? "bg-accent text-accent-ink" : "bg-surface-2 text-text",
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon className="h-6 w-6" strokeWidth={2} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
