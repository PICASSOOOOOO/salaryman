// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getPabloHref,
  APP_HISTORY_DEPTH_KEY,
  APP_HISTORY_SESSION_KEY,
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  getAppBackPath,
  getAppHomePath,
  isAppNavItemActive,
  readAppHistoryDepth,
  isSafeAppHistoryState,
  shouldShowModuleSubnav,
  withAppHistoryDepth,
} from "./app-navigation";

describe("getPabloHref", () => {
  it("preserves the exact Tower location as Pablo's return target", () => {
    expect(getPabloHref("/tower?focus=elevator")).toBe("/pablo?returnTo=%2Ftower%3Ffocus%3Delevator");
    expect(getPabloHref("/tower/mezzanine?focus=classifieds")).toBe("/pablo?returnTo=%2Ftower%2Fmezzanine%3Ffocus%3Dclassifieds");
  });

  it("does not create recursive or unsafe Pablo destinations", () => {
    expect(getPabloHref("/pablo")).toBe("/pablo");
    expect(getPabloHref("//other.example/path")).toBe("/pablo");
  });
});

describe("shared app navigation", () => {
  it("uses one canonical set of primary and overflow destinations", () => {
    expect(PRIMARY_NAV_ITEMS.map(item => item.id)).toEqual(["pablo", "phone", "contacts", "leads", "comms", "org", "office"]);
    expect(MORE_NAV_ITEMS.map(item => item.id)).toEqual([
      "business", "creative", "marketing", "pledge", "feedback",
      "settings", "profile", "admin",
    ]);
  });

  it("shares active matching across desktop and mobile renderers", () => {
    const office = PRIMARY_NAV_ITEMS.find(item => item.id === "office")!;
    expect(isAppNavItemActive(office, "/phone")).toBe(false);
  });

  it("suppresses redundant global phone sub-navigation", () => {
    expect(shouldShowModuleSubnav("phone", 10, "/phone")).toBe(false);
    expect(shouldShowModuleSubnav("business", 10, "/business")).toBe(true);
    expect(shouldShowModuleSubnav("business", 10, "/business/crm")).toBe(false);
    expect(shouldShowModuleSubnav("business", 0, "/business")).toBe(false);
  });

  it("keeps signed-out entry and authenticated office fallbacks distinct", () => {
    expect(getAppHomePath(false)).toBe("/");
    expect(getAppHomePath(true)).toBe("/office");
    expect(getAppBackPath(false)).toBe("/pablo");
    expect(getAppBackPath(true)).toBe("/office");
  });
});

describe("safe app history", () => {
  it("treats an untagged direct entry as having no safe back history", () => {
    expect(readAppHistoryDepth(null)).toBe(0);
    expect(readAppHistoryDepth({ other: true })).toBe(0);
  });

  it("preserves state while applying a non-negative app depth", () => {
    expect(withAppHistoryDepth({ tab: "chat" }, 2)).toEqual({ tab: "chat", [APP_HISTORY_DEPTH_KEY]: 2 });
    expect(withAppHistoryDepth(null, -5)[APP_HISTORY_DEPTH_KEY]).toBe(0);
  });

  it("only trusts back history from the current document session", () => {
    const state = { [APP_HISTORY_DEPTH_KEY]: 2, [APP_HISTORY_SESSION_KEY]: "current" };
    expect(isSafeAppHistoryState(state, "current")).toBe(true);
    expect(isSafeAppHistoryState(state, "new-document")).toBe(false);
    expect(isSafeAppHistoryState({ ...state, [APP_HISTORY_DEPTH_KEY]: 0 }, "current")).toBe(false);
  });
});