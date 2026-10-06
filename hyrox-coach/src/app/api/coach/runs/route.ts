import { coachRoute } from "@/lib/coach/api";
import { dateRange, intParam } from "@/lib/coach/dto";
import { createRun, listRuns } from "@/lib/data/runs";
import { formatDuration, formatPace } from "@/lib/domain/format";
import { runTypeLabel } from "@/lib/domain/running";
import { runInputSchema } from "@/lib/validation";

export const GET = coachRoute("read", async ({ db, userId, today, req }) => {
  const { from, to } = dateRange(req.nextUrl.searchParams, today, { back: 30, forward: 0 });
  const limit = intParam(req.nextUrl.searchParams, "limit", 50, 1, 200);
  const runs = await listRuns(db, userId, { from, to, limit });
  return {
    from,
    to,
    total_km: Math.round(runs.reduce((a, r) => a + Number(r.distance_km), 0) * 10) / 10,
    runs: runs.map((r) => ({
      id: r.id,
      date: r.date,
      run_type: r.run_type,
      type_label: runTypeLabel(r.run_type),
      distance_km: r.distance_km,
      duration: formatDuration(r.duration_seconds),
      duration_seconds: r.duration_seconds,
      pace: `${formatPace(r.average_pace)}/km`,
      average_hr: r.average_hr,
      max_hr: r.max_hr,
      cadence: r.cadence,
      rpe: r.rpe,
      zones_seconds: [r.zone1_seconds, r.zone2_seconds, r.zone3_seconds, r.zone4_seconds, r.zone5_seconds],
      splits: r.splits,
      source: r.source,
      notes: r.notes,
    })),
  };
});

/** Logs a run (e.g. the athlete tells the coach "今日5km 25分走った"). Durations accept "25:00". */
export const POST = coachRoute("write", async ({ db, userId, today, body }) => {
  const raw = (body ?? {}) as Record<string, unknown>;
  const input = runInputSchema.parse({ date: today, ...raw });
  const run = await createRun(db, userId, { ...input, source: input.source ?? "import" });
  return Response.json({ created: true, run: { id: run.id, date: run.date, distance_km: run.distance_km, duration: formatDuration(run.duration_seconds), pace: `${formatPace(run.average_pace)}/km` } }, { status: 201 });
});
