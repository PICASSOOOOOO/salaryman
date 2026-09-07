/**
 * E2E: protected profile access stays behind the Clerk/security boundary.
 *
 * Detailed LABOR RECORD rendering is covered by Profile.labor-record.test.tsx.
 * This browser check verifies that an anonymous browser cannot reach that
 * surface by guessing /profile.
 */

import { test, expect } from "@playwright/test";

test("anonymous /profile access returns to the public Pablo front door", async ({ page }) => {
  await page.goto("/profile");

  await expect(page).toHaveURL(/\/pablo(?:$|[?#])/);
  await expect(page.getByRole("textbox", { name: "Type a message…" })).toBeVisible();
  await expect(page.getByText("LABOR RECORD", { exact: false })).not.toBeAttached();
});