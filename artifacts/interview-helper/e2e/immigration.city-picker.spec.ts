/**
 * E2E: retired browser onboarding routes hand off to the native client.
 *
 * Immigration used to expose the browser city-picker. The current product
 * contract starts onboarding through the desktop client, so the legacy route
 * must not render a partial intake or leave a dead end on small screens.
 */

import { test, expect } from "@playwright/test";

test.describe("Legacy immigration route", () => {
  test("hands the legacy route to the desktop client surface", async ({ page }) => {
    await page.goto("/immigration");

    await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
    await expect(
      page.getByRole("heading", { name: "Run the office where you work." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect a desktop" })).toBeVisible();
    await expect(page.getByTestId("audio-control-toggle")).not.toBeAttached();
  });
});