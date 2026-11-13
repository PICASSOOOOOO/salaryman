import {
  Banknote,
  Bot,
  Brain,
  Globe,
  Grid2X2,
  LayoutDashboard,
  Ruler,
  Target,
} from "lucide-react";
import HummingbirdIcon from "@/components/HummingbirdIcon";
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type AppNavItem,
} from "./app-navigation";
import { HISTORIC_MODULES, type HistoricModule } from "./historic-navigation";
import { getBoomerAppLabel } from "./vocabulary";
import { MODULES } from "./modules";

export type WorkspaceMenuEntry = {
  id: string;
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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

const businessModule = historicModule("business");
const creativeModule = MODULES.find((module) => module.id === "creative");
const marketingModule = MODULES.find((module) => module.id === "marketing");
const officeModule = MODULES.find((module) => module.id === "office");
const consoleModule = historicModule("console");
const phoneModule = historicModule("phone");
if (!creativeModule || !marketingModule || !officeModule) {
  throw new Error("A workspace menu module is missing");
}

export const WORKSPACE_MENU_FEATURED = {
  ...appEntry("pablo"),
  hint: "CONVERSATIONAL ASSISTANT",
};

const entryFromModule = (
  module: { subs: Array<Parameters<typeof historicSubEntry>[0]> },
  id: string,
  overrides: Partial<WorkspaceMenuEntry> = {},
): WorkspaceMenuEntry => {
  const sub = module.subs.find((candidate) => candidate.id === id);
  if (!sub) throw new Error(`Missing navigation destination: ${id}`);
  return { ...historicSubEntry(sub), ...overrides };
};

const stemPlayer = entryFromModule(creativeModule, "stems", {
  label: "STEM PLAYER",
  hint: "1999",
});
const creative1999 = entryFromModule(creativeModule, "lab", {
  label: "1999",
  children: [stemPlayer],
});
const dataVault = entryFromModule(creativeModule, "media", {
  label: "DATA VAULT",
  hint: "ALL FILE TYPES",
  children: [
    { id: "knowledge-vault", path: "/console/vault", label: "KNOWLEDGE VAULT", icon: Brain, hint: "SAVED NOTES & RESEARCH" },
  ],
});
const hummingbird = {
  id: "hummingbird",
  path: "/hummingbird",
  label: "HUMMINGBIRD",
  icon: HummingbirdIcon,
  hint: "MUSIC PLAYER",
} satisfies WorkspaceMenuEntry;

export const WORKSPACE_MENU_SECTIONS: WorkspaceMenuSection[] = [
  {
    id: "marketing",
    label: "MARKETING",
    entries: [
      appEntry("marketing", {
        children: marketingModule.subs
          .filter((sub) => sub.id !== "leads")
          .map(historicSubEntry),
      }),
    ],
  },
  {
    id: "creative",
    label: "CREATIVE",
    entries: [
      appEntry("creative", {
        children: [
          creative1999,
          ...creativeModule.subs
            .filter((sub) => !["lab", "stems", "brand", "classroom", "media", "schematic"].includes(sub.id))
            .map(historicSubEntry),
          dataVault,
          entryFromModule(creativeModule, "schematic", {
            label: "CAD & BLUEPRINT READER",
            icon: Ruler,
            hint: "READ TECHNICAL DRAWINGS",
          }),
          entryFromModule(creativeModule, "classroom", {
            label: "MEETING ROOM",
            hint: "VIDEO MEETINGS & CLASSES",
          }),
          hummingbird,
        ],
      }),
    ],
  },
  {
    id: "business",
    label: "BUSINESS",
    entries: [
      appEntry("business", {
        children: [
          {
            id: "business-finance",
            path: "/business/accounting",
            label: "FINANCE & ACCOUNTING",
            icon: Banknote,
            hint: "BUSINESS LEDGERS",
          },
          ...businessModule.subs
            .filter((sub) => !["contacts", "deals", "autopilot", "accounting"].includes(sub.id) && sub.path !== businessModule.defaultPath)
            .map(historicSubEntry),
          appEntry("notepad"),
          appEntry("calculator"),
        ],
      }),
      appEntry("org"),
    ],
  },
  {
    id: "settings",
    label: "SETTINGS",
    entries: [
      appEntry("platform"),
      appEntry("settings", {
        children: [{
          id: "salaryman-os-settings",
          path: "/settings/os",
          label: "SALARYMAN OS",
          icon: officeModule.icon,
          hint: "GAME, SERVER & ECONOMY SETTINGS",
        }],
      }),
      appEntry("profile"),
      appEntry("admin"),
    ],
  },
  {
    id: "calll-home",
    label: "CALLL HOME",
    entries: [
      appEntry("phone", {
        children: [
          appEntry("crm", {
            hint: "FREE CRM",
            children: [
              { id: "leads", path: "/marketing/leads", label: "LEADS", icon: Target },
              entryFromModule(businessModule, "contacts", {
                label: "LEAD CAPTURE",
                hint: "CONTACT IMPORT & FOLLOW-UP",
              }),
              entryFromModule(businessModule, "deals", { label: "DEALS" }),
            ],
          }),
          ...phoneModule.subs
            .filter((sub) => sub.path !== phoneModule.path)
            .map(historicSubEntry),
        ],
      }),
    ],
  },
  {
    id: "pablo-prime",
    label: "PABLO PRIME",
    entries: [
      appEntry("bots", {
        hint: "AUTOMATION WORKSPACE",
        children: [
          { id: "ai-agents", path: "/pablo/deck", label: "AI AGENTS", icon: Bot },
        ],
      }),
    ],
  },
  {
    id: "office",
    label: "THE OFFICE",
    entries: [
      appEntry("workspace", { label: "THE OFFICE" }),
      appEntry("comms", { hint: "MESSAGING" }),
      appEntry("office", {
        hint: "DESKTOP APP",
        children: officeModule.subs
          .filter((sub) => ![
            "office-business",
            "office-map",
            "office-economy",
            "office-bank",
            "office-vending",
            "office-property",
            "office-settings",
          ].includes(sub.id))
          .map(historicSubEntry),
      }),
      {
        id: "terminal",
        path: consoleModule.defaultPath,
        label: "CONSOLE",
        icon: consoleModule.icon,
        hint: consoleModule.subs.map((sub) => sub.boomerLabel || sub.codename).join(" · "),
      },
      { id: "apps", path: "/my-apps", label: "MY APPS", icon: Grid2X2 },
      { id: "project-dashboard", path: "/intel/dashboard", label: "PROJECTS", icon: LayoutDashboard, hint: "PROJECTS & KNOWLEDGE" },
    ],
  },
];

export const WORKSPACE_MENU_BROWSE = {
  id: "browse",
  path: "/world",
  label: "BROWSE",
  icon: Globe,
};
