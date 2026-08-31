import {
  Bot,
  Briefcase,
  Building2,
  Code2,
  Layers,
  Megaphone,
  MessageSquare,
  Network,
  Settings,
  ShieldCheck,
  Terminal,
  User,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  authOnly?: boolean;
  staffOnly?: boolean;
  accent?: "emerald";
};

export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { id: "pablo", path: "/pablo", label: "PABLO", icon: Terminal },
  { id: "comms", path: "/phone?tab=chat", label: "COMMS", icon: MessageSquare },
  { id: "bots", path: "/pledge", label: "AGENTS", icon: Bot },
  { id: "office", path: "/office", label: "OFFICE", icon: Building2, authOnly: true, accent: "emerald" },
  { id: "org", path: "/org", label: "ORG", icon: Network, authOnly: true },
];

export const MORE_NAV_ITEMS: AppNavItem[] = [
  { id: "console", path: "/console", label: "TERMINAL", icon: Code2 },
  { id: "business", path: "/business", label: "BUSINESS", icon: Briefcase },
  { id: "creative", path: "/creative/music", label: "CREATIVE", icon: Layers },
  { id: "marketing", path: "/marketing", label: "MARKETING", icon: Megaphone },
  { id: "settings", path: "/settings", label: "SETTINGS", icon: Settings, authOnly: true },
  { id: "profile", path: "/profile", label: "PROFILE", icon: User, authOnly: true },
  { id: "admin", path: "/profile/admin", label: "ADMIN", icon: ShieldCheck, authOnly: true, staffOnly: true },
];

export function isAppNavItemActive(item: AppNavItem, pathname: string): boolean {
  switch (item.id) {
    case "pablo":
      return pathname === "/pablo" || pathname.startsWith("/pablo/");
    case "office":
      return pathname === "/office" || pathname === "/my-office" ||
        pathname.startsWith("/office/") ||
        ["/game/map", "/game/economy", "/game/bank", "/game/character", "/game/settings"].includes(pathname);
    case "bots":
      return pathname.startsWith("/bots") || pathname === "/pledge";
    case "comms":
      return pathname.startsWith("/phone") || pathname === "/comms";
    case "org":
      return pathname === "/org" || pathname.startsWith("/org/");
    case "console":
      return pathname === "/console" || pathname.startsWith("/console/");
    case "settings":
      return pathname.startsWith("/settings");
    case "admin":
      return pathname.startsWith("/profile/admin") ||
        pathname.startsWith("/profile/moderator") ||
        pathname.startsWith("/profile/world-map");
    case "profile":
      return (pathname === "/profile" || pathname.startsWith("/profile/")) &&
        !pathname.startsWith("/profile/admin") &&
        !pathname.startsWith("/profile/moderator") &&
        !pathname.startsWith("/profile/world-map");
    default:
      return pathname === `/${item.id}` || pathname.startsWith(`/${item.id}/`);
  }
}

export const APP_HISTORY_DEPTH_KEY = "__salarymanDepth";
export const APP_HISTORY_SESSION_KEY = "__salarymanSession";

export function readAppHistoryDepth(state: unknown): number {
  if (!state || typeof state !== "object") return 0;
  const depth = Number((state as Record<string, unknown>)[APP_HISTORY_DEPTH_KEY]);
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

export function withAppHistoryDepth(state: unknown, depth: number): Record<string, unknown> {
  const base = state && typeof state === "object" ? state as Record<string, unknown> : {};
  return { ...base, [APP_HISTORY_DEPTH_KEY]: Math.max(0, depth) };
}

let historyTrackingInstalled = false;
let historySessionId = "";

export function isSafeAppHistoryState(state: unknown, sessionId: string): boolean {
  return Boolean(
    sessionId &&
    state &&
    typeof state === "object" &&
    (state as Record<string, unknown>)[APP_HISTORY_SESSION_KEY] === sessionId &&
    readAppHistoryDepth(state) > 0,
  );
}

export function canGoBackInApp(): boolean {
  return typeof window !== "undefined" && isSafeAppHistoryState(window.history.state, historySessionId);
}

export function getAppHomePath(isAuthenticated: boolean): string {
  return isAuthenticated ? "/office" : "/";
}

export function getAppBackPath(isAuthenticated: boolean): string {
  return isAuthenticated ? "/office" : "/pablo";
}

export function installAppHistoryTracking(): void {
  if (historyTrackingInstalled || typeof window === "undefined") return;
  historyTrackingInstalled = true;

  const history = window.history;
  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  historySessionId = crypto.randomUUID();
  nativeReplace({
    ...withAppHistoryDepth(history.state, 0),
    [APP_HISTORY_SESSION_KEY]: historySessionId,
  }, "");

  history.pushState = (state, title, url) => {
    nativePush({
      ...withAppHistoryDepth(state, readAppHistoryDepth(history.state) + 1),
      [APP_HISTORY_SESSION_KEY]: historySessionId,
    }, title, url);
  };
  history.replaceState = (state, title, url) => {
    nativeReplace({
      ...withAppHistoryDepth(state, readAppHistoryDepth(history.state)),
      [APP_HISTORY_SESSION_KEY]: historySessionId,
    }, title, url);
  };
}

export function shouldShowModuleSubnav(moduleId: string | undefined, itemCount: number): boolean {
  return Boolean(moduleId && moduleId !== "phone" && itemCount > 0);
}
