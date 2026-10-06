import { weightTrend, type WeightPoint, type WeightTrend } from "@/lib/domain/body";
import { addDays, diffDays, startOfWeek } from "@/lib/domain/dates";
import type { Exercise } from "@/lib/domain/exercise";
import { mean, round } from "@/lib/domain/format";
import { stationSummaries, weakestStations, type StationSummary } from "@/lib/domain/hyrox";
import { generateInsights, type Insight } from "@/lib/domain/insights";
import { baselineOf, computeReadiness, type Baseline, type ReadinessResult } from "@/lib/domain/readiness";
import {
  hyroxLoadEntry,
  loadOnDate,
  runLoadEntry,
  strengthLoadEntry,
  summarizeLoad,
  type LoadEntry,
  type LoadSummary,
} from "@/lib/domain/training-load";
import type { Db } from "@/lib/supabase/types";
import { indexExercises, listExercises } from "./exercises";
import { bestResult, listHyroxResults, toAnalysisInput, type HyroxResult } from "./hyrox";
import {
  listBodyMetrics,
  listCheckins,
  listHealthMetrics,
  type BodyMetricRow,
  type CheckinRow,
  type HealthMetricRow,
} from "./metrics";
import { getPlansForDate, type Plan } from "./plans";
import { getProfile, profileTimezone, profileToday, type Profile } from "./profile";
import { listRuns, type RunRow } from "./runs";
import { listSessions, type SessionSummary } from "./sessions";

/** Lifts and stations the coach tracks session-by-session. */
export const KEY_EXERCISES = [
  "bench_press",
  "pull_up",
  "squat",
  "ski_erg",
  "sled_push",
  "sled_pull",
  "farmers_carry",
  "wall_ball",
] as const;

const VOLUME_LIFTS = ["bench_press", "squat", "deadlift"];

export type HealthSummary = {
  today: HealthMetricRow | null;
  latest: HealthMetricRow | null;
  rows: HealthMetricRow[];
  hrvBaseline: Baseline | null;
  restingHrBaseline: Baseline | null;
  hrv7dAvg: number | null;
  restingHr7dAvg: number | null;
  sleep7dAvg: number | null;
  hrvLowStreak: number;
};

export type RunningSummary = {
  km7: number;
  kmPrev7: number;
  km30: number;
  runs7: number;
  avgPace7: number | null;
  weekKm: number;
};

export type WeekSummary = {
  start: string;
  sessions: number;
  strengthSessions: number;
  runs: number;
  hyroxEfforts: number;
  trainingMinutes: number;
  volumeKg: number;
};

export type AthleteSnapshot = {
  today: string;
  timezone: string;
  profile: Profile;
  exercises: Map<string, Exercise>;
  body: { trend: WeightTrend; points: WeightPoint[]; latest: BodyMetricRow | null };
  health: HealthSummary;
  checkin: CheckinRow | null;
  readiness: ReadinessResult;
  load: LoadSummary & { yesterday: number; entries: LoadEntry[]; minutes7: number };
  sessions: SessionSummary[];
  runs: RunRow[];
  running: RunningSummary;
  week: WeekSummary;
  hyrox: {
    results: HyroxResult[];
    pb: HyroxResult | null;
    racePb: HyroxResult | null;
    latest: HyroxResult | null;
    stations: StationSummary[];
    weakest: StationSummary[];
  };
  liftVolumes: Array<{ exerciseId: string; name: string; thisWeek: number; lastWeek: number }>;
  insights: Insight[];
  todayPlans: Plan[];
};

const sumBy = <T>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

