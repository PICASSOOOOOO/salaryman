import { pgTable, serial, varchar, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// ── LAND & CONSTRUCTION ──────────────────────────────────────────────────────
// The city is divided into a nested hierarchy of land:
//   Sector › Zone › District › Hamlet › Commune
// Cities are being rebuilt from disaster; sectors are the walled expansion
// regions reclaimed from the unlivable outside, and zones within them are the
// parcels actually opened for construction.
// Each buildable parcel is a `land_plots` row. A plot starts life UNCLAIMED.
// A player may CLAIM (reserve) a plot, but NOTHING may be built on it until the
// game OWNER or a PICASSO admin OPENS it for construction (status 'open') —
// this is the hard governance rule. Once open, the claimer starts a
// `construction_projects` row (with a designed footprint + furniture), which is
// worked by laborers until complete, at which point a real building is created.

// A buildable parcel of land within the zoning hierarchy.
export const landPlotsTable = pgTable("land_plots", {
  id: serial("id").primaryKey(),
  cityId: varchar("city_id", { length: 40 }).notNull().default("minx"),
  // Nesting, largest → smallest.
  sector: varchar("sector", { length: 80 }).notNull().default("Reclaimed Core"),
  zone: varchar("zone", { length: 80 }).notNull(),
  district: varchar("district", { length: 80 }).notNull(),
  hamlet: varchar("hamlet", { length: 80 }).notNull(),
  commune: varchar("commune", { length: 80 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  // World-space footprint.
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  w: integer("w").notNull().default(40),
  h: integer("h").notNull().default(40),
  // 'unclaimed' | 'claimed' | 'open' | 'building' | 'built'
  status: varchar("status", { length: 24 }).notNull().default("unclaimed"),
  claimedBy: varchar("claimed_by", { length: 256 }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  // Who OPENED the plot for construction (owner / Picasso admin) — the approval.
  approvedBy: varchar("approved_by", { length: 256 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  // Set once a building is actually constructed here (links to city_buildings).
  buildingId: varchar("building_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cityIdx: index("land_plots_city_idx").on(t.cityId),
  statusIdx: index("land_plots_status_idx").on(t.status),
  claimedIdx: index("land_plots_claimed_idx").on(t.claimedBy),
}));

// An in-flight build on an OPEN plot. Carries the player's design and tracks
// labor progress. A building is only ever created when one of these reaches
// 100% — so every building traces back to an approved plot.
export const constructionProjectsTable = pgTable("construction_projects", {
  id: serial("id").primaryKey(),
  plotId: integer("plot_id").notNull(),
  ownerId: varchar("owner_id", { length: 256 }).notNull(),
  buildingType: varchar("building_type", { length: 40 }).notNull().default("home"),
  label: varchar("label", { length: 120 }).notNull().default("New Building"),
  // The medium-depth design: { footprint, rooms, furniture: [{key,x,y,rot}] }.
  design: jsonb("design").notNull().default({}),
  laborRequired: integer("labor_required").notNull().default(100),
  laborApplied: integer("labor_applied").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  // Snapshot of the owner's debt at queue/tick time — higher debt = built first.
  priorityScore: integer("priority_score").notNull().default(0),
  // 'designing' | 'queued' | 'in_progress' | 'complete' | 'cancelled'
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // ── ORG-SCOPED DEBTOR LABOR ──────────────────────────────────────────────
  // An org admin can associate a project with their organization and flag it
  // as open to debtor labor. When set, incarcerated players (not just the
  // project owner) can work shifts on this project from inside the Collections
  // Facility. Their debt is reduced by the normal REWARD_PER_SHIFT; the labor
  // log records which org benefits so the audit trail is clear.
  owningOrgId: varchar("owning_org_id", { length: 64 }),
  owningOrgName: varchar("owning_org_name", { length: 120 }),
  openToDebtorLabor: boolean("open_to_debtor_labor").notNull().default(false),
  // Optional bounty posted by the org: custom debt-reduction per shift, capped at ƒ5000.
  // When set, the reward appears as "BOUNTY: ƒX/SHIFT" in red in the CF feed.
  // Null = use the default REWARD_PER_SHIFT (ƒ200).
  rewardOverride: integer("reward_override"),
}, (t) => ({
  statusIdx: index("construction_projects_status_idx").on(t.status),
  ownerIdx: index("construction_projects_owner_idx").on(t.ownerId),
  plotIdx: index("construction_projects_plot_idx").on(t.plotId),
  orgLaborIdx: index("construction_projects_org_labor_idx").on(t.owningOrgId, t.openToDebtorLabor),
}));

// One row per labor shift worked on a project. Debtors work off debt; everyone
// else earns ƒ wages. Drives the "debtors are the labor pool" half of the rule.
export const constructionLaborLogTable = pgTable("construction_labor_log", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  laborerId: varchar("laborer_id", { length: 256 }).notNull(),
  units: integer("units").notNull().default(0),
  // ƒ paid as wage (non-debtor) OR ƒ of debt forgiven (debtor).
  reward: integer("reward").notNull().default(0),
  wasDebtor: boolean("was_debtor").notNull().default(false),
  // When this shift was directed labor for an org (openToDebtorLabor=true),
  // record which org benefited so the audit trail is complete.
  benefitingOrgId: varchar("benefiting_org_id", { length: 64 }),
  benefitingOrgName: varchar("benefiting_org_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("construction_labor_project_idx").on(t.projectId),
  laborerIdx: index("construction_labor_laborer_idx").on(t.laborerId),
  benefitIdx: index("construction_labor_benefit_idx").on(t.benefitingOrgId),
}));

export type LandPlot = typeof landPlotsTable.$inferSelect;
export type ConstructionProject = typeof constructionProjectsTable.$inferSelect;
export type ConstructionLaborLog = typeof constructionLaborLogTable.$inferSelect;
