import { pgTable, serial, varchar, integer, timestamp, unique, index } from "drizzle-orm/pg-core";

// ─── Home storage locker ──────────────────────────────────────────────────
// A personal stash framed in-fiction as a safe/footlocker kept "at home", but
// keyed only by (userId + slotIndex) — NOT by city — so it follows the player
// everywhere: deposit an item in Minx, withdraw it in HUDA. Mirrors
// player_inventory: we persist ownership only; the item definition (stats,
// price, equip slot) lives in the backend catalog (lib/item-catalog.ts) keyed
// by `itemId`. An item lives in EITHER inventory or storage, never both.
export const playerStorageTable = pgTable("player_storage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  acquiredVia: varchar("acquired_via", { length: 16 }).notNull().default("fiat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("player_storage_user_slot_item").on(t.userId, t.slotIndex, t.itemId),
  index("player_storage_user_slot_idx").on(t.userId, t.slotIndex),
]);

export type PlayerStorageRow = typeof playerStorageTable.$inferSelect;
