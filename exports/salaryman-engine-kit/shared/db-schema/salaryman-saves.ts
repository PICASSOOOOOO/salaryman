import { pgTable, serial, varchar, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

export const salarymanSavesTable = pgTable("salaryman_saves", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  charName: varchar("char_name", { length: 64 }).notNull(),
  charClass: varchar("char_class", { length: 32 }).notNull(),
  level: integer("level").notNull().default(1),
  salary: integer("salary").notNull().default(0),
  lastZone: varchar("last_zone", { length: 64 }).default("MINX CITY"),
  playtime: integer("playtime").notNull().default(0),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("salaryman_saves_user_slot").on(t.userId, t.slotIndex)]);

export type SalarymanSave = typeof salarymanSavesTable.$inferSelect;
