import { pgTable, serial, varchar, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

// Public lockers are individual, lower-capacity lockers at the Tower shop.
export const publicLockerStorageTable = pgTable("public_locker_storage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  acquiredVia: varchar("acquired_via", { length: 16 }).notNull().default("fiat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("public_locker_storage_user_slot_item").on(t.userId, t.slotIndex, t.itemId),
  index("public_locker_storage_user_slot_idx").on(t.userId, t.slotIndex),
]);

// Organization storage rooms are shared by members who pass the org permission
// gate. Quantities are held as rows so every deposit can be audited.
export const orgSharedStorageTable = pgTable("org_shared_storage", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  depositedByUserId: varchar("deposited_by_user_id", { length: 256 }).notNull(),
  acquiredVia: varchar("acquired_via", { length: 16 }).notNull().default("fiat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("org_shared_storage_org_idx").on(t.orgId),
  index("org_shared_storage_org_item_idx").on(t.orgId, t.itemId),
]);

export type PublicLockerStorageRow = typeof publicLockerStorageTable.$inferSelect;
export type OrgSharedStorageRow = typeof orgSharedStorageTable.$inferSelect;
