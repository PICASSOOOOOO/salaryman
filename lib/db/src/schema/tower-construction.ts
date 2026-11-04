import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { worldBuildPlansTable } from "./world-build-plans";

export const towerConstructionContributionsTable = pgTable(
  "tower_construction_contributions",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull(),
    taskId: varchar("task_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 256 }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    rewardFiat: integer("reward_fiat").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tower_construction_contrib_plan_task_idx").on(table.planId, table.taskId),
    index("tower_construction_contrib_user_created_idx").on(table.userId, table.createdAt),
    foreignKey({
      name: "tower_construction_plan_fk",
      columns: [table.planId],
      foreignColumns: [worldBuildPlansTable.id],
    }).onDelete("cascade"),
    check("tower_construction_contrib_reward_check", sql`${table.rewardFiat} between 1 and 100000`),
  ],
);

export type TowerConstructionContribution = typeof towerConstructionContributionsTable.$inferSelect;
