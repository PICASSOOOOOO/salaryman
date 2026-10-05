import {
  Bot,
  Briefcase,
  Building2,
  Contact,
  Layers,
  ListChecks,
  Megaphone,
  MessageSquare,
  Network,
  Phone,
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
  boomerLabel?: string;
  icon: LucideIcon;
  authOnly?: boolean;
  staffOnly?: boolean;
  accent?: "emerald" | "green";
};

// Copied from the app navigation source so the baseline and redesign retain
// the exact existing labels, paths, icons, and access flags.
export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { id: "pablo", path: "/pablo", label: "PABLO AI", boomerLabel: "PABLO AI", icon: Terminal },
  { id: "phone", path: "/phone", label: "CALLL HOME", boomerLabel: "CALLL HOME", icon: Phone },
  { id: "comms", path: "/comms", label: "COMMS", boomerLabel: "MESSAGES", icon: MessageSquare, authOnly: true },
  { id: "office", path: "/desktop", label: "SALARYMAN OS", boomerLabel: "SALARYMAN OS", icon: Building2, accent: "green" },
];

export const MORE_NAV_ITEMS: AppNavItem[] = [
  { id: "bots", path: "/business/autopilot", label: "PABLO AI AUTOMATION", boomerLabel: "PABLO AI AUTOMATION", icon: Bot },
  { id: "org", path: "/organizations", label: "ORG", boomerLabel: "ORGANIZATION", icon: Network, authOnly: true },
  { id: "business", path: "/business", label: "BUSINESS", boomerLabel: "BUSINESS", icon: Briefcase, authOnly: true },
  { id: "contacts", path: "/contacts", label: "CONTACTS", boomerLabel: "CONTACTS", icon: Contact, authOnly: true },
  { id: "leads", path: "/leads", label: "LEADS", boomerLabel: "LEADS", icon: ListChecks, authOnly: true },
  { id: "creative", path: "/creative/music", label: "CREATIVE", boomerLabel: "CREATIVE STUDIO", icon: Layers },
  { id: "marketing", path: "/marketing", label: "MARKETING", boomerLabel: "MARKETING", icon: Megaphone },
  { id: "settings", path: "/settings", label: "SETTINGS", boomerLabel: "SETTINGS", icon: Settings, authOnly: true },
  { id: "platform", path: "/platform", label: "PLATFORM API", boomerLabel: "PLATFORM API", icon: Network, authOnly: true },
  { id: "profile", path: "/profile", label: "PROFILE", boomerLabel: "PROFILE", icon: User, authOnly: true },
  { id: "admin", path: "/profile/admin", label: "ADMIN", boomerLabel: "ADMIN", icon: ShieldCheck, authOnly: true, staffOnly: true },
];
