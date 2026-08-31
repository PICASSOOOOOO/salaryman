// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  APP_HISTORY_DEPTH_KEY,
  APP_HISTORY_SESSION_KEY,
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  isAppNavItemActive,
  readAppHistoryDepth,
  isSafeAppHistoryState,
  shouldShowModuleSubnav,
  withAppHistoryDepth,
} from "./app-navigation";

describe("shared app navigation", () => {
  it("uses one canonical set of primary and overflow destinations", () => {
    expect(PRIMARY_NAV_ITEMS.map(item => item.id)).toEqual(["pablo", "comms", "bots", "office", "org"]);
    expect(MORE_NAV_ITEMS.map(item => item.id)).toEqual([
      "console", "business", "creative", "marketing", "settings", "profile", "admin",
    ]);
  });

  it("shares active matching across desktop and mobile renderers", () => {
    const phone = PRIMARY_NAV_ITEMS.find(item => item.id === "comms")!;
    const office = PRIMARY_NAV_ITEMS.find(item => item.id === "office")!;
    expect(isAppNavItemActive(phone, "/phone/recordings")).toBe(true);
    expect(isAppNavItemActive(office, "/game/map")).toBe(true);
    expect(isAppNavItemActive(office, "/phone")).toBe(false);
  });

  it("suppresses redundant global phone sub-navigation", () => {
    expect(shouldShowModuleSubnav("phone", 10)).toBe(false);
    expect(shouldShowModuleSubnav("business", 10)).toBe(true);
    expect(shouldShowModuleSubnav("business", 0)).toBe(false);
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