import { pgTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const worldBusinessesTable = pgTable("world_businesses", {
  id: serial("id").primaryKey(),
  playerName: varchar("player_name", { length: 32 }).notNull(),
  userId: varchar("user_id", { length: 256 }),
  businessType: varchar("business_type", { length: 16 }).notNull().default("minx"), // 'minx' | 'real'
  companyName: varchar("company_name", { length: 80 }),
  industry: varchar("industry", { length: 60 }),
  companySize: varchar("company_size", { length: 30 }),
  contactEmail: varchar("contact_email", { length: 120 }),
  isPaid: boolean("is_paid").notNull().default(false),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorldBusinessSchema = createInsertSchema(worldBusinessesTable).omit({ id: true, createdAt: true });
export type InsertWorldBusiness = z.infer<typeof insertWorldBusinessSchema>;
export type WorldBusiness = typeof worldBusinessesTable.$inferSelect;
