import { expect, test } from "@playwright/test";
import { adminClient, login } from "./helpers";

/** Checklist ①–⑪: login, TODAY plan, steppers, RPE, complete, rest timer, next set, finish, saved, history. */
test("log a set from the AI plan and finish the workout", async ({ page }) => {
  await login(page); // ①

  // ② Today's AI plan is on TODAY.
  const plan = page.getByTestId("plan-card").filter({ hasText: "HYROX Upper" });
  await expect(plan).toBeVisible();
  await expect(plan).toContainText("Bench Press");
  await expect(plan).toContainText("82.5 kg");
  await expect(page.getByTestId("readiness-score")).toBeVisible();

  await plan.getByTestId("start-workout").click();
  await page.waitForURL("**/workout/**");
  const sessionId = page.url().split("/workout/")[1];

  // Jump to Bench Press: the coach's target weight is pre-filled.
  await page.getByRole("navigation", { name: "種目一覧" }).getByRole("button", { name: /Bench Press/ }).click();
  await expect(page.getByTestId("exercise-name")).toHaveText("Bench Press");
  await expect(page.getByTestId("target-line")).toContainText("4 × 6-8 · 82.5 kg · RPE 8");
  await expect(page.getByTestId("previous-line")).toContainText("80 kg · 8 / 8 / 7 / 6");
  await expect(page.getByTestId("weight-value")).toHaveText("82.5");
  await expect(page.getByTestId("reps-value")).toHaveText("8");

  // ③ weight +/−, ④ reps +/−
  await page.getByTestId("weight-inc").click();
  await expect(page.getByTestId("weight-value")).toHaveText("85");
  await page.getByTestId("weight-dec").click();
  await expect(page.getByTestId("weight-value")).toHaveText("82.5");
  await page.getByTestId("reps-inc").click();
  await expect(page.getByTestId("reps-value")).toHaveText("9");
  await page.getByTestId("reps-dec").click();
  await expect(page.getByTestId("reps-value")).toHaveText("8");

  // ⑤ RPE, ⑥ complete
  await page.getByTestId("rpe-8").click();
  await expect(page.getByTestId("rpe-8")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("complete-set").click();
  await expect(page.getByTestId("completed-sets")).toContainText("82.5×8");
  await expect(page.getByTestId("completed-sets")).toContainText("@8");

  // ⑦ rest timer counts down from the plan's 120 s
  const remaining = page.getByTestId("rest-remaining");
  await expect(remaining).toBeVisible();
  const first = await remaining.textContent();
  expect(first).toMatch(/^[12]:\d\d$/);
  await page.waitForTimeout(1500);
  expect(await remaining.textContent()).not.toBe(first);

  // ⑧ skip rest -> next set, values carried over
  await page.getByTestId("rest-skip").click();
  await expect(page.getByTestId("current-set-label")).toContainText("SET 2");
  await expect(page.getByTestId("weight-value")).toHaveText("82.5");
  await page.getByTestId("complete-set").click();
  await expect(page.getByTestId("completed-sets").locator("li")).toHaveCount(2);

  // ⑨ finish with session RPE
  await page.getByTestId("finish-open").click();
  await page.getByTestId("session-rpe-7").click();
  await page.getByTestId("finish-save").click();
  await page.waitForURL(`**/history/${sessionId}?done=1`);
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  await expect(page.getByTestId("exercise-group").filter({ hasText: "Bench Press" })).toContainText("82.5×8");

  // ⑩ persisted in Supabase
  const admin = adminClient();
  const session = await admin.from("workout_sessions").select("status, session_rpe, duration_seconds").eq("id", sessionId).single();
  expect(session.data?.status).toBe("completed");
  expect(session.data?.session_rpe).toBe(7);
  const sets = await admin.from("workout_sets").select("exercise_id, weight, reps, rpe").eq("session_id", sessionId).order("set_number");
  expect(sets.data).toEqual([
    { exercise_id: "bench_press", weight: 82.5, reps: 8, rpe: 8 },
    { exercise_id: "bench_press", weight: 82.5, reps: 8, rpe: null },
  ]);

  // ⑪ visible in History; TODAY shows the plan as completed
  await page.goto("/history");
  await expect(page.getByRole("link", { name: /HYROX Upper/ }).first()).toBeVisible();
  await page.goto("/today");
  await expect(page.getByTestId("plan-card").filter({ hasText: "HYROX Upper" })).toContainText("完了");
});
