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
    await expect(page.getByText(/^Minimum /)).toBeVisible({ timeout: 30_000 });

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
    await expect(page.getByText(/^(Pending|Completed|Failed)$/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^(Completed|Failed)$/)).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `e2e/screenshots/claim-status-${testInfo.project.name}.png`, fullPage: true });

    await page.getByRole("button", { name: "Back to balances" }).click();
    await expect(page.getByText("Available to claim").first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `e2e/screenshots/after-claim-${testInfo.project.name}.png`, fullPage: true });
  });
});
