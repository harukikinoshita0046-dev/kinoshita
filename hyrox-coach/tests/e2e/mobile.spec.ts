import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** ⑳ Every main screen fits an iPhone-width viewport without sideways scrolling. */
const PAGES = [
  "/today",
  "/history",
  "/hyrox",
  "/progress",
  "/progress?range=3m",
  "/profile",
  "/checkin",
  "/body",
  "/run/new",
  "/hyrox/new",
  "/hyrox/simulation",
  "/profile/coach",
  "/profile/exercises",
  "/profile/health",
];

test("main screens fit a phone screen", async ({ page }) => {
  await login(page);
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/couldn.t load|Application error/i), `${path} rendered an error page`).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).or(page.getByText("HYROX SIMULATION")).first(), `${path} has content`).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/screens${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
  }
  // The tab bar is reachable on app screens.
  await page.goto("/today");
  await expect(page.getByRole("navigation", { name: "メインメニュー" })).toBeVisible();
  for (const name of ["HISTORY", "HYROX", "TODAY", "PROGRESS", "PROFILE"]) {
    await expect(page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name })).toBeVisible();
  }
});

test("signed-out visitors are sent to the login page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/today");
  await page.waitForURL("**/login**");
  await expect(page.getByRole("button", { name: "ログイン", exact: true })).toBeVisible();
  await context.close();
});
