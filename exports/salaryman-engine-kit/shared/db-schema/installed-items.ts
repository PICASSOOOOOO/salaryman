import { pgTable, serial, varchar, integer, doublePrecision, timestamp, unique, index } from "drizzle-orm/pg-core";

// ─── Installable consumable slots ─────────────────────────────────────────
// A consumable (battery, fuel, etc.) installed into a target the player owns:
// a home, a vehicle, a bot, or a non-human companion. This is the association
// layer for "powered" slots — the consumable's quantity is decremented from
// player_inventory when installed and returned when removed.
//
// `targetType` is one of INSTALL_TARGET_TYPES below. `targetId` identifies the
// specific target within that type, encoded as a string so it can hold the
// heterogeneous ids the game already uses:
//   home      → property deed id / "home_base"
//   vehicle   → inventory itemId (catalog id, e.g. "veh_car")
//   bot       → bots.id (stringified)
//   companion → normalized companion name
//   assistant → "assistant" (the player's single Pablo/Mila AI assistant)
// `slotNo` is the install slot index on that target (0..capacity-1).
//
// Like player_inventory, ownership is scoped to a character save slot
// (userId + slotIndex) so installs follow the right character. The item
// definition lives in the backend catalog keyed by `itemId`.
export const INSTALL_TARGET_TYPES = ["home", "vehicle", "bot", "companion", "assistant"] as const;
export type InstallTargetType = (typeof INSTALL_TARGET_TYPES)[number];

// How many consumables each target type can hold at once.
export const INSTALL_CAPACITY: Record<InstallTargetType, number> = {
  home: 2,
  vehicle: 1,
  bot: 1,
  companion: 1,
  assistant: 1,
};

export const playerInstalledItemsTable = pgTable("player_installed_items", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  slotIndex: integer("slot_index").notNull().default(0),
  targetType: varchar("target_type", { length: 16 }).notNull(),
  targetId: varchar("target_id", { length: 128 }).notNull(),
  slotNo: integer("slot_no").notNull().default(0),
  itemId: varchar("item_id", { length: 64 }).notNull(),
  // Remaining charge (battery loop). Null for non-battery installs (fuel, etc.).
  // A battery is installed at full capacity, depletes as the target runs AI /
  // electrical work, and is topped back up at a charging station. Stored as a
  // float so sub-unit AI burns accumulate accurately.
  currentCharge: doublePrecision("current_charge"),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // One consumable per physical slot on a target, per character save.
  unique("player_installed_user_slot_target_slotno").on(
    t.userId, t.slotIndex, t.targetType, t.targetId, t.slotNo,
  ),
  index("player_installed_user_slot_idx").on(t.userId, t.slotIndex),
]);

export type PlayerInstalledItemRow = typeof playerInstalledItemsTable.$inferSelect;
