/** E2E smoke checks for the public Pablo surface and its sign-in handoff. */

import { test, expect } from "@playwright/test";

test("Pablo mounts the nebula instead of the route loading screen", async ({ page }) => {
  await page.goto("/pablo", { waitUntil: "networkidle" });

  await expect(page.locator('[data-testid="pablo-orb"]')).toBeVisible();
  await expect(page.locator('[data-testid="pablo-orb"] canvas')).toHaveCount(1);
  await expect(page.getByText("PABLO // SYNCING")).toHaveCount(0);
});

test("console sign-in reaches the Replit authorization handoff", async ({ page }) => {
  await page.goto("/console", { waitUntil: "networkidle" });

  const signIn = page.getByRole("button", { name: "SIGN IN" });
  await expect(signIn).toBeVisible();
  await Promise.all([
    page.waitForURL(/https:\/\/replit\.com\/(?:oidc\/auth|oidc\/login|oidc-login-consent)/),
    signIn.click(),
  ]);
});