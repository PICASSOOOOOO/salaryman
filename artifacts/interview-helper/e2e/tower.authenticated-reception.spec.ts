/** E2E: after the development reset, no prior account bypasses sign-up. */

import { test, expect } from "@playwright/test";

test("Tower bookmarks require a fresh sign-up session after reset", async ({ page }) => {
  await page.goto("/tower");

  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftower/);
});