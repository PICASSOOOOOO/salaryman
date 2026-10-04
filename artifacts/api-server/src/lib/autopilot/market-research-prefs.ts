export interface MarketResearchPrefs {
  subject: string;
  region: string;
  competitors: string;
}

const text = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function sanitizeMarketResearchPrefs(raw: unknown): MarketResearchPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { subject: "", region: "", competitors: "" };
  }

  const prefs = raw as Record<string, unknown>;
  return {
    subject: text(prefs.subject, 180),
    region: text(prefs.region, 120),
    competitors: text(prefs.competitors, 500),
  };
}

export const readMarketResearchPrefs = sanitizeMarketResearchPrefs;