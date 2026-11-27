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
  shouldShowGlobalSignIn,
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
    expect(PRIMARY_NAV_ITEMS.map(item => item.id)).toEqual(["pablo", "phone", "bots", "office"]);
    expect(PRIMARY_NAV_ITEMS.slice(1, 3).every(item => (item.priority ?? 0) >= 90)).toBe(true);
    expect(MORE_NAV_ITEMS.map(item => item.id)).toEqual([
      "workspace", "calculator", "crm", "business", "org",
      "creative", "marketing", "settings", "platform", "profile", "admin", "comms",
    ]);
  });

  it("shares active matching across desktop and mobile renderers", () => {
    const office = PRIMARY_NAV_ITEMS.find(item => item.id === "office")!;
    expect(isAppNavItemActive(office, "/phone")).toBe(false);
    const pabloPrime = PRIMARY_NAV_ITEMS.find(item => item.id === "bots")!;
    expect(isAppNavItemActive(pabloPrime, "/bots/factory")).toBe(true);
  });

  it("selects only the owning feature for nested business and marketing routes", () => {
    const items = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];
    const paths = [
      "/business",
      "/business/payroll",
      "/business/crm",
      "/business/crm?tab=people",
      "/business/contacts",
      "/business/deals",
      "/business/autopilot?cap=agents",
      "/marketing",
      "/marketing/social",
      "/marketing/ads",
      "/marketing/leads",
      "/creative/brand",
      "/intel/reports",
      "/intel/goals",
      "/intel/seo",
    ];

    for (const path of paths) {
      const active = items.filter(item => isAppNavItemActive(item, path));
      expect(active.map(item => item.id), path).toHaveLength(1);
    }
    expect(items.find(item => item.id === "business") && isAppNavItemActive(items.find(item => item.id === "business")!, "/business/crm")).toBe(false);
    expect(items.find(item => item.id === "marketing") && isAppNavItemActive(items.find(item => item.id === "marketing")!, "/marketing/ads")).toBe(false);
    expect(items.find(item => item.id === "marketing") && isAppNavItemActive(items.find(item => item.id === "marketing")!, "/creative/brand")).toBe(true);
  });

  it("avoids duplicating Pablo's signed-out Start Work action", () => {
    expect(shouldShowGlobalSignIn("/pablo", false)).toBe(false);
    expect(shouldShowGlobalSignIn("/phone", false)).toBe(true);
    expect(shouldShowGlobalSignIn("/pablo", true)).toBe(false);
  });

  it("suppresses redundant global phone sub-navigation", () => {
    expect(shouldShowModuleSubnav("phone", 10, "/phone")).toBe(false);
    expect(shouldShowModuleSubnav("business", 10, "/business")).toBe(true);
    expect(shouldShowModuleSubnav("business", 10, "/organizations")).toBe(true);
    expect(shouldShowModuleSubnav("business", 10, "/org")).toBe(true);
    expect(shouldShowModuleSubnav("business", 10, "/business/crm")).toBe(false);
    expect(shouldShowModuleSubnav("business", 0, "/business")).toBe(false);
  });

  it("keeps the public homepage and authenticated Office defaults distinct", () => {
    expect(getAppHomePath(false)).toBe("/");
    expect(getAppHomePath(true)).toBe("/workspace");
    expect(getAppBackPath(false)).toBe("/");
    expect(getAppBackPath(true)).toBe("/workspace");
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