import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type DeviceLinkScope = "salaryman_app" | "file_transfer";

// A durable, user-owned trust relationship between one desktop companion and
// one mobile device. Pairing codes are never stored here in plaintext.
export const deviceLinksTable = pgTable(
  "device_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    desktopDeviceId: varchar("desktop_device_id", { length: 128 }).notNull(),
    desktopName: varchar("desktop_name", { length: 80 }).notNull(),
    mobileDeviceId: varchar("mobile_device_id", { length: 128 }),
    mobileName: varchar("mobile_name", { length: 80 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    pairingCodeHash: varchar("pairing_code_hash", { length: 128 }),
    pairingCodeExpiresAt: timestamp("pairing_code_expires_at", { withTimezone: true }),
    desktopApprovedAt: timestamp("desktop_approved_at", { withTimezone: true }),
    mobileApprovedAt: timestamp("mobile_approved_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastDesktopSeenAt: timestamp("last_desktop_seen_at", { withTimezone: true }),
    lastMobileSeenAt: timestamp("last_mobile_seen_at", { withTimezone: true }),
    desktopAccessTokenHash: varchar("desktop_access_token_hash", { length: 128 }),
    desktopAccessTokenIssuedAt: timestamp("desktop_access_token_issued_at", { withTimezone: true }),
    scopes: jsonb("scopes").$type<DeviceLinkScope[]>().notNull().default(["salaryman_app"]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("device_links_user_idx").on(table.userId, table.status),
    uniqueIndex("device_links_user_desktop_idx").on(table.userId, table.desktopDeviceId),
  ],
);

export const deviceLinkEventsTable = pgTable(
  "device_link_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id").notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    actor: varchar("actor", { length: 20 }).notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("device_link_events_link_idx").on(table.linkId, table.createdAt),
    index("device_link_events_user_idx").on(table.userId, table.createdAt),
  ],
);

export const insertDeviceLinkSchema = createInsertSchema(deviceLinksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeviceLink = z.infer<typeof insertDeviceLinkSchema>;
export type DeviceLink = typeof deviceLinksTable.$inferSelect;
export type DeviceLinkEvent = typeof deviceLinkEventsTable.$inferSelect;