import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// (IMPORTANT) This table is the app-local identity and Replit Auth session store.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// (IMPORTANT) This table is the app-local user record shared by auth and product data.
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Immutable account-level identity for economy/banking records. Unlike a
  // profile id, this never changes when the user creates or switches characters.
  economicId: uuid("economic_id").notNull().defaultRandom(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeConnectAccountId: varchar("stripe_connect_account_id", { length: 255 }),
  stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled").notNull().default(false),
  // Durable protection signal: unlike a live subscription row, this survives
  // cancellation so retention jobs never treat a former paying account as free.
  hasPaidHistory: boolean("has_paid_history").notNull().default(false),
  // Account-level public handle (without the leading "@"). Globally unique
  // (case-insensitive via a lower() unique index). Distinct from the
  // per-profile playerName used as the world data join key — do not conflate.
  username: varchar("username", { length: 32 }),
  // When the username was last changed; gates the 60-day change cooldown.
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  pabloPrivacyMode: boolean("pablo_privacy_mode").notNull().default(false),
  // Account-level UI / display preferences (graphics quality, camera zoom,
  // low-graphics mode, audio volumes, etc.) so they follow the player across
  // devices. Mirrors the client's sm_game_settings_v1 + salaryman_low_gfx
  // localStorage blobs: { settings: {...}, lowGfx: boolean }. Null = the player
  // has never synced settings; the client falls back to its local-only blob.
  gameSettings: jsonb("game_settings"),
  currentOrgId: varchar("current_org_id"),
  // FK-by-string to player_profiles.id (we don't declare a hard FK to avoid
  // a circular import with player-profiles.ts; profile delete cascades via
  // user-id rather than via this column). Null = no profile selected, fall
  // back to the legacy name-derivation path in derivePlayerName().
  activeProfileId: varchar("active_profile_id"),
  // Lifecycle: tracks activity and the 23-day warning / 30-day data cleanup.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  abandonmentWarnedAt: timestamp("abandonment_warned_at", { withTimezone: true }),
  dataDeletedAt: timestamp("data_deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("users_username_unique_idx").on(sql`lower(${t.username})`),
  uniqueIndex("users_economic_id_unique_idx").on(t.economicId),
]);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
