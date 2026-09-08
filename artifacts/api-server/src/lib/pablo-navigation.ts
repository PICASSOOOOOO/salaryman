// Server-owned destinations Pablo may open or suggest. The browser may send
// labels for these paths, but it cannot expand this authority set.
export const PABLO_NAV_PATHS = new Set([
  "/", "/pablo", "/office", "/my-office", "/comms", "/dashboard",
  "/business", "/business/calendar", "/business/tasks", "/business/team",
  "/business/contacts", "/business/deals", "/business/invoices",
  "/business/estimates", "/business/bills", "/business/expenses",
  "/business/vendors", "/business/payroll", "/business/accounting",
  "/business/profit-loss", "/business/balance-sheet", "/business/hiring",
  "/business/documents", "/business/time-tracking", "/business/autopilot",
  "/marketing", "/marketing/campaigns", "/marketing/seo", "/marketing/leads",
  "/marketing/social", "/intel/dashboard", "/intel/reports", "/intel/goals",
  "/creative/darkroom", "/creative/design", "/creative/brand",
  "/creative/writer", "/creative/video", "/creative/media",
  "/creative/schematic", "/creative/classroom", "/console", "/console/agents",
  "/console/video", "/console/vault", "/console/scraper", "/bots", "/bots/my",
  "/bots/jobs", "/game", "/game/map", "/game/bank", "/game/character",
  "/game/settings", "/recreation", "/marketplace", "/wallet", "/pledge",
  "/armory", "/armory/inventory", "/profile", "/profile/platform",
  "/profile/platform?tab=keys", "/profile/platform?tab=webhooks",
  "/profile/world-map", "/settings", "/pricing", "/alpha", "/legal",
  "/legal/terms", "/legal/privacy", "/legal/contact",
  // Established destinations from the original Pablo command catalog.
  "/features", "/upgrade", "/mobile", "/world", "/world/play",
  "/profile/apis", "/profile/admin", "/profile/moderator",
  "/profile/admin/billboards", "/profile/admin/tickets", "/profile/admin/dev-tasks",
  "/business/gusto", "/business/announcements", "/business/partnerships",
  "/business/interview", "/business/resume", "/job-offers",
  "/creative/lab", "/creative/stems", "/tools/media-center",
  "/bots/office", "/bots/templates", "/bots/prompt-sensei",
  "/jean-claw", "/insurance", "/feedback", "/investors",
  "/legal/refunds", "/legal/returns", "/legal/cancellation",
  "/legal/promotions", "/legal/restrictions",
]);

export function isPabloNavPath(path: string): boolean {
  return PABLO_NAV_PATHS.has(path);
}