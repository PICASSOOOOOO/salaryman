/**
 * E2E: protected profile access stays behind the Clerk/security boundary.
 *
 * Detailed LABOR RECORD rendering is covered by Profile.labor-record.test.tsx.
 * This browser check verifies that an anonymous browser cannot reach that
 * surface by guessing /profile. Protected deep links go to the compact
 * sign-in route and preserve the requested destination.
 */

import { test, expect } from "@playwright/test";

test("anonymous /profile access returns to sign-in with its destination", async ({ page }) => {
  await page.goto("/profile");

  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprofile/);
  await expect(page.getByText(/sign in/i).first()).toBeVisible();
  await expect(page.getByText("LABOR RECORD", { exact: false })).not.toBeAttached();
});