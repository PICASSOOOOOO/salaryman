import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MODULES, getModuleForPath } from "./modules";

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
    "/game/map",
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

  it("all five sub-nav pages are present as sub entries in the office module", () => {
    const subPaths = OFFICE_MODULE.subs.map((s) => s.path);
    expect(subPaths).toContain("/game/map");
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

// ─── 2. Source-scan: /game redirects to /pablo in App.tsx ────────────────────

const APP_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../App.tsx"),
  "utf8",
);

describe("/game route in App.tsx", () => {
  it('contains an authenticated <Route path="/game"> for GameHub', () => {
    const hasGameRoute = /path=["']\/game["']/.test(APP_SRC);
    const hasGameHub = /path=["']\/game["'][^>]*>[\s\S]{0,120}<GameLock><GameHub/.test(APP_SRC);
    expect(
      hasGameRoute,
      'App.tsx must contain a Route for "/game"',
    ).toBe(true);
    expect(hasGameHub, 'The /game route must keep rendering GameHub behind GameLock').toBe(true);
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

// ─── 3. Source-scan: NavBar has exactly one OFFICE primary tab ───────────────

const NAVBAR_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../components/NavBar.tsx"),
  "utf8",
);

// ─── 4. Source-scan: MobileBottomBar has exactly one OFFICE primary tab ──────

const MOBILEBAR_SRC = readFileSync(
  path.resolve(import.meta.dirname, "../components/MobileBottomBar.tsx"),
  "utf8",
);

describe("NavBar NAV_PRIMARY — exactly one OFFICE tab", () => {
  it("NAV_PRIMARY contains exactly one entry with id 'office'", () => {
    // Count { id: 'office', ... } entries inside the NAV_PRIMARY array literal.
    // We extract the array body between 'const NAV_PRIMARY = [' and the
    // first matching '];' to avoid counting unrelated occurrences.
    const arrayMatch = NAVBAR_SRC.match(
      /const NAV_PRIMARY\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(
      arrayMatch,
      "Could not locate the NAV_PRIMARY array in NavBar.tsx",
    ).not.toBeNull();

    const arrayBody = arrayMatch![1];
    const officeEntries = (arrayBody.match(/id:\s*['"]office['"]/g) ?? [])
      .length;
    expect(
      officeEntries,
      `NAV_PRIMARY must have exactly 1 office entry, found ${officeEntries}`,
    ).toBe(1);
  });

  it("the office tab has the emerald accent (distinguishes it visually)", () => {
    const arrayMatch = NAVBAR_SRC.match(
      /const NAV_PRIMARY\s*=\s*\[([\s\S]*?)\];/,
    );
    const arrayBody = arrayMatch![1];
    expect(arrayBody).toMatch(/accent:\s*['"]emerald['"]/);
  });
});

describe("MobileBottomBar PRIMARY_TABS — exactly one OFFICE tab", () => {
  it("PRIMARY_TABS contains exactly one entry with id 'office'", () => {
    const arrayMatch = MOBILEBAR_SRC.match(
      /const PRIMARY_TABS\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(
      arrayMatch,
      "Could not locate the PRIMARY_TABS array in MobileBottomBar.tsx",
    ).not.toBeNull();

    const arrayBody = arrayMatch![1];
    const officeEntries = (arrayBody.match(/id:\s*['"]office['"]/g) ?? [])
      .length;
    expect(
      officeEntries,
      `PRIMARY_TABS must have exactly 1 office entry, found ${officeEntries}`,
    ).toBe(1);
  });

  it("the office tab routes to /office", () => {
    const arrayMatch = MOBILEBAR_SRC.match(
      /const PRIMARY_TABS\s*=\s*\[([\s\S]*?)\];/,
    );
    const arrayBody = arrayMatch![1];
    // Find the office object's path field — should point to /office
    const officeObjMatch = arrayBody.match(
      /id:\s*['"]office['"][\s\S]*?path:\s*['"]([^'"]+)['"]/,
    );
    expect(
      officeObjMatch,
      "Could not find path for office entry in PRIMARY_TABS",
    ).not.toBeNull();
    expect(officeObjMatch![1]).toBe("/office");
  });
});
