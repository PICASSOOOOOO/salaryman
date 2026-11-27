import { Calculator, FileText, MessageSquare, Network, Settings, User, ShieldCheck, Eye, Bot } from "lucide-react";
import {
  ADMIN_SUBS,
  MODULES,
  PROFILE_MODULES,
  SETTINGS_MODULES,
  type Module,
  type SubItem,
} from "./modules";

export type WorkspaceWidgetFeature = {
  id: string;
  path: string;
  label: string;
  icon: Module["icon"];
  restrictedTo?: "admin" | "moderator";
};

export type WorkspaceWidgetGroup = {
  id: string;
  label: string;
  features: WorkspaceWidgetFeature[];
  icon?: Module["icon"];
};

function getModule(id: string): Module {
  const found = MODULES.find((item) => item.id === id);
  if (!found) throw new Error(`Missing workspace feature module: ${id}`);
  return found;
}

function moduleFeature(id: string, label: string, path?: string): WorkspaceWidgetFeature {
  const item = getModule(id);
  return {
    id: `${id}-main`,
    path: path ?? item.defaultPath,
    label,
    icon: item.icon,
  };
}

function moduleSubfeatures(
  moduleId: string,
  excludedIds: string[] = [],
  labelOverrides: Record<string, string> = {},
): WorkspaceWidgetFeature[] {
  return getModule(moduleId).subs
    .filter((item) => !excludedIds.includes(item.id))
    .map((item) => subfeature(moduleId, item, labelOverrides[item.id]));
}

function subfeature(
  moduleId: string,
  item: SubItem,
  label = item.id === "lab" ? "1999" : item.boomerLabel || item.label,
  restrictedTo?: "admin" | "moderator",
): WorkspaceWidgetFeature {
  return {
    id: `${moduleId}-${item.id}`,
    path: item.path,
    label,
    icon: item.icon,
    ...(restrictedTo ? { restrictedTo } : {}),
  };
}

function standalone(
  id: string,
  path: string,
  label: string,
  icon: Module["icon"],
  restrictedTo?: "admin" | "moderator",
): WorkspaceWidgetFeature {
  return { id, path, label, icon, ...(restrictedTo ? { restrictedTo } : {}) };
}

