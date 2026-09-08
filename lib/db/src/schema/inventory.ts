import { pgTable, serial, varchar, integer, timestamp, unique, index } from "drizzle-orm/pg-core";

// ─── Player inventory ─────────────────────────────────────────────────────
// One row per owned catalog item, scoped to a character save slot
// (userId + slotIndex). The item definition (stats, price, equip slot)
// lives in the backend catalog (lib/item-catalog.ts) keyed by `itemId` —
// we only persist ownership here so the catalog can evolve without a
// migration. `acquiredVia` records how it was obtained: fiat | stripe | grant.
export const playerInventoryTable = pgTable("player_inventory", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  acquiredVia: varchar("acquired_via", { length: 16 }).notNull().default("fiat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("player_inventory_user_slot_item").on(t.userId, t.slotIndex, t.itemId),
  index("player_inventory_user_slot_idx").on(t.userId, t.slotIndex),
]);

export type PlayerInventoryRow = typeof playerInventoryTable.$inferSelect;

// ─── Player loadout (equipped gear) ───────────────────────────────────────
// At most one equipped item per equip slot per character save. Equipping a
// new item in a slot overwrites the previous one (it stays in inventory).
export const playerLoadoutTable = pgTable("player_loadout", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  equipSlot: varchar("equip_slot", { length: 24 }).notNull(),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  equippedAt: timestamp("equipped_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("player_loadout_user_slot_equipslot").on(t.userId, t.slotIndex, t.equipSlot),
]);

export type PlayerLoadoutRow = typeof playerLoadoutTable.$inferSelect;
