/** E2E: signed-out legacy Tower bookmarks go through login. */

import { test, expect } from "@playwright/test";

test("anonymous /tower access lands on login", async ({ page }) => {
  await page.goto("/tower");

  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftower/);
});