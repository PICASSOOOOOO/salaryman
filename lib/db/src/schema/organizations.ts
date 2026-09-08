import { pgTable, serial, varchar, text, timestamp, primaryKey, index, boolean, uniqueIndex, numeric, integer, bigint, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const RESERVED_ORG_NAMES = ["picasso", "picassoo", "picasso ai", "picasso ai llc", "picassoo.ai"];

export function isReservedOrgName(name: string): boolean {
  return RESERVED_ORG_NAMES.includes(normalizeOrgName(name).toLowerCase());
}

export function normalizeOrgName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  // Public, immutable business identity. The serial id remains an internal FK.
  businessId: uuid("business_id").notNull().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  industry: varchar("industry", { length: 80 }),
  size: varchar("size", { length: 40 }),
  description: text("description"),
  website: varchar("website", { length: 500 }),
  businessAddress: text("business_address"),
  contactEmail: varchar("contact_email", { length: 254 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  legalEntityName: varchar("legal_entity_name", { length: 160 }),
  entityType: varchar("entity_type", { length: 80 }),
  ownerUserId: varchar("owner_user_id").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  isDeveloper: boolean("is_developer").notNull().default(false),
  adultContentEnabled: boolean("adult_content_enabled").notNull().default(false),
  isEducation: boolean("is_education").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("organizations_name_unique_idx").on(sql`lower(${t.name})`),
  // Avoid a backslash regex here: Replit's publish schema-diff renderer
  // truncates quoted \s expressions when it serializes an index definition.
  // PostgreSQL's POSIX class is equivalent and produces portable publish SQL.
  uniqueIndex("organizations_name_canonical_unique_idx").on(sql`lower(regexp_replace(btrim(${t.name}), '[[:space:]]+', ' ', 'g'))`),
  uniqueIndex("organizations_business_id_unique_idx").on(t.businessId),
]);

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;

export const orgProtectedRecordsTable = pgTable("org_protected_records", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  maskedValue: varchar("masked_value", { length: 64 }).notNull(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  updatedByUserId: varchar("updated_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("org_protected_records_org_idx").on(t.orgId, t.updatedAt),
]);

export type OrgProtectedRecord = typeof orgProtectedRecordsTable.$inferSelect;

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
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
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
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
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
  orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  invitedByUserId: varchar("invited_by_user_id").notNull(),
  inviteEmail: varchar("invite_email", { length: 200 }),
  inviteUsername: varchar("invite_username", { length: 80 }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  offeredRole: varchar("offered_role", { length: 40 }),
  offeredTitle: varchar("offered_title", { length: 200 }),
  offeredDepartment: varchar("offered_department", { length: 120 }),
  offeredMemberType: varchar("offered_member_type", { length: 20 }),
  offeredSalary: integer("offered_salary"),
  offerMessage: text("offer_message"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("org_invites_token_idx").on(t.token),
  index("org_invites_org_id_idx").on(t.orgId),
  index("org_invites_status_idx").on(t.status),
]);

export type OrgInvite = typeof orgInvitesTable.$inferSelect;

export const ORG_PARTNERSHIP_STATUSES = ["pending", "active", "declined", "dissolved"] as const;
export type OrgPartnershipStatus = (typeof ORG_PARTNERSHIP_STATUSES)[number];

export const orgPartnershipsTable = pgTable("org_partnerships", {
  id: serial("id").primaryKey(),
  orgAId: integer("org_a_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  orgBId: integer("org_b_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
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

// ── Org door locks ───────────────────────────────────────────────────────────
// Server-authoritative passcode/access-level gating for org-controlled spaces in
// the city: offices, whole buildings, and makeshift spaces (tents/vans). A door
// is keyed by a globally-unique `doorKey` (the in-world space/building id), so a
// given space is locked by at most one org at a time. Entry is decided on the
// server from live org membership + role rank (never a client flag): an active
// member whose role meets `minRole` enters freely; everyone else needs the
// passcode. Managers+ of the owning org manage the lock.
export const ORG_DOOR_SPACE_TYPES = [
  "office", "building", "floor", "restricted_office", "executive_suite",
  "tent", "van", "makeshift",
] as const;
export type OrgDoorSpaceType = (typeof ORG_DOOR_SPACE_TYPES)[number];

export const orgDoorLocksTable = pgTable(
  "org_door_locks",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    doorKey: varchar("door_key", { length: 120 }).notNull(),
    label: varchar("label", { length: 200 }),
    spaceType: varchar("space_type", { length: 20 }).notNull().default("office"),
    passcode: varchar("passcode", { length: 120 }).notNull(),
    minRole: varchar("min_role", { length: 20 }).notNull().default("specialist"),
    createdByUserId: varchar("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("org_door_locks_door_key_unique_idx").on(t.doorKey),
    index("org_door_locks_org_id_idx").on(t.orgId),
  ]
);

export type OrgDoorLock = typeof orgDoorLocksTable.$inferSelect;

// ── Org permissions ──────────────────────────────────────────────────────────
// Straightforward, per-org access policy that governs how members CROSS-USE each
// other's data inside an org. Every shareable capability is a permission KEY
// mapped to a minimum role. An active member whose role rank meets/exceeds the
// configured `minRole` may perform that action / see that org-wide data; the
// owner always passes. Rows are OPTIONAL — when a key has no row the
// DEFAULT_PERMISSION_MIN_ROLE applies, so a brand-new org ships with sane
// defaults and zero setup, yet every org gets an extensive matrix it can tune.
export const ORG_PERMISSION_KEYS = [
  "finance.view",
  "finance.export",
  "finance.manage",
  "tax.view",
  "crm.view",
  "crm.edit",
  "members.view",
  "members.manage",
  "billing.manage",
  "autopilot.manage",
  "website.manage",
  "org.settings",
] as const;
export type OrgPermissionKey = (typeof ORG_PERMISSION_KEYS)[number];

export function isOrgPermissionKey(k: string): k is OrgPermissionKey {
  return (ORG_PERMISSION_KEYS as readonly string[]).includes(k);
}

// UI metadata so the permissions matrix is self-describing & grouped.
export const ORG_PERMISSION_META: Record<OrgPermissionKey, { label: string; description: string; group: string }> = {
  "finance.view": { label: "View org finances", description: "See the organization's combined books, revenue & expenses across members.", group: "Finance" },
  "finance.export": { label: "Export tax-ready data", description: "Download org-wide Schedule C / tax exports (CSV & JSON).", group: "Finance" },
  "finance.manage": { label: "Manage org accounts", description: "Transfer funds between org checking and savings accounts.", group: "Finance" },
  "tax.view": { label: "View tax estimates", description: "See org-wide tax estimates and quarterly payment figures.", group: "Finance" },
  "crm.view": { label: "View CRM", description: "See the shared lead & call/SMS activity timeline.", group: "CRM" },
  "crm.edit": { label: "Edit CRM", description: "Create and update leads, notes and outreach.", group: "CRM" },
  "members.view": { label: "View roster", description: "See the full list of organization members.", group: "People" },
  "members.manage": { label: "Manage members", description: "Invite, remove and change roles of members.", group: "People" },
  "billing.manage": { label: "Manage billing", description: "Manage subscriptions, plans and payment methods.", group: "Admin" },
  "autopilot.manage": { label: "Manage autopilot", description: "Assign bots to domains and turn autopilot on or off.", group: "Admin" },
  "website.manage": { label: "Manage public website", description: "Connect a Framer site and manage the org's public SALARYMAN-hosted site.", group: "Admin" },
  "org.settings": { label: "Edit settings & permissions", description: "Change org settings and edit this permissions matrix.", group: "Admin" },
};

// Sensible defaults applied when an org has not customized a key.
export const DEFAULT_PERMISSION_MIN_ROLE: Record<OrgPermissionKey, OrgRole> = {
  "finance.view": "manager",
  "finance.export": "director",
  "finance.manage": "director",
  "tax.view": "manager",
  "crm.view": "specialist",
  "crm.edit": "manager",
  "members.view": "specialist",
  "members.manage": "manager",
  "billing.manage": "ceo",
  "autopilot.manage": "manager",
  "website.manage": "manager",
  "org.settings": "ceo",
};

export const orgPermissionsTable = pgTable(
  "org_permissions",
  {
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 60 }).notNull(),
    minRole: varchar("min_role", { length: 20 }).notNull().default("manager"),
    updatedByUserId: varchar("updated_by_user_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.permissionKey] }),
    index("org_permissions_org_id_idx").on(t.orgId),
  ]
);

export type OrgPermission = typeof orgPermissionsTable.$inferSelect;

// ── Org accounts ─────────────────────────────────────────────────────────────
// Each org gets two named ledger accounts: checking (daily ops) and savings
// (interest-bearing reserve). Balances are in FIAT (game currency, integer).
// These are separate from the personal player wallet — they represent org-level
// treasury, fed by invoice payments, marketplace sales, and bot earnings.
export const ORG_ACCOUNT_TYPES = ["checking", "savings"] as const;
export type OrgAccountType = (typeof ORG_ACCOUNT_TYPES)[number];

export const orgAccountsTable = pgTable(
  "org_accounts",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    balanceFiat: bigint("balance_fiat", { mode: "number" }).notNull().default(0),
    apyBps: integer("apy_bps").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_accounts_org_type_unique_idx").on(t.orgId, t.type),
    index("org_accounts_org_id_idx").on(t.orgId),
  ]
);

export type OrgAccount = typeof orgAccountsTable.$inferSelect;

export const orgAccountTransactionsTable = pgTable(
  "org_account_transactions",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    accountType: varchar("account_type", { length: 20 }).notNull(),
    delta: bigint("delta", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull().default(0),
    description: varchar("description", { length: 500 }).notNull().default(""),
    category: varchar("category", { length: 60 }).notNull().default("other"),
    actorUserId: varchar("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("org_acct_tx_org_id_idx").on(t.orgId),
    index("org_acct_tx_account_type_idx").on(t.orgId, t.accountType),
    index("org_acct_tx_created_at_idx").on(t.createdAt),
  ]
);

export type OrgAccountTransaction = typeof orgAccountTransactionsTable.$inferSelect;