const rawGroups: WorkspaceWidgetGroup[] = [
  {
    id: "pablo",
    label: "PABLO AI",
    features: [
      moduleFeature("pablo", "PABLO AI"),
      ...moduleSubfeatures("pablo"),
    ],
  },
  {
    id: "phone",
    label: "CALLL HOME",
    features: [
      moduleFeature("phone", "CALLL HOME"),
      ...moduleSubfeatures("phone", ["secretary"]),
    ],
  },
  {
    id: "pablo-prime",
    label: "PABLO PRIME",
    features: [
      moduleFeature("bots", "PABLO PRIME"),
      ...[
        ["workflows", "WORKFLOWS"],
        ["agents", "AI AGENTS"],
        ["ads", "AD BOTS"],
        ["secretary", "AI SECRETARY"],
      ].map(([capability, label]) => standalone(
        `pablo-prime-${capability}`,
        `/business/autopilot?cap=${capability}`,
        label,
        Bot,
      )),
      standalone("pablo-prime-call-handling", "/phone/secretary", "CALL HANDLING", Bot),
    ],
  },
  {
    id: "business",
    label: "BUSINESS",
    features: [
      moduleFeature("business", "BUSINESS"),
      standalone("workspace-calculator", "/workspace/calculator", "CALCULATOR", Calculator),
      ...moduleSubfeatures("business", [
        "office",
        "marketplace",
        "org",
        "documents",
        "deals",
      ]),
      ...[
        ["business-website", "/business/website", "WEBSITE"],
        ["business-services", "/business/services", "SERVICES"],
        ["business-partnerships", "/business/partnerships", "PARTNERSHIPS"],
        ["business-contracts", "/business/contracts", "CONTRACTS"],
        ["business-gusto", "/business/gusto", "GUSTO PAYROLL"],
        ["business-floor-plans", "/business/floor-plans", "FLOOR PLANS"],
        ["business-insurance", "/insurance", "INSURANCE"],
        ["business-my-apps", "/my-apps", "MY APPS"],
      ].map(([id, path, label]) => standalone(id, path, label, getModule("business").icon)),
    ],
  },
  {
    id: "crm",
    label: "CRM",
    features: [
      moduleFeature("crm", "CRM"),
      ...moduleSubfeatures("crm"),
    ],
  },
  {
    id: "creative",
    label: "CREATIVE",
    features: [
      moduleFeature("creative", "PISE"),
      ...moduleSubfeatures("creative", ["writer", "classroom", "media", "design", "brand"]),
      ...[
        ["creative-scene", "/creative/scene", "SCENE COMPOSER"],
        ["creative-sound-lab", "/creative/lab", "SOUND LAB"],
        ["creative-video", "/creative/video", "VIDEO STUDIO"],
        ["creative-terrence", "/creative/terrence-studio", "TERRENCE STUDIO"],
        ["creative-hummingbird", "/hummingbird", "HUMMINGBIRD"],
        ["creative-media-center", "/tools/media-center", "MEDIA CENTER"],
        ["creative-cyber-deck", "/cyber-deck", "CYBER DECK"],
      ].map(([id, path, label]) => standalone(id, path, label, getModule("creative").icon)),
    ],
  },
  {
    id: "hemingway",
    label: "HEMINGWAY",
    features: [
      moduleFeature("creative", "HEMINGWAY", "/creative/writer"),
      standalone("workspace-notes", "/workspace/notepad", "NOTES", FileText),
      standalone("workspace-documents", "/business/documents", "DOCUMENTS", FileText),
    ],
  },
  {
    id: "comms",
    label: "COMMS",
    features: [
      standalone("comms", "/comms", "COMMS", MessageSquare),
      standalone("meeting-room", "/creative/classroom", "START A MEETING", MessageSquare),
    ],
  },
  {
    id: "office",
    label: "OFFICE",
    features: [
      moduleFeature("office", "OFFICE FLOOR"),
      ...moduleSubfeatures("office", ["office-business", "office-settings"]),
    ],
  },
  {
    id: "terminal",
    label: "TERMINAL",
    features: [
      moduleFeature("console", "SOLVER"),
      ...moduleSubfeatures("console", ["vault"]),
    ],
  },
  {
    id: "marketing",
    label: "MARKETING",
    features: [
      moduleFeature("marketing", "MARKETING", "/marketing"),
      standalone("marketing-command", "/marketing/command", "COMMAND CENTER", getModule("marketing").icon),
      ...moduleSubfeatures("marketing"),
    ],
  },
  {
    id: "armory",
    label: "ARMORY",
    features: [
      moduleFeature("armory", "ARMORY"),
      ...moduleSubfeatures("armory"),
    ],
  },
  {
    id: "marketplace",
    label: "MARKETPLACE",
    features: [
      moduleFeature("marketplace", "MARKETPLACE"),
      ...moduleSubfeatures("marketplace", ["marketplace-home"]),
      standalone("business-marketplace", "/business/marketplace", "BUSINESS MARKETPLACE", getModule("marketplace").icon),
    ],
  },
  {
    id: "organization",
    label: "ORGANIZATION",
    features: [
      standalone("organization", "/organizations", "ORGANIZATION", Network),
    ],
  },
  {
    id: "settings",
    label: "THE OFFICE",
    icon: Settings,
    features: [
      standalone("settings", "/settings", "SETTINGS", Settings),
      standalone("salaryman-os", "/desktop", "SALARYMAN OS", Settings),
      standalone("data-vault", "/creative/media", "DATA VAULT", FileText),
      standalone("data-vault-knowledge", "/creative/media?tab=knowledge", "KNOWLEDGE", FileText),
      standalone("game-settings", "/game/settings", "GAME SETTINGS", Settings),
      ...PROFILE_MODULES.map((item) => subfeature(
        "profile",
        item,
        item.boomerLabel,
        item.id === "profile-admin" ? "admin" : item.id === "profile-moderator" ? "moderator" : undefined,
      )),
      ...SETTINGS_MODULES
        .filter((item) => item.id !== "plat-overview")
        .map((item) => subfeature("settings", item)),
      ...ADMIN_SUBS
        .filter((item) => item.id !== "admin-users")
        .map((item) => subfeature("admin", item, item.boomerLabel, "admin")),
      standalone("settings-profile", "/profile", "PROFILE", User),
      standalone("settings-admin", "/profile/admin", "ADMIN", ShieldCheck, "admin"),
      standalone("settings-moderator", "/profile/moderator", "MODERATOR", Eye, "moderator"),
    ],
  },
];

const seenPaths = new Set<string>();

export const WORKSPACE_WIDGET_GROUPS: WorkspaceWidgetGroup[] = rawGroups.map((group) => ({
  ...group,
  features: group.features.filter((feature) => {
    if (seenPaths.has(feature.path)) return false;
    seenPaths.add(feature.path);
    return true;
  }),
}));

export const WORKSPACE_STARTER_PATHS = [
  "/pablo",
  "/phone",
  "/business",
  "/business/autopilot",
];

export const LEGACY_WORKSPACE_STARTER_PATHS = [
  "/pablo",
  "/workspace/notepad",
  "/workspace/calculator",
  "/business/crm",
  "/business/autopilot",
  "/comms",
  "/creative/classroom",
  "/1999",
  "/creative/media",
];

export function isLegacyWorkspaceStarter(paths: Array<string | null>): boolean {
  return paths.length === LEGACY_WORKSPACE_STARTER_PATHS.length
    && LEGACY_WORKSPACE_STARTER_PATHS.every((path, index) => paths[index] === path);
}
