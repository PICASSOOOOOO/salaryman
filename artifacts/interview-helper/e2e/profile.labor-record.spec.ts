/**
 * E2E: LABOR RECORD section on /profile
 *
 * Validates the full route-level rendering of the LaborRecordSection component
 * inside the Profile page. Network routes are intercepted so the test is
 * deterministic and does not require a live database seed.
 *
 * Why page.route() instead of a seeded DB row:
 *   The section's only backend dependency is GET /api/cf/labor-history.  A
 *   network-level mock is faster, isolated, and stable across environments.
 *   It still exercises the full React rendering pipeline — App.tsx routing,
 *   Profile.tsx component tree, useEffect fetch, and conditional render.
 *
 * Auth bypass strategy:
 *   1. Mock GET /api/auth/user to return a synthetic authenticated user.
 *   2. Set localStorage key "salaryman_tutorial_done" = "1" so the App.tsx
 *      funnel gate does not redirect to /pablo (the sign-in funnel).
 */

import { test, expect, type Page } from "@playwright/test";

// ── Shared test data ─────────────────────────────────────────────────────────

const MOCK_USER = {
  id: "e2e-labor-test-user",
  email: "e2e-labor@example.test",
  firstName: "Labor",
  lastName: "Tester",
  profileImageUrl: null,
  createdAt: new Date().toISOString(),
};

const MOCK_CF_SHIFT_1 = {
  id: "task-101",
  source: "task",
  kind: "bug",
  orgId: "org-e2e-1",
  orgName: "E2E Corp",
  payoff: 1500,
  createdAt: new Date("2026-03-10T10:00:00Z").toISOString(),
};

const MOCK_CF_SHIFT_2 = {
  id: "construction-202",
  source: "construction",
  kind: "construction",
  orgId: "org-e2e-2",
  orgName: "E2E Builders",
  payoff: 200,
  createdAt: new Date("2026-03-11T10:00:00Z").toISOString(),
};

const MOCK_LABOR_HISTORY = {
  history: [MOCK_CF_SHIFT_1, MOCK_CF_SHIFT_2],
  totalPayoff: 1700,
  count: 2,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up all the network mocks needed for the Profile page to load and show
 * the LABOR RECORD section.  Non-essential profile endpoints (donation history,
 * org affiliations, etc.) are allowed to pass through or return empty stubs.
 */
async function setupProfileMocks(page: Page): Promise<void> {
  // Auth: return an authenticated user so the profile page does not redirect.
  await page.route("**/api/auth/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: MOCK_USER }),
    }),
  );

  // CF labor history: return two shifts so the section renders.
  await page.route("**/api/cf/labor-history", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_LABOR_HISTORY),
    }),
  );

  // Stub other profile endpoints so they don't produce unhandled errors that
  // might crash the page before the labor section renders.
  const emptyStubs: string[] = [
    "**/api/account",
    "**/api/stripe/donation-history",
    "**/api/orgs/me/all",
    "**/api/orgs/me/financials",
    "**/api/labor/my/contracts",
    "**/api/profiles",
    "**/api/events/my-stats",
    "**/api/events/history",
    "**/api/world/me/name",
  ];
  for (const pattern of emptyStubs) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      }),
    );
  }
}

/**
 * Set localStorage keys required to bypass the App.tsx tutorial/onboarding
 * funnel gate before navigating to /profile.
 */
async function bypassFunnelGate(page: Page): Promise<void> {
  // Must be called after a first navigation has loaded the page origin so
  // localStorage is available.  We use about:blank with addInitScript instead
  // to inject before any page load.
  await page.addInitScript(() => {
    localStorage.setItem("salaryman_tutorial_done", "1");
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Profile page — LABOR RECORD section", () => {
  test.beforeEach(async ({ page }) => {
    await bypassFunnelGate(page);
    await setupProfileMocks(page);
  });

  test("LABOR RECORD section is visible when the user has CF history", async ({
    page,
  }) => {
    await page.goto("/profile");

    // Wait for the section heading to appear.  The component defers rendering
    // until the apiFetch microtask resolves, so we wait rather than asserting
    // immediately.
    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("displays the correct total payoff (ƒ1,700)", async ({ page }) => {
    await page.goto("/profile");

    // The section renders: ƒ{totalPayoff.toLocaleString()}
    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // 1700 formatted as en-US = "1,700"
    await expect(page.getByText("1,700", { exact: false })).toBeVisible();
  });

  test("displays the correct shift count (2 shifts)", async ({ page }) => {
    await page.goto("/profile");

    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // Shift-count cell shows the raw number next to the "Shifts" label.
    const shiftsSection = page.locator("text=Shifts").first();
    await expect(shiftsSection).toBeVisible();

    // The count "2" must appear somewhere in the rendered section.
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  });

  test("shows org names from history entries (E2E Corp, E2E Builders)", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("E2E Corp")).toBeVisible();
    await expect(page.getByText("E2E Builders")).toBeVisible();
  });

  test("maps 'bug' kind to 'Bug Report' label in the entry row", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Bug Report", { exact: false })).toBeVisible();
  });

  test("LABOR RECORD section is absent when count is 0", async ({ page }) => {
    // Override just the CF route to return empty history.
    await page.route("**/api/cf/labor-history", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history: [], totalPayoff: 0, count: 0 }),
      }),
    );

    await page.goto("/profile");

    // Give the page time to settle (load + fetch + render).
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("LABOR RECORD", { exact: false }),
    ).not.toBeVisible();
  });
});
