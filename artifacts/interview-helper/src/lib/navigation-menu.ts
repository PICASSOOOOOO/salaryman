import { Globe, Grid2X2, Music2, ShoppingBag } from "lucide-react";
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type AppNavItem,
} from "./app-navigation";
import { HISTORIC_MODULES, type HistoricModule, type HistoricSubItem } from "./historic-navigation";
import { getBoomerAppLabel, getBoomerModuleLabel } from "./vocabulary";
import { MODULES } from "./modules";

export type WorkspaceMenuEntry = {
  id: string;
  path: string;
  label: string;
  icon: AppNavItem["icon"];
  hint?: string;
  staffOnly?: boolean;
  children?: WorkspaceMenuEntry[];
};

export type WorkspaceMenuSection = {
  id: string;
  label: string;
  entries: WorkspaceMenuEntry[];
};

export function filterWorkspaceMenuEntry(
  entry: WorkspaceMenuEntry,
  query: string,
  canAccessStaff: boolean,
): WorkspaceMenuEntry | null {
  if (entry.staffOnly && !canAccessStaff) return null;

  const matches = !query
    || `${entry.label} ${entry.path} ${entry.hint ?? ""}`.toLowerCase().includes(query);
  const childQuery = matches ? "" : query;
  const children = entry.children
    ?.map((child) => filterWorkspaceMenuEntry(child, childQuery, canAccessStaff))
    .filter((child): child is WorkspaceMenuEntry => child !== null);

  if (!matches && !children?.length) return null;
  return { ...entry, children };
}

const allAppItems = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];

function appEntry(id: string, additions: Partial<WorkspaceMenuEntry> = {}): WorkspaceMenuEntry {
  const item = allAppItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown app navigation item: ${id}`);
  return {
    id: item.id,
    path: item.path,
    label: getBoomerAppLabel(item.id, item.boomerLabel ?? item.label),
    icon: item.icon,
    ...(item.staffOnly ? { staffOnly: true } : {}),
    ...additions,
  };
}

function historicModule(id: string): HistoricModule {
  const module = HISTORIC_MODULES.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`Unknown historic navigation module: ${id}`);
  return module;
}

function historicSubEntry(sub: {
  id: string;
  path: string;
  boomerLabel?: string;
  codename?: string;
  icon: React.ComponentType<{ className?: string }>;
}): WorkspaceMenuEntry {
  return {
    id: sub.id,
    path: sub.path,
    label: sub.id === "lab" ? "1999" : sub.boomerLabel || sub.codename || sub.id,
    icon: sub.icon as WorkspaceMenuEntry["icon"],
  };
}

function historicModuleEntry(
  id: string,
  options: { children?: WorkspaceMenuEntry[]; hint?: string } = {},
): WorkspaceMenuEntry {
  const module = historicModule(id);
  return {
    id: module.id,
    path: module.defaultPath,
    label: getBoomerModuleLabel(module.id, module.label),
    icon: module.icon,
    ...options,
  };
}

const businessModule = historicModule("business");
const creativeModule = MODULES.find((module) => module.id === "creative");
const marketingModule = MODULES.find((module) => module.id === "marketing");
const officeModule = MODULES.find((module) => module.id === "office");
const consoleModule = historicModule("console");
const intelModule = historicModule("intel");
const phoneModule = historicModule("phone");
if (!creativeModule || !marketingModule || !officeModule) {
  throw new Error("A workspace menu module is missing");
}
const businessContacts = businessModule.subs.find((sub) => sub.id === "contacts");
const phoneContacts = phoneModule.subs.find((sub) => sub.id === "contacts");
if (!businessContacts || !phoneContacts) {
  throw new Error("The shared CONTACTS menu requires the business and phone contact destinations");
}

export const WORKSPACE_MENU_FEATURED = {
  ...appEntry("pablo"),
  hint: "CHAT + AUTOMATION",
};

const contactsEntry = appEntry("contacts", {
  hint: "WORKSPACE",
  children: [
    { ...historicSubEntry(businessContacts), hint: "BUSINESS" },
    { ...historicSubEntry(phoneContacts), hint: "CALLL HOME" },
  ],
});

export const WORKSPACE_MENU_SECTIONS: WorkspaceMenuSection[] = [
  {
    id: "workspace",
    label: "WORKSPACE",
    entries: [
      appEntry("phone", {
        children: phoneModule.subs
          .filter((sub) => sub.id !== "contacts")
          .map(historicSubEntry),
      }),
      { id: "hummingbird", path: "/hummingbird", label: "HUMMINGBIRD", icon: Music2 },
      appEntry("comms"),
      appEntry("office", {
        children: [
          ...officeModule.subs.filter((sub) => sub.id !== "office-business").map(historicSubEntry),
          { id: "pledge-store", path: "/pledge", label: "PLEDGE STORE", icon: ShoppingBag },
        ],
      }),
      { id: "apps", path: "/my-apps", label: "MY APPS", icon: Grid2X2 },
    ],
  },
  {
    id: "business",
    label: "BUSINESS",
    entries: [
      appEntry("business", {
        children: businessModule.subs
          .filter((sub) => sub.id !== "contacts")
          .map(historicSubEntry),
      }),
      appEntry("org"),
      contactsEntry,
      appEntry("leads"),
      appEntry("bots", { hint: "PABLO PRIME AUTOMATION" }),
       appEntry("marketing", {
         children: marketingModule.subs.map(historicSubEntry),
       }),
    ],
  },
  {
    id: "tools",
    label: "TOOLS",
    entries: [
      appEntry("creative", {
        children: creativeModule.subs.map(historicSubEntry),
      }),
      historicModuleEntry("console", {
        hint: consoleModule.subs.map((sub) => sub.boomerLabel || sub.codename).join(" · "),
      }),
      historicModuleEntry("intel", {
        children: intelModule.subs
          .filter((sub) => sub.path !== intelModule.defaultPath)
          .map(historicSubEntry),
      }),
      appEntry("platform"),
    ],
  },
  {
    id: "account",
    label: "ACCOUNT",
    entries: [
      appEntry("settings"),
      appEntry("profile"),
      appEntry("admin"),
    ],
  },
];

export const WORKSPACE_MENU_BROWSE = {
  id: "browse",
  path: "/world",
  label: "BROWSE",
  icon: Globe,
};
