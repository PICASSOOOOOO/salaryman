/** E2E: new accounts must authenticate before onboarding. */

import { test, expect } from "@playwright/test";

test.describe("Onboarding route", () => {
  test("sends signed-out visitors to login", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fonboarding/);
  });
});