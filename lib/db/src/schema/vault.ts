import { pgTable, serial, varchar, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const vaultEntriesTable = pgTable("vault_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull().default(""),
  entryType: varchar("entry_type", { length: 50 }).notNull().default("note"),
  tags: jsonb("tags").notNull().default([]),
  color: varchar("color", { length: 20 }),
  folder: varchar("folder", { length: 500 }).notNull().default("/"),
  frontmatter: jsonb("frontmatter").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("vault_entries_user_idx").on(t.userId),
  index("vault_entries_folder_idx").on(t.userId, t.folder),
]);

export const vaultConnectionsTable = pgTable("vault_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 256 }).notNull(),
  sourceId: integer("source_id").notNull().references(() => vaultEntriesTable.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => vaultEntriesTable.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 200 }),
  strength: integer("strength").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("vault_connections_user_idx").on(t.userId),
  index("vault_connections_source_idx").on(t.sourceId),
  index("vault_connections_target_idx").on(t.targetId),
]);
