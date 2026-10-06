import { computeTotals, HYROX_SEGMENTS, type ResultWithSplits } from "@/lib/domain/hyrox";
import type { Db, Row } from "@/lib/supabase/types";
import { DataError, must } from "./util";

export type HyroxResultRow = Row<"hyrox_results">;
export type HyroxSplitRow = Row<"hyrox_splits">;
export type HyroxResult = HyroxResultRow & { splits: HyroxSplitRow[] };

const RESULT_SELECT = "*, splits:hyrox_splits(*)";

const sortSplits = (r: HyroxResult): HyroxResult => ({
  ...r,
  splits: [...(r.splits ?? [])].sort((a, b) => a.segment_index - b.segment_index),
});

export async function listHyroxResults(db: Db, userId: string, opts: { limit?: number } = {}): Promise<HyroxResult[]> {
  const rows = must(
    await db
      .from("hyrox_results")
      .select(RESULT_SELECT)
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(opts.limit ?? 100),
    "list HYROX results",
  ) as HyroxResult[];
  return rows.map(sortSplits);
}

export async function getHyroxResult(db: Db, userId: string, id: string): Promise<HyroxResult> {
  const row = must(
    await db.from("hyrox_results").select(RESULT_SELECT).eq("user_id", userId).eq("id", id).maybeSingle(),
    "load HYROX result",
  ) as HyroxResult | null;
  if (!row) throw new DataError("HYROX result not found.", 404);
  return sortSplits(row);
}

export type HyroxSplitInput = { segment_index: number; duration_seconds: number; roxzone_seconds?: number | null };

export type HyroxResultInput = {
  date: string;
  event_type: "race" | "simulation" | "partial";
  division?: string | null;
  name?: string | null;
  notes?: string | null;
  workout_plan_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  splits: HyroxSplitInput[];
  /** Official Roxzone total when per-transition times are unknown (race results). */
  roxzone_total_seconds?: number | null;
  /** Official finish time; defaults to runs + stations + Roxzone. */
  total_seconds?: number | null;
};

export async function createHyroxResult(db: Db, userId: string, input: HyroxResultInput): Promise<string> {
  const splits = input.splits.map((s) => {
    const seg = HYROX_SEGMENTS.find((x) => x.index === s.segment_index);
    if (!seg) throw new DataError(`Invalid segment_index ${s.segment_index}`, 400);
    return {
      segment_index: s.segment_index,
      segment_type: seg.type,
      exercise_id: seg.exerciseId,
      duration_seconds: Math.round(s.duration_seconds),
      roxzone_seconds: s.roxzone_seconds == null ? null : Math.round(s.roxzone_seconds),
    };
  });
  const totals = computeTotals(splits, input.roxzone_total_seconds ?? null);
  const total = input.total_seconds ?? totals.total;
  if (!(total > 0)) throw new DataError("A HYROX result needs at least one split or a total time.", 400);
  const id = must(
    await db.rpc("create_hyrox_result", {
      p_user_id: userId,
      p_result: {
        date: input.date,
        event_type: input.event_type,
        division: input.division ?? null,
        name: input.name ?? null,
        notes: input.notes ?? null,
        workout_plan_id: input.workout_plan_id ?? null,
        started_at: input.started_at ?? null,
        finished_at: input.finished_at ?? null,
        status: "completed",
        total_seconds: Math.round(total),
        run_total_seconds: splits.length ? totals.runTotal : null,
        station_total_seconds: splits.length ? totals.stationTotal : null,
        roxzone_seconds: splits.length || input.roxzone_total_seconds != null ? totals.roxzone : null,
      },
      p_splits: splits,
    }),
    "save HYROX result",
  );
  return id;
}

export async function deleteHyroxResult(db: Db, userId: string, id: string) {
  must(await db.from("hyrox_results").delete().eq("user_id", userId).eq("id", id), "delete HYROX result");
}

export function toAnalysisInput(results: HyroxResult[]): ResultWithSplits[] {
  return results.map((r) => ({
    id: r.id,
    date: r.date,
    event_type: r.event_type,
    total_seconds: r.total_seconds,
    run_total_seconds: r.run_total_seconds,
    station_total_seconds: r.station_total_seconds,
    roxzone_seconds: r.roxzone_seconds,
    splits: r.splits,
  }));
}

/** Best complete (16-split or official) result, by total time. */
export function bestResult(results: HyroxResult[], eventTypes: string[] = ["race", "simulation"]): HyroxResult | null {
  return (
    results
      .filter((r) => eventTypes.includes(r.event_type) && r.total_seconds)
      .sort((a, b) => (a.total_seconds ?? Infinity) - (b.total_seconds ?? Infinity))[0] ?? null
  );
}
