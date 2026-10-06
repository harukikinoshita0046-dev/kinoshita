export const UNIT_TYPES = ["weight_reps", "bodyweight_reps", "reps", "distance_time", "weight_distance", "time"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export type ExerciseMasterRow = {
  id: string;
  owner_id: string | null;
  name: string;
  category: string;
  primary_muscle: string | null;
  secondary_muscles: string[];
  hyrox_relevance: number;
  is_hyrox_station: boolean;
  hyrox_station_order: number | null;
  unit_type: string;
  weight_increment: number;
  default_rest_seconds: number;
  default_distance_m: number | null;
  aliases: string[];
  active: boolean;
};

export type ExerciseSettingsRow = {
  exercise_id: string;
  weight_increment: number | null;
  default_rest_seconds: number | null;
  hidden: boolean;
};

export type Exercise = ExerciseMasterRow & {
  unit_type: UnitType;
  is_custom: boolean;
  hidden: boolean;
};

export function isUnitType(value: unknown): value is UnitType {
  return typeof value === "string" && (UNIT_TYPES as readonly string[]).includes(value);
}

/** Built-in master row + the athlete's overrides = what the app should use. */
export function mergeExerciseSettings(master: ExerciseMasterRow[], settings: ExerciseSettingsRow[]): Exercise[] {
  const byId = new Map(settings.map((s) => [s.exercise_id, s]));
  return master.map((m) => {
    const s = byId.get(m.id);
    return {
      ...m,
      unit_type: isUnitType(m.unit_type) ? m.unit_type : "weight_reps",
      weight_increment: Number(s?.weight_increment ?? m.weight_increment),
      default_rest_seconds: s?.default_rest_seconds ?? m.default_rest_seconds,
      is_custom: m.owner_id != null,
      hidden: s?.hidden ?? false,
    };
  });
}

export function usesWeight(unit: UnitType): boolean {
  return unit === "weight_reps" || unit === "bodyweight_reps" || unit === "weight_distance";
}
export function usesReps(unit: UnitType): boolean {
  return unit === "weight_reps" || unit === "bodyweight_reps" || unit === "reps";
}
export function usesDistance(unit: UnitType): boolean {
  return unit === "distance_time" || unit === "weight_distance";
}
export function usesTime(unit: UnitType): boolean {
  return unit === "distance_time" || unit === "time" || unit === "weight_distance";
}

/** Snap to the exercise's weight step (avoids 82.49999 from float math). */
export function snapToIncrement(value: number, increment: number): number {
  if (!(increment > 0)) return value;
  const snapped = Math.round(value / increment) * increment;
  return Math.max(0, Number(snapped.toFixed(2)));
}

export function slugifyExerciseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Finds an exercise by id, name or alias (case/spacing-insensitive). */
export function resolveExercise<T extends Pick<ExerciseMasterRow, "id" | "name" | "aliases">>(
  exercises: T[],
  query: string,
): T | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-'’]+/g, "_").replace(/_+/g, "_");
  const q = norm(query);
  return (
    exercises.find((e) => e.id === query) ??
    exercises.find((e) => norm(e.id) === q) ??
    exercises.find((e) => norm(e.name) === q) ??
    exercises.find((e) => e.aliases.some((a) => norm(a) === q))
  );
}
