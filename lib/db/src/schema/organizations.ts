import { pgTable, serial, varchar, text, timestamp, primaryKey, index, boolean, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const RESERVED_ORG_NAMES = ["picasso", "picassoo", "picasso ai", "picasso ai llc", "picassoo.ai"];

export function isReservedOrgName(name: string): boolean {
  return RESERVED_ORG_NAMES.includes(name.trim().toLowerCase());
}

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  industry: varchar("industry", { length: 80 }),
  size: varchar("size", { length: 40 }),
  ownerUserId: varchar("owner_user_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  isDeveloper: boolean("is_developer").notNull().default(false),
  adultContentEnabled: boolean("adult_content_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("organizations_name_unique_idx").on(sql`lower(${t.name})`),
]);

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

export const ORG_ROLES = ["owner", "ceo", "executive", "director", "manager", "specialist"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 100,
  ceo: 90,
  executive: 80,
  director: 60,
  manager: 40,
  specialist: 20,
};

export function hasRoleAccess(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return (ORG_ROLE_HIERARCHY[userRole] ?? 0) >= (ORG_ROLE_HIERARCHY[requiredRole] ?? 0);
}

export const PLATFORM_ADMIN_ROLES = ["platform_owner", "platform_ceo", "platform_executive"] as const;
export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export const PLATFORM_ROLE_HIERARCHY: Record<PlatformAdminRole, number> = {
  platform_owner: 100,
  platform_ceo: 90,
  platform_executive: 80,
};

export function isPlatformAdmin(role: string): boolean {
  return (PLATFORM_ADMIN_ROLES as readonly string[]).includes(role);
}

export function hasPlatformAccess(userRole: PlatformAdminRole, requiredRole: PlatformAdminRole): boolean {
  return (PLATFORM_ROLE_HIERARCHY[userRole] ?? 0) >= (PLATFORM_ROLE_HIERARCHY[requiredRole] ?? 0);
}

export const ORG_BILLING_MODES = ["company", "individual"] as const;
export type OrgBillingMode = (typeof ORG_BILLING_MODES)[number];

export const ORG_MEMBER_STATUSES = ["invited", "active", "removed"] as const;
export type OrgMemberStatus = (typeof ORG_MEMBER_STATUSES)[number];

export const ORG_MEMBER_TYPES = ["employee", "contractor"] as const;
export type OrgMemberType = (typeof ORG_MEMBER_TYPES)[number];

export const orgMembersTable = pgTable(
  "org_members",
  {
    orgId: serial("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull(),
    role: varchar("role", { length: 20 }).notNull().default("specialist"),
    department: varchar("department", { length: 100 }),
    spawnLocation: varchar("spawn_location", { length: 100 }),
    featureBilling: varchar("feature_billing", { length: 20 }).notNull().default("individual"),
    status: varchar("status", { length: 20 }).notNull().default("invited"),
    invitedByUserId: varchar("invited_by_user_id"),
    title: varchar("title", { length: 200 }),
    salary: numeric("salary", { precision: 12, scale: 2 }),
    inviteEmail: varchar("invite_email", { length: 200 }),
    memberType: varchar("member_type", { length: 20 }).notNull().default("employee"),
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

export const ORG_PARTNERSHIP_STATUSES = ["pending", "active", "declined", "dissolved"] as const;
export type OrgPartnershipStatus = (typeof ORG_PARTNERSHIP_STATUSES)[number];

export const orgPartnershipsTable = pgTable("org_partnerships", {
  id: serial("id").primaryKey(),
  orgAId: serial("org_a_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  orgBId: serial("org_b_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull().default("partnership"),
  label: varchar("label", { length: 200 }),
  sharedOffice: varchar("shared_office", { length: 200 }),
  rentalAgreement: varchar("rental_agreement", { length: 200 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  requestedByUserId: varchar("requested_by_user_id").notNull(),
  approvedByUserId: varchar("approved_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("org_partnerships_org_a_idx").on(t.orgAId),
  index("org_partnerships_org_b_idx").on(t.orgBId),
]);

export type OrgPartnership = typeof orgPartnershipsTable.$inferSelect;
