import { pgTable, serial, varchar, integer, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
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
  },
  (t) => ({
    slugIdx: uniqueIndex("world_build_plans_slug_idx").on(t.slug),
    statusIdx: index("world_build_plans_status_idx").on(t.status),
    regionIdx: index("world_build_plans_region_idx").on(t.region),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planIdx: index("world_build_contribs_plan_idx").on(t.planId),
    userIdx: index("world_build_contribs_user_idx").on(t.userId),
    // First-come-first-served: one contribution row per (plan, task).
    planTaskIdx: uniqueIndex("world_build_contribs_plan_task_idx").on(t.planId, t.taskId),
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
