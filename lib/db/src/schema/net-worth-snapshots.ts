import { pgTable, serial, varchar, bigint, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playerNetWorthSnapshotsTable = pgTable("player_net_worth_snapshots", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  netWorth: bigint("net_worth", { mode: "number" }).notNull().default(0),
  fiat: bigint("fiat", { mode: "number" }).notNull().default(0),
  gold: integer("gold").notNull().default(0),
  property: bigint("property", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerNetWorthSnapshotSchema = createInsertSchema(playerNetWorthSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertPlayerNetWorthSnapshot = z.infer<typeof insertPlayerNetWorthSnapshotSchema>;
export type PlayerNetWorthSnapshot = typeof playerNetWorthSnapshotsTable.$inferSelect;
