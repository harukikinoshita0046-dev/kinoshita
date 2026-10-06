import { expect, type Page } from "@playwright/test";
import { adminClient } from "../integration/helpers";

export const DEMO = { email: process.env.SEED_EMAIL ?? "demo@hyrox.local", password: process.env.SEED_PASSWORD ?? "hyrox-demo-2026" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(DEMO.email);
  await page.getByLabel(/パスワード/).fill(DEMO.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL("**/today");
  await expect(page.getByRole("heading", { name: "TODAY", exact: true })).toBeVisible();
}

export async function demoUserId(): Promise<string> {
  const { data } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((u) => u.email === DEMO.email);
  if (!user) throw new Error("demo user missing — run npm run seed");
  return user.id;
}

export { adminClient };
