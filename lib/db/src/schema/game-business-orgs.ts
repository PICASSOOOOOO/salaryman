import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const GAME_BUSINESS_KINDS = ["real", "fictional", "illegal"] as const;
export type GameBusinessKind = (typeof GAME_BUSINESS_KINDS)[number];

export const GAME_BUSINESS_ORG_STATUSES = ["active", "collections", "closed"] as const;
export type GameBusinessOrgStatus = (typeof GAME_BUSINESS_ORG_STATUSES)[number];

export const gameBusinessOrgsTable = pgTable("game_business_orgs", {
  id: serial("id").primaryKey(),
  ownerUserId: varchar("owner_user_id", { length: 256 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  kind: varchar("kind", { length: 16 }).notNull().$type<GameBusinessKind>(),
  cityId: varchar("city_id", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active").$type<GameBusinessOrgStatus>(),
  treasuryFiat: bigint("treasury_fiat", { mode: "number" }).notNull().default(0),
  treasuryGold: bigint("treasury_gold", { mode: "number" }).notNull().default(0),
  collectionsStartedAt: timestamp("collections_started_at", { withTimezone: true }),
  requalifiesAt: timestamp("requalifies_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("game_business_orgs_owner_name_city_unique_idx").on(t.ownerUserId, t.name, t.cityId),
  index("game_business_orgs_status_idx").on(t.status, t.collectionsStartedAt),
]);

export const insertGameBusinessOrgSchema = createInsertSchema(gameBusinessOrgsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGameBusinessOrg = z.infer<typeof insertGameBusinessOrgSchema>;
export type GameBusinessOrg = typeof gameBusinessOrgsTable.$inferSelect;

export const GAME_BUSINESS_MEMBER_ROLES = ["owner", "member"] as const;
export type GameBusinessMemberRole = (typeof GAME_BUSINESS_MEMBER_ROLES)[number];

export const gameBusinessOrgMembersTable = pgTable("game_business_org_members", {
  orgId: integer("org_id").notNull().references(() => gameBusinessOrgsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 256 }).notNull(),
  role: varchar("role", { length: 16 }).notNull().default("member").$type<GameBusinessMemberRole>(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_business_org_members_org_user_unique_idx").on(t.orgId, t.userId),
  index("game_business_org_members_user_idx").on(t.userId),
]);
export type GameBusinessOrgMember = typeof gameBusinessOrgMembersTable.$inferSelect;

export const GAME_BUSINESS_INCOME_CURRENCIES = ["fiat", "gold", "credits"] as const;
export type GameBusinessIncomeCurrency = (typeof GAME_BUSINESS_INCOME_CURRENCIES)[number];

export const GAME_BUSINESS_INCOME_TYPES = ["earned", "stolen"] as const;
export type GameBusinessIncomeType = (typeof GAME_BUSINESS_INCOME_TYPES)[number];

export const gameBusinessIncomeEventsTable = pgTable("game_business_income_events", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => gameBusinessOrgsTable.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 16 }).notNull().$type<GameBusinessIncomeCurrency>(),
  incomeType: varchar("income_type", { length: 16 }).notNull().$type<GameBusinessIncomeType>(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  requestId: varchar("request_id", { length: 128 }).notNull(),
  actorUserId: varchar("actor_user_id", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_business_income_events_org_request_unique_idx").on(t.orgId, t.requestId),
  index("game_business_income_events_org_created_idx").on(t.orgId, t.createdAt),
]);
export type GameBusinessIncomeEvent = typeof gameBusinessIncomeEventsTable.$inferSelect;

export const GAME_BUSINESS_TAX_STATUSES = ["owed", "paid", "collections", "closed"] as const;
export type GameBusinessTaxStatus = (typeof GAME_BUSINESS_TAX_STATUSES)[number];

export const gameBusinessTaxAssessmentsTable = pgTable("game_business_tax_assessments", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => gameBusinessOrgsTable.id, { onDelete: "cascade" }),
  taxDate: date("tax_date", { mode: "string" }).notNull(),
  currency: varchar("currency", { length: 16 }).notNull().$type<"fiat" | "gold">(),
  rateBps: integer("rate_bps").notNull(),
  taxableGrossIncome: bigint("taxable_gross_income", { mode: "number" }).notNull().default(0),
  taxAmount: bigint("tax_amount", { mode: "number" }).notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("owed").$type<GameBusinessTaxStatus>(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("game_business_tax_assessments_org_day_currency_unique_idx").on(t.orgId, t.taxDate, t.currency),
  index("game_business_tax_assessments_status_due_idx").on(t.status, t.dueAt),
]);
export type GameBusinessTaxAssessment = typeof gameBusinessTaxAssessmentsTable.$inferSelect;
