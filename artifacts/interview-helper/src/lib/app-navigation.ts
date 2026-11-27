import {
  Bot,
  Briefcase,
  Building2,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Network,
  Phone,
  Settings,
  ShieldCheck,
  Terminal,
  User,
  Calculator,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  id: string;
  path: string;
  label: string;
  boomerLabel?: string;
  icon: LucideIcon;
  authOnly?: boolean;
  staffOnly?: boolean;
  accent?: "emerald" | "green";
  priority?: number;
};

export const PRIMARY_NAV_ITEMS: AppNavItem[] = ([
  { id: "pablo", path: "/pablo", label: "PABLO AI", boomerLabel: "PABLO AI", icon: Terminal, priority: 120 },
  { id: "phone", path: "/phone", label: "CALLL HOME", boomerLabel: "CALLL HOME", icon: Phone, priority: 100 },
  { id: "bots", path: "/business/autopilot", label: "PABLO PRIME", boomerLabel: "PABLO PRIME", icon: Bot, authOnly: true, priority: 90 },
  { id: "office", path: "/desktop", label: "SALARYMAN OS", boomerLabel: "SALARYMAN OS", icon: Building2, accent: "green", priority: 50 },
] as AppNavItem[]).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

export const MORE_NAV_ITEMS: AppNavItem[] = [
  { id: "workspace", path: "/workspace", label: "THE OFFICE", boomerLabel: "THE OFFICE", icon: LayoutDashboard, authOnly: true },
  { id: "calculator", path: "/workspace/calculator", label: "CALCULATOR", boomerLabel: "CALCULATOR", icon: Calculator, authOnly: true },
  { id: "crm", path: "/business/crm", label: "CRM", boomerLabel: "CRM", icon: Briefcase, authOnly: true },
  { id: "business", path: "/business", label: "BUSINESS", boomerLabel: "BUSINESS", icon: Briefcase, authOnly: true },
  { id: "org", path: "/organizations", label: "ORG", boomerLabel: "ORGANIZATION", icon: Network, authOnly: true },
  { id: "creative", path: "/creative", label: "CREATIVE", boomerLabel: "CREATIVE", icon: Layers },
  { id: "marketing", path: "/marketing", label: "MARKETING", boomerLabel: "MARKETING", icon: Megaphone },
  { id: "settings", path: "/settings", label: "SETTINGS", boomerLabel: "SETTINGS", icon: Settings, authOnly: true },
  { id: "platform", path: "/platform", label: "PLATFORM API", boomerLabel: "PLATFORM API", icon: Network, authOnly: true },
  { id: "profile", path: "/profile", label: "PROFILE", boomerLabel: "PROFILE", icon: User, authOnly: true },
  { id: "admin", path: "/profile/admin", label: "ADMIN", boomerLabel: "ADMIN", icon: ShieldCheck, authOnly: true, staffOnly: true },
  { id: "comms", path: "/comms", label: "COMMS", boomerLabel: "MESSAGES", icon: MessageSquare, authOnly: true },
];

export function isAppNavItemActive(item: AppNavItem, pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  switch (item.id) {
    case "workspace":
      return path === "/workspace" || path.startsWith("/workspace/");
    case "pablo":
      return path === "/pablo" || path.startsWith("/pablo/") || path === "/terminal";
    case "office":
      return path === "/desktop" || path === "/office" || path === "/my-office" || path.startsWith("/office/") || path.startsWith("/tower") || path.startsWith("/game");
    case "bots":
      return path === "/business/autopilot" || path === "/phone/secretary" ||
        path === "/bots/ad-studio" || path === "/marketing/ads" ||
        path === "/bots" || path.startsWith("/bots/");
    case "crm":
      return path === "/business/crm" || path.startsWith("/business/crm/") ||
        path === "/marketing/leads" || path.startsWith("/marketing/leads/") ||
        path === "/business/contacts" || path === "/business/deals";
    case "business":
      return (path === "/business" || path.startsWith("/business/")) &&
        path !== "/business/autopilot" &&
        path !== "/business/contacts" &&
        path !== "/business/deals" &&
        path !== "/business/leads" &&
        path !== "/business/crm" &&
        !path.startsWith("/business/crm/");
    case "creative":
      return (path === "/creative" || path.startsWith("/creative/")) &&
        path !== "/creative/brand" ||
        path === "/1999" || path.startsWith("/1999/");
    case "phone":
      return path === "/phone" ||
        (path.startsWith("/phone/") && path !== "/phone/secretary");
    case "comms":
      return path === "/comms" || path.startsWith("/comms/");
    case "org":
      return path === "/organizations" || path.startsWith("/organizations/") || path === "/org" || path.startsWith("/org/");
    case "settings":
      return path.startsWith("/settings");
    case "admin":
      return path.startsWith("/profile/admin") || path.startsWith("/profile/moderator");
    case "profile":
      return (path === "/profile" || path.startsWith("/profile/")) && !path.startsWith("/profile/admin") && !path.startsWith("/profile/moderator");
    case "marketing":
      return ((path === "/marketing" || path.startsWith("/marketing/")) &&
        path !== "/marketing/ads" &&
        path !== "/marketing/leads" &&
        !path.startsWith("/marketing/leads/")) ||
        path === "/creative/brand" ||
        path === "/intel/reports" ||
        path === "/intel/goals" ||
        path.startsWith("/intel/seo");
    default:
      return path === `/${item.id}` || path.startsWith(`/${item.id}/`);
  }
}

export function shouldShowGlobalSignIn(pathname: string, isAuthenticated: boolean): boolean {
  return !isAuthenticated && pathname !== "/pablo";
}

export const APP_HISTORY_DEPTH_KEY = "__salarymanDepth";
export const APP_HISTORY_SESSION_KEY = "__salarymanSession";
export const APP_RETURN_PATH_KEY = "__salarymanReturnPath";

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
  return isAuthenticated ? "/workspace" : "/";
}

export function getAppBackPath(isAuthenticated: boolean): string {
  return isAuthenticated ? "/workspace" : "/";
}

export function rememberAppReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  if (!path || path === "/" || path.startsWith("/pablo") || path.startsWith("/phone")) return;
  try { sessionStorage.setItem(APP_RETURN_PATH_KEY, path); } catch {}
}

export function consumeAppReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = sessionStorage.getItem(APP_RETURN_PATH_KEY);
    sessionStorage.removeItem(APP_RETURN_PATH_KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}

export function getPabloHref(currentLocation: string): string {
  const path = currentLocation.trim();
  if (!path || path === "/" || path === "/pablo" || path.startsWith("/pablo?")) return "/pablo";
  if (!path.startsWith("/") || path.startsWith("//")) return "/pablo";
  return `/pablo?returnTo=${encodeURIComponent(path)}`;
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

export function shouldShowModuleSubnav(moduleId: string | undefined, itemCount: number, pathname = ""): boolean {
  const isStandaloneMajorFeature =
    pathname === "/business/crm" ||
    pathname.startsWith("/business/crm/") ||
    pathname === "/business/contacts" ||
    pathname === "/business/deals" ||
    pathname === "/contacts" ||
    pathname.startsWith("/contacts/") ||
    pathname === "/leads" ||
    pathname.startsWith("/leads/") ||
    pathname === "/marketing/leads" ||
    pathname.startsWith("/marketing/leads/") ||
    pathname === "/comms" ||
    pathname.startsWith("/comms/");
  return Boolean(moduleId && moduleId !== "phone" && !isStandaloneMajorFeature && itemCount > 0);
}
