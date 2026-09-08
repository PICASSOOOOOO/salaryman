import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// (IMPORTANT) This table remains the app-local identity, authorization, and state bridge under Clerk.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// (IMPORTANT) Retained for data compatibility during and after the Clerk migration.
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
  // Lifecycle: drives the 3-day Pablo warning + 28-day asset seizure.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  abandonmentWarnedAt: timestamp("abandonment_warned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("users_username_unique_idx").on(sql`lower(${t.username})`),
  uniqueIndex("users_economic_id_unique_idx").on(t.economicId),
]);

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
