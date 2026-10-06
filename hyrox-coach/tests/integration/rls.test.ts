import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUser, todayTokyo, type TestUser } from "./helpers";

/**
 * Checklist ⑱⑲: Row Level Security — a signed-in user can only ever see or
 * change their own rows, anon can see nothing, and child rows cannot be
 * attached to another user's parent.
 */
describe("Row Level Security", () => {
  let a: TestUser;
  let b: TestUser;
  const ids: Record<string, string> = {};
  const today = todayTokyo();

  beforeAll(async () => {
    a = await createTestUser("rls-a");
    b = await createTestUser("rls-b");

    // User A creates one row in every table, through their own RLS-scoped client.
    const plan = await a.client.rpc("create_workout_plan", {
      p_user_id: a.id,
      p_plan: { date: today, title: "A plan", workout_type: "upper", created_by: "USER" },
      p_exercises: [{ order_index: 0, exercise_id: "bench_press", target_sets: 3, target_reps_min: 5, target_reps_max: 5, target_weight: 80 }],
    });
    expect(plan.error).toBeNull();
    ids.plan = plan.data![0].plan_id;
    const pe = await a.client.from("workout_plan_exercises").select("id").eq("workout_plan_id", ids.plan).single();
    ids.planExercise = pe.data!.id;

    const session = await a.client
      .from("workout_sessions")
      .insert({ user_id: a.id, workout_plan_id: ids.plan, date: today, title: "A plan", workout_type: "upper" })
      .select("id")
      .single();
    expect(session.error).toBeNull();
    ids.session = session.data!.id;

    const set = await a.client
      .from("workout_sets")
      .insert({ user_id: a.id, session_id: ids.session, plan_exercise_id: ids.planExercise, exercise_id: "bench_press", set_number: 1, weight: 80, reps: 5, rpe: 8 })
      .select("id")
      .single();
    expect(set.error).toBeNull();
    ids.set = set.data!.id;

    const writes = await Promise.all([
      a.client.from("body_metrics").insert({ user_id: a.id, date: today, weight: 81.2 }).select("id").single(),
      a.client.from("health_metrics").insert({ user_id: a.id, date: today, hrv: 55, resting_hr: 50 }).select("id").single(),
      a.client.from("readiness_checkins").insert({ user_id: a.id, date: today, soreness: 2 }).select("id").single(),
      a.client.from("running_sessions").insert({ user_id: a.id, date: today, run_type: "easy", distance_km: 5, duration_seconds: 1500 }).select("id").single(),
      a.client.from("coach_insights").insert({ user_id: a.id, date: today, body: "private note" }).select("id").single(),
    ]);
    for (const w of writes) expect(w.error).toBeNull();
    [ids.body, ids.health, ids.checkin, ids.run, ids.insight] = writes.map((w) => w.data!.id);

    const hyrox = await a.client.rpc("create_hyrox_result", {
      p_user_id: a.id,
      p_result: { date: today, event_type: "simulation", total_seconds: 4000 },
      p_splits: [{ segment_index: 1, segment_type: "run", exercise_id: "running", duration_seconds: 270, roxzone_seconds: 15 }],
    });
    expect(hyrox.error).toBeNull();
    ids.hyrox = hyrox.data!;

    const custom = await a.client
      .from("exercise_master")
      .insert({ id: `custom_rls_${Date.now()}`, owner_id: a.id, name: "A secret exercise", category: "other", unit_type: "reps" })
      .select("id")
      .single();
    expect(custom.error).toBeNull();
    ids.custom = custom.data!.id;
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  const tables = [
    ["workout_plans", "plan"],
    ["workout_plan_exercises", "planExercise"],
    ["workout_sessions", "session"],
    ["workout_sets", "set"],
    ["body_metrics", "body"],
    ["health_metrics", "health"],
    ["readiness_checkins", "checkin"],
    ["running_sessions", "run"],
    ["coach_insights", "insight"],
    ["hyrox_results", "hyrox"],
  ] as const;

  it("lets the owner read their own rows", async () => {
    for (const [table, key] of tables) {
      const { data, error } = await a.client.from(table).select("id").eq("id", ids[key]);
      expect(error, table).toBeNull();
      expect(data, table).toHaveLength(1);
    }
  });

  it("hides every row from another user", async () => {
    for (const [table, key] of tables) {
      const { data, error } = await b.client.from(table).select("id").eq("id", ids[key]);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const splits = await b.client.from("hyrox_splits").select("id").eq("result_id", ids.hyrox);
    expect(splits.data).toEqual([]);
    const stats = await b.client.from("exercise_session_stats").select("*").eq("session_id", ids.session);
    expect(stats.data).toEqual([]);
    const pbs = await b.client.from("exercise_personal_bests").select("*").eq("user_id", a.id);
    expect(pbs.data).toEqual([]);
  });

  it("prevents another user from updating or deleting rows", async () => {
    await b.client.from("body_metrics").update({ weight: 50 }).eq("id", ids.body);
    await b.client.from("workout_sets").update({ weight: 999 }).eq("id", ids.set);
    await b.client.from("workout_plans").delete().eq("id", ids.plan);
    await b.client.from("running_sessions").delete().eq("id", ids.run);

    const admin = adminClient();
    expect((await admin.from("body_metrics").select("weight").eq("id", ids.body).single()).data?.weight).toBe(81.2);
    expect((await admin.from("workout_sets").select("weight").eq("id", ids.set).single()).data?.weight).toBe(80);
    expect((await admin.from("workout_plans").select("id").eq("id", ids.plan)).data).toHaveLength(1);
    expect((await admin.from("running_sessions").select("id").eq("id", ids.run)).data).toHaveLength(1);
  });

  it("rejects rows written on behalf of another user", async () => {
    const forged = await b.client.from("body_metrics").insert({ user_id: a.id, date: "2026-01-01", weight: 70 });
    expect(forged.error?.code).toBe("42501");
    const rpc = await b.client.rpc("create_workout_plan", {
      p_user_id: a.id,
      p_plan: { date: today, title: "forged", workout_type: "upper" },
      p_exercises: [],
    });
    expect(rpc.error).not.toBeNull();
  });

  it("cannot attach a child row to another user's parent", async () => {
    // B uses their own user_id but A's session id: the composite FK (session_id, user_id) rejects it.
    const res = await b.client
      .from("workout_sets")
      .insert({ user_id: b.id, session_id: ids.session, exercise_id: "bench_press", set_number: 2, weight: 100, reps: 1 });
    expect(res.error).not.toBeNull();
    expect(["23503", "42501"]).toContain(res.error?.code);
  });

  it("keeps custom exercises private and built-ins read-only", async () => {
    const own = await b.client.from("exercise_master").select("id").eq("id", ids.custom);
    expect(own.data).toEqual([]);
    const builtIns = await b.client.from("exercise_master").select("id").is("owner_id", null);
    expect(builtIns.data!.length).toBeGreaterThanOrEqual(20);
    await b.client.from("exercise_master").update({ name: "Hacked" }).eq("id", "bench_press");
    const bench = await adminClient().from("exercise_master").select("name").eq("id", "bench_press").single();
    expect(bench.data?.name).toBe("Bench Press");
  });

  it("never exposes token hashes, even to the owner", async () => {
    const hashes = await a.client.from("coach_api_tokens").select("token_hash");
    expect(hashes.error?.code).toBe("42501");
    const safe = await a.client.from("coach_api_tokens").select("id, name, token_prefix");
    expect(safe.error).toBeNull();
  });

  it("gives anonymous requests nothing", async () => {
    const anon = anonClient();
    for (const table of ["workout_plans", "body_metrics", "exercise_master", "coach_api_tokens", "api_request_logs"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
      expect(error?.code, table).toBe("42501");
    }
  });
});
