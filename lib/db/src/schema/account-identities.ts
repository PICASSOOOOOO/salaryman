import { pgTable, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

// Linked external OAuth identities for an account. Lets a signed-in user attach
// an additional sign-in method (e.g. GitHub) to their EXISTING account even when
// the provider's email differs from the account email — so future logins with
// that provider resolve to this account instead of minting a duplicate
// `<provider>:<id>` row. One row per (provider, providerUserId): a given GitHub
// account can be linked to at most one SALARYMAN account.
export const accountIdentitiesTable = pgTable("account_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // e.g. "github". Lowercase provider key.
  provider: varchar("provider", { length: 32 }).notNull(),
  // The provider's stable user id (GitHub numeric id stored as a string).
  providerUserId: varchar("provider_user_id", { length: 128 }).notNull(),
  // Human-friendly handle for display (GitHub login). Best-effort.
  providerUsername: varchar("provider_username", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("account_identities_provider_user_idx").on(t.provider, t.providerUserId),
  index("account_identities_user_idx").on(t.userId),
]);

export type AccountIdentity = typeof accountIdentitiesTable.$inferSelect;
