import { z } from "zod";
import { coachRoute } from "@/lib/coach/api";
import { intParam } from "@/lib/coach/dto";
import { listBodyMetrics, upsertBodyMetric } from "@/lib/data/metrics";
import { lossRateAssessment, weightTrend } from "@/lib/domain/body";
import { addDays } from "@/lib/domain/dates";
import { bodyMetricSchema } from "@/lib/validation";

/** Weight trend for "減量順調？": entries, 7-day average, weekly/monthly change, rate, projection. */
export const GET = coachRoute("read", async ({ db, userId, today, profile, req }) => {
  const days = intParam(req.nextUrl.searchParams, "days", 60, 7, 730);
  const rows = await listBodyMetrics(db, userId, { from: addDays(today, -(days - 1)), to: today });
  const points = rows.filter((r) => r.weight != null).map((r) => ({ date: r.date, weight: Number(r.weight) }));
  const trend = weightTrend(points, today, profile.target_weight_kg == null ? null : Number(profile.target_weight_kg));
  return {
    days,
    target_weight_kg: profile.target_weight_kg,
    trend: { ...trend, loss_rate: lossRateAssessment(trend.weeklyRatePct) },
    entries: rows.map((r) => ({ date: r.date, weight_kg: r.weight, body_fat_pct: r.body_fat_percentage, muscle_mass_kg: r.muscle_mass, source: r.source })),
  };
});

const batch = z.object({ entries: z.array(z.unknown()).min(1).max(400) });

/** Logs body weight / composition (one entry, or {entries: [...]}) — one row per date, merged. */
export const POST = coachRoute("write", async ({ db, userId, today, body }) => {
  const list = batch.safeParse(body).success ? (body as { entries: unknown[] }).entries : [body];
  const saved = [];
  for (const raw of list) {
    const entry = bodyMetricSchema.parse({ date: today, ...((raw ?? {}) as Record<string, unknown>) });
    saved.push(await upsertBodyMetric(db, userId, { ...entry, source: entry.source ?? "import" }));
  }
  return Response.json({ saved: saved.length, dates: saved.map((s) => s.date) }, { status: 201 });
});
