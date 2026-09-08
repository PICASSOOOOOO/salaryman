import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const socialPostsTable = pgTable(
  "social_posts",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 256 }).notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    content: text("content").notNull().default(""),
    mediaUrls: jsonb("media_urls").default([]),
    hashtags: jsonb("hashtags").default([]),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalPostId: varchar("external_post_id", { length: 512 }),
    impressions: integer("impressions").notNull().default(0),
    engagements: integer("engagements").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    aiGenerated: varchar("ai_generated", { length: 8 }).notNull().default("no"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("social_posts_user_idx").on(table.userId),
    index("social_posts_status_idx").on(table.status),
    index("social_posts_platform_idx").on(table.platform),
    index("social_posts_scheduled_idx").on(table.scheduledAt),
  ]
);
