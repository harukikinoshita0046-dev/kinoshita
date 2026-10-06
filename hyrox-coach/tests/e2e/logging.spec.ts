import { expect, test } from "@playwright/test";
import { createToken } from "../integration/helpers";
import { adminClient, demoUserId, login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** ⑫ Running log */
test("save a run", async ({ page }) => {
  await page.goto("/run/new");
  await page.getByRole("button", { name: "Zone 2" }).click();
  const distance = page.getByTestId("run-distance-value");
  const before = Number(await distance.textContent());
  await page.getByTestId("run-distance-inc").click();
  await expect(distance).toHaveText(String(Math.round((before + 0.1) * 100) / 100));
  await page.getByTestId("save-run").click();
  await page.waitForURL("**/history/run/**");
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  const id = page.url().split("/history/run/")[1].split("?")[0];
  const run = await adminClient().from("running_sessions").select("run_type, distance_km").eq("id", id).single();
  expect(run.data?.run_type).toBe("zone2");
  expect(run.data?.distance_km).toBeCloseTo(before + 0.1, 2);
});

/** ⑬ HYROX simulation: 16 segments, compared with the PB, saved with splits */
test("run a HYROX simulation and save it", async ({ page }) => {
  await page.goto("/hyrox/simulation");
  await page.getByLabel(/Track Roxzone/).uncheck();
  await page.getByTestId("sim-start").click();
  for (let i = 0; i < 16; i++) {
    await page.getByTestId("sim-done").click();
  }
  await expect(page.getByTestId("sim-final")).toBeVisible();
  await expect(page.getByTestId("sim-diff")).toContainText("PB");
  await page.getByTestId("sim-save").click();
  await page.waitForURL("**/hyrox/results/**");
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  const id = page.url().split("/hyrox/results/")[1].split("?")[0];
  const splits = await adminClient().from("hyrox_splits").select("segment_index").eq("result_id", id);
  expect(splits.data).toHaveLength(16);
});

/** ⑭ Body weight + ⑮ the coach API sees it immediately */
test("log body weight in the check-in and see it in TODAY and the coach context", async ({ page }) => {
  await page.goto("/checkin");
  const weight = page.getByTestId("checkin-weight-value");
  await expect(weight).toHaveText("78.4");
  await page.getByTestId("checkin-weight-inc").click();
  await expect(weight).toHaveText("78.5");
  await page.getByTestId("motivation-5").click();
  await page.getByTestId("checkin-save").click();
  await page.waitForURL("**/today");
  await expect(page.getByTestId("today-metrics")).toContainText("78.5");

  const { token } = await createToken(await demoUserId(), { scopes: ["read"] });
  const res = await page.request.get("/api/coach/context", { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  const ctx = await res.json();
  expect(ctx.body.weight_kg).toBe(78.5);
  expect(ctx.recovery.subjective_today.motivation).toBe(5);
});

/** ⑯⑰ A plan written through the coach API appears on TODAY */
test("a plan created through the API shows up on TODAY", async ({ page }) => {
  const { token } = await createToken(await demoUserId());
  const res = await page.request.post("/api/coach/workouts", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "E2E Engine",
      workout_type: "hyrox",
      coach_reason: "API → TODAY check",
      exercises: [
        { exercise_id: "ski_erg", sets: 3, distance_m: 500, rest_seconds: 90 },
        { exercise_id: "Wall Balls", sets: 3, reps: "20", weight: 6 },
      ],
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/today");
  const card = page.getByTestId("plan-card").filter({ hasText: "E2E Engine" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("AI COACH");
  await expect(card).toContainText("SkiErg");
  await expect(card).toContainText("3 × 500 m");
});
