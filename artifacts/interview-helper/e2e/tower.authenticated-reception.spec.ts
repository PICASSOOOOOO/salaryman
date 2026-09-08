/**
 * E2E: the browser no longer hosts the authenticated Tower lobby.
 *
 * Gameplay bookmarks intentionally share the same native-client handoff for
 * signed-in and signed-out visitors. Authenticated Tower reception remains
 * native-client territory; this check prevents the retired React lobby from
 * quietly returning.
 */

import { test, expect } from "@playwright/test";

test("authenticated Tower bookmarks use the desktop client handoff", async ({ page }) => {
  await page.goto("/tower");

  await expect(page).toHaveURL(/\/desktop(?:$|[?#])/);
  await expect(
    page.getByRole("heading", { name: "Run the office where you work." }),
  ).toBeVisible();
  await expect(page.getByTestId("lobby-map")).not.toBeAttached();
});