import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MODULES, getModuleForPath } from "./modules";
import { PRIMARY_NAV_ITEMS } from "./app-navigation";

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
    "/game/character",
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
    expect(subPaths).toContain("/game/character");
    expect(subPaths).toContain("/game/settings");
    expect(subPaths).toContain("/vending?from=office");
    expect(subPaths).toContain("/store/realty?from=office");
    expect(subPaths).toContain("/bots");
    expect(subPaths).toContain("/business");
  });
});

// ─── 2. Source-scan: retired browser gameplay routes land on the desktop client

const APP_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../App.tsx"),
  "utf8",
);

describe("retired gameplay routes in App.tsx", () => {
  it('keeps a /game route that lands on the desktop client', () => {
    const hasGameRoute = /path=["']\/game["']/.test(APP_SRC);
    const redirectsToDesktop = /path=["']\/game["'][^>]*>[\s\S]{0,100}<Redirect to=["']\/desktop["']/.test(APP_SRC);
    expect(
      hasGameRoute,
      'App.tsx must contain a Route for "/game"',
    ).toBe(true);
    expect(redirectsToDesktop, 'The retired browser game must land on the desktop client').toBe(true);
  });

  it("the /game route appears before office handling", () => {
    const gameIdx = APP_SRC.indexOf('path="/game"');
    expect(gameIdx, 'Could not find path="/game" in App.tsx').toBeGreaterThan(
      -1,
    );
    const officeIdx = APP_SRC.indexOf('path="/office"', gameIdx);
    expect(officeIdx, 'Could not find path="/office" after path="/game"').toBeGreaterThan(gameIdx);
  });
});

// ─── 3. Shared desktop/mobile primary navigation ─────────────────────────────

describe("PRIMARY_NAV_ITEMS — exactly one OFFICE tab", () => {
  it("contains exactly one entry with id 'office'", () => {
    const officeEntries = PRIMARY_NAV_ITEMS.filter(
      (item) => item.id === "office",
    );
    expect(
      officeEntries.length,
      `PRIMARY_NAV_ITEMS must have exactly 1 office entry, found ${officeEntries.length}`,
    ).toBe(1);
  });

  it("the office tab has the emerald accent (distinguishes it visually)", () => {
    const office = PRIMARY_NAV_ITEMS.find((item) => item.id === "office");
    expect(office?.accent).toBe("emerald");
  });

  it("the office tab routes to /office", () => {
    const office = PRIMARY_NAV_ITEMS.find((item) => item.id === "office");
    expect(office?.path).toBe("/office");
  });
});
