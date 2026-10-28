// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HISTORIC_MODULES } from "./historic-navigation";
import { MORE_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "./app-navigation";
import {
  WORKSPACE_MENU_BROWSE,
  WORKSPACE_MENU_FEATURED,
  WORKSPACE_MENU_SECTIONS,
  filterWorkspaceMenuEntry,
  type WorkspaceMenuEntry,
} from "./navigation-menu";

function flatten(entries: WorkspaceMenuEntry[]): WorkspaceMenuEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])]);
}

const menuEntries = [
  WORKSPACE_MENU_FEATURED,
  ...WORKSPACE_MENU_SECTIONS.flatMap((section) => section.entries),
  WORKSPACE_MENU_BROWSE,
] as WorkspaceMenuEntry[];
const menuDestinations = flatten(menuEntries);

describe("consolidated workspace navigation", () => {
  it("contains each route once after merging the overlapping menus", () => {
    const paths = menuDestinations.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("retains all primary and overflow destinations", () => {
    const paths = new Set(menuDestinations.map((entry) => entry.path));
    for (const item of [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS]) {
      expect(paths.has(item.path), `${item.label} (${item.path})`).toBe(true);
    }
  });

  it("retains every historic work-area route without duplicate menu links", () => {
    const paths = new Set(menuDestinations.map((entry) => entry.path));
    const historicPaths = HISTORIC_MODULES
      .filter((module) => module.id !== "pablo" && module.id !== "creative")
      .flatMap((module) => [module.defaultPath, ...module.subs.map((sub) => sub.path)]);
    for (const path of historicPaths) {
      expect(paths.has(path), path).toBe(true);
    }
    for (const module of MODULES.filter((candidate) => ["creative", "marketing"].includes(candidate.id))) {
      for (const sub of module.subs) expect(paths.has(sub.path), sub.path).toBe(true);
    }
  });

  it("merges the repeated contact destinations under one CONTACTS entry with context", () => {
    const contacts = WORKSPACE_MENU_SECTIONS.flatMap((section) => section.entries)
      .find((entry) => entry.id === "contacts");
    expect(contacts?.path).toBe("/contacts");
    expect(contacts?.children?.map(({ path, label, hint }) => ({ path, label, hint }))).toEqual([
      { path: "/business/contacts", label: "CONTACTS", hint: "BUSINESS" },
      { path: "/phone/contacts", label: "CONTACTS", hint: "CALLL HOME" },
    ]);
  });

  it("filters BROWSE like the other destinations", () => {
    expect(filterWorkspaceMenuEntry(WORKSPACE_MENU_BROWSE, "business", false)).toBeNull();
    expect(filterWorkspaceMenuEntry(WORKSPACE_MENU_BROWSE, "world", false)).toMatchObject({
      label: "BROWSE",
      path: "/world",
    });
  });

  it("retains ADMIN as staff-only for the shared menu to enforce", () => {
    const admin = menuDestinations.find((entry) => entry.path === "/profile/admin");
    expect(admin?.staffOnly).toBe(true);
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

  it("keeps the lab name 1999 and merges both automation names onto one route", () => {
    const entries = WORKSPACE_MENU_SECTIONS.flatMap((section) => section.entries);
    const creative = entries
      .find((entry) => entry.id === "creative");
    expect(creative?.children?.find((entry) => entry.id === "lab")?.label).toBe("1999");
    expect(creative?.path).toBe("/creative");
    expect(creative?.children?.some((entry) => entry.id === "humbird")).toBe(false);
    expect(entries.find((entry) => entry.id === "hummingbird")?.path).toBe("/hummingbird");

    const marketing = entries.find((entry) => entry.id === "marketing");
    expect(marketing?.children?.some((entry) => entry.path === "/marketing/campaigns")).toBe(true);
    const office = entries.find((entry) => entry.id === "office");
    expect(office?.children?.some((entry) => entry.path === "/pledge")).toBe(true);
    expect(entries.find((entry) => entry.id === "settings")?.children?.some((entry) => entry.path === "/pledge") ?? false).toBe(false);

    const automation = menuDestinations.filter((entry) => entry.path === "/business/autopilot");
    expect(automation).toHaveLength(1);
    expect(automation[0]).toMatchObject({
      label: "PABLO AI AUTOMATION",
      hint: "PABLO PRIME AUTOMATION",
    });
  });
});
