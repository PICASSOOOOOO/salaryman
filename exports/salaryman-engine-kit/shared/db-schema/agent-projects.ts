import { pgTable, serial, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";

export const AGENT_PROJECT_STATUSES = [
  "planning",
  "building",
  "review",
  "live",
  "paused",
] as const;
export type AgentProjectStatus = (typeof AGENT_PROJECT_STATUSES)[number];

export const agentProjectsTable = pgTable("agent_projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name").notNull(),
  goal: text("goal").notNull().default(""),
  status: varchar("status").notNull().default("planning"),
  progressPct: integer("progress_pct").notNull().default(0),
  assignedBotId: integer("assigned_bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  // Economy hook: every venture is forced to have a physical office/property.
  // Stores the label now; real rent wiring lands when the deck connects to the game economy.
  requiresOffice: boolean("requires_office").notNull().default(true),
  officeLabel: varchar("office_label").notNull().default(""),
  lastBriefing: text("last_briefing").notNull().default(""),
  lastBriefingAt: timestamp("last_briefing_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const AGENT_PROJECT_LOG_KINDS = ["update", "milestone", "pablo", "system"] as const;
export type AgentProjectLogKind = (typeof AGENT_PROJECT_LOG_KINDS)[number];

export const agentProjectLogsTable = pgTable("agent_project_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => agentProjectsTable.id, { onDelete: "cascade" }),
  kind: varchar("kind").notNull().default("update"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentProjectSchema = createInsertSchema(agentProjectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentProject = z.infer<typeof insertAgentProjectSchema>;
export type AgentProject = typeof agentProjectsTable.$inferSelect;
export type AgentProjectLog = typeof agentProjectLogsTable.$inferSelect;
