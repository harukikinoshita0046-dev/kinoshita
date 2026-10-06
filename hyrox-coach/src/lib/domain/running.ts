import { round } from "./format";

export const RUN_TYPES = [
  "easy",
  "zone2",
  "tempo",
  "threshold",
  "intervals",
  "hyrox_run",
  "long_run",
  "recovery",
] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: "Easy",
  zone2: "Zone 2",
  tempo: "Tempo",
  threshold: "Threshold",
  intervals: "Intervals",
  hyrox_run: "HYROX Run",
  long_run: "Long Run",
  recovery: "Recovery",
};

/** Typical session RPE per run type, used for training load when RPE was not logged. */
const ESTIMATED_RPE: Record<RunType, number> = {
  recovery: 2,
  easy: 3,
  zone2: 4,
  long_run: 5,
  tempo: 6.5,
  hyrox_run: 7,
  threshold: 7.5,
  intervals: 8,
};

export function isRunType(value: unknown): value is RunType {
  return typeof value === "string" && (RUN_TYPES as readonly string[]).includes(value);
}

export function normalizeRunType(input: string | null | undefined): RunType | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isRunType(key)) return key;
  const map: Record<string, RunType> = {
    zone_2: "zone2",
    z2: "zone2",
    interval: "intervals",
    hyrox: "hyrox_run",
    hyrox_interval: "intervals",
    long: "long_run",
    longrun: "long_run",
    recovery_run: "recovery",
    easy_run: "easy",
    tempo_run: "tempo",
    lt: "threshold",
  };
  return map[key] ?? null;
}

export function runTypeLabel(type: string | null | undefined): string {
  return isRunType(type) ? RUN_TYPE_LABELS[type] : "Run";
}

export function estimatedRunRpe(type: string | null | undefined): number {
  return isRunType(type) ? ESTIMATED_RPE[type] : 5;
}

export function paceSecondsPerKm(distanceKm: number, durationSeconds: number): number | null {
  if (!(distanceKm > 0) || !(durationSeconds > 0)) return null;
  return round(durationSeconds / distanceKm, 1);
}

export type HrZone = { zone: 1 | 2 | 3 | 4 | 5; min: number; max: number };

/** Simple %HRmax zones (50-60 / 60-70 / 70-80 / 80-90 / 90-100). */
export function heartRateZones(maxHr: number): HrZone[] {
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return [1, 2, 3, 4, 5].map((zone, i) => ({
    zone: zone as HrZone["zone"],
    min: Math.round(maxHr * bounds[i]),
    max: Math.round(maxHr * bounds[i + 1]),
  }));
}

/** Rough age-based HRmax (Tanaka: 208 - 0.7 * age) when the athlete has not set one. */
export function estimateMaxHr(birthYear: number | null | undefined, currentYear: number): number | null {
  if (!birthYear) return null;
  return Math.round(208 - 0.7 * (currentYear - birthYear));
}

export type ZoneSeconds = [number, number, number, number, number];

export function zoneDistribution(zones: Partial<Record<`zone${1 | 2 | 3 | 4 | 5}_seconds`, number | null>>): ZoneSeconds {
  return [
    zones.zone1_seconds ?? 0,
    zones.zone2_seconds ?? 0,
    zones.zone3_seconds ?? 0,
    zones.zone4_seconds ?? 0,
    zones.zone5_seconds ?? 0,
  ];
}