function summarizeHealth(rows: HealthMetricRow[], today: string): HealthSummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const todayRow = sorted.find((r) => r.date === today) ?? null;
  const prior = sorted.filter((r) => inRange(r.date, addDays(today, -28), addDays(today, -1)));
  const last7 = sorted.filter((r) => inRange(r.date, addDays(today, -6), today));
  const hrvBaseline = baselineOf(prior.map((r) => (r.hrv == null ? null : Number(r.hrv))));
  const restingHrBaseline = baselineOf(prior.map((r) => r.resting_hr));
  const avg = (vals: Array<number | null>) => {
    const v = vals.filter((x): x is number => x != null);
    return v.length ? round(mean(v)!, 1) : null;
  };

  // Consecutive days (ending today, or yesterday if today has no reading) with HRV
  // more than 0.5 SD below the 28-day baseline.
  let hrvLowStreak = 0;
  if (hrvBaseline) {
    const threshold = hrvBaseline.mean - 0.5 * hrvBaseline.sd;
    const hrvByDate = new Map(sorted.filter((r) => r.hrv != null).map((r) => [r.date, Number(r.hrv)]));
    let day = hrvByDate.has(today) ? today : addDays(today, -1);
    while (hrvByDate.has(day) && hrvByDate.get(day)! < threshold) {
      hrvLowStreak++;
      day = addDays(day, -1);
    }
  }

  return {
    today: todayRow,
    latest: sorted[sorted.length - 1] ?? null,
    rows: sorted,
    hrvBaseline,
    restingHrBaseline,
    hrv7dAvg: avg(last7.map((r) => (r.hrv == null ? null : Number(r.hrv)))),
    restingHr7dAvg: avg(last7.map((r) => r.resting_hr)),
    sleep7dAvg: avg(last7.map((r) => r.sleep_minutes)),
    hrvLowStreak,
  };
}

export function buildLoadEntries(sessions: SessionSummary[], runs: RunRow[], hyrox: HyroxResult[]): LoadEntry[] {
  return [
    ...sessions
      .filter((s) => s.status === "completed" && s.duration_seconds)
      .map((s) => strengthLoadEntry({ date: s.date, duration_seconds: s.duration_seconds, session_rpe: s.session_rpe })),
    ...runs.map((r) => runLoadEntry(r)),
    ...hyrox.map((h) => hyroxLoadEntry(h)),
  ];
}

