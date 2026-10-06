import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, api, createTestUser, createToken, deleteTestUser, todayTokyo, type TestUser } from "./helpers";

/**
 * Checklist ⑮⑯⑰⑲ and API security: the coach API only ever touches the token
 * owner's data, honours scopes, revocation, expiry and rate limits, and plans it
 * writes show up as today's workout.
 */
describe("AI Coach API", () => {
  let a: TestUser;
  let b: TestUser;
  let tokenA: string;
  let tokenB: string;
  const today = todayTokyo();

  beforeAll(async () => {
    const health = await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/coach/openapi.json`).catch(() => null);
    if (!health?.ok) throw new Error("The app must be running (npm run dev / npm start) for API tests. Set APP_URL if it is not on :3000.");
    a = await createTestUser("api-a");
    b = await createTestUser("api-b");
    tokenA = (await createToken(a.id)).token;
    tokenB = (await createToken(b.id)).token;
    await adminClient().from("body_metrics").insert({ user_id: a.id, date: today, weight: 77.7 });
    await adminClient().from("body_metrics").insert({ user_id: b.id, date: today, weight: 66.6 });
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  it("rejects missing, malformed and unknown tokens", async () => {
    expect((await api("/api/coach/context")).status).toBe(401);
    expect((await api("/api/coach/context", { token: "not-a-token" })).status).toBe(401);
    const unknown = await api("/api/coach/context", { token: `hxc_${"A".repeat(43)}` });
    expect(unknown.status).toBe(401);
    expect(unknown.json.error.code).toBe("unauthorized");
  });

  it("returns the token owner's context only (⑮)", async () => {
    const ctxA = await api("/api/coach/context", { token: tokenA });
    expect(ctxA.status).toBe(200);
    expect(ctxA.json.body.weight_kg).toBe(77.7);
    expect(ctxA.json.meta.date).toBe(today);
    const ctxB = await api("/api/coach/context", { token: tokenB });
    expect(ctxB.json.body.weight_kg).toBe(66.6);
  });

  it("creates a plan that becomes today's workout (⑯⑰)", async () => {
    const created = await api("/api/coach/workouts", {
      token: tokenA,
      method: "POST",
      body: {
        workout_type: "Upper",
        title: "API Upper",
        coach_reason: "HYROX pulling strength development",
        exercises: [
          { exercise_id: "pull_up", sets: 4, reps_min: 6, reps_max: 10, target_rpe: 8 },
          { exercise_id: "bench_press", sets: 4, reps_min: 6, reps_max: 8, target_weight: 82.5, target_rpe: 8 },
        ],
      },
    });
    expect(created.status).toBe(201);
    expect(created.json.plan.created_by).toBe("AI");
    expect(created.json.shows_on_today).toBe(true);
    expect(created.json.plan.exercises[1].target).toBe("4 × 6-8 · 82.5 kg · RPE 8");

    const ctx = await api("/api/coach/context", { token: tokenA });
    expect(ctx.json.plans.today.map((p: { title: string }) => p.title)).toContain("API Upper");

    // The signed-in app user sees it through RLS too.
    const viaApp = await a.client.from("workout_plans").select("title, created_by").eq("date", today);
    expect(viaApp.data).toContainEqual({ title: "API Upper", created_by: "AI" });
  });

  it("is idempotent with an idempotency key and replaces plans on request", async () => {
    const body = { date: "2030-01-01", workout_type: "run", title: "Intervals", idempotency_key: "k-2030-01-01", exercises: [{ exercise_id: "running", sets: 6, distance_m: 1000, pace: "4:20-4:30" }] };
    const first = await api("/api/coach/workouts", { token: tokenA, method: "POST", body });
    const retry = await api("/api/coach/workouts", { token: tokenA, method: "POST", body });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.json.plan.id).toBe(first.json.plan.id);

    const replacement = await api("/api/coach/workouts", {
      token: tokenA,
      method: "POST",
      body: { date: "2030-01-01", workout_type: "recovery", title: "Easy day", replace_existing: true, exercises: [] },
    });
    expect(replacement.status).toBe(201);
    const list = await api("/api/coach/workouts?from=2030-01-01&to=2030-01-01", { token: tokenA });
    expect(list.json.plans.map((p: { title: string }) => p.title)).toEqual(["Easy day"]);
  });

  it("explains unknown exercises and invalid input", async () => {
    const unknown = await api("/api/coach/workouts", { token: tokenA, method: "POST", body: { workout_type: "upper", exercises: [{ exercise_id: "cable_fly", sets: 3 }] } });
    expect(unknown.status).toBe(422);
    expect(unknown.json.error.details.valid_ids).toContain("bench_press");
    const invalid = await api("/api/coach/workouts", { token: tokenA, method: "POST", body: { workout_type: "upper", exercises: [{ exercise_id: "bench_press", sets: 0 }] } });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.details[0].path).toBe("exercises.0.sets");
  });

  it("never reads or writes another user's plans (⑲)", async () => {
    const created = await api("/api/coach/workouts", { token: tokenA, method: "POST", body: { date: "2030-02-01", workout_type: "lower", title: "A only", exercises: [] } });
    const id = created.json.plan.id;
    expect((await api(`/api/coach/workouts/${id}`, { token: tokenB })).status).toBe(404);
    expect((await api(`/api/coach/workouts/${id}`, { token: tokenB, method: "PUT", body: { title: "hijacked" } })).status).toBe(404);
    expect((await api(`/api/coach/workouts/${id}`, { token: tokenB, method: "DELETE" })).status).toBe(404);
    const listB = await api("/api/coach/workouts?from=2030-02-01&to=2030-02-01", { token: tokenB });
    expect(listB.json.plans).toEqual([]);
    const stillThere = await api(`/api/coach/workouts/${id}`, { token: tokenA });
    expect(stillThere.json.plan.title).toBe("A only");
  });

  it("enforces scopes, revocation and expiry", async () => {
    const readOnly = (await createToken(a.id, { scopes: ["read"] })).token;
    expect((await api("/api/coach/ping", { token: readOnly })).status).toBe(200);
    const denied = await api("/api/coach/insights", { token: readOnly, method: "POST", body: { body: "x" } });
    expect(denied.status).toBe(403);

    const revoked = (await createToken(a.id, { revoked: true })).token;
    expect((await api("/api/coach/ping", { token: revoked })).status).toBe(401);
    const expired = (await createToken(a.id, { expiresAt: new Date(Date.now() - 1000).toISOString() })).token;
    expect((await api("/api/coach/ping", { token: expired })).status).toBe(401);
  });

  it("rate-limits per token", async () => {
    const { token, id } = await createToken(a.id);
    const now = new Date().toISOString();
    const rows = Array.from({ length: 60 }, () => ({ user_id: a.id, token_id: id, method: "GET", path: "/api/coach/ping", status: 200, created_at: now }));
    await adminClient().from("api_request_logs").insert(rows);
    const limited = await api("/api/coach/ping", { token });
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("rate_limited");
  });

  it("logs requests for the owner to review", async () => {
    await api("/api/coach/ping", { token: tokenB });
    await new Promise((r) => setTimeout(r, 500));
    const logs = await b.client.from("api_request_logs").select("path, status").eq("path", "/api/coach/ping");
    expect(logs.data!.length).toBeGreaterThan(0);
    const othersLogs = await b.client.from("api_request_logs").select("id").eq("user_id", a.id);
    expect(othersLogs.data).toEqual([]);
  });

  it("imports health data and logs runs", async () => {
    const health = await api("/api/coach/health", {
      token: tokenB,
      method: "POST",
      body: { metrics: [{ date: today, sleep_minutes: 455, hrv: 60, resting_hr: 51, weight: 66.4, source: "apple_health" }] },
    });
    expect(health.status).toBe(201);
    const run = await api("/api/coach/runs", { token: tokenB, method: "POST", body: { run_type: "Zone 2", distance_km: 6, duration_seconds: "33:00" } });
    expect(run.status).toBe(201);
    expect(run.json.run.pace).toBe("5:30/km");
    const ctx = await api("/api/coach/context", { token: tokenB });
    expect(ctx.json.recovery.sleep_last_night_min).toBe(455);
    expect(ctx.json.body.weight_kg).toBe(66.4);
    expect(ctx.json.running.distance_7d_km).toBe(6);
  });

  it("serves a public OpenAPI document", async () => {
    const doc = await api("/api/coach/openapi.json");
    expect(doc.status).toBe(200);
    expect(doc.json.openapi).toBe("3.1.0");
    expect(doc.json.paths["/api/coach/workouts"].post.operationId).toBe("createWorkoutPlan");
  });
});
