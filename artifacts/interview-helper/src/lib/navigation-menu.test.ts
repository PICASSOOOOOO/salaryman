// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isAppNavItemActive, PRIMARY_NAV_ITEMS } from "./app-navigation";
import { getModuleForPath } from "./modules";
import { PABLO_AUTOMATION_CAPABILITIES } from "@/components/PabloAutomationNav";
import {
  WORKSPACE_MENU_FEATURED,
  WORKSPACE_MENU_OFFICE,
  WORKSPACE_MENU_OS,
  WORKSPACE_MENU_SECTIONS,
  countWorkspaceMenuDestinations,
  filterWorkspaceMenuEntry,
  type WorkspaceMenuEntry,
} from "./navigation-menu";

function flatten(entries: WorkspaceMenuEntry[]): WorkspaceMenuEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])]);
}

const menuEntries = [
  WORKSPACE_MENU_OFFICE,
  ...WORKSPACE_MENU_SECTIONS.flatMap((section) => section.entries),
  WORKSPACE_MENU_OS,
] as WorkspaceMenuEntry[];
const menuDestinations = flatten(menuEntries);

describe("consolidated workspace navigation", () => {
  it("keeps Pablo AI featured while paid groups lead the categorized menu", () => {
    expect(WORKSPACE_MENU_FEATURED).toMatchObject({
      path: "/pablo",
      label: "PABLO AI",
    });
    expect(WORKSPACE_MENU_SECTIONS[0]).toMatchObject({
      id: "pablo-ai",
      label: "PABLO AI",
      priority: 200,
    });
    expect(WORKSPACE_MENU_SECTIONS[1]).toMatchObject({
      id: "paid-features",
      label: "PAID FEATURES",
      priority: 100,
    });
  });

  it("prioritizes paid features, then orders other groups by size", () => {
    expect(WORKSPACE_MENU_SECTIONS[0]).toMatchObject({
      id: "pablo-ai",
      priority: 200,
    });
    expect(WORKSPACE_MENU_SECTIONS[1]).toMatchObject({
      id: "paid-features",
      label: "PAID FEATURES",
      priority: 100,
    });
    const otherSections = WORKSPACE_MENU_SECTIONS.slice(2);
    expect(otherSections.every((section) => section.priority < 100)).toBe(true);
    const sizes = otherSections.map((section) => countWorkspaceMenuDestinations(section.entries));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it("keeps menu destinations unique", () => {
    const paths = menuDestinations.map((entry) => entry.path);
    const duplicates = [...new Set(paths.filter((path, index) => paths.indexOf(path) !== index))];
    expect(duplicates).toEqual([]);
    expect(paths.filter((path) => path === "/pablo/deck")).toHaveLength(1);
  });

  it("keeps direct feature destinations and SALARYMAN OS in the footer", () => {
    const paths = new Set(menuDestinations.map((entry) => entry.path));
    expect(PABLO_AUTOMATION_CAPABILITIES.map(({ path }) => path)).toEqual([
      "/business/autopilot?cap=workflows",
      "/business/autopilot?cap=agents",
      "/business/autopilot?cap=ads",
      "/business/autopilot?cap=secretary",
    ]);
    expect(paths).toContain("/business/autopilot");
    expect(paths).toContain("/phone");
    expect(paths).toContain("/business");
    expect(paths).toContain("/creative/design");
    expect(paths).toContain("/creative/writer");
    expect(paths).toContain("/desktop");
    expect(WORKSPACE_MENU_OS.label).toBe("SALARYMAN OS");
  });

  it("keeps menu groups free of nested destination lists and settings shortcuts", () => {
    for (const section of WORKSPACE_MENU_SECTIONS) {
      for (const entry of section.entries) {
        expect(entry.children).toBeUndefined();
        expect("settingsPath" in entry).toBe(false);
      }
    }
  });

  it("keeps CALLL HOME as a direct feature link rather than a dropdown branch", () => {
    const section = WORKSPACE_MENU_SECTIONS.find(({ id }) => id === "paid-features");
    const calllHome = section?.entries[0];
    expect(calllHome?.path).toBe("/phone");
    expect(calllHome?.children).toBeUndefined();
  });

  it("links to the Business hub without nested tool destinations", () => {
    const business = WORKSPACE_MENU_SECTIONS.find(({ id }) => id === "business")?.entries
      .find(({ path }) => path === "/business");
    expect(business?.children).toBeUndefined();
  });

  it("uses section names that do not repeat their feature labels", () => {
    for (const section of WORKSPACE_MENU_SECTIONS.filter(({ id }) => id !== "pablo-ai")) {
      const rootLabels = section.entries.map((entry) => entry.label.trim().toLowerCase());
      expect(rootLabels, `${section.label} should not repeat a destination label`)
        .not.toContain(section.label.trim().toLowerCase());
    }
  });

  it("keeps paid automation under the PABLO AUTOMATION feature", () => {
    const paid = WORKSPACE_MENU_SECTIONS.find(({ id }) => id === "paid-features");
    const automation = paid?.entries.find(({ path }) => path === "/business/autopilot");
    expect(automation).toMatchObject({ id: "pablo-automation", label: "PABLO AUTOMATION" });
    expect(automation?.children).toBeUndefined();
    expect(PABLO_AUTOMATION_CAPABILITIES.map(({ path }) => path)).toEqual([
      "/business/autopilot?cap=workflows",
      "/business/autopilot?cap=agents",
      "/business/autopilot?cap=ads",
      "/business/autopilot?cap=secretary",
    ]);
    const pabloAi = WORKSPACE_MENU_SECTIONS.find(({ id }) => id === "pablo-ai");
    expect(pabloAi?.entries.map(({ path }) => path)).toEqual(["/pablo", "/pablo/deck"]);
    const marketing = WORKSPACE_MENU_SECTIONS.find(({ id }) => id === "marketing")?.entries[0];
    expect(marketing?.children).toBeUndefined();
  });

  it("keeps automation capability routes active within PABLO AUTOMATION", () => {
    for (const path of ["/bots/factory", "/phone/secretary", "/bots/ad-studio", "/marketing/ads"]) {
      expect(getModuleForPath(path)?.id, path).toBe("bots");
      expect(isAppNavItemActive(PRIMARY_NAV_ITEMS.find(({ id }) => id === "bots")!, path), path).toBe(true);
    }
    expect(getModuleForPath("/phone/coach")?.id).toBe("phone");
    expect(isAppNavItemActive(PRIMARY_NAV_ITEMS.find(({ id }) => id === "phone")!, "/phone/coach")).toBe(true);
    expect(getModuleForPath("/pablo/deck")?.id).toBe("pablo");
    expect(isAppNavItemActive(PRIMARY_NAV_ITEMS.find(({ id }) => id === "pablo")!, "/pablo/deck")).toBe(true);
  });

  it("filters SALARYMAN OS like the other destinations", () => {
    expect(filterWorkspaceMenuEntry(WORKSPACE_MENU_OS, "business", false)).toBeNull();
    expect(filterWorkspaceMenuEntry(WORKSPACE_MENU_OS, "salaryman", false)).toMatchObject({
      label: "SALARYMAN OS",
      path: "/desktop",
    });
  });

  it("does not expose nested account-only tools in the workspace menu", () => {
    const admin = menuDestinations.find((entry) => entry.path === "/profile/admin");
    expect(admin).toBeUndefined();
  });

  it("filters nested staff-only destinations even when a parent matches search", () => {
    const staffOnlyChild: WorkspaceMenuEntry = {
      id: "admin",
      path: "/profile/admin",
      label: "ADMIN",
      icon: WORKSPACE_MENU_SECTIONS[0].entries[0].icon,
      staffOnly: true,
    };
    const parent: WorkspaceMenuEntry = {
      id: "account-menu",
      path: "/account",
      label: "ACCOUNT",
      icon: WORKSPACE_MENU_SECTIONS[0].entries[0].icon,
      children: [staffOnlyChild],
    };

    expect(filterWorkspaceMenuEntry(parent, "", false)?.children).toEqual([]);
    expect(filterWorkspaceMenuEntry(parent, "account", false)?.children).toEqual([]);
    expect(filterWorkspaceMenuEntry(parent, "account", true)?.children).toContainEqual(staffOnlyChild);
  });

  it("places requested tools in their intended groups", () => {
    const sections = new Map(WORKSPACE_MENU_SECTIONS.map(({ id, entries }) => [id, flatten(entries)]));
    const creative = sections.get("creative");
    const lab = creative?.find((entry) => entry.id === "lab");
    expect(lab?.label).toBe("1999");
    expect(creative?.find((entry) => entry.id === "hummingbird")?.path).toBe("/hummingbird");

    const marketing = sections.get("marketing")?.find((entry) => entry.id === "marketing");
    expect(marketing?.path).toBe("/marketing/command");
    const business = sections.get("business");
    expect(business?.some((entry) => entry.path === "/business")).toBe(true);
    expect(business?.some((entry) => entry.path === "/organizations")).toBe(true);
    expect(business?.some((entry) => entry.path === "/workspace/calculator")).toBe(true);
    expect(business?.some((entry) => entry.path === "/workspace/notepad")).toBe(true);
    const account = sections.get("settings");
    expect(account?.some((entry) => entry.path === "/profile")).toBe(true);
    expect(account?.some((entry) => entry.path === "/settings")).toBe(true);
    const hemingway = sections.get("creative")?.find((entry) => entry.path === "/creative/writer");
    expect(hemingway?.children).toBeUndefined();
    const office = sections.get("office");
    expect(office?.some((entry) => entry.path === "/comms")).toBe(true);
    expect(WORKSPACE_MENU_OFFICE).toMatchObject({ path: "/workspace", label: "THE OFFICE" });
    expect(WORKSPACE_MENU_OS.path).toBe("/desktop");
    expect(menuDestinations.some((entry) => entry.path === "/pledge")).toBe(false);
    expect(menuDestinations.some((entry) => ["/tower", "/game/economy", "/game/bank", "/game/settings"].includes(entry.path))).toBe(false);
    const automation = menuDestinations.filter((entry) => entry.path === "/business/autopilot");
    expect(automation).toHaveLength(1);
    expect(automation[0]).toMatchObject({ label: "PABLO AUTOMATION" });
    expect(automation[0].children).toBeUndefined();
    expect("settingsPath" in automation[0]).toBe(false);
  });
});
