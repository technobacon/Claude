import { expect, test } from "@playwright/test";

test("mobile landing page exposes the core market interaction", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Put points behind the group chat take." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will our flight leave the gate by 18:15?" })).toBeVisible();

  await page.getByRole("button", { name: "100" }).click();
  await page.getByRole("button", { name: "Commit 100 points to YES" }).click();

  await expect(page.getByText("100 demo points committed to YES. The market moved.")).toBeVisible();
});
