import { expect, test } from "@playwright/test";
import { addDays, formatDayLabel } from "@/lib/domain/dates";
import { adminClient, demoUserId, login } from "./helpers";

/** Logging a workout from an earlier day in the app: it is saved on that date, not today. */
test("log a past workout in the app", async ({ page }) => {
  const userId = await demoUserId();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const day = addDays(today, -9);

  await login(page);
  await page.goto("/history");
  await page.getByTestId("log-past").click();
  await page.getByTestId("past-date").fill(day);
  await page.getByLabel("タイトル").fill("E2E Past Lift");
  await page.getByTestId("past-start").click();
  await page.waitForURL("**/workout/**");

  // The logger says which day it is filling in, and there is no rest timer.
  await expect(page.getByText(`${formatDayLabel(day)}の記録`)).toBeVisible();
  await page.getByRole("button", { name: "種目を追加" }).first().click();
  await page.getByRole("button", { name: "Bench Press", exact: true }).click();
  await expect(page.getByTestId("exercise-name")).toHaveText("Bench Press");
  await page.getByTestId("reps-input").or(page.getByTestId("reps-value")).first().click();
  await page.getByTestId("reps-input").fill("6");
  await page.getByTestId("reps-input").press("Enter");
  await page.getByTestId("complete-set").click();
  await expect(page.getByTestId("completed-sets")).toContainText("×6");
  await expect(page.getByTestId("rest-timer")).toHaveCount(0);

  await page.getByTestId("finish-open").click();
  await expect(page.getByTestId("backfill-duration")).toBeVisible();
  await page.getByTestId("finish-save").click();
  await page.waitForURL("**/history/**done=1");
  await expect(page.getByTestId("workout-title")).toHaveText("E2E Past Lift");

  const { data } = await adminClient().from("workout_sessions").select("date, status, started_at, duration_seconds").eq("user_id", userId).eq("title", "E2E Past Lift").single();
  expect(data?.date).toBe(day);
  expect(data?.status).toBe("completed");
  expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date(data!.started_at))).toBe(day);
  expect(data?.duration_seconds).toBe(20 * 60); // default estimate: 10 min + 3 per set, at least 20 min
});
