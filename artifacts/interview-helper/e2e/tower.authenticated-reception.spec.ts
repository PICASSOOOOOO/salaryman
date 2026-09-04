/**
 * E2E: first authenticated entry to the physical Tower lobby.
 *
 * The default test uses a browser-only Clerk module replacement because the
 * preview environment cannot complete an OAuth sign-in. An opt-in companion
 * test below uses the normal Clerk UI when TOWER_E2E_EMAIL and
 * TOWER_E2E_PASSWORD are injected by the test environment.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const MOCK_USER = {
  id: "e2e-tower-reception-user",
  email: "e2e-tower-reception@example.test",
  firstName: "Tower",
  lastName: "Tester",
  profileImageUrl: null,
};

const MOCK_SAVE = {
  slotIndex: 0,
  charName: "TOWER TESTER",
  charClass: "salaryman",
  level: 1,
  lastZone: "SHADOW TOWER",
  playtime: 0,
  data: {},
};

const REAL_CLERK_EMAIL = process.env.TOWER_E2E_EMAIL;
const REAL_CLERK_PASSWORD = process.env.TOWER_E2E_PASSWORD;
const HAS_REAL_CLERK_CREDENTIALS = Boolean(
  REAL_CLERK_EMAIL && REAL_CLERK_PASSWORD,
);

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function setupTowerApi(page: Page): Promise<void> {
  await page.route("**/api/world/my-business", (route) =>
    fulfillJson(route, { businesses: [] }),
  );
  await page.route("**/api/world/home-city", (route) =>
    fulfillJson(route, { homeCityId: "minx_city" }),
  );
  await page.route("**/api/world/heartbeat", (route) => fulfillJson(route, {}));
  await page.route("**/api/onboard-housing/quote", (route) =>
    fulfillJson(route, { startingBalance: 200_000 }),
  );
  await page.route("**/api/salaryman/character/templates", (route) =>
    fulfillJson(route, { templates: [] }),
  );
  await page.route("**/api/world/locate", (route) =>
    fulfillJson(route, {}, 404),
  );
  await page.route("**/api/world/population", (route) =>
    fulfillJson(route, { cityId: "minx_city", online: 1, max: 100 }),
  );
  await page.route("**/api/salaryman/saves", (route) =>
    fulfillJson(route, { saves: [MOCK_SAVE] }),
  );
  await page.route("**/api/salaryman/saves/0", (route) =>
    fulfillJson(route, { save: MOCK_SAVE }),
  );
  await page.route("**/api/world/register", (route) =>
    fulfillJson(route, { business: { id: "e2e-tower-business" } }, 201),
  );

  await page.addInitScript(() => {
    localStorage.removeItem("salaryman_tutorial_done");
    localStorage.removeItem("salaryman_building_onboarding_v1");
    localStorage.removeItem("salaryman_tower_lockdown_v1");
    localStorage.removeItem("sm_save");
  });
}

