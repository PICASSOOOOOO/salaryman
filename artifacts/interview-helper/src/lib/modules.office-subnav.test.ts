import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MODULES, getModuleForPath } from "./modules";
import { PRIMARY_NAV_ITEMS } from "./app-navigation";
import { PABLO_AUTOMATION_CAPABILITIES } from "@/components/PabloAutomationNav";

// ─── 1. getModuleForPath returns the OFFICE module (MODULES[1]) ───────────────

const OFFICE_MODULE = MODULES[1];

describe("getModuleForPath — office module (MODULES[1])", () => {
  it("MODULES[1] is the office module", () => {
    expect(OFFICE_MODULE.id).toBe("office");
  });

  const officePaths = [
    "/office",
    "/my-office",
    "/office/some-sub",
    "/game/economy",
    "/game/bank",
    "/game/settings",
  ];

  for (const p of officePaths) {
    it(`"${p}" resolves to the office module`, () => {
      const mod = getModuleForPath(p);
      expect(
        mod,
        `Expected "${p}" to map to the office module but got ${mod?.id ?? "null"}`,
      ).not.toBeNull();
      expect(mod!.id).toBe("office");
    });
  }

  it("bare /game does NOT resolve to the office module", () => {
    // /game owns the GameHub route; getModuleForPath must not claim it as an
    // office sub-page.
    const mod = getModuleForPath("/game");
    expect(mod?.id ?? null).not.toBe("office");
  });

  it("all remaining game sub-nav pages are present as sub entries in the office module", () => {
    const subPaths = OFFICE_MODULE.subs.map((s) => s.path);
    expect(subPaths).toContain("/game/economy");
    expect(subPaths).toContain("/game/bank");
    expect(subPaths).toContain("/game/settings");
    expect(subPaths).toContain("/vending?from=office");
    expect(subPaths).toContain("/store/realty?from=office");
    expect(subPaths).not.toContain("/bots");
    expect(subPaths).toContain("/business");
  });

  it("keeps automation capabilities under PABLO PRIME and other tools separate", () => {
    const automation = MODULES.find((module) => module.id === "bots");
    expect(automation?.label).toBe("PABLO PRIME");
    expect(automation?.subs).toHaveLength(0);
    expect(PABLO_AUTOMATION_CAPABILITIES.map((capability) => capability.path)).toEqual([
      "/business/autopilot?cap=workflows",
      "/business/autopilot?cap=agents",
      "/business/autopilot?cap=ads",
      "/business/autopilot?cap=secretary",
    ]);
    expect(getModuleForPath("/pablo/deck")?.id).toBe("pablo");
    expect(getModuleForPath("/phone/coach")?.id).toBe("phone");
    expect(MODULES.find((module) => module.id === "phone")?.subs.map((sub) => sub.path))
      .toContain("/phone/coach");
    expect(MODULES.find((module) => module.id === "pablo")?.subs.map((sub) => sub.path))
      .toContain("/pablo/deck");
    expect(MODULES.find((module) => module.id === "office")?.subs.map((sub) => sub.path))
      .not.toContain("/bots");
  });

  it("places organization routes inside the Business module", () => {
    const business = MODULES.find((module) => module.id === "business");
    expect(business?.subs.some((sub) => sub.path === "/organizations")).toBe(true);
    expect(getModuleForPath("/organizations")?.id).toBe("business");
    expect(getModuleForPath("/org")?.id).toBe("business");
  });
});

// ─── 2. Source-scan: gameplay routes land on the desktop client only in PTU

const APP_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../App.tsx"),
  "utf8",
);

describe("retired gameplay routes in App.tsx", () => {
  it('keeps a /game route that lands on the desktop client', () => {
    const hasGameRoute = /path=["']\/game["']/.test(APP_SRC);
    const redirectsToDesktop = APP_SRC.includes(
      'path="/game">{() => <GameLock><Redirect to="/desktop" /></GameLock>}</Route>',
    );
    expect(
      hasGameRoute,
      'App.tsx must contain a Route for "/game"',
    ).toBe(true);
    expect(redirectsToDesktop, 'The game route must be release-gated before it reaches the desktop client').toBe(true);
  });

  it("release-gates the desktop download route", () => {
    expect(APP_SRC).toContain('<Route path="/desktop">{() => <GameLock><DesktopDownload /></GameLock>}</Route>');
  });

  it("the /game route appears before office handling", () => {
    const gameIdx = APP_SRC.indexOf('path="/game"');
    expect(gameIdx, 'Could not find path="/game" in App.tsx').toBeGreaterThan(
      -1,
    );
    const officeIdx = APP_SRC.indexOf('path="/office"', gameIdx);
    expect(officeIdx, 'Could not find path="/office" after path="/game"').toBeGreaterThan(gameIdx);
  });

  it("handles the specific legacy game-office route before the game wildcard", () => {
    const specificIdx = APP_SRC.indexOf('path="/game/office"');
    const wildcardIdx = APP_SRC.indexOf('path="/game/*"');
    expect(specificIdx).toBeGreaterThan(-1);
    expect(wildcardIdx).toBeGreaterThan(-1);
    expect(specificIdx).toBeLessThan(wildcardIdx);
  });
});

// ─── 3. Shared desktop/mobile primary navigation ─────────────────────────────

describe("PRIMARY_NAV_ITEMS — desktop client entry", () => {
  it("contains exactly one entry with id 'office'", () => {
    const officeEntries = PRIMARY_NAV_ITEMS.filter(
      (item) => item.id === "office",
    );
    expect(
      officeEntries.length,
      `PRIMARY_NAV_ITEMS must have exactly 1 office entry, found ${officeEntries.length}`,
    ).toBe(1);
  });

  it("uses the green desktop-client accent", () => {
    const office = PRIMARY_NAV_ITEMS.find((item) => item.id === "office");
    expect(office?.accent).toBe("green");
  });

  it("routes browser navigation to the desktop download", () => {
    const office = PRIMARY_NAV_ITEMS.find((item) => item.id === "office");
    expect(office?.path).toBe("/desktop");
  });
});
