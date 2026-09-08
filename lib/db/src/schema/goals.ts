import { pgTable, serial, varchar, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull().default(""),
  period: varchar("period", { length: 50 }).notNull().default("Quarterly"),
  targetMetric: varchar("target_metric", { length: 200 }).notNull().default(""),
  currentValue: integer("current_value").notNull().default(0),
  targetValue: integer("target_value").notNull().default(100),
  unit: varchar("unit", { length: 50 }).notNull().default("%"),
  deadline: varchar("deadline", { length: 20 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("goals_user_id_idx").on(table.userId),
  index("goals_status_idx").on(table.status),
]);

export const insertGoalSchema = createInsertSchema(goalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;

export const goalMilestonesTable = pgTable("goal_milestones", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => goalsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  text: text("text").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("goal_milestones_goal_id_idx").on(table.goalId),
  index("goal_milestones_user_id_idx").on(table.userId),
]);

export const insertGoalMilestoneSchema = createInsertSchema(goalMilestonesTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertGoalMilestone = z.infer<typeof insertGoalMilestoneSchema>;
export type GoalMilestone = typeof goalMilestonesTable.$inferSelect;