async function setupStubClerk(page: Page): Promise<void> {
  // Replace only the browser bundle consumed by the app. The production
  // Clerk provider and auth hook remain unchanged.
  await page.route("**/node_modules/.vite/deps/@clerk_react.js*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        export const ClerkProvider = ({ children }) => children;
        export const useAuth = () => ({ isSignedIn: true });
        const user = ${JSON.stringify({
          id: MOCK_USER.id,
          externalId: null,
          primaryEmailAddress: { emailAddress: MOCK_USER.email },
          firstName: MOCK_USER.firstName,
          lastName: MOCK_USER.lastName,
          imageUrl: "",
        })};
        export const useUser = () => ({ isLoaded: true, user });
        export const useClerk = () => ({
          addListener: () => () => {},
          signOut: async () => {},
        });
        export const SignIn = () => null;
        export const SignUp = () => null;
      `,
    }),
  );
}

async function signInWithRealClerk(page: Page): Promise<void> {
  if (!REAL_CLERK_EMAIL || !REAL_CLERK_PASSWORD) {
    throw new Error(
      "Real Clerk Tower smoke test requires TOWER_E2E_EMAIL and TOWER_E2E_PASSWORD.",
    );
  }

  await page.goto("/sign-in?returnTo=%2Ftower", {
    waitUntil: "domcontentloaded",
  });

  const identifier = page
    .locator('input[name="identifier"], input[type="email"]')
    .first();
  await expect(identifier).toBeVisible({ timeout: 15_000 });
  await identifier.fill(REAL_CLERK_EMAIL);
  await page
    .getByRole("button", { name: /continue/i })
    .first()
    .click();

  const password = page
    .locator('input[name="password"], input[type="password"]')
    .first();
  await expect(password).toBeVisible({ timeout: 15_000 });
  await password.fill(REAL_CLERK_PASSWORD);
  await page
    .getByRole("button", { name: /continue|sign in/i })
    .first()
    .click();

  const verificationCode = page
    .locator('input[name*="code" i], input[inputmode="numeric"]')
    .first();
  if (await verificationCode.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new Error(
      "The configured Tower test account requires a verification code. Use a verified password-enabled disposable Clerk account.",
    );
  }

  await page.waitForURL(/\/tower(?:$|[?#])/, { timeout: 20_000 });
}

async function assertTowerReceptionHandoff(page: Page): Promise<void> {
  // The authenticated route is the physical lobby, not the anonymous entry.
  await expect(page.getByTestId("lobby-map")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("tower-entry")).not.toBeAttached();

  // Reception is open on the first render; no arrival interstitial gets a
  // chance to appear between the lobby and the receptionist.
  const receptionDialog = page.getByRole("dialog", {
    name: "Receptionist onboarding",
  });
  await expect(receptionDialog).toBeVisible();
  await expect(
    receptionDialog.getByRole("heading", { name: "FRONT DESK" }),
  ).toBeVisible();
  await expect(
    receptionDialog.getByText(/ARRIVAL|BRIEFING|LOCKDOWN/i),
  ).not.toBeVisible();

  await page.getByTestId("finish-reception-onboarding").click();

  // The lobby venue intentionally exposes only the start choice and the
  // optional company name, rather than the retired multi-screen ceremony.
  await expect(page.getByTestId("onboarding-choice-business")).toHaveCount(1);
  await expect(page.getByTestId("onboarding-choice-unemployed")).toHaveCount(1);
  await expect(page.getByPlaceholder("Your company")).toBeVisible();
  await expect(
    page.getByText("BUSINESS DETAILS", { exact: true }),
  ).not.toBeAttached();
  await expect(
    page.getByText("HEADCOUNT & PAYROLL", { exact: true }),
  ).not.toBeAttached();
  await expect(
    page.getByText("Set up your address.", { exact: true }),
  ).not.toBeAttached();

  await page.getByPlaceholder("Your company").fill("Tower Test Company");
  await page.getByTestId("onboarding-submit").click();

  // Saving completes the one reception handoff and returns to the lobby.
  await expect(receptionDialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("lobby-map")).toBeVisible();
  await expect(
    page.getByText("TOWER OPEN · USE THE ELEVATOR OR STAIRS"),
  ).toBeVisible();
  await expect(page.getByText(/BRIEFING|LOCKDOWN/i)).not.toBeVisible();
}

test.describe("Tower entry — authenticated new user", () => {
  test.beforeEach(async ({ page }) => {
    await setupTowerApi(page);
    await setupStubClerk(page);
  });

  test("hands the user from reception straight into the compact check-in", async ({
    page,
  }) => {
    await page.goto("/tower", { waitUntil: "domcontentloaded" });
    await assertTowerReceptionHandoff(page);
  });
});

test.describe("Tower entry — authenticated real Clerk session", () => {
  test.skip(
    !HAS_REAL_CLERK_CREDENTIALS,
    "Set TOWER_E2E_EMAIL and TOWER_E2E_PASSWORD in the test environment to run the real Clerk smoke test.",
  );

  test.beforeEach(async ({ page }) => {
    await setupTowerApi(page);
  });

  test("hands the real signed-in user from reception into the compact check-in and lobby", async ({
    page,
  }) => {
    await signInWithRealClerk(page);
    await assertTowerReceptionHandoff(page);
  });
});
