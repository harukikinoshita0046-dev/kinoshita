import { ChevronRight, Dumbbell, Flame, Footprints } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page, PageHeader, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listHyroxResults } from "@/lib/data/hyrox";
import { getProfile, profileToday } from "@/lib/data/profile";
import { listRuns } from "@/lib/data/runs";
import { listSessions } from "@/lib/data/sessions";
import { formatShortDate, relativeDayLabel, startOfWeek } from "@/lib/domain/dates";
import { formatDuration, formatMinutes, formatNumber, formatPace } from "@/lib/domain/format";
import { runTypeLabel } from "@/lib/domain/running";
import { workoutTypeLabel } from "@/lib/domain/workout-types";

export const metadata: Metadata = { title: "History" };

type Item = {
  key: string;
  kind: "workout" | "run" | "hyrox";
  date: string;
  sortAt: string;
  href: string;
  title: string;
  subtitle: string;
  value: string;
  badge?: string;
};

const FILTERS = [
  { key: "all", label: "ALL" },
  { key: "workouts", label: "WORKOUTS" },
  { key: "runs", label: "RUNS" },
  { key: "hyrox", label: "HYROX" },
] as const;

const ICON = { workout: Dumbbell, run: Footprints, hyrox: Flame };
const ICON_TONE = { workout: "text-text", run: "text-run", hyrox: "text-station" };

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { type } = await searchParams;
  const filter = FILTERS.some((f) => f.key === type) ? (type as (typeof FILTERS)[number]["key"]) : "all";
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));

  const [sessions, runs, hyrox] = await Promise.all([
    filter === "all" || filter === "workouts" ? listSessions(supabase, userId, { limit: 60 }) : [],
    filter === "all" || filter === "runs" ? listRuns(supabase, userId, { limit: 60 }) : [],
    filter === "all" || filter === "hyrox" ? listHyroxResults(supabase, userId, { limit: 30 }) : [],
  ]);

  const items: Item[] = [
    ...sessions.map((s) => ({
      key: `w-${s.id}`,
      kind: "workout" as const,
      date: s.date,
      sortAt: s.started_at,
      href: s.status === "in_progress" ? `/workout/${s.id}` : `/history/${s.id}`,
      title: s.title,
      subtitle: [
        workoutTypeLabel(s.workout_type),
        s.duration_seconds ? formatMinutes(s.duration_seconds / 60) : null,
        `${s.totalSets} sets`,
        s.totalVolumeKg ? `${formatNumber(s.totalVolumeKg / 1000, 1)} t` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      value: s.session_rpe ? `RPE ${s.session_rpe}` : "",
      badge: s.status === "in_progress" ? "IN PROGRESS" : undefined,
    })),
    ...runs.map((r) => ({
      key: `r-${r.id}`,
      kind: "run" as const,
      date: r.date,
      sortAt: r.started_at ?? `${r.date}T12:00:00Z`,
      href: `/history/run/${r.id}`,
      title: runTypeLabel(r.run_type),
      subtitle: [formatDuration(r.duration_seconds), `${formatPace(r.average_pace)} /km`, r.average_hr ? `${r.average_hr} bpm` : null]
        .filter(Boolean)
        .join(" · "),
      value: `${formatNumber(r.distance_km, 2)} km`,
    })),
    ...hyrox.map((h) => ({
      key: `h-${h.id}`,
      kind: "hyrox" as const,
      date: h.date,
      sortAt: h.started_at ?? `${h.date}T12:00:00Z`,
      href: `/hyrox/results/${h.id}`,
      title: h.name || (h.event_type === "race" ? "HYROX Race" : "HYROX Simulation"),
      subtitle: h.event_type === "race" ? "Race" : h.event_type === "simulation" ? "Simulation" : "Partial",
      value: formatDuration(h.total_seconds),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.sortAt.localeCompare(a.sortAt));

  const weeks = new Map<string, Item[]>();
  for (const item of items) {
    const wk = startOfWeek(item.date);
    weeks.set(wk, [...(weeks.get(wk) ?? []), item]);
  }
  const thisWeek = startOfWeek(today);

  return (
    <Page>
      <PageHeader title="HISTORY" />
      <nav className="mb-4 flex gap-1.5" aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/history" : `/history?type=${f.key}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold",
              filter === f.key ? "bg-text text-black" : "bg-surface-2 text-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? <EmptyState title="Nothing logged yet">Completed workouts, runs and HYROX results show up here.</EmptyState> : null}

      <div className="space-y-6">
        {[...weeks.entries()].map(([week, list]) => (
          <section key={week}>
            <h2 className="label mb-2">
              {week === thisWeek ? "This week" : `Week of ${formatShortDate(week, Number(today.slice(0, 4)))}`}
              <span className="ml-2 text-faint">{list.length}</span>
            </h2>
            <ul className="space-y-1.5">
              {list.map((item) => {
                const Icon = ICON[item.kind];
                return (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 active:bg-surface-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                        <Icon className={cn("h-5 w-5", ICON_TONE[item.kind])} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-bold">{item.title}</span>
                          {item.badge ? <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-accent-ink">{item.badge}</span> : null}
                        </span>
                        <span className="num block truncate text-xs text-muted">
                          {relativeDayLabel(item.date, today)} · {item.subtitle}
                        </span>
                      </span>
                      <span className="num shrink-0 text-sm font-bold">{item.value}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
