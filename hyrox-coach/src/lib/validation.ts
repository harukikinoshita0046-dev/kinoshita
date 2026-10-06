import { z } from "zod";
import { isIsoDate } from "./domain/dates";
import { parseClock } from "./domain/format";
import { normalizeRunType } from "./domain/running";

/** Shared input schemas for app forms and the coach API. */

export const isoDate = z.string().refine(isIsoDate, "Expected a date as YYYY-MM-DD");

/** Seconds as a number, or a clock string like "4:25" / "1:03:24". */
export const clockSeconds = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const s = parseClock(v);
  if (s == null) {
    ctx.addIssue({ code: "custom", message: 'Expected seconds or a time like "4:25"' });
    return z.NEVER;
  }
  return s;
});

export const runTypeField = z.string().transform((v, ctx) => {
  const t = normalizeRunType(v);
  if (!t) {
    ctx.addIssue({
      code: "custom",
      message: "run_type must be one of easy, zone2, tempo, threshold, intervals, hyrox_run, long_run, recovery",
    });
    return z.NEVER;
  }
  return t;
});

const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullish();
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullish();

export const runInputSchema = z.object({
  date: isoDate,
  run_type: runTypeField,
  distance_km: z.number().positive().max(500),
  duration_seconds: clockSeconds.pipe(z.number().int().positive().max(172800)),
  started_at: z.iso.datetime({ offset: true }).nullish(),
  workout_plan_id: z.uuid().nullish(),
  average_hr: optInt(30, 250),
  max_hr: optInt(30, 250),
  cadence: optInt(50, 260),
  calories: optInt(0, 20000),
  elevation_gain_m: optInt(0, 10000),
  rpe: optNum(1, 10),
  zone1_seconds: optInt(0, 172800),
  zone2_seconds: optInt(0, 172800),
  zone3_seconds: optInt(0, 172800),
  zone4_seconds: optInt(0, 172800),
  zone5_seconds: optInt(0, 172800),
  splits: z
    .array(
      z.object({
        distance_m: z.number().positive().max(100000),
        time_seconds: z.number().int().positive().max(86400),
        average_hr: optInt(30, 250),
      }),
    )
    .max(200)
    .nullish(),
  notes: z.string().max(2000).nullish(),
  source: z.enum(["manual", "apple_health", "import"]).optional(),
  external_id: z.string().max(200).nullish(),
});

export const bodyMetricSchema = z
  .object({
    date: isoDate,
    weight: optNum(20, 300),
    body_fat_percentage: optNum(2, 70),
    muscle_mass: optNum(5, 150),
    source: z.enum(["manual", "apple_health", "import"]).optional(),
  })
  .refine((v) => v.weight != null || v.body_fat_percentage != null || v.muscle_mass != null, "Provide at least one value");

export const healthMetricSchema = z.object({
  date: isoDate,
  sleep_minutes: optInt(0, 1440),
  hrv: optNum(1, 300),
  resting_hr: optInt(25, 150),
  steps: optInt(0, 200000),
  active_calories: optInt(0, 20000),
  vo2max: optNum(10, 100),
  source: z.enum(["manual", "apple_health", "import"]).optional(),
});

export const checkinSchema = z.object({
  date: isoDate,
  soreness: optInt(1, 5),
  fatigue: optInt(1, 5),
  motivation: optInt(1, 5),
  note: z.string().max(500).nullish(),
});

export const hyroxResultSchema = z
  .object({
    date: isoDate,
    event_type: z.enum(["race", "simulation", "partial"]),
    division: z.enum(["open_men", "open_women", "pro_men", "pro_women", "doubles_men", "doubles_women", "doubles_mixed"]).nullish(),
    name: z.string().max(120).nullish(),
    notes: z.string().max(2000).nullish(),
    workout_plan_id: z.uuid().nullish(),
    started_at: z.iso.datetime({ offset: true }).nullish(),
    finished_at: z.iso.datetime({ offset: true }).nullish(),
    splits: z
      .array(
        z.object({
          segment_index: z.number().int().min(1).max(16),
          duration_seconds: clockSeconds.pipe(z.number().int().min(0).max(14400)),
          roxzone_seconds: clockSeconds.pipe(z.number().int().min(0).max(3600)).nullish(),
        }),
      )
      .max(16),
    roxzone_total_seconds: clockSeconds.pipe(z.number().int().min(0).max(7200)).nullish(),
    total_seconds: clockSeconds.pipe(z.number().int().positive().max(28800)).nullish(),
  })
  .refine((v) => new Set(v.splits.map((s) => s.segment_index)).size === v.splits.length, "Duplicate segment_index")
  .refine((v) => v.splits.length > 0 || v.total_seconds != null, "Provide splits or total_seconds");

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
