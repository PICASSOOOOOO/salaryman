import { pgTable, serial, text, timestamp, integer, boolean, jsonb, varchar, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Bot Autopilot ───────────────────────────────────────────────────────────
// Per-org, per-domain configuration that lets an assigned bot (Pixel Agent) run
// a business domain automatically. This is the SHARED FOUNDATION the four domain
// autopilots (business ops, marketing, CRM/calls, accounting) build on. Autopilot
// is strictly ADDITIVE: every domain defaults to disabled, and turning it off
// returns the domain to manual-only with zero data divergence — the automated
// handlers call the SAME service functions the manual screens use.

export const AUTOPILOT_DOMAINS = [
  "business_ops",
  "marketing",
  "crm_calls",
  "accounting",
] as const;
export type AutopilotDomain = (typeof AUTOPILOT_DOMAINS)[number];

export function isAutopilotDomain(d: string): d is AutopilotDomain {
  return (AUTOPILOT_DOMAINS as readonly string[]).includes(d);
}

// UI metadata so the Autopilot panel is self-describing.
export const AUTOPILOT_DOMAIN_META: Record<AutopilotDomain, { label: string; description: string }> = {
  business_ops: {
    label: "Business Ops",
    description: "Runs day-to-day operations — orders, fulfillment, inventory and routine business tasks.",
  },
  marketing: {
    label: "Marketing",
    description: "Plans and publishes campaigns, social posts and outreach across connected channels.",
  },
  crm_calls: {
    label: "CRM & Calls",
    description: "Works the lead pipeline, logs activity and handles routine calls, SMS and follow-ups.",
  },
  accounting: {
    label: "Accounting",
    description: "Keeps the books — reconciles transactions, drafts invoices and prepares financial reports.",
  },
};

// Outcome of a single automated action / tick, recorded to the activity log.
export const AUTOPILOT_OUTCOMES = ["success", "noop", "blocked", "error", "skipped"] as const;
export type AutopilotOutcome = (typeof AUTOPILOT_OUTCOMES)[number];

// Default cadence (minutes) for a domain tick when an org has not set one.
export const AUTOPILOT_DEFAULT_CADENCE_MINUTES = 60;
// Default per-tick action cap when an org has not set one.
export const AUTOPILOT_DEFAULT_MAX_ACTIONS_PER_TICK = 5;

// ── Marketing autopilot preferences ──────────────────────────────────────────
// Lightweight, owner-tunable controls for the Marketing domain, stored in the
// per-domain `prefs` jsonb so an org can steer the bot's posting behavior
// without forking the handler. Empty/default values reproduce today's behavior.
export const AUTOPILOT_MARKETING_TONES = [
  "professional",
  "casual",
  "friendly",
  "playful",
  "bold",
  "inspirational",
  "witty",
] as const;
export type AutopilotMarketingTone = (typeof AUTOPILOT_MARKETING_TONES)[number];
export const AUTOPILOT_DEFAULT_MARKETING_TONE: AutopilotMarketingTone = "professional";
export const AUTOPILOT_MAX_MARKETING_TOPICS = 12;
export const AUTOPILOT_MAX_MARKETING_TOPIC_LEN = 120;

/**
 * Owner-set marketing preferences read by the marketing autopilot handler.
 * `platforms` empty = no restriction (rotate connected accounts / defaults).
 * `topics` empty = fall back to the bot's evergreen rotation.
 */
export interface MarketingAutopilotPrefs {
  platforms: string[];
  tone: string;
  topics: string[];
}

// Per-org, per-domain autopilot configuration. A row is created lazily the first
// time an org touches a domain; a missing row means "disabled, no bot" (today's
// behavior). Unique on (orgId, domain).
export const autopilotConfigsTable = pgTable(
  "autopilot_configs",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull(),
    domain: varchar("domain", { length: 40 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    // Assigned bot (Pixel Agent) that runs this domain. Nullable: a domain can be
    // enabled-but-unassigned (it simply won't run until a bot is picked). No FK so
    // a deleted bot leaves a dangling id that the engine treats as "unassigned".
    botId: integer("bot_id"),
    // Optional caps. Null falls back to the AUTOPILOT_DEFAULT_* constants.
    cadenceMinutes: integer("cadence_minutes"),
    maxActionsPerTick: integer("max_actions_per_tick"),
    budgetCapCents: integer("budget_cap_cents"),
    // Domain-specific, owner-tunable preferences (e.g. marketing platforms /
    // tone / topics). Empty object = today's defaults. Shape is validated by the
    // owning domain (see MarketingAutopilotPrefs) before it is written.
    prefs: jsonb("prefs").$type<Record<string, unknown>>().notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    updatedBy: varchar("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("autopilot_configs_org_domain_idx").on(t.orgId, t.domain),
  ]
);

export const insertAutopilotConfigSchema = createInsertSchema(autopilotConfigsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AutopilotConfig = typeof autopilotConfigsTable.$inferSelect;
export type InsertAutopilotConfig = z.infer<typeof insertAutopilotConfigSchema>;

// Org-scoped audit feed: one row per automated action (or blocked attempt) so a
// human can review and trust what each bot did. Read-only from the UI.
export const autopilotActivityLogTable = pgTable(
  "autopilot_activity_log",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull(),
    domain: varchar("domain", { length: 40 }).notNull(),
    botId: integer("bot_id"),
    // Short machine-ish label for the action ("tick", "publish_post", "blocked", ...).
    action: varchar("action", { length: 80 }).notNull(),
    // Human-readable summary shown in the activity feed.
    summary: text("summary").notNull(),
    outcome: varchar("outcome", { length: 20 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("autopilot_activity_org_created_idx").on(t.orgId, t.createdAt),
  ]
);

export const insertAutopilotActivitySchema = createInsertSchema(autopilotActivityLogTable).omit({
  id: true,
  createdAt: true,
});
export type AutopilotActivity = typeof autopilotActivityLogTable.$inferSelect;
export type InsertAutopilotActivity = z.infer<typeof insertAutopilotActivitySchema>;
