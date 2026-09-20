/**
 * Browser-facing vocabulary policy.
 *
 * The app keeps codename values in its catalogs for compatibility and
 * internal identity, but the public workspace always uses plain labels.
 */
export const BOOMER_MODE_ENABLED = true;

export function boomerLabel(plainLabel: string, legacyLabel?: string): string {
  return plainLabel || legacyLabel || "";
}

const MODULE_LABELS: Record<string, string> = {
  console: "TOOLS",
  business: "BUSINESS",
  creative: "CREATIVE STUDIO",
  intel: "REPORTS",
  phone: "CALLL HOME",
};

export function getBoomerModuleLabel(moduleId: string, fallback: string): string {
  return MODULE_LABELS[moduleId] ?? fallback;
}

const APP_LABELS: Record<string, string> = {
  pablo: "PABLO AI",
  phone: "CALLL HOME",
  comms: "MESSAGES",
  office: "SALARYMAN OS",
  bots: "PIXEL AGENTS",
  org: "ORGANIZATION",
  business: "BUSINESS",
  contacts: "CONTACTS",
  leads: "LEADS",
  creative: "CREATIVE STUDIO",
  marketing: "MARKETING",
  pledge: "PLEDGE STORE",
  settings: "SETTINGS",
  profile: "PROFILE",
  admin: "ADMIN",
};

export function getBoomerAppLabel(itemId: string, fallback: string): string {
  return APP_LABELS[itemId] ?? fallback;
}