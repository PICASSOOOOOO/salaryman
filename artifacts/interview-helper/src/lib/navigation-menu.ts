import { Globe, Grid2X2 } from "lucide-react";
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type AppNavItem,
} from "./app-navigation";
import { HISTORIC_MODULES, type HistoricModule, type HistoricSubItem } from "./historic-navigation";
import { getBoomerAppLabel, getBoomerModuleLabel } from "./vocabulary";

export type WorkspaceMenuEntry = {
  id: string;
  path: string;
  label: string;
  icon: AppNavItem["icon"];
  hint?: string;
  children?: WorkspaceMenuEntry[];
};

export type WorkspaceMenuSection = {
  id: string;
  label: string;
  entries: WorkspaceMenuEntry[];
};

const allAppItems = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];

function appEntry(id: string, additions: Partial<WorkspaceMenuEntry> = {}): WorkspaceMenuEntry {
  const item = allAppItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown app navigation item: ${id}`);
  return {
    id: item.id,
    path: item.path,
    label: getBoomerAppLabel(item.id, item.boomerLabel ?? item.label),
    icon: item.icon,
    ...additions,
  };
}

function historicModule(id: string): HistoricModule {
  const module = HISTORIC_MODULES.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`Unknown historic navigation module: ${id}`);
  return module;
}

function historicSubEntry(sub: HistoricSubItem): WorkspaceMenuEntry {
  return {
    id: sub.id,
    path: sub.path,
    label: sub.id === "lab" ? "1999" : sub.boomerLabel || sub.codename,
    icon: sub.icon,
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
const creativeModule = historicModule("creative");
const consoleModule = historicModule("console");
const intelModule = historicModule("intel");

export const WORKSPACE_MENU_FEATURED = {
  ...appEntry("pablo"),
  hint: "CHAT + AUTOMATION",
};

export const WORKSPACE_MENU_SECTIONS: WorkspaceMenuSection[] = [
  {
    id: "workspace",
    label: "WORKSPACE",
    entries: [
      appEntry("phone"),
      appEntry("comms"),
      appEntry("office"),
      { id: "apps", path: "/my-apps", label: "MY APPS", icon: Grid2X2 },
    ],
  },
  {
    id: "business",
    label: "BUSINESS",
    entries: [
      appEntry("business", {
        children: businessModule.subs.map(historicSubEntry),
      }),
      appEntry("org"),
      appEntry("contacts"),
      appEntry("leads"),
      appEntry("bots", { hint: "PABLO PRIME AUTOMATION" }),
      appEntry("marketing"),
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
