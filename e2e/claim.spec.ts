import { expect, test, type Page } from "@playwright/test";

const token = process.env.CASHMINE_TOKEN ?? "";
const API = "https://task-api.cashmine.io";

async function enterToken(page: Page, value: string) {
  await expect(page.getByText("Your CashMine API token")).toBeVisible();
  await page.getByLabel("API token").fill(value);
  await page.getByRole("button", { name: /^Save/ }).click();
}

test.describe("claim flow", () => {
  test.skip(!token, "CASHMINE_TOKEN is not set");
  test.describe.configure({ timeout: 180_000 }); // a claim takes ~20 s to settle on the server

  test("validates input, claims the minimum USDT and follows the claim until it settles", async ({ page, request }, testInfo) => {
    const response = await request.get(`${API}/v1/claim-options?asset=USDT`, { headers: { Authorization: `Bearer ${token}` } });
    const options = (await response.json()) as { minAmount: string; fee: string };

    await page.goto("/");
    await enterToken(page, token);
    await page.getByRole("button", { name: /Claim USDT/ }).click({ timeout: 30_000 });
    // The test API injects failures on purpose; press Retry the way a user would.
    const minimum = page.getByText(/^Minimum /);
    for (let attempt = 0; attempt < 5 && !(await minimum.isVisible()); attempt += 1) {
      const retry = page.getByRole("button", { name: "Retry" });
      if (await retry.isVisible()) await retry.click();
      await page.waitForTimeout(3_000);
    }
    await expect(minimum).toBeVisible({ timeout: 30_000 });

    const amount = page.getByLabel("Amount");
    await amount.fill("abc");
    await expect(page.getByText(/Use digits/)).toBeVisible();
    await amount.fill("0.0000001");
    await expect(page.getByText(/at most 6 decimal places/)).toBeVisible();
    await amount.fill("999999999");
    await expect(page.getByText(/You can claim up to/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

    await amount.fill(options.minAmount);
    await expect(page.getByText(/You receive/)).toBeVisible();
    const destinations = page.getByRole("radio");
    if ((await destinations.count()) > 0) await destinations.first().click();
    await page.screenshot({ path: `e2e/screenshots/claim-form-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Confirm your claim")).toBeVisible();
    await page.getByRole("button", { name: "Confirm claim" }).click();

    await expect(page).toHaveURL(/claims\/clm_/, { timeout: 40_000 });
    // The web stack keeps the previous screen mounted, so match only what is visible.
    await expect(page.getByText(/^(Pending|Completed|Failed)$/).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^(Completed|Failed)$/).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `e2e/screenshots/claim-status-${testInfo.project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Back to balances" }).click();
    const balances = page.getByText("Available to claim").filter({ visible: true }).first();
    for (let attempt = 0; attempt < 5 && !(await balances.isVisible()); attempt += 1) {
      const retry = page.getByRole("button", { name: "Retry" });
      if (await retry.isVisible()) await retry.click();
      await page.waitForTimeout(3_000);
    }
    await expect(balances).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `e2e/screenshots/after-claim-${testInfo.project.name}.png`, fullPage: true });
  });
});
