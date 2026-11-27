import { expect, test, type Page, type Route } from "@playwright/test";

type WorkspaceLayout = {
  version: 2;
  slots: (string | null)[];
};

async function installSignedInWorkspaceApi(page: Page, initialLayout: WorkspaceLayout | null = null) {
  let accountLayout = initialLayout;
  let writes = 0;

  const fulfillJson = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path.endsWith("/api/auth/user")) {
      return fulfillJson(route, {
        user: { id: "workspace-playwright-user", email: "workspace@example.test" },
      });
    }
    if (path.endsWith("/api/world/onboarding-status")) {
      return fulfillJson(route, { completed: true });
    }
    if (path.endsWith("/api/world/heartbeat")) {
      return fulfillJson(route, { ok: true });
    }
    if (path.endsWith("/api/account/settings")) {
      return fulfillJson(route, { settings: null, lowGfx: null });
    }
    if (path.endsWith("/api/alpha/me")) {
      return fulfillJson(route, {
        applications: [],
        tester: null,
        dev: null,
        isApprovedTester: false,
        isApprovedDev: false,
        isAdmin: false,
      });
    }
    if (path.endsWith("/api/chat/channels")) {
      return fulfillJson(route, {
        pabloChannelId: 42,
        unreadCounts: { "42": 3 },
      });
    }
    if (path.endsWith("/api/notifications")) {
      return fulfillJson(route, { notifications: [], unreadCount: 44 });
    }
    if (path.endsWith("/api/account/workspace")) {
      if (method === "GET") return fulfillJson(route, { layout: accountLayout });
      if (method === "PUT") {
        const contentType = route.request().headers()["content-type"] ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return fulfillJson(route, { error: "JSON Content-Type is required" }, 400);
        }
        accountLayout = route.request().postDataJSON() as WorkspaceLayout;
        writes += 1;
        return fulfillJson(route, { layout: accountLayout });
      }
    }

    // Keep ancillary app chrome isolated from real services in this browser
    // test while allowing read requests to retain their normal 401 behavior.
    if (method !== "GET" && method !== "HEAD") {
      return fulfillJson(route, { ok: true });
    }
    return route.continue();
  });
  await page.route((url) => url.searchParams.get("embed") === "1", async (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body><main>${url.pathname}</main></body></html>`,
    });
  });

  return {
    get layout() {
      return accountLayout;
    },
    get writes() {
      return writes;
    },
  };
}

test("signed-in workspace edits sync, survive reload, and fit a phone viewport", async ({ page }) => {
  const account = await installSignedInWorkspaceApi(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "salaryman-workspace-slots:workspace-playwright-user",
      JSON.stringify({ version: 2, slots: ["/workspace/notepad", "/workspace/calculator"] }),
    );
  });
  await page.goto("/workspace");

  await expect(page.getByTestId("workspace-home")).toBeVisible();
  await expect(page.getByTestId("add-workspace-feature")).toBeEnabled();
  await expect.poll(() => account.layout).not.toBeNull();

  await page.getByTestId("add-workspace-feature").click();
  await page.getByTestId("workspace-feature-group-creative").click();
  await page.getByTestId("workspace-feature-option-creative-scene").click();
  await expect(page.getByTestId("workspace-slot-3")).toContainText("SCENE COMPOSER");
  await page.getByTestId("drag-slot-1").dragTo(page.getByTestId("workspace-slot-2"));

  await page.getByTestId("expand-feature-3").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("focused-feature-frame"))
    .toHaveAttribute("src", /creative\/scene/);
  await page.getByTestId("close-focused-workspace").click();

  await expect.poll(() => account.layout?.slots.slice(0, 2))
    .toEqual(["/workspace/calculator", "/workspace/notepad"]);
  await expect.poll(() => account.layout?.slots[2]).toBe("/creative/scene");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("workspace-home")).toBeVisible();
  const savedWidget = page.getByTestId("workspace-slot-3");
  await expect(savedWidget).toContainText("SCENE COMPOSER");
  await savedWidget.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.getByTestId("widget-frame-3")).toHaveAttribute("src", /creative\/scene/);
});

test("an existing account layout wins over stale browser storage", async ({ page }) => {
  const serverLayout: WorkspaceLayout = {
    version: 2,
    slots: ["/workspace/calculator", "/workspace/notepad"],
  };
  const account = await installSignedInWorkspaceApi(page, serverLayout);
  await page.addInitScript(() => {
    localStorage.setItem(
      "salaryman-workspace-slots:workspace-playwright-user",
      JSON.stringify({ version: 2, slots: ["/pablo", "/phone"] }),
    );
  });

  await page.goto("/workspace");
  await expect(page.getByTestId("workspace-home")).toBeVisible();
  await expect(page.getByTestId("workspace-slot-1")).toContainText("CALCULATOR");
  await expect(page.getByTestId("workspace-slot-2")).toContainText("NOTES");
  expect(account.writes).toBe(0);
});

test("a menu selection opens as a widget without changing a full saved layout", async ({ page }) => {
  const layout: WorkspaceLayout = {
    version: 2,
    slots: [
      "/pablo",
      "/workspace/notepad",
      "/workspace/calculator",
      "/business/crm",
      "/business/autopilot",
      "/comms",
      "/creative/classroom",
      "/1999",
      "/creative/media",
    ],
  };
  const account = await installSignedInWorkspaceApi(page, layout);
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("start-work-menu-trigger")).toBeVisible();

  await page.getByTestId("start-work-menu-trigger").click();
  await page.locator('.workspace-menu-link[href="/hummingbird"]').click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("dialog", { name: "HUMMINGBIRD workspace" })).toBeVisible();
  await expect(page.getByTestId("focused-feature-frame")).toHaveAttribute("src", /hummingbird/);
  expect(account.layout).toEqual(layout);
});

test("an empty widget plus button opens the picker and fills that tile", async ({ page }) => {
  await installSignedInWorkspaceApi(page, { version: 2, slots: [null] });
  await page.goto("/workspace", { waitUntil: "domcontentloaded" });

  const tilePlus = page.getByTestId("add-feature-1");
  await expect(tilePlus).toBeEnabled();
  await tilePlus.click();
  await page.getByTestId("workspace-feature-option-pablo-main").click();

  await expect(page.getByTestId("workspace-slot-1")).toContainText("PABLO AI");
  await expect(page.getByTestId("widget-frame-1")).toHaveAttribute("src", /pablo/);
});

test("shows PABLO unread state and keeps the notification count clear of the bell", async ({ page }) => {
  await installSignedInWorkspaceApi(page, { version: 2, slots: ["/pablo"] });
  await page.goto("/workspace", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("workspace-pablo-unread-1")).toHaveText("3");
  const notificationButton = page.locator('button[title="Notifications"]');
  const bell = await notificationButton.locator("svg").boundingBox();
  const badge = await notificationButton.locator("span").boundingBox();
  expect(bell).not.toBeNull();
  expect(badge).not.toBeNull();
  const overlaps = Boolean(
    bell && badge &&
    bell.x < badge.x + badge.width &&
    bell.x + bell.width > badge.x &&
    bell.y < badge.y + badge.height &&
    bell.y + bell.height > badge.y,
  );
  expect(overlaps).toBe(false);

  await page.getByTestId("start-work-menu-trigger").click();
  await expect(page.locator(".workspace-menu-featured h3")).toHaveText("FEATURED");
  const groupLabels = await page.locator(".workspace-menu-group h3").allTextContents();
  expect(groupLabels).toEqual([
    "PAID FEATURES",
    "RUN YOUR BUSINESS",
    "MAKE & BUILD",
    "ACCOUNT",
    "OFFICE",
    "REACH & GROW",
  ]);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("workspace-pablo-unread-1")).toHaveText("3");
  await expect(page.getByTestId("start-work-menu-trigger")).toBeVisible();
  await page.getByTestId("start-work-menu-trigger").click();
  const menuWidth = await page.locator(".workspace-navigation-menu").evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(menuWidth.scroll).toBeLessThanOrEqual(menuWidth.client);
});

test.describe("narrow phone workspace", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows one widget at a time", async ({ page }) => {
    await installSignedInWorkspaceApi(page, {
      version: 2,
      slots: ["/workspace/notepad", "/workspace/calculator"],
    });

    await page.goto("/workspace", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("workspace-home")).toBeVisible();
    await expect(page.locator(".workspace-slot.is-visible")).toHaveCount(1);
    await expect(page.getByTestId("next-workspace-widget")).toBeVisible();
  });
});