export async function loadAthleteSnapshot(db: Db, userId: string, now = new Date()): Promise<AthleteSnapshot> {
  const profile = await getProfile(db, userId);
  const today = profileToday(profile, now);
  const yesterday = addDays(today, -1);
  const since = addDays(today, -45);

  const [exercisesList, bodyRows, healthRows, checkins, sessions, runs, hyroxResults, todayPlans] = await Promise.all([
    listExercises(db, userId, { includeInactive: true }),
    listBodyMetrics(db, userId, { from: since, to: today }),
    listHealthMetrics(db, userId, { from: since, to: today }),
    listCheckins(db, userId, { from: today, to: today }),
    listSessions(db, userId, { from: since, limit: 120 }),
    listRuns(db, userId, { from: since, limit: 120 }),
    listHyroxResults(db, userId, { limit: 60 }),
    getPlansForDate(db, userId, today),
  ]);
  const exercises = indexExercises(exercisesList);

  // Body
  const points: WeightPoint[] = bodyRows.filter((b) => b.weight != null).map((b) => ({ date: b.date, weight: Number(b.weight) }));
  const trend = weightTrend(points, today, profile.target_weight_kg == null ? null : Number(profile.target_weight_kg));
  const latestBody = [...bodyRows].reverse().find((b) => b.weight != null) ?? null;

  // Recovery
  const health = summarizeHealth(healthRows, today);
  const checkin = checkins.find((c) => c.date === today) ?? null;

  // Load
  const recentHyrox = hyroxResults.filter((h) => h.date >= since);
  const entries = buildLoadEntries(sessions, runs, recentHyrox);
  const loadToday = summarizeLoad(entries, today);
  const loadBeforeToday = summarizeLoad(entries, yesterday);
  const yesterdayLoad = loadOnDate(entries, yesterday);
  const hasHistory = entries.some((e) => e.date < today);
  const minutes7 = round(sumBy(entries.filter((e) => inRange(e.date, addDays(today, -6), today)), (e) => e.minutes), 0);

  const readiness = computeReadiness({
    sleepMinutes: health.today?.sleep_minutes ?? null,
    hrv: health.today?.hrv == null ? null : Number(health.today.hrv),
    hrvBaseline: health.hrvBaseline,
    restingHr: health.today?.resting_hr ?? null,
    restingHrBaseline: health.restingHrBaseline,
    loadYesterday: hasHistory ? yesterdayLoad : null,
    typicalSessionDayLoad: loadBeforeToday.typicalSessionDayLoad,
    acwr: loadBeforeToday.acwr,
    soreness: checkin?.soreness ?? null,
    fatigue: checkin?.fatigue ?? null,
    motivation: checkin?.motivation ?? null,
  });

  // Running
  const runsIn = (from: string, to: string) => runs.filter((r) => inRange(r.date, from, to));
  const runs7 = runsIn(addDays(today, -6), today);
  const km = (rows: RunRow[]) => round(sumBy(rows, (r) => Number(r.distance_km)), 1);
  const dist7 = sumBy(runs7, (r) => Number(r.distance_km));
  const weekStart = startOfWeek(today);
  const running: RunningSummary = {
    km7: km(runs7),
    kmPrev7: km(runsIn(addDays(today, -13), addDays(today, -7))),
    km30: km(runsIn(addDays(today, -29), today)),
    runs7: runs7.length,
    avgPace7: dist7 > 0 ? round(sumBy(runs7, (r) => r.duration_seconds) / dist7, 0) : null,
    weekKm: km(runsIn(weekStart, today)),
  };

  // Calendar week
  const weekSessions = sessions.filter((s) => s.status === "completed" && inRange(s.date, weekStart, today));
  const weekHyrox = hyroxResults.filter((h) => inRange(h.date, weekStart, today));
  const weekRuns = runsIn(weekStart, today);
  const week: WeekSummary = {
    start: weekStart,
    sessions: weekSessions.length + weekRuns.length + weekHyrox.length,
    strengthSessions: weekSessions.length,
    runs: weekRuns.length,
    hyroxEfforts: weekHyrox.length,
    trainingMinutes: round(
      sumBy(weekSessions, (s) => (s.duration_seconds ?? 0) / 60) +
        sumBy(weekRuns, (r) => r.duration_seconds / 60) +
        sumBy(weekHyrox, (h) => (h.total_seconds ?? 0) / 60),
      0,
    ),
    volumeKg: sumBy(weekSessions, (s) => s.totalVolumeKg),
  };

  // HYROX
  const analysis = toAnalysisInput(hyroxResults);
  const stations = stationSummaries(analysis);
  const weakest = weakestStations(stations, 2);

  // Key lift volume, rolling weeks
  const volumeIn = (exerciseId: string, from: string, to: string) =>
    sumBy(
      sessions.filter((s) => s.status === "completed" && inRange(s.date, from, to)),
      (s) => sumBy(s.exercises.filter((e) => e.exercise_id === exerciseId), (e) => Number(e.volume_kg ?? 0)),
    );
  const liftVolumes = VOLUME_LIFTS.map((id) => ({
    exerciseId: id,
    name: exercises.get(id)?.name ?? id,
    thisWeek: round(volumeIn(id, addDays(today, -6), today), 0),
    lastWeek: round(volumeIn(id, addDays(today, -13), addDays(today, -7)), 0),
  })).filter((l) => l.lastWeek > 0 || l.thisWeek > 0);

  const insights = generateInsights({
    weight: trend.latest ? trend : null,
    liftVolumes: liftVolumes.map((l) => ({ name: l.name, thisWeek: l.thisWeek, lastWeek: l.lastWeek })),
    runningKm: { thisWeek: running.km7, lastWeek: running.kmPrev7 },
    weakestStation: weakest[0]?.relativeIndex != null ? { label: weakest[0].label, relativeIndex: weakest[0].relativeIndex } : null,
    hrvLowStreak: health.hrvLowStreak,
    acwr: loadToday.acwr,
    sleepAvg7: health.sleep7dAvg,
    daysToRace: profile.next_race_date ? diffDays(profile.next_race_date, today) : null,
  });

  return {
    today,
    timezone: profileTimezone(profile),
    profile,
    exercises,
    body: { trend, points, latest: latestBody },
    health,
    checkin,
    readiness,
    load: { ...loadToday, yesterday: yesterdayLoad, entries, minutes7 },
    sessions,
    runs,
    running,
    week,
    hyrox: {
      results: hyroxResults,
      pb: bestResult(hyroxResults),
      racePb: bestResult(hyroxResults, ["race"]),
      latest: hyroxResults[0] ?? null,
      stations,
      weakest,
    },
    liftVolumes,
    insights,
    todayPlans,
  };
}
