export const WORKOUT_TYPES = [
  "upper",
  "lower",
  "full_body",
  "hyrox",
  "run",
  "simulation",
  "conditioning",
  "recovery",
  "other",
] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  upper: "上半身",
  lower: "下半身",
  full_body: "全身",
  hyrox: "HYROX",
  run: "ラン",
  simulation: "HYROX シミュレーション",
  conditioning: "コンディショニング",
  recovery: "リカバリー",
  other: "その他",
};

const SYNONYMS: Record<string, WorkoutType> = {
  upper: "upper",
  upper_body: "upper",
  push: "upper",
  pull: "upper",
  chest: "upper",
  back: "upper",
  lower: "lower",
  lower_body: "lower",
  legs: "lower",
  leg: "lower",
  full_body: "full_body",
  fullbody: "full_body",
  full: "full_body",
  total_body: "full_body",
  strength: "full_body",
  hyrox: "hyrox",
  hyrox_strength: "hyrox",
  hyrox_training: "hyrox",
  stations: "hyrox",
  run: "run",
  running: "run",
  intervals: "run",
  interval: "run",
  tempo: "run",
  easy_run: "run",
  long_run: "run",
  simulation: "simulation",
  hyrox_simulation: "simulation",
  sim: "simulation",
  race_simulation: "simulation",
  conditioning: "conditioning",
  metcon: "conditioning",
  engine: "conditioning",
  cardio: "conditioning",
  recovery: "recovery",
  mobility: "recovery",
  rest: "recovery",
  deload: "recovery",
  other: "other",
};

export function isWorkoutType(value: unknown): value is WorkoutType {
  return typeof value === "string" && (WORKOUT_TYPES as readonly string[]).includes(value);
}

/** Maps free text like "Upper", "Legs", "HYROX Simulation" onto a canonical workout type. */
export function normalizeWorkoutType(input: string | null | undefined): WorkoutType {
  if (!input) return "other";
  const key = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (SYNONYMS[key]) return SYNONYMS[key];
  if (key.includes("simulation")) return "simulation";
  if (key.includes("hyrox")) return "hyrox";
  if (key.includes("upper")) return "upper";
  if (key.includes("lower") || key.includes("leg")) return "lower";
  if (key.includes("run")) return "run";
  return "other";
}

export function workoutTypeLabel(type: string | null | undefined): string {
  return isWorkoutType(type) ? WORKOUT_TYPE_LABELS[type] : "トレーニング";
}

/** Session types grouped the way the coach asks about them ("last upper", "last HYROX"...). */
export const WORKOUT_GROUPS = {
  upper: ["upper", "full_body"],
  lower: ["lower", "full_body"],
  hyrox: ["hyrox", "simulation", "conditioning"],
} as const satisfies Record<string, readonly WorkoutType[]>;
