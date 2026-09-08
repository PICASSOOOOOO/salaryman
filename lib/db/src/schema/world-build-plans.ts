import { pgTable, serial, varchar, integer, boolean, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * WORLD BUILD PLANS — "jail construction detail."
 *
 * Picasso admins draft the blueprint for a chunk of the map/wastes/outlands
 * in a terminal (title, description, target region/area, list of tasks —
 * each task is a "place X at (x,y)" instruction). The plan starts in
 * 'draft'; once the admin publishes it ('active'), it becomes available
 * to Collections Facility inmates as a labor option. Inmates pick open
 * tasks and actually build them out — each completion pays ƒ off their
 * debt (via the normal CF labor loop) and records a contribution row.
 *
 * Org admins may also create plans owned by their organization and flag
 * them as open to debtor labor — so the org's build project can draw on
 * the CF labor pool. The owningOrgId / openToDebtorLabor columns control
 * this. Admin-owned plans (owningOrgId null) = Pablo community projects.
 * Org-owned plans = the org's directed-labor requests.
 *
 * The tasks jsonb is the authoritative task list. Each entry:
 *   {
 *     id: string,
 *     kind: 'building' | 'road' | 'prop' | 'sign' | 'light' | 'tree' | 'custom',
 *     x: number, y: number, w?: number, h?: number,
 *     label: string,
 *     notes?: string,
 *     completed?: boolean,
 *     completedByName?: string | null,
 *     completedAt?: string | null,
 *   }
 *
 * Contributions are also recorded in the sibling table so we keep a full
 * audit trail and can credit individual inmates even after a plan is
 * archived or re-edited.
 */
export const worldBuildPlansTable = pgTable(
  "world_build_plans",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    // 'city' | 'wastes' | 'outlands' | 'subterranean' | 'aerial'
    region: varchar("region", { length: 24 }).notNull().default("city"),
    // 'draft' | 'active' | 'completed' | 'archived'
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    areaX: integer("area_x").notNull().default(0),
    areaY: integer("area_y").notNull().default(0),
    areaW: integer("area_w").notNull().default(200),
    areaH: integer("area_h").notNull().default(200),
    // Task list — see comment above for shape.
    tasks: jsonb("tasks").notNull().default([]),
    rewardPerTask: integer("reward_per_task").notNull().default(2500),
    createdByUserId: varchar("created_by_user_id", { length: 64 }).notNull(),
    createdByName: varchar("created_by_name", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // ── ORG-SCOPED DEBTOR LABOR ─────────────────────────────────────────────
    // Org admins can create world-build plans on behalf of their organization.
    // When owningOrgId is set and openToDebtorLabor is true, the plan appears
    // in the CF "For Hire" section alongside Pablo's community blueprints.
    // Admin-authored plans (owningOrgId null) are always Pablo community work.
    owningOrgId: varchar("owning_org_id", { length: 64 }),
    owningOrgName: varchar("owning_org_name", { length: 120 }),
    openToDebtorLabor: boolean("open_to_debtor_labor").notNull().default(false),
  },
  (t) => ({
    slugIdx: uniqueIndex("world_build_plans_slug_idx").on(t.slug),
    statusIdx: index("world_build_plans_status_idx").on(t.status),
    regionIdx: index("world_build_plans_region_idx").on(t.region),
    orgLaborIdx: index("world_build_plans_org_labor_idx").on(t.owningOrgId, t.openToDebtorLabor),
  }),
);

export const worldBuildContributionsTable = pgTable(
  "world_build_contributions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull(),
    taskId: varchar("task_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    userName: varchar("user_name", { length: 80 }),
    payoff: integer("payoff").notNull().default(0),
    // When the plan belongs to an org, record which org was credited so the
    // audit trail shows who benefited from each inmate's labor.
    benefitingOrgId: varchar("benefiting_org_id", { length: 64 }),
    benefitingOrgName: varchar("benefiting_org_name", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planIdx: index("world_build_contribs_plan_idx").on(t.planId),
    userIdx: index("world_build_contribs_user_idx").on(t.userId),
    // First-come-first-served: one contribution row per (plan, task).
    planTaskIdx: uniqueIndex("world_build_contribs_plan_task_idx").on(t.planId, t.taskId),
    benefitIdx: index("world_build_contribs_benefit_idx").on(t.benefitingOrgId),
  }),
);

export const insertWorldBuildPlanSchema = createInsertSchema(worldBuildPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorldBuildPlan = z.infer<typeof insertWorldBuildPlanSchema>;
export type WorldBuildPlan = typeof worldBuildPlansTable.$inferSelect;

export type WorldBuildTask = {
  id: string;
  kind: "building" | "road" | "prop" | "sign" | "light" | "tree" | "custom";
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  notes?: string;
  completed?: boolean;
  completedByName?: string | null;
  completedAt?: string | null;
};

export const insertWorldBuildContributionSchema = createInsertSchema(worldBuildContributionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWorldBuildContribution = z.infer<typeof insertWorldBuildContributionSchema>;
export type WorldBuildContribution = typeof worldBuildContributionsTable.$inferSelect;
