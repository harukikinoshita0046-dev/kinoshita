/**
 * Demo data for development: creates demo@hyrox.local with ~6 weeks of
 * training, running, HYROX, body and recovery data, today's AI plan and a
 * coach API token.
 *
 *   npm run seed
 *
 * Re-running deletes the demo user (cascade) and recreates everything.
 * Uses the service-role key from .env.local — never point this at production.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { generateCoachToken } from "../src/lib/coach/token-crypto";
import { addDays, diffDays, todayInTimeZone } from "../src/lib/domain/dates";
import { computeTotals, HYROX_SEGMENTS } from "../src/lib/domain/hyrox";
import type { Database } from "../src/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
type SetInsert = Tables["workout_sets"]["Insert"];
type PlanExerciseInsert = Tables["workout_plan_exercises"]["Insert"];

const TZ = "Asia/Tokyo";
const OFFSET = "+09:00";
const EMAIL = process.env.SEED_EMAIL ?? "demo@hyrox.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "hyrox-demo-2026";
const DAYS = 42;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.SEED_ALLOW_REMOTE !== "1") {
  throw new Error(`Refusing to seed ${url}. Set SEED_ALLOW_REMOTE=1 to seed a remote project on purpose.`);
}
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Deterministic randomness so the demo looks the same every run.
let state = 20261006;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + (b - a) * rand();
const jitter = (v: number, amount: number) => v + (rand() * 2 - 1) * amount;
const r1 = (v: number) => Math.round(v * 10) / 10;
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00${OFFSET}`).toISOString();
const plusMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sun

type Res = { data: unknown; error: { message: string } | null };
type Ok<R> = Extract<R, { error: null }> extends { data: infer D } ? D : never;

function check<R extends Res>(res: R, what: string): Ok<R> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as Ok<R>;
}

async function chunkInsert<T extends keyof Tables>(table: T, rows: Tables[T]["Insert"][]) {
  for (let i = 0; i < rows.length; i += 500) {
    check(await db.from(table).insert(rows.slice(i, i + 500) as never), `insert ${table}`);
  }
}

// --- workout builder ---------------------------------------------------------

type Target = Partial<Omit<PlanExerciseInsert, "workout_plan_id" | "user_id" | "order_index" | "exercise_id">>;
type SetSpec = Partial<Pick<SetInsert, "weight" | "reps" | "distance" | "time_seconds" | "rpe">>;
type Item = { ex: string; target: Target; sets: SetSpec[] };

const sessions: Tables["workout_sessions"]["Insert"][] = [];
const plans: Tables["workout_plans"]["Insert"][] = [];
const planExercises: PlanExerciseInsert[] = [];
const sets: SetInsert[] = [];

function workout(
  userId: string,
  date: string,
  opts: { title: string; type: string; start: string; minutes: number; rpe: number; reason: string },
  items: Item[],
) {
  const planId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  plans.push({
    id: planId,
    user_id: userId,
    date,
    title: opts.title,
    workout_type: opts.type,
    status: "completed",
    created_by: "AI",
    coach_reason: opts.reason,
    estimated_duration_min: opts.minutes,
    source: "chatgpt",
  });
  const started = at(date, opts.start);
  sessions.push({
    id: sessionId,
    user_id: userId,
    workout_plan_id: planId,
    date,
    title: opts.title,
    workout_type: opts.type,
    status: "completed",
    started_at: started,
    finished_at: plusMinutes(started, opts.minutes),
    session_rpe: opts.rpe,
  });
  let minute = 6;
  items.forEach((item, order) => {
    const peId = crypto.randomUUID();
    planExercises.push({ id: peId, workout_plan_id: planId, user_id: userId, order_index: order, exercise_id: item.ex, ...item.target });
    item.sets.forEach((s, i) => {
      minute += 2.5;
      sets.push({
        user_id: userId,
        session_id: sessionId,
        plan_exercise_id: peId,
        exercise_id: item.ex,
        set_number: i + 1,
        completed_at: plusMinutes(started, minute),
        ...s,
      });
    });
  });
}

const reps = (weight: number, list: number[], rpes: number[]) => list.map((r, i) => ({ weight, reps: r, rpe: rpes[i] ?? rpes[rpes.length - 1] }));

// --- main --------------------------------------------------------------------

async function main() {
  const today = todayInTimeZone(TZ);
  const start = addDays(today, -(DAYS - 1));

  // Fresh demo user (deleting cascades to every row the user owns).
  const users = check(await db.auth.admin.listUsers({ page: 1, perPage: 1000 }), "list users");
  const existing = users.users.find((u) => u.email === EMAIL);
  if (existing) check(await db.auth.admin.deleteUser(existing.id), "delete demo user");
  const created = check(
    await db.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }),
    "create demo user",
  );
  const userId = created.user.id;

  check(
    await db.from("profiles").upsert({
      id: userId,
      display_name: "Kinoshita",
      timezone: TZ,
      sex: "male",
      birth_year: 1994,
      height_cm: 178,
      max_hr: 190,
      target_weight_kg: 75,
      target_weight_date: addDays(today, 120),
      hyrox_division: "open_men",
      hyrox_goal_seconds: 59 * 60 + 59,
      next_race_date: addDays(today, 40),
      next_race_name: "HYROX Tokyo",
    }),
    "profile",
  );

  // Body weight: 80.6 kg -> 78.4 kg with daily noise.
  const body: Tables["body_metrics"]["Insert"][] = [];
  const health: Tables["health_metrics"]["Insert"][] = [];
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    const isToday = date === today;
    const trend = 80.6 - (2.2 * i) / (DAYS - 1);
    body.push({
      user_id: userId,
      date,
      weight: isToday ? 78.4 : r1(jitter(trend, 0.3)),
      body_fat_percentage: i % 7 === 0 || isToday ? r1(jitter(17.8 - (1.4 * i) / DAYS, 0.2)) : null,
      muscle_mass: i % 7 === 0 || isToday ? r1(jitter(36.9, 0.15)) : null,
      source: "manual",
    });
    health.push({
      user_id: userId,
      date,
      sleep_minutes: isToday ? 462 : Math.round(between(395, 495)),
      hrv: isToday ? 61 : r1(jitter(57.5, 5)),
      resting_hr: isToday ? 52 : Math.round(jitter(53, 1.6)),
      steps: Math.round(between(6500, 14500)),
      active_calories: Math.round(between(480, 950)),
      vo2max: i % 7 === 0 ? r1(jitter(51.5, 0.3)) : null,
      source: "manual",
    });
  }
  await chunkInsert("body_metrics", body);
  await chunkInsert("health_metrics", health);
  check(
    await db.from("readiness_checkins").insert({ user_id: userId, date: today, soreness: 3, fatigue: 2, motivation: 4 }),
    "check-in",
  );

  // Weekly rhythm: Mon lower · Tue upper · Wed intervals · Thu HYROX stations · Fri zone 2 · Sat long run / simulation · Sun rest
  // Oldest -> newest; the most recent Tuesday is the spec example (80 kg × 8/8/7/6).
  const benchWeeks = [
    { w: 75, r: [8, 8, 8, 7], rpe: [7.5, 8, 8, 8.5] },
    { w: 77.5, r: [8, 8, 7, 6], rpe: [8, 8.5, 9, 9] },
    { w: 77.5, r: [8, 8, 8, 8], rpe: [7.5, 8, 8, 8.5] },
    { w: 80, r: [7, 7, 6, 6], rpe: [8.5, 9, 9, 9.5] },
    { w: 80, r: [8, 7, 7, 6], rpe: [8.5, 8.5, 9, 9] },
    { w: 80, r: [8, 8, 7, 6], rpe: [8, 8.5, 9, 9.5] },
  ];
  const runs: Tables["running_sessions"]["Insert"][] = [];
  const simulationDays = new Set([addDays(today, -25), addDays(today, -11)]);
  let tuesday = 0;
  let monday = 0;

  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i);
    if (date >= today) break;
    const dow = weekday(date);
    const weekIndex = Math.floor(i / 7);

    if (dow === 1) {
      const sq = [100, 102.5, 102.5, 105, 105, 107.5][Math.min(monday++, 5)];
      workout(
        userId,
        date,
        { title: "Lower Strength", type: "lower", start: "07:00", minutes: 68, rpe: 8, reason: "下半身の最大筋力維持。Sandbag LungesとSled Pushへの転移を狙う。" },
        [
          { ex: "squat", target: { target_sets: 4, target_reps_min: 5, target_reps_max: 5, target_weight: sq, target_rpe: 8, rest_seconds: 150 }, sets: reps(sq, [5, 5, 5, 5], [7.5, 8, 8, 8.5]) },
          { ex: "romanian_deadlift", target: { target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight: 90, rest_seconds: 120 }, sets: reps(90 + weekIndex * 1.25 - ((weekIndex * 1.25) % 2.5), [10, 9, 8], [7.5, 8, 8.5]) },
          { ex: "bulgarian_split_squat", target: { target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight: 20, rest_seconds: 90 }, sets: reps(20, [10, 10, 9], [8, 8, 8.5]) },
          { ex: "walking_lunge", target: { target_sets: 3, target_reps_min: 12, target_reps_max: 12, target_weight: 20, rest_seconds: 90 }, sets: reps(20, [12, 12, 12], [7.5, 8, 8]) },
          {
            ex: "sled_push",
            target: { target_sets: 2, target_distance: 50, target_weight: 152, rest_seconds: 180, coach_note: "Race weight. Low hips, short fast steps." },
            sets: [0, 1].map(() => ({ weight: 152, distance: 50, time_seconds: Math.round(between(170, 200)), rpe: 9 })),
          },
        ],
      );
    } else if (dow === 2) {
      const weeksAgo = Math.ceil(diffDays(today, date) / 7);
      const b = benchWeeks[Math.max(0, benchWeeks.length - weeksAgo)];
      const pullUps = weeksAgo <= 2 ? [10, 9, 9, 8] : [9, 9, 8, 7];
      tuesday++;
      workout(
        userId,
        date,
        { title: "HYROX Upper", type: "upper", start: "07:00", minutes: 64, rpe: 7.5, reason: "引く力（Sled Pull / SkiErg）と押す力の維持。減量中なので量より質。" },
        [
          { ex: "pull_up", target: { target_sets: 4, target_reps_min: 6, target_reps_max: 10, target_rpe: 8, rest_seconds: 120 }, sets: pullUps.map((r, k) => ({ weight: 0, reps: r, rpe: [7.5, 8, 8.5, 9][k] })) },
          { ex: "bench_press", target: { target_sets: 4, target_reps_min: 6, target_reps_max: 8, target_weight: b.w, target_rpe: 8, rest_seconds: 120 }, sets: reps(b.w, b.r, b.rpe) },
          { ex: "seated_row", target: { target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_weight: 60, rest_seconds: 90 }, sets: reps(tuesday > 3 ? 65 : 60, [12, 11, 10], [7.5, 8, 8.5]) },
          { ex: "db_shoulder_press", target: { target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight: 22, rest_seconds: 90 }, sets: reps(22, [10, 9, 8], [8, 8.5, 9]) },
          { ex: "straight_arm_pulldown", target: { target_sets: 3, target_reps_min: 12, target_reps_max: 15, target_weight: 27.5, rest_seconds: 60 }, sets: reps(27.5, [15, 14, 12], [7.5, 8, 8.5]) },
          { ex: "farmers_carry", target: { target_sets: 4, target_distance: 50, target_weight: 24, rest_seconds: 60, coach_note: "2 × 24 kg, weight is per hand." }, sets: [0, 1, 2, 3].map(() => ({ weight: 24, distance: 50, time_seconds: Math.round(between(22, 27)), rpe: 7.5 })) },
        ],
      );
    } else if (dow === 4) {
      workout(
        userId,
        date,
        { title: "HYROX Stations", type: "hyrox", start: "19:00", minutes: 58, rpe: 8.5, reason: "Station効率。Sled Pullを重点的に、Wall Ballはテンポ維持。" },
        [
          { ex: "ski_erg", target: { target_sets: 2, target_distance: 1000, target_time: 240, rest_seconds: 180 }, sets: [0, 1].map(() => ({ distance: 1000, time_seconds: Math.round(between(228 - weekIndex, 246 - weekIndex)), rpe: 8.5 })) },
          { ex: "sled_pull", target: { target_sets: 3, target_distance: 50, target_weight: 103, rest_seconds: 150, coach_note: "Hand over hand, keep tension. Weakest station." }, sets: [0, 1, 2].map(() => ({ weight: 103, distance: 50, time_seconds: Math.round(between(250 - weekIndex * 2, 275 - weekIndex * 2)), rpe: 9 })) },
          { ex: "burpee_broad_jump", target: { target_sets: 2, target_distance: 40, rest_seconds: 120 }, sets: [0, 1].map(() => ({ distance: 40, time_seconds: Math.round(between(95, 108)), rpe: 8.5 })) },
          { ex: "row_erg", target: { target_sets: 1, target_distance: 1000, target_time: 240, rest_seconds: 120 }, sets: [{ distance: 1000, time_seconds: Math.round(between(232, 244)), rpe: 8.5 }] },
          { ex: "wall_ball", target: { target_sets: 3, target_reps_min: 30, target_reps_max: 30, target_weight: 6, rest_seconds: 60 }, sets: reps(6, [30, 30, 30], [8, 8.5, 9]) },
          { ex: "sandbag_lunges", target: { target_sets: 2, target_distance: 50, target_weight: 20, rest_seconds: 90 }, sets: [0, 1].map(() => ({ weight: 20, distance: 50, time_seconds: Math.round(between(78, 90)), rpe: 8.5 })) },
        ],
      );
    } else if (dow === 3) {
      const splits = Array.from({ length: 6 }, () => ({ distance_m: 1000, time_seconds: Math.round(between(258, 272)), average_hr: Math.round(between(170, 178)) }));
      const work = splits.reduce((a, s) => a + s.time_seconds, 0);
      runs.push({
        user_id: userId,
        date,
        started_at: at(date, "06:30"),
        run_type: "intervals",
        distance_km: 9,
        duration_seconds: 690 + work + 5 * 90 + 360,
        average_hr: 158,
        max_hr: 182,
        cadence: 176,
        calories: 640,
        rpe: 8,
        zone1_seconds: 240,
        zone2_seconds: 780,
        zone3_seconds: 600,
        zone4_seconds: 1200,
        zone5_seconds: 300,
        splits,
        notes: "HYROX interval 6 × 1 km, 90 s rest",
      });
    } else if (dow === 5) {
      const dist = 8;
      runs.push({
        user_id: userId,
        date,
        started_at: at(date, "06:30"),
        run_type: "zone2",
        distance_km: dist,
        duration_seconds: Math.round(dist * between(338, 350)),
        average_hr: Math.round(between(138, 143)),
        max_hr: 152,
        cadence: 170,
        calories: 520,
        rpe: 4,
        zone1_seconds: 300,
        zone2_seconds: 2300,
        zone3_seconds: 200,
        zone4_seconds: 0,
        zone5_seconds: 0,
      });
    } else if (dow === 6 && !simulationDays.has(date)) {
      const dist = weekIndex >= 4 ? 14 : 12;
      runs.push({
        user_id: userId,
        date,
        started_at: at(date, "07:00"),
        run_type: "long_run",
        distance_km: dist,
        duration_seconds: Math.round(dist * between(345, 356)),
        average_hr: 146,
        max_hr: 160,
        cadence: 171,
        calories: 900,
        rpe: 5,
        zone1_seconds: 300,
        zone2_seconds: 3400,
        zone3_seconds: 1000,
        zone4_seconds: 100,
        zone5_seconds: 0,
      });
    }
  }

  // Older strength test so PBs exist (Bench 100 × 3).
  workout(
    userId,
    addDays(today, -130),
    { title: "Strength Test", type: "full_body", start: "10:00", minutes: 75, rpe: 9, reason: "Off-season strength test." },
    [
      { ex: "bench_press", target: { target_sets: 3, target_reps_min: 3, target_reps_max: 3, target_weight: 100 }, sets: reps(100, [3, 2, 2], [9, 9.5, 9.5]) },
      { ex: "squat", target: { target_sets: 2, target_reps_min: 3, target_reps_max: 3, target_weight: 140 }, sets: reps(140, [3, 3], [9, 9.5]) },
      { ex: "deadlift", target: { target_sets: 2, target_reps_min: 3, target_reps_max: 3, target_weight: 170 }, sets: reps(170, [3, 2], [9, 9.5]) },
    ],
  );

  await chunkInsert("workout_plans", plans);
  await chunkInsert("workout_plan_exercises", planExercises);
  await chunkInsert("workout_sessions", sessions);
  await chunkInsert("workout_sets", sets);
  await chunkInsert("running_sessions", runs);

  // HYROX: one race and two simulations (PB 1:05:12). Sled Pull is the relatively weak station.
  const hyroxEvents = [
    { date: addDays(today, -120), type: "race", name: "HYROX Yokohama", run: 263, rox: 330, st: [240, 165, 265, 205, 245, 85, 195, 250] },
    { date: addDays(today, -25), type: "simulation", name: "Gym simulation", run: 270, rox: 250, st: [230, 155, 255, 195, 235, 82, 188, 240] },
    { date: addDays(today, -11), type: "simulation", name: "Gym simulation", run: 265, rox: 240, st: [225, 150, 245, 190, 230, 80, 185, 247] },
  ];
  for (const ev of hyroxEvents) {
    const runSplits = Array.from({ length: 8 }, (_, k) => ev.run + [-6, -2, 3, 4, 2, 5, 0, -6][k]);
    const splits = HYROX_SEGMENTS.map((seg) => ({
      segment_index: seg.index,
      segment_type: seg.type,
      exercise_id: seg.exerciseId,
      duration_seconds: seg.type === "run" ? runSplits[(seg.index - 1) / 2] : ev.st[seg.index / 2 - 1],
      roxzone_seconds: Math.round(ev.rox / 16),
    }));
    const totals = computeTotals(splits, ev.rox);
    const resultId = check(
      await db.rpc("create_hyrox_result", {
        p_user_id: userId,
        p_result: {
          date: ev.date,
          event_type: ev.type,
          division: "open_men",
          name: ev.name,
          status: "completed",
          total_seconds: totals.total,
          run_total_seconds: totals.runTotal,
          station_total_seconds: totals.stationTotal,
          roxzone_seconds: totals.roxzone,
        },
        p_splits: splits,
      }),
      "hyrox result",
    );
    if (!resultId) throw new Error("hyrox result not created");
  }

  // Today's AI plan (spec example) and tomorrow's run.
  check(
    await db.rpc("create_workout_plan", {
      p_user_id: userId,
      p_plan: {
        date: today,
        title: "HYROX Upper",
        workout_type: "upper",
        created_by: "AI",
        source: "chatgpt",
        estimated_duration_min: 65,
        coach_reason:
          "睡眠・HRVとも良好で回復は十分。前回Bench Pressは80kg×8/8/7/6（RPE 8.8）で上限に近づいたため82.5kgに挑戦。Sled Pullが相対的に弱いのでPull Up・Seated Row・Straight Arm Pulldownで引く力を強化します。",
      },
      p_exercises: [
        { order_index: 0, exercise_id: "pull_up", target_sets: 4, target_reps_min: 6, target_reps_max: 10, target_rpe: 8, rest_seconds: 120 },
        { order_index: 1, exercise_id: "bench_press", target_sets: 4, target_reps_min: 6, target_reps_max: 8, target_weight: 82.5, target_rpe: 8, rest_seconds: 120 },
        { order_index: 2, exercise_id: "seated_row", target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_weight: 65, rest_seconds: 90 },
        { order_index: 3, exercise_id: "db_shoulder_press", target_sets: 3, target_reps_min: 8, target_reps_max: 10, target_weight: 22, rest_seconds: 90 },
        { order_index: 4, exercise_id: "straight_arm_pulldown", target_sets: 3, target_reps_min: 12, target_reps_max: 15, target_weight: 27.5, rest_seconds: 60 },
        { order_index: 5, exercise_id: "farmers_carry", target_sets: 4, target_distance: 50, target_weight: 24, rest_seconds: 60, coach_note: "2 × 24 kg, weight is per hand." },
      ],
      p_replace_existing: false,
    }),
    "today's plan",
  );
  check(
    await db.rpc("create_workout_plan", {
      p_user_id: userId,
      p_plan: {
        date: addDays(today, 1),
        title: "HYROX Interval",
        workout_type: "run",
        created_by: "AI",
        source: "chatgpt",
        estimated_duration_min: 50,
        coach_reason: "Compromised runningの準備。レースペースより少し速い4:20-4:30/kmで6本。",
      },
      p_exercises: [
        { order_index: 0, exercise_id: "running", target_sets: 6, target_distance: 1000, target_pace_min: 260, target_pace_max: 270, target_hr_zone: 4, rest_seconds: 90 },
      ],
      p_replace_existing: false,
    }),
    "tomorrow's plan",
  );

  check(
    await db.from("coach_insights").insert({
      user_id: userId,
      date: addDays(today, -1),
      category: "hyrox",
      title: "今週のフォーカス",
      body: "Sled PullがStationの中で相対的に遅く、レースの伸びしろです。上半身の日は引く種目を優先し、木曜のStation練習でSled Pullを3本入れます。",
      created_by: "AI",
    }),
    "coach insight",
  );

  const token = generateCoachToken();
  check(
    await db.from("coach_api_tokens").insert({
      user_id: userId,
      name: "Seed token (local dev)",
      token_hash: token.hash,
      token_prefix: token.displayPrefix,
      scopes: ["read", "write"],
    }),
    "coach token",
  );

  console.log(`Seeded ${EMAIL} (${userId})`);
  console.log(`  password:   ${PASSWORD}`);
  console.log(`  sessions:   ${sessions.length} workouts, ${sets.length} sets, ${runs.length} runs, ${hyroxEvents.length} HYROX results`);
  console.log(`  days:       ${start} .. ${today}`);
  console.log(`  coach token (local only): ${token.token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
