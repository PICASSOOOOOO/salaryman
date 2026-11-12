import { pgTable, serial, varchar, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const insuranceCarriersTable = pgTable("insurance_carriers", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  shortName: varchar("short_name", { length: 20 }).notNull(),
  category: varchar("category", { length: 40 }).notNull().default("health"),
  logoColor: varchar("logo_color", { length: 10 }).notNull().default("#38bdf8"),
  apiBaseUrl: varchar("api_base_url", { length: 255 }),
  authType: varchar("auth_type", { length: 20 }).notNull().default("jwt"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insuranceAgencyConnectionsTable = pgTable("insurance_agency_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  orgId: integer("org_id"),
  carrierId: integer("carrier_id").notNull(),
  agencyName: varchar("agency_name", { length: 200 }),
  npn: varchar("npn", { length: 20 }),
  apiToken: text("api_token"),
  apiConfig: jsonb("api_config"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insuranceClientsTable = pgTable("insurance_clients", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  orgId: integer("org_id"),
  connectionId: integer("connection_id"),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  dateOfBirth: varchar("date_of_birth", { length: 10 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zip_code", { length: 10 }),
  source: varchar("source", { length: 40 }).notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insurancePoliciesTable = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  orgId: integer("org_id"),
  carrierId: integer("carrier_id").notNull(),
  connectionId: integer("connection_id"),
  policyNumber: varchar("policy_number", { length: 60 }),
  planName: varchar("plan_name", { length: 200 }),
  planType: varchar("plan_type", { length: 40 }),
  status: varchar("status", { length: 30 }).notNull().default("quoted"),
  premiumMonthly: integer("premium_monthly"),
  effectiveDate: varchar("effective_date", { length: 10 }),
  terminationDate: varchar("termination_date", { length: 10 }),
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  externalId: varchar("external_id", { length: 100 }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insuranceCallLogsTable = pgTable("insurance_call_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  clientId: integer("client_id"),
  callSid: varchar("call_sid", { length: 100 }),
  direction: varchar("direction", { length: 10 }).notNull().default("inbound"),
  callType: varchar("call_type", { length: 20 }).notNull().default("sales"),
  callerPhone: varchar("caller_phone", { length: 30 }),
  duration: integer("duration"),
  outcome: varchar("outcome", { length: 30 }),
  transcript: text("transcript"),
  extractedInfo: jsonb("extracted_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInsuranceCarrierSchema = createInsertSchema(insuranceCarriersTable).omit({ id: true, createdAt: true });
export type InsertInsuranceCarrier = z.infer<typeof insertInsuranceCarrierSchema>;
export type InsuranceCarrier = typeof insuranceCarriersTable.$inferSelect;

export const insertAgencyConnectionSchema = createInsertSchema(insuranceAgencyConnectionsTable).omit({ id: true, createdAt: true });
export type InsertAgencyConnection = z.infer<typeof insertAgencyConnectionSchema>;
export type AgencyConnection = typeof insuranceAgencyConnectionsTable.$inferSelect;

export const insertInsuranceClientSchema = createInsertSchema(insuranceClientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInsuranceClient = z.infer<typeof insertInsuranceClientSchema>;
export type InsuranceClient = typeof insuranceClientsTable.$inferSelect;

export const insertInsurancePolicySchema = createInsertSchema(insurancePoliciesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInsurancePolicy = z.infer<typeof insertInsurancePolicySchema>;
export type InsurancePolicy = typeof insurancePoliciesTable.$inferSelect;

export const INSURANCE_CARRIERS_SEED: { slug: string; name: string; shortName: string; category: string; logoColor: string; authType: string; apiBaseUrl?: string }[] = [
  { slug: "united_healthcare", name: "UNITED HEALTHCARE", shortName: "UHC", category: "health", logoColor: "#0072CE", authType: "jwt" },
  { slug: "humana", name: "HUMANA", shortName: "HUM", category: "health", logoColor: "#4CAF50", authType: "jwt" },
  { slug: "anthem", name: "ANTHEM", shortName: "ANT", category: "health", logoColor: "#003DA5", authType: "jwt" },
  { slug: "zing", name: "ZING", shortName: "ZNG", category: "health", logoColor: "#FF6B00", authType: "jwt" },
  { slug: "devoted", name: "DEVOTED", shortName: "DEV", category: "health", logoColor: "#E91E63", authType: "jwt" },
  { slug: "cigna", name: "CIGNA", shortName: "CIG", category: "health", logoColor: "#00A651", authType: "jwt" },
  { slug: "aetna", name: "AETNA", shortName: "AET", category: "health", logoColor: "#7B2D8E", authType: "jwt" },
  { slug: "wellcare", name: "WELLCARE", shortName: "WLC", category: "health", logoColor: "#00B4D8", authType: "jwt" },
  { slug: "sunfire", name: "SUNFIRE", shortName: "SUN", category: "health", logoColor: "#F59E0B", authType: "jwt", apiBaseUrl: "https://api.sunfireagents.com" },
];

export const POLICY_STATUSES = ["quoted", "submitted", "pending", "active", "cancelled", "lapsed", "declined", "expired"] as const;
export type PolicyStatus = typeof POLICY_STATUSES[number];

export const CALL_TYPES = ["sales", "support", "partner", "follow_up", "renewal"] as const;
export type InsuranceCallType = typeof CALL_TYPES[number];

export const CALL_OUTCOMES = ["qualified", "transferred", "voicemail", "callback", "not_interested", "disqualified", "no_answer"] as const;
export type CallOutcome = typeof CALL_OUTCOMES[number];
