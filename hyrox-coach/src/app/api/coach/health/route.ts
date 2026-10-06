import { z } from "zod";
import { coachRoute } from "@/lib/coach/api";
import { intParam } from "@/lib/coach/dto";
import { listHealthMetrics, upsertBodyMetric, upsertHealthMetric } from "@/lib/data/metrics";
import { addDays } from "@/lib/domain/dates";
import { healthMetricSchema } from "@/lib/validation";

export const GET = coachRoute("read", async ({ db, userId, today, req }) => {
  const days = intParam(req.nextUrl.searchParams, "days", 14, 1, 365);
  const rows = await listHealthMetrics(db, userId, { from: addDays(today, -(days - 1)), to: today });
  return {
    days,
    metrics: rows.map((r) => ({
      date: r.date,
      sleep_minutes: r.sleep_minutes,
      hrv_ms: r.hrv,
      resting_hr: r.resting_hr,
      steps: r.steps,
      active_calories: r.active_calories,
      vo2max: r.vo2max,
      source: r.source,
    })),
  };
});

const row = healthMetricSchema.extend({
  weight: z.number().min(20).max(300).nullish(),
  body_fat_percentage: z.number().min(2).max(70).nullish(),
});
const batch = z.object({ metrics: z.array(z.unknown()).min(1).max(400) });

/**
 * Import endpoint for health data (Apple Health via an iOS Shortcut, or values
 * the athlete tells the coach). One object or {metrics: [...]}; one row per
 * date, only the provided fields are overwritten. Weight is routed to body metrics.
 */
export const POST = coachRoute("write", async ({ db, userId, today, body }) => {
  const list = batch.safeParse(body).success ? (body as { metrics: unknown[] }).metrics : [body];
  const dates: string[] = [];
  for (const raw of list) {
    const { weight, body_fat_percentage, ...health } = row.parse({ date: today, ...((raw ?? {}) as Record<string, unknown>) });
    const source = health.source ?? "import";
    const hasHealth = ["sleep_minutes", "hrv", "resting_hr", "steps", "active_calories", "vo2max"].some(
      (k) => health[k as keyof typeof health] != null,
    );
    if (hasHealth) await upsertHealthMetric(db, userId, { ...health, source });
    if (weight != null || body_fat_percentage != null) {
      await upsertBodyMetric(db, userId, { date: health.date, weight, body_fat_percentage, source });
    }
    dates.push(health.date);
  }
  return Response.json({ saved: dates.length, dates }, { status: 201 });
});
