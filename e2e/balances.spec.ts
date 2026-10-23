import { expect, test, type Page } from "@playwright/test";

const token = process.env.CASHMINE_TOKEN ?? "";

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function enterToken(page: Page, value: string) {
  await expect(page.getByText("Your CashMine API token")).toBeVisible();
  await page.getByLabel("API token").fill(value);
  await page.getByRole("button", { name: /^Save/ }).click();
}

test.describe("token and balances", () => {
  test.skip(!token, "CASHMINE_TOKEN is not set");

  test("asks for a token first, then shows balances without horizontal overflow", async ({ page }, testInfo) => {
    await page.goto("/");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/screenshots/token-${testInfo.project.name}.png`, fullPage: true });

    await enterToken(page, token);
    await expect(page.getByText("Available to claim").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Updated \d/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Claim USDT/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/screenshots/balances-${testInfo.project.name}.png`, fullPage: true });
  });

  test("remembers the token across a reload", async ({ page }) => {
    await page.goto("/");
    await enterToken(page, token);
    await expect(page.getByText("Available to claim").first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText("Available to claim").first()).toBeVisible({ timeout: 30_000 });
  });

  test("sends a rejected token back to the token screen with an explanation", async ({ page }) => {
    await page.goto("/");
    await enterToken(page, "ct1.not-a-real-token");
    await expect(page.getByText(/rejected this token/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("API token")).toBeVisible();
  });

  test("keeps the last balances and warns when a refresh fails, then recovers", async ({ page }) => {
    await page.goto("/");
    await enterToken(page, token);
    await expect(page.getByRole("button", { name: /Claim USDT/ })).toBeVisible({ timeout: 30_000 });

    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" };
    await page.route("**/v1/balances", (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({
        status: 503,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ error: { code: "SERVER", message: "temporary server error" } }),
      });
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(/Couldn't refresh/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Stale/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Claim USDT/ })).toBeVisible(); // last good data stays

    await page.unroute("**/v1/balances");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText(/Couldn't refresh/)).toBeHidden({ timeout: 30_000 });
  });

  test("shows paginated activity from the home header", async ({ page }, testInfo) => {
    await page.goto("/");
    await enterToken(page, token);
    await page.getByRole("link", { name: "Activity" }).click({ timeout: 30_000 });
    const rows = page.getByText(/^(Accrual|Reversal|Claim)( · .+)?$/).filter({ visible: true });
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const before = await rows.count();
    const more = page.getByRole("button", { name: "Load more" });
    if (await more.isVisible()) {
      await more.click();
      await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThan(before);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/screenshots/activity-${testInfo.project.name}.png`, fullPage: false });
  });

  test("navigates to the claim screen for an asset", async ({ page }) => {
    await page.goto("/");
    await enterToken(page, token);
    await page.getByRole("button", { name: /Claim USDT/ }).click({ timeout: 30_000 });
    await expect(page.getByText("Claim USDT")).toBeVisible();
    await expect(page).toHaveURL(/claim\/USDT/);
  });
});
