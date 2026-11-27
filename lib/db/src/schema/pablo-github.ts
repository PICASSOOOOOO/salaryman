import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export interface PabloGithubRepository {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export const pabloGithubConnectionsTable = pgTable("pablo_github_connections", {
  userId: varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  githubUserId: varchar("github_user_id", { length: 40 }).notNull(),
  githubLogin: varchar("github_login", { length: 100 }).notNull(),
  encryptedCredentials: text("encrypted_credentials").notNull(),
  selectedRepositories: jsonb("selected_repositories")
    .$type<PabloGithubRepository[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPabloGithubConnectionSchema = createInsertSchema(pabloGithubConnectionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPabloGithubConnection = z.infer<typeof insertPabloGithubConnectionSchema>;
export type PabloGithubConnection = typeof pabloGithubConnectionsTable.$inferSelect;

export type PabloGithubChangeStatus =
  | "pending"
  | "opened"
  | "rejected"
  | "failed";

export const pabloGithubChangesTable = pgTable("pablo_github_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  repositoryId: varchar("repository_id", { length: 40 }).notNull(),
  repositoryFullName: varchar("repository_full_name", { length: 255 }).notNull(),
  baseBranch: varchar("base_branch", { length: 255 }).notNull(),
  baseSha: varchar("base_sha", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  diffHash: varchar("diff_hash", { length: 64 }).notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  status: varchar("status", { length: 16 }).$type<PabloGithubChangeStatus>().notNull().default("pending"),
  branchName: varchar("branch_name", { length: 255 }),
  pullRequestUrl: text("pull_request_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pablo_github_changes_user_created_idx").on(table.userId, table.createdAt),
  index("pablo_github_changes_user_status_idx").on(table.userId, table.status),
]);
export const insertPabloGithubChangeSchema = createInsertSchema(pabloGithubChangesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPabloGithubChange = z.infer<typeof insertPabloGithubChangeSchema>;
export type PabloGithubChange = typeof pabloGithubChangesTable.$inferSelect;
