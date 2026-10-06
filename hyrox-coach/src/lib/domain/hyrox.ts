import { mean, round } from "./format";

export type SegmentType = "run" | "station";

export type HyroxSegment = {
  index: number; // 1..16
  type: SegmentType;
  exerciseId: string;
  label: string;
  spec: string;
};

export const HYROX_STATIONS = [
  { exerciseId: "ski_erg", label: "SkiErg", spec: "1000 m" },
  { exerciseId: "sled_push", label: "Sled Push", spec: "50 m" },
  { exerciseId: "sled_pull", label: "Sled Pull", spec: "50 m" },
  { exerciseId: "burpee_broad_jump", label: "Burpee Broad Jump", spec: "80 m" },
  { exerciseId: "row_erg", label: "RowErg", spec: "1000 m" },
  { exerciseId: "farmers_carry", label: "Farmer's Carry", spec: "200 m" },
  { exerciseId: "sandbag_lunges", label: "Sandbag Lunges", spec: "100 m" },
  { exerciseId: "wall_ball", label: "Wall Balls", spec: "100 reps" },
] as const;

export type StationId = (typeof HYROX_STATIONS)[number]["exerciseId"];

/** Race order: Run 1, SkiErg, Run 2, Sled Push, ... Run 8, Wall Balls. */
export const HYROX_SEGMENTS: HyroxSegment[] = HYROX_STATIONS.flatMap((station, i) => [
  { index: i * 2 + 1, type: "run" as const, exerciseId: "running", label: `Run ${i + 1}`, spec: "1 km" },
  { index: i * 2 + 2, type: "station" as const, exerciseId: station.exerciseId, label: station.label, spec: station.spec },
]);

/**
 * Approximate share of total station time per station for a ~60-minute
 * Open finisher. Used only to rank the athlete's stations against each other
 * ("relatively weak"), not as an absolute standard. Adjust as needed.
 */
export const REFERENCE_STATION_SHARE: Record<StationId, number> = {
  ski_erg: 0.15,
  sled_push: 0.1,
  sled_pull: 0.125,
  burpee_broad_jump: 0.125,
  row_erg: 0.155,
  farmers_carry: 0.055,
  sandbag_lunges: 0.125,
  wall_ball: 0.165,
};

export const HYROX_DIVISION_LABELS: Record<string, string> = {
  open_men: "Men Open",
  open_women: "Women Open",
  pro_men: "Men Pro",
  pro_women: "Women Pro",
  doubles_men: "Men Doubles",
  doubles_women: "Women Doubles",
  doubles_mixed: "Mixed Doubles",
};

export type SplitInput = {
  segment_index: number;
  segment_type: string;
  exercise_id: string;
  duration_seconds: number;
  roxzone_seconds: number | null;
};

export type HyroxTotals = {
  runTotal: number;
  stationTotal: number;
  roxzone: number;
  total: number;
  complete: boolean;
};

export function computeTotals(splits: SplitInput[], roxzoneOverride?: number | null): HyroxTotals {
  const runTotal = splits.filter((s) => s.segment_type === "run").reduce((a, s) => a + s.duration_seconds, 0);
  const stationTotal = splits.filter((s) => s.segment_type === "station").reduce((a, s) => a + s.duration_seconds, 0);
  const roxzone = roxzoneOverride ?? splits.reduce((a, s) => a + (s.roxzone_seconds ?? 0), 0);
  const indexes = new Set(splits.map((s) => s.segment_index));
  return {
    runTotal,
    stationTotal,
    roxzone,
    total: runTotal + stationTotal + roxzone,
    complete: HYROX_SEGMENTS.every((seg) => indexes.has(seg.index)),
  };
}

/** Difference vs the previous best (negative = faster). */
export function compareToBest(total: number, previousBest: number | null): { diff: number | null; isPb: boolean } {
  if (previousBest == null) return { diff: null, isPb: true };
  return { diff: total - previousBest, isPb: total < previousBest };
}

export type ResultWithSplits = {
  id: string;
  date: string;
  event_type: string;
  total_seconds: number | null;
  run_total_seconds: number | null;
  station_total_seconds: number | null;
  roxzone_seconds: number | null;
  splits: SplitInput[];
};

export type StationSummary = {
  exerciseId: StationId;
  label: string;
  spec: string;
  pb: { seconds: number; date: string } | null;
  latest: { seconds: number; date: string } | null;
  previous: { seconds: number; date: string } | null;
  /** Chronological, last 6 efforts. */
  trend: number[];
  /** >1 means this station takes a bigger share of your station time than the reference. */
  relativeIndex: number | null;
};

export function stationSummaries(results: ResultWithSplits[]): StationSummary[] {
  const chronological = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const complete = chronological.filter((r) => HYROX_STATIONS.every((st) => r.splits.some((s) => s.exercise_id === st.exerciseId)));
  const recentComplete = complete.slice(-3);

  return HYROX_STATIONS.map((station) => {
    const efforts = chronological.flatMap((r) =>
      r.splits
        .filter((s) => s.segment_type === "station" && s.exercise_id === station.exerciseId && s.duration_seconds > 0)
        .map((s) => ({ seconds: s.duration_seconds, date: r.date })),
    );
    const pb = efforts.reduce<{ seconds: number; date: string } | null>(
      (best, e) => (best == null || e.seconds < best.seconds ? e : best),
      null,
    );
    const indexes = recentComplete.map((r) => {
      const stationTotal = r.splits.filter((s) => s.segment_type === "station").reduce((a, s) => a + s.duration_seconds, 0);
      const mine = r.splits.find((s) => s.exercise_id === station.exerciseId)?.duration_seconds ?? 0;
      return stationTotal > 0 ? mine / stationTotal / REFERENCE_STATION_SHARE[station.exerciseId] : null;
    });
    const validIndexes = indexes.filter((v): v is number => v != null);
    return {
      exerciseId: station.exerciseId,
      label: station.label,
      spec: station.spec,
      pb,
      latest: efforts[efforts.length - 1] ?? null,
      previous: efforts[efforts.length - 2] ?? null,
      trend: efforts.slice(-6).map((e) => e.seconds),
      relativeIndex: validIndexes.length ? round(mean(validIndexes)!, 2) : null,
    };
  });
}

/** Stations ranked weakest first (largest relative index). */
export function weakestStations(summaries: StationSummary[], count = 2): StationSummary[] {
  return summaries
    .filter((s) => s.relativeIndex != null)
    .sort((a, b) => (b.relativeIndex ?? 0) - (a.relativeIndex ?? 0))
    .slice(0, count);
}

export function averageRunSplit(result: ResultWithSplits): number | null {
  const runs = result.splits.filter((s) => s.segment_type === "run" && s.duration_seconds > 0);
  return runs.length ? round(mean(runs.map((r) => r.duration_seconds))!, 0) : null;
}

/** Run pace needed to hit a goal if stations and Roxzone stay as in `basis`. */
export function requiredRunPace(goalSeconds: number, basis: { station_total_seconds: number | null; roxzone_seconds: number | null }) {
  if (basis.station_total_seconds == null) return null;
  const remaining = goalSeconds - basis.station_total_seconds - (basis.roxzone_seconds ?? 0);
  return remaining > 0 ? Math.round(remaining / 8) : null;
}
