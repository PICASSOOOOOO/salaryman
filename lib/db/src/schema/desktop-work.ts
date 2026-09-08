import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const desktopWorkLeasesTable = pgTable(
  "desktop_work_leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id").notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    desktopDeviceId: varchar("desktop_device_id", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxMinutes: integer("max_minutes").notNull().default(480),
    consumedMinutes: integer("consumed_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("desktop_work_leases_user_idx").on(table.userId, table.createdAt),
    index("desktop_work_leases_link_idx").on(table.linkId, table.status),
  ],
);

export const desktopWorkClaimsTable = pgTable(
  "desktop_work_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: varchar("event_id", { length: 128 }).notNull(),
    leaseId: uuid("lease_id").notNull(),
    linkId: uuid("link_id").notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    desktopDeviceId: varchar("desktop_device_id", { length: 128 }).notNull(),
    workType: varchar("work_type", { length: 40 }).notNull(),
    workMinutes: integer("work_minutes").notNull(),
    amountFiat: integer("amount_fiat").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull(),
    rejectionReason: varchar("rejection_reason", { length: 120 }),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("desktop_work_claims_event_idx").on(table.eventId),
    index("desktop_work_claims_user_idx").on(table.userId, table.createdAt),
    index("desktop_work_claims_lease_idx").on(table.leaseId, table.createdAt),
  ],
);

export const insertDesktopWorkLeaseSchema = createInsertSchema(desktopWorkLeasesTable).omit({
  id: true,
  createdAt: true,
});
export type DesktopWorkLease = typeof desktopWorkLeasesTable.$inferSelect;
export type DesktopWorkClaim = typeof desktopWorkClaimsTable.$inferSelect;
export type InsertDesktopWorkLease = z.infer<typeof insertDesktopWorkLeaseSchema>;