import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";

export const brandKitTable = pgTable("brand_kit", {
  userId: varchar("user_id").primaryKey(),
  companyName: varchar("company_name").notNull().default(""),
  tagline: varchar("tagline").notNull().default(""),
  mission: text("mission").notNull().default(""),
  primaryColor: varchar("primary_color").notNull().default("#6366f1"),
  secondaryColor: varchar("secondary_color").notNull().default("#8b5cf6"),
  logoUrl: text("logo_url").notNull().default(""),
  website: varchar("website").notNull().default(""),
  industry: varchar("industry").notNull().default(""),
  targetAudience: text("target_audience").notNull().default(""),
  fontPrimary: varchar("font_primary").notNull().default(""),
  fontSecondary: varchar("font_secondary").notNull().default(""),
  toneOfVoice: text("tone_of_voice").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BrandKit = typeof brandKitTable.$inferSelect;
