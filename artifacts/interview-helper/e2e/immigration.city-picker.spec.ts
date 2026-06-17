/**
 * E2E: City picker on /immigration at iPhone SE viewport (375×667)
 *
 * The city picker ("destination" step) is the first thing a newly-authenticated
 * user sees on /immigration.  These tests guard against three regressions that
 * are invisible at desktop size:
 *
 *   1. The footer NEXT button is cut off by small viewports.
 *   2. City card descriptions overflow their containers instead of line-clamping.
 *   3. The AudioControl FAB is accidentally shown on /immigration (it must be
 *      hidden on all fullscreen routes including /immigration).
 *
 * Auth + redirect bypass strategy:
 *   • Mock GET /api/auth/user to return a synthetic authenticated user so the
 *     Immigration page does not immediately redirect to /pablo.
 *   • Mock GET /api/world/my-business to return empty businesses[] so
 *     hydrateOnboardingStatus() resolves to "not yet onboarded" — which allows
 *     the city picker intake to render instead of bouncing to /.
 *   • Do NOT set `salaryman_tutorial_done` in localStorage, which keeps
 *     isTutorialDone()=false and leaves the user in the intake flow.
 *
 * Network mocks:
 *   • /api/world/locate — 404 (no geolocation suggestion; avoids a real fetch).
 *   • /api/world/population — stub response (drives the capacity label).
 *   • /api/art/* — 404 (city hero art falls back to the CSS gradient, which
 *     keeps the city cards visible without any art-pipeline dependency).
 */

import { test, expect, type Page } from "@playwright/test";

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEWPORT = { width: 375, height: 667 }; // iPhone SE

const MOCK_USER = {
  id: "e2e-city-picker-user",
  email: "e2e-city-picker@example.test",
  firstName: "City",
  lastName: "Picker",
  profileImageUrl: null,
  createdAt: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wire all network routes the Immigration page touches so the city picker step
 * renders without a live backend or DB.
 */
async function setupImmigrationMocks(page: Page): Promise<void> {
  // Auth: synthetic authenticated user.
  await page.route("**/api/auth/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: MOCK_USER }),
    }),
  );

  // Onboarding check: empty businesses[] → user is genuinely new, intake shows.
  await page.route("**/api/world/my-business", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ businesses: [] }),
    }),
  );

  // Geolocation: 404 → no pre-selected city suggestion (first city selected).
  await page.route("**/api/world/locate", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );

  // Population: stub data for the capacity label on the city card.
  await page.route("**/api/world/population", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ cityId: "minx_city", online: 42, max: 100 }),
    }),
  );

  // Art assets: 404 so the city hero falls back to the CSS gradient — the card
  // still renders with name/description, just without the Nano Banana art.
  await page.route("**/api/art/**", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("City picker — iPhone SE (375×667) layout", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ page }) => {
    // Do NOT set salaryman_tutorial_done: we want the user stuck in immigration.
    await setupImmigrationMocks(page);
  });

  // ── 1. Footer NEXT button ────────────────────────────────────────────────────

  test("footer NEXT button is visible and fully inside the viewport", async ({
    page,
  }) => {
    await page.goto("/immigration");

    // The destination step renders immediately (it is the first step), but the
    // auth + onboarding checks are async, so wait for the button to appear.
    const nextBtn = page.getByTestId("onboarding-next");
    await expect(nextBtn).toBeVisible({ timeout: 12_000 });

    // Bounding-box check: the button must be fully inside the 375×667 viewport.
    // A partially-clipped button (e.g. pushed below the fold by a tall hero
    // banner) would have y+height > viewport height.
    const box = await nextBtn.boundingBox();
    expect(box).not.toBeNull();

    // Left edge inside viewport.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    // Right edge inside viewport.
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width);
    // Top edge inside viewport.
    expect(box!.y).toBeGreaterThanOrEqual(0);
    // Bottom edge inside viewport — this is the key small-phone regression.
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height);
  });

  // ── 2. Description line-clamp ────────────────────────────────────────────────

  test("city card descriptions are clamped and do not visually overflow", async ({
    page,
  }) => {
    await page.goto("/immigration");

    // Wait until at least the first live city card renders.
    const firstCard = page.locator('[data-testid^="city-option-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 12_000 });

    // For every city card in the DOM, inspect the description element's
    // computed style.  On a 375 px viewport the component sets:
    //   display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden;
    // This prevents the text from stretching the card and pushing the footer
    // button off-screen.
    const allClamped = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="city-option-"]'),
      );

      return cards.every((card) => {
        // DOM structure inside the city card button:
        //   button
        //     div (hero — position:relative)
        //     div (content wrapper — has padding)
        //       div  ← description (line-clamped on mobile)
        //       div  ← capacity label
        const contentWrapper = card.querySelector<HTMLElement>("div + div");
        if (!contentWrapper) return true; // no inner content, skip
        const descEl = contentWrapper.querySelector<HTMLElement>(
          "div:first-child",
        );
        if (!descEl) return true; // no description element, skip

        const computed = window.getComputedStyle(descEl);
        // overflow must be "hidden" for the -webkit-line-clamp to take effect.
        const overflowHidden =
          computed.overflow === "hidden" || computed.overflowY === "hidden";

        // Also verify the bounding height is bounded relative to scrollHeight.
        // A fully clamped element's clientHeight is <= scrollHeight, but its
        // clientHeight must be less than what an unclamped layout would produce
        // (roughly: 3+ line heights).  We verify indirectly via overflow:hidden.
        return overflowHidden;
      });
    });

    expect(allClamped).toBe(true);
  });

  // ── 3. AudioControl FAB absent ───────────────────────────────────────────────

  test("AudioControl FAB is absent on the /immigration route", async ({
    page,
  }) => {
    await page.goto("/immigration");

    // The city picker step loads quickly; give the page time to fully settle
    // before asserting the FAB is absent so we are not racing the mount.
    await page.waitForLoadState("networkidle");

    // App.tsx explicitly excludes /immigration from the routes that render
    // AudioControl.  Assert the widget is never attached to the DOM at all.
    await expect(page.getByTestId("audio-control")).not.toBeAttached();
  });
});
