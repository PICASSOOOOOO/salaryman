import { pgTable, serial, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Every persistent location in the world (office, apartment, van, public
// workspace, character residence) gets a UNIQUE address. Templates can be
// reused/customized but each instance is unique per server. Addresses are
// the routing layer for in-game post and notifications.
export const ADDRESS_OWNER_TYPES = ["user", "org", "office", "property", "bot"] as const;
export type AddressOwnerType = (typeof ADDRESS_OWNER_TYPES)[number];

export const addressesTable = pgTable("addresses", {
  id: serial("id").primaryKey(),
  // Routable address parts
  unit: varchar("unit", { length: 24 }),               // apt #, suite #, locker #
  floor: integer("floor"),
  streetNumber: varchar("street_number", { length: 12 }).notNull(),
  street: varchar("street", { length: 120 }).notNull(),
  district: varchar("district", { length: 80 }).notNull(),
  postalCode: varchar("postal_code", { length: 12 }).notNull(),
  // World coords this address physically resolves to
  worldX: integer("world_x").notNull(),
  worldY: integer("world_y").notNull(),
  // Ownership reference (polymorphic)
  ownerType: varchar("owner_type", { length: 16 }).notNull(),
  ownerId: varchar("owner_id").notNull(),
  // Display label (e.g. "Salaryman HQ", "Pablo's Loft")
  label: varchar("label", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("address_unique_uq").on(t.streetNumber, t.street, t.unit, t.floor, t.district),
  index("addresses_owner_idx").on(t.ownerType, t.ownerId),
  index("addresses_district_idx").on(t.district),
]);

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addressesTable.$inferSelect;
