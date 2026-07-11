import { expect, test } from "@playwright/test";

test("mobile landing page exposes the core market interaction", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.getByTestId("hero-title")).toBeVisible();
  await expect(page.getByTestId("demo-market-title")).toBeVisible();

  await page.getByTestId("stake-100").click();
  await page.getByTestId("commit-position").click();

  await expect(page.getByTestId("demo-message")).toHaveText(
    "100 demo points committed to YES. The market moved."
  );
});
