import { coachRoute } from "@/lib/coach/api";
import { intParam } from "@/lib/coach/dto";
import { bestResult, createHyroxResult, getHyroxResult, listHyroxResults, toAnalysisInput } from "@/lib/data/hyrox";
import { formatDuration, formatPace } from "@/lib/domain/format";
import { averageRunSplit, HYROX_SEGMENTS, requiredRunPace, stationSummaries, weakestStations } from "@/lib/domain/hyrox";
import { hyroxResultSchema } from "@/lib/validation";

/** HYROX results with splits, station PB/latest/trend and relative weaknesses — "HYROXの弱点は？" */
export const GET = coachRoute("read", async ({ db, userId, profile, req }) => {
  const limit = intParam(req.nextUrl.searchParams, "limit", 10, 1, 50);
  const results = await listHyroxResults(db, userId, { limit: 100 });
  const analysis = toAnalysisInput(results);
  const stations = stationSummaries(analysis);
  const pb = bestResult(results);
  const goal = profile.hyrox_goal_seconds;
  return {
    division: profile.hyrox_division,
    goal: goal ? formatDuration(goal) : null,
    pb: pb ? { id: pb.id, date: pb.date, event_type: pb.event_type, total: formatDuration(pb.total_seconds) } : null,
    goal_gap_seconds: goal && pb?.total_seconds ? pb.total_seconds - goal : null,
    required_avg_run_pace_for_goal: goal && pb && requiredRunPace(goal, pb) ? `${formatPace(requiredRunPace(goal, pb))}/km` : null,
    stations: stations.map((s) => ({
      id: s.exerciseId,
      name: s.label,
      spec: s.spec,
      pb: s.pb ? formatDuration(s.pb.seconds) : null,
      latest: s.latest ? formatDuration(s.latest.seconds) : null,
      trend: s.trend.map((t) => formatDuration(t)),
      relative_index: s.relativeIndex,
    })),
    weakest_stations: weakestStations(stations, 3).map((s) => ({ id: s.exerciseId, name: s.label, relative_index: s.relativeIndex })),
    results: results.slice(0, limit).map((r) => {
      const a = analysis.find((x) => x.id === r.id)!;
      return {
        id: r.id,
        date: r.date,
        event_type: r.event_type,
        name: r.name,
        total: formatDuration(r.total_seconds),
        running: formatDuration(r.run_total_seconds),
        stations: formatDuration(r.station_total_seconds),
        roxzone: formatDuration(r.roxzone_seconds),
        avg_run_split: formatDuration(averageRunSplit(a)),
        splits: r.splits.map((s) => ({ segment: HYROX_SEGMENTS[s.segment_index - 1]?.label, time: formatDuration(s.duration_seconds) })),
      };
    }),
  };
});

/** Logs a race or simulation result. Splits use segment_index 1..16 (odd = runs, even = stations). */
export const POST = coachRoute("write", async ({ db, userId, today, body }) => {
  const input = hyroxResultSchema.parse({ date: today, ...((body ?? {}) as Record<string, unknown>) });
  const id = await createHyroxResult(db, userId, input);
  const result = await getHyroxResult(db, userId, id);
  return Response.json({ created: true, id, total: formatDuration(result.total_seconds) }, { status: 201 });
});
