import { pgTable, serial, varchar, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  industry: varchar("industry", { length: 80 }),
  size: varchar("size", { length: 40 }),
  ownerUserId: varchar("owner_user_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

export const ORG_ROLES = ["owner", "manager", "employee"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_BILLING_MODES = ["company", "individual"] as const;
export type OrgBillingMode = (typeof ORG_BILLING_MODES)[number];

export const ORG_MEMBER_STATUSES = ["invited", "active", "removed"] as const;
export type OrgMemberStatus = (typeof ORG_MEMBER_STATUSES)[number];

export const orgMembersTable = pgTable(
  "org_members",
  {
    orgId: serial("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("employee"),
    department: varchar("department", { length: 100 }),
    spawnLocation: varchar("spawn_location", { length: 100 }),
    featureBilling: varchar("feature_billing", { length: 20 }).notNull().default("individual"),
    status: varchar("status", { length: 20 }).notNull().default("invited"),
    invitedByUserId: varchar("invited_by_user_id"),
    inviteEmail: varchar("invite_email", { length: 200 }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("org_members_user_id_idx").on(t.userId),
    index("org_members_org_id_idx").on(t.orgId),
  ]
);

export type OrgMember = typeof orgMembersTable.$inferSelect;

export const orgFeatureGrantsTable = pgTable(
  "org_feature_grants",
  {
    orgId: serial("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    featureKey: varchar("feature_key").notNull(),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.featureKey] }),
    index("org_feature_grants_org_id_idx").on(t.orgId),
  ]
);

export type OrgFeatureGrant = typeof orgFeatureGrantsTable.$inferSelect;

export const orgInvitesTable = pgTable("org_invites", {
  id: serial("id").primaryKey(),
  orgId: serial("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  invitedByUserId: varchar("invited_by_user_id").notNull(),
  inviteEmail: varchar("invite_email", { length: 200 }),
  inviteUsername: varchar("invite_username", { length: 80 }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("org_invites_token_idx").on(t.token),
  index("org_invites_org_id_idx").on(t.orgId),
]);

export type OrgInvite = typeof orgInvitesTable.$inferSelect;
