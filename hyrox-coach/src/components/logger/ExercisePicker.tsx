"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { inputClass } from "@/components/ui";
import type { LoggerExercise } from "@/lib/logger";

const CATEGORY_ORDER = ["hyrox_station", "run", "push", "pull", "legs", "hinge", "carry", "core", "cardio", "other"];
const CATEGORY_LABEL: Record<string, string> = {
  hyrox_station: "HYROX Stations",
  run: "Running",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  hinge: "Hinge",
  carry: "Carry",
  core: "Core",
  cardio: "Cardio",
  other: "Other",
};

export function ExercisePicker({
  open,
  title,
  catalog,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  catalog: LoggerExercise[];
  onClose: () => void;
  onPick: (exercise: LoggerExercise) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = catalog.filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.includes(q));
    return CATEGORY_ORDER.map((c) => ({ category: c, items: filtered.filter((e) => e.category === c) })).filter((g) => g.items.length);
  }, [catalog, query]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          className={`${inputClass} pl-9`}
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
        />
      </div>
      <div className="space-y-4 pb-4">
        {groups.map((g) => (
          <div key={g.category}>
            <p className="label mb-1.5">{CATEGORY_LABEL[g.category] ?? g.category}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {g.items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onPick(e)}
                  className="truncate rounded-xl bg-surface-2 px-3 py-3 text-left text-sm font-semibold active:bg-surface-3"
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 ? <p className="text-sm text-muted">No exercise matches “{query}”.</p> : null}
      </div>
    </Sheet>
  );
}
