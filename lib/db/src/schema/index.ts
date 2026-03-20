// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./conversations";
export * from "./messages";
export * from "./auth";
export * from "./contacts";
export * from "./user-memory";
export * from "./projects";
export * from "./notes";
export * from "./brand-kit";
export * from "./user-tiers";
export * from "./user-features";
export * from "./world-businesses";
export * from "./salaryman-saves";
export * from "./billboards";
export * from "./hiring";
export * from "./documents";
export * from "./zapier-webhooks";
export * from "./appointments";
export * from "./call-history";
export * from "./subscribers";
export * from "./campaigns";
export * from "./deals";
export * from "./goals";
export * from "./merch";
export * from "./cosmetics";
export * from "./donations";
export * from "./salaryman-season";
export * from "./meetings";
export * from "./investor-leads";
export * from "./feature-trials";
