/**
 * E2E: legacy browser Tower bookmarks hand off to the native client.
 */

import { test, expect } from "@playwright/test";

test("anonymous /tower access lands on the desktop client surface", async ({ page }) => {
  await page.goto("/tower");

  await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
  await expect(
    page.getByRole("heading", { name: "Run the office where you work." }),
  ).toBeVisible();
  await expect(page.getByTestId("tower-entry")).not.toBeAttached();
  await expect(page.getByTestId("lobby-map")).not.toBeAttached();
});