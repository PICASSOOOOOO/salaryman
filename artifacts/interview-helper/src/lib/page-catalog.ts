import { MODULES, PROFILE_MODULES, SETTINGS_MODULES, type Module } from "./modules";

// SINGLE SOURCE OF TRUTH for site-wide navigation search.
//
// Every navigable page is derived from the existing nav config (MODULES,
// PROFILE_MODULES, SETTINGS_MODULES) so paths never drift from the real nav,
// plus a small set of curated standalone pages (office, comms, game surfaces,
// pledge, legal) that aren't expressed as module subs. This catalog is used in
// TWO places:
//   1. Client — to render best-guess suggestions and do instant local matching
//      inside the command palette.
//   2. Server — the palette ships a compact form of it to /chat/pablo/command
//      so Pablo only ever picks REAL, existing paths (grounding).
//
// Phone destinations are included for navigation. Call actions still happen
// inside the phone interface and retain their existing auth/entitlement gates.

export type PageEntry = {
  /** In-app path to navigate to. */
  path: string;
  /** Human-readable name shown to the user. */
  label: string;
  /** The module/group this page belongs to (for display grouping). */
  group: string;
  /** Extra search terms / aliases for matching. */
  keywords: string[];
};

// Curated aliases keyed by path — the natural-language phrasings a user is
// likely to type for a given page. Kept small and high-signal.
const ALIASES: Record<string, string[]> = {
  "/": ["pablo", "home", "assistant", "ai", "start", "front door"],
  "/phone": ["phone", "calll home", "phone system", "calls"],
  "/phone/dialer": ["dialer", "phone dialer", "crm dialer", "outbound calls", "call a lead"],
  "/phone/contacts": ["phone contacts", "call contacts"],
  "/phone/active": ["active calls", "live calls"],
  "/phone/history": ["call history", "call log", "past calls"],
  "/phone/recordings": ["call recordings", "recordings"],
  "/phone/recording": ["call recordings", "recordings"],
  "/phone/voicemail": ["voicemail", "voice messages"],
  "/phone/conference": ["conference calls"],
  "/phone/sessions": ["dialing sessions", "power dialer"],
  "/phone/coach": ["call coach", "phone coach"],
  "/phone/secretary": ["phone secretary", "call secretary"],
  "/phone/numbers": ["phone numbers", "business phone lines"],
  "/phone/call-center": ["call center", "outbound call center"],
  "/phone/sms": ["phone messages", "sms"],
  "/my-office": ["my office", "office dashboard", "workspace", "my workspace"],
  "/office": ["the office", "office", "surveillance", "cctv", "watch office", "floor"],
  "/comms": ["comms", "messages", "chat", "dm", "colleagues", "inbox"],
  "/pledge": ["pledge store", "store", "support", "founder", "perks", "pablo prime"],
  "/armory": ["gear store", "armory", "buy gear", "weapons", "equipment", "shop gear"],
  "/armory/inventory": ["my inventory", "my gear", "owned gear", "loadout"],
  "/business/payroll": ["payroll", "pay employees", "salaries", "wages"],
  "/business/invoices": ["invoices", "billing", "invoice", "bill a client"],
  "/business/estimates": ["estimates", "quotes", "proposals"],
  "/business/expenses": ["expenses", "spending", "receipts"],
  "/business/bills": ["bills", "payables", "pay bills"],
  "/business/team": ["team", "team management", "roster", "employees", "staff", "colleagues"],
  "/business/hiring": ["hiring", "recruit", "hr", "jobs", "post a job"],
  "/business/job-command": ["job command center", "jcc", "job center", "job search", "evaluate job", "resume ai", "interview prep", "battle prep", "ops log", "job evaluation"],
  "/business/taxes": ["taxes", "tax", "tax estimate", "1040"],
  "/business/accounting": ["accounting", "ledger", "books", "general ledger"],
  "/business/balance-sheet": ["balance sheet", "net worth", "assets"],
  "/business/profit-loss": ["profit and loss", "p&l", "pnl", "income statement"],
  "/business/marketplace": ["business marketplace", "buy a business", "sell business"],
  "/marketplace": ["marketplace", "cross-city exchange", "buy items", "sell items", "properties", "vehicles"],
  "/business/autopilot": ["pablo automation", "automation", "autopilot", "automated workflows"],
  "/business/contacts": ["contacts", "address book", "people"],
  "/business/services": ["services board", "gigs", "bounties", "debt bounty", "vehicle rental", "escort", "player services"],
  "/business/tasks": ["tasks", "task board", "todo", "to do"],
  "/business/time-tracking": ["time tracking", "timesheet", "hours"],
  "/business/documents": ["documents", "files", "docs"],
  "/business/calendar": ["calendar", "schedule", "events"],
  "/business/deals": ["deals", "pipeline", "sales pipeline"],
  "/business/vendors": ["vendors", "suppliers"],
  "/business/resume": ["resume", "cv", "resume builder"],
  "/business/announcements": ["announcements", "broadcast"],
  "/intel/dashboard": ["dashboard", "command deck", "overview"],
  "/intel/reports": ["reports", "reporting", "analytics", "mrr"],
  "/intel/goals": ["goals", "objectives", "targets"],
  "/marketing": ["marketing", "marketing command center"],
  "/marketing/campaigns": ["campaigns", "email campaigns"],
  "/marketing/social": ["social", "social media", "post", "twitter", "bluesky"],
  "/marketing/seo": ["seo", "search engine optimization", "rankings"],
  "/marketing/leads": ["leads", "lead database", "prospects"],
  "/marketing/ads": ["ads", "ad bots", "advertising"],
  "/creative/music": ["music", "humming bird", "hummingbird", "tracks", "songs"],
  "/creative/darkroom": ["dark room", "photos", "image editor", "photo studio"],
  "/1999": ["1999", "music production", "audio production", "music workstation", "step sequencer"],
  "/creative/design": ["design studio", "design", "graphics"],
  "/creative/brand": ["brand kit", "branding", "logo"],
  "/creative/writer": ["writer", "hemingway", "writing", "copywriting"],
  "/creative/video": ["video", "video studio", "video maker"],
  "/creative/media": ["media library", "media", "assets"],
  "/creative/schematic": ["blueprint", "schematic", "cad", "decoder"],
  "/creative/classroom": ["classroom", "conference", "education", "lessons", "academy", "live session", "video call", "meeting"],
  "/console": ["console", "terminal", "cipher"],
  "/console/video": ["video intel", "video analyzer"],
  "/console/vault": ["vault", "knowledge vault", "notes"],
  "/console/scraper": ["scraper", "web scraper"],
  "/profile": ["account", "my account", "profile", "identity", "call sign", "avatar", "appearance"],
  "/settings": ["settings", "preferences", "account settings", "linked accounts", "connections", "language", "currency", "privacy", "memory", "data export", "delete account", "org settings", "city settings"],
  "/platform": ["platform", "platform api", "developer", "api"],
  "/platform?tab=keys": ["api keys", "keys"],
  "/platform?tab=webhooks": ["webhooks", "hooks"],
  "/profile/admin": ["admin", "admin panel", "users"],
  "/game": ["game", "city", "play", "world"],
  "/game/bank": ["bank", "atm", "banco ombra", "money"],
  "/game/character": ["character", "avatar", "appearance"],
  "/game/settings": ["game settings", "audio", "graphics", "preferences"],
  "/wallet": ["wallet", "balance", "funds"],
  "/pricing": ["pricing", "upgrade", "plans", "subscribe", "prime"],
  "/alpha": ["tester program", "alpha", "apply"],
  "/legal": ["legal", "terms", "privacy", "policies"],
};

// Curated standalone pages that aren't module subs but are real navigable
// screens users search for.
const EXTRA_PAGES: Array<{ path: string; label: string; group: string }> = [
  { path: "/", label: "Pablo (AI Assistant)", group: "Pablo" },
  { path: "/phone", label: "CALLL HOME", group: "Phone" },
  { path: "/phone/dialer", label: "Phone Dialer", group: "Phone" },
  { path: "/phone/cmd", label: "Phone Command Center", group: "Phone" },
  { path: "/phone/contacts", label: "Phone Contacts", group: "Phone" },
  { path: "/phone/active", label: "Active Calls", group: "Phone" },
  { path: "/phone/history", label: "Call History", group: "Phone" },
  { path: "/phone/recordings", label: "Call Recordings", group: "Phone" },
  { path: "/phone/recording", label: "Call Recording", group: "Phone" },
  { path: "/phone/voicemail", label: "Voicemail", group: "Phone" },
  { path: "/phone/conference", label: "Conference", group: "Phone" },
  { path: "/phone/sessions", label: "Dialing Sessions", group: "Phone" },
  { path: "/phone/coach", label: "Call Coach", group: "Phone" },
  { path: "/phone/secretary", label: "Phone Secretary", group: "Phone" },
  { path: "/phone/numbers", label: "Phone Numbers", group: "Phone" },
  { path: "/phone/call-center", label: "Outbound Call Center", group: "Phone" },
  { path: "/phone/sms", label: "Phone SMS", group: "Phone" },
  { path: "/my-office", label: "My Office", group: "Office" },
  { path: "/marketplace", label: "Marketplace", group: "World" },
  { path: "/office", label: "The Office (Live View)", group: "Office" },
  { path: "/comms", label: "Payphone", group: "Payphone" },
  { path: "/pledge", label: "Pledge Store", group: "Account" },
  { path: "/game", label: "The City", group: "Game" },
  { path: "/game/bank", label: "Bank", group: "Game" },
  { path: "/game/character", label: "Character", group: "Game" },
  { path: "/game/settings", label: "Game Settings", group: "Game" },
  { path: "/wallet", label: "Wallet", group: "Account" },
  { path: "/pricing", label: "Pricing & Upgrade", group: "Account" },
  { path: "/alpha", label: "Tester Program", group: "Account" },
  { path: "/legal", label: "Legal", group: "Account" },
];

function isExcluded(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === "/api" || lower.startsWith("/api/")) return true;
  return false;
}

function tokensFromLabel(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
}

let _catalog: PageEntry[] | null = null;

/** Build (and memoize) the full navigation catalog. */
export function buildPageCatalog(): PageEntry[] {
  if (_catalog) return _catalog;
  const byPath = new Map<string, PageEntry>();

  const add = (path: string, label: string, group: string, extraKeywords: string[] = []) => {
    if (isExcluded(path)) return;
    if (byPath.has(path)) {
      // Merge keywords if the same path shows up under multiple modules.
      const existing = byPath.get(path)!;
      existing.keywords = Array.from(new Set([...existing.keywords, ...extraKeywords]));
      return;
    }
    const keywords = Array.from(new Set([
      ...tokensFromLabel(label),
      ...tokensFromLabel(group),
      ...(ALIASES[path] ?? []),
      ...extraKeywords,
    ]));
    byPath.set(path, { path, label, group, keywords });
  };

  const friendly = (label: string) =>
    label.length <= 3 ? label : label.charAt(0) + label.slice(1).toLowerCase();

  const addModule = (m: Module) => {
    const groupLabel = friendly(m.label);
    for (const sub of m.subs) {
      add(sub.path, friendly(sub.boomerLabel || sub.label), groupLabel);
    }
    // Some modules (e.g. Pablo) have no subs — index the module itself.
    if (m.subs.length === 0) add(m.path, groupLabel, groupLabel);
  };

  for (const m of MODULES) addModule(m);
  for (const s of PROFILE_MODULES) add(s.path, friendly(s.boomerLabel || s.label), "Account");
  for (const s of SETTINGS_MODULES) add(s.path, friendly(s.boomerLabel || s.label), "Platform");
  for (const e of EXTRA_PAGES) add(e.path, e.label, e.group);

  _catalog = Array.from(byPath.values());
  return _catalog;
}

/** Compact form sent to the server to ground Pablo's command-mode prompt. */
export function catalogForPrompt(): Array<{ path: string; label: string }> {
  return buildPageCatalog().map(({ path, label }) => ({ path, label }));
}

/** Lightweight local fuzzy search over the catalog for instant matches. */
export function searchCatalog(query: string, limit = 6): PageEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ entry: PageEntry; score: number }> = [];
  for (const entry of buildPageCatalog()) {
    const hay = `${entry.label.toLowerCase()} ${entry.group.toLowerCase()} ${entry.keywords.join(" ")}`;
    let score = 0;
    if (entry.label.toLowerCase() === q) score += 100;
    if (entry.label.toLowerCase().startsWith(q)) score += 40;
    if (entry.keywords.some(k => k === q)) score += 50;
    for (const term of terms) {
      if (entry.label.toLowerCase().includes(term)) score += 12;
      if (entry.keywords.some(k => k.includes(term))) score += 8;
      else if (hay.includes(term)) score += 3;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
}

/** Resolve a path to its catalog label (for rendering suggestion rows). */
export function labelForPath(path: string): string {
  const base = path.split("?")[0];
  const hit = buildPageCatalog().find(e => e.path === path || e.path.split("?")[0] === base);
  return hit?.label ?? path;
}
