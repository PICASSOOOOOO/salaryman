/** E2E: authenticated fresh accounts enter the shared onboarding flow. */

import { test, expect } from "@playwright/test";

test("authenticated fresh accounts enter onboarding from Tower bookmarks", async ({ page }) => {
  await page.goto("/tower");

  await expect(page).toHaveURL(/\/onboarding\?returnTo=%2Ftower/);
});