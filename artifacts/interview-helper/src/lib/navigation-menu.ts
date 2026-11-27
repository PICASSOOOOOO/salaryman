import {
  Bot,
  FileText,
  Layers,
  User,
} from "lucide-react";
import HummingbirdIcon from "@/components/HummingbirdIcon";
import {
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  type AppNavItem,
} from "./app-navigation";
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
  priority: number;
  entries: WorkspaceMenuEntry[];
};

export function countWorkspaceMenuDestinations(entries: WorkspaceMenuEntry[]): number {
  return entries.reduce(
    (count, entry) => count + 1 + countWorkspaceMenuDestinations(entry.children ?? []),
    0,
  );
}

export function orderWorkspaceMenuSections(
  sections: WorkspaceMenuSection[],
): WorkspaceMenuSection[] {
  return sections
    .map((section, index) => ({
      section,
      index,
      destinationCount: countWorkspaceMenuDestinations(section.entries),
    }))
    .sort((a, b) =>
      b.section.priority - a.section.priority ||
      b.destinationCount - a.destinationCount ||
      a.index - b.index,
    )
    .map(({ section }) => section);
}

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

const creativeModule = MODULES.find((module) => module.id === "creative");
if (!creativeModule) {
  throw new Error("The creative workspace menu module is missing");
}

export const WORKSPACE_MENU_FEATURED = {
  ...appEntry("pablo"),
  hint: "CONVERSATIONAL ASSISTANT",
};

const pabloDeck = {
  id: "pablo-deck-ai",
  path: "/pablo/deck",
  label: "PABLO DECK",
  icon: Layers,
  hint: "USE AN AGENT WITH PABLO AI",
} satisfies WorkspaceMenuEntry;

export const WORKSPACE_MENU_OFFICE = appEntry("workspace", {
  label: "THE OFFICE",
  hint: "Your tools and shared workspace",
});

function entryFromModule(
  module: { subs: Array<Parameters<typeof historicSubEntry>[0]> },
  id: string,
  overrides: Partial<WorkspaceMenuEntry> = {},
): WorkspaceMenuEntry {
  const sub = module.subs.find((candidate) => candidate.id === id);
  if (!sub) throw new Error(`Missing navigation destination: ${id}`);
  return { ...historicSubEntry(sub), ...overrides };
}

const hemingway = entryFromModule(creativeModule, "writer", {
  hint: "WRITING & DOCUMENTS",
});
const creative1999 = entryFromModule(creativeModule, "lab", {
  label: "1999",
  hint: "MUSIC WORKSTATION",
});
const hummingbird = {
  id: "hummingbird",
  path: "/hummingbird",
  label: "HUMMINGBIRD",
  icon: HummingbirdIcon,
  hint: "MUSIC PLAYER",
} satisfies WorkspaceMenuEntry;

export const WORKSPACE_MENU_SECTIONS: WorkspaceMenuSection[] = orderWorkspaceMenuSections([
  {
    id: "pablo-ai",
    label: "PABLO AI",
    priority: 200,
    entries: [WORKSPACE_MENU_FEATURED, pabloDeck],
  },
  {
    id: "paid-features",
    label: "PAID FEATURES",
    priority: 100,
    entries: [
      appEntry("phone", {
        hint: "CALLING & SMS",
      }),
      {
        id: "pablo-automation",
        path: "/business/autopilot",
        label: "PABLO AUTOMATION",
        icon: Bot,
      } satisfies WorkspaceMenuEntry,
    ],
  },
  {
    id: "business",
    label: "RUN YOUR BUSINESS",
    priority: 0,
    entries: [
      appEntry("business"),
      appEntry("org", { label: "ORGANIZATION" }),
      appEntry("calculator"),
      {
        id: "workspace-notes",
        path: "/workspace/notepad",
        label: "NOTES",
        icon: FileText,
      },
    ],
  },
  {
    id: "creative",
    label: "MAKE & BUILD",
    priority: 0,
    entries: [
      appEntry("creative", { path: "/creative/design", label: "PISE", hint: "DESIGN WORKSPACE" }),
      hemingway,
      creative1999,
      hummingbird,
    ],
  },
  {
    id: "marketing",
    label: "REACH & GROW",
    priority: 0,
    entries: [appEntry("marketing", { path: "/marketing/command", hint: "SOCIAL & CAMPAIGNS" })],
  },
  {
    id: "settings",
    label: "ACCOUNT",
    priority: 0,
    entries: [
      appEntry("profile", { icon: User }),
      appEntry("settings"),
    ],
  },
  {
    id: "office",
    label: "OFFICE",
    priority: 0,
    entries: [appEntry("comms", { hint: "MESSAGING" })],
  },
]);

export const WORKSPACE_MENU_OS = appEntry("office", { hint: "DOWNLOAD THE GAME" });
