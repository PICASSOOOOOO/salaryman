/**
 * E2E: anonymous access to /tower
 *
 * The Tower route is allowed through App.tsx so it can show its sign-in
 * handoff, but the authenticated lobby and PabloOnboarding must not mount
 * while Clerk is resolving or after an anonymous session is confirmed.
 *
 * Registry routes are intercepted instead of relying on a backend response:
 * the important contract is that an anonymous visit never starts either
 * registration request.
 */

import { test, expect } from "@playwright/test";

test.describe("Tower entry — anonymous visitor", () => {
  test("shows only the sign-in surface and never reaches the registry", async ({
    page,
  }) => {
    const registryRequests: string[] = [];

    for (const endpoint of ["register", "check-company"]) {
      await page.route(`**/api/world/${endpoint}`, async (route) => {
        registryRequests.push(route.request().url());
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "anonymous registry request" }),
        });
      });
    }

    await page.goto("/tower");

    // This locator retries through Clerk's initial loading state rather than
    // asserting against the first render frame.
    const entry = page.getByTestId("tower-entry");
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "ENTER THE TOWER" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "CHECK IN AT THE LOBBY" }),
    ).toBeVisible();

    // These are authenticated-only surfaces. Check attachment rather than
    // visibility so a hidden form cannot accidentally satisfy the regression.
    await expect(page.getByTestId("lobby-map")).not.toBeAttached();
    await expect(page.getByTestId("onboarding-choice-business")).not.toBeAttached();
    await expect(page.getByTestId("onboarding-submit")).not.toBeAttached();

    // Clerk has settled by network-idle; the route itself has no anonymous
    // registry work.
    expect(registryRequests).toEqual([]);
  });
});