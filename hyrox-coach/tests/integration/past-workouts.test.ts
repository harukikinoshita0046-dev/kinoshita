import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/dates";
import { adminClient, api, createTestUser, createToken, deleteTestUser, todayTokyo, type TestUser } from "./helpers";

/** POST /api/coach/sessions: the coach saves a past workout the athlete reports. */
describe("Logging past workouts through the coach API", () => {
  let a: TestUser;
  let b: TestUser;
  let tokenA: string;
  let tokenB: string;
  const today = todayTokyo();
  const day = addDays(today, -4);

  beforeAll(async () => {
    const health = await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/coach/openapi.json`).catch(() => null);
    if (!health?.ok) throw new Error("The app must be running (npm start) for API tests.");
    a = await createTestUser("past-a");
    b = await createTestUser("past-b");
    tokenA = (await createToken(a.id)).token;
    tokenB = (await createToken(b.id)).token;
  });

  afterAll(async () => {
    await deleteTestUser(a);
    await deleteTestUser(b);
  });

  const body = {
    date: day,
    title: "Past Upper",
    workout_type: "upper",
    start_time: "19:00",
    session_rpe: 8,
    exercises: [
      { exercise_id: "Bench Press", sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 7, rpe: 9 }] },
      { exercise_id: "squat", sets: 3, reps: 5, weight: 100 },
    ],
  };

  it("saves the workout on that day with its sets", async () => {
    const res = await api("/api/coach/sessions", { token: tokenA, method: "POST", body });
    expect(res.status).toBe(201);
    expect(res.json.session.date).toBe(day);
    expect(res.json.session.total_sets).toBe(6);
    expect(res.json.session.duration_min).toBe(28); // 10 + 3 × 6 sets
    expect(res.json.session.exercises.map((e: { exercise_id: string }) => e.exercise_id)).toEqual(["bench_press", "squat"]);

    const session = (await adminClient().from("workout_sessions").select("*").eq("id", res.json.session.id).single()).data!;
    expect(session.status).toBe("completed");
    expect(session.user_id).toBe(a.id);
    expect(new Date(session.started_at).toISOString()).toBe(new Date(`${day}T10:00:00Z`).toISOString()); // 19:00 Tokyo
    const sets = (await adminClient().from("workout_sets").select("*").eq("session_id", session.id).order("completed_at")).data!;
    expect(sets.map((s) => `${s.exercise_id}#${s.set_number} ${s.weight}x${s.reps}`)).toEqual([
      "bench_press#1 80x8",
      "bench_press#2 80x8",
      "bench_press#3 80x7",
      "squat#1 100x5",
      "squat#2 100x5",
      "squat#3 100x5",
    ]);
  });

  it("shows up in the workout list for that date", async () => {
    const list = await api(`/api/coach/sessions?from=${day}&to=${day}`, { token: tokenA });
    expect(list.json.sessions.map((s: { title: string }) => s.title)).toEqual(["Past Upper"]);
    expect(list.json.sessions[0].exercises[0].sets).toBe("80×8, 80×8, 80×7");
  });

  it("refuses a duplicate unless replace_existing, then replaces it", async () => {
    const dup = await api("/api/coach/sessions", { token: tokenA, method: "POST", body });
    expect(dup.status).toBe(409);
    const replaced = await api("/api/coach/sessions", {
      token: tokenA,
      method: "POST",
      body: { ...body, replace_existing: true, exercises: [{ exercise_id: "bench_press", sets: 2, reps: 10, weight: 70 }] },
    });
    expect(replaced.status).toBe(201);
    expect(replaced.json.replaced).toBe(1);
    const rows = (await adminClient().from("workout_sessions").select("id").eq("user_id", a.id).eq("date", day)).data!;
    expect(rows).toHaveLength(1);
  });

  it("rejects future dates, unknown exercises and sets without work", async () => {
    const future = await api("/api/coach/sessions", { token: tokenA, method: "POST", body: { ...body, date: addDays(today, 1), title: "x" } });
    expect(future.status).toBe(400);
    const unknown = await api("/api/coach/sessions", {
      token: tokenA,
      method: "POST",
      body: { date: day, exercises: [{ exercise_id: "moon_lift", sets: 1, reps: 1 }] },
    });
    expect(unknown.status).toBe(422);
    const empty = await api("/api/coach/sessions", {
      token: tokenA,
      method: "POST",
      body: { date: day, title: "empty", exercises: [{ exercise_id: "bench_press", sets: [{ weight: 50 }] }] },
    });
    expect(empty.status).toBe(400);
  });

  it("keeps each athlete's history separate", async () => {
    const list = await api(`/api/coach/sessions?from=${day}&to=${day}`, { token: tokenB });
    expect(list.json.sessions).toEqual([]);
  });

  it("needs the write scope", async () => {
    const readOnly = (await createToken(a.id, { scopes: ["read"] })).token;
    const res = await api("/api/coach/sessions", { token: readOnly, method: "POST", body: { ...body, title: "ro" } });
    expect(res.status).toBe(403);
  });
});
