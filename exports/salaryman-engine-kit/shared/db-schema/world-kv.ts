import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const worldKvTable = pgTable("world_kv", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: integer("value").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorldKv = typeof worldKvTable.$inferSelect;
