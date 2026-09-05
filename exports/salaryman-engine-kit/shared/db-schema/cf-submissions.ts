import { pgTable, serial, varchar, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Collections-Facility labor submissions.
 *
 * Every time an inmate completes a debt-paying activity inside CF, a row
 * lands here. The whole point of CF is twofold:
 *
 *   1. The inmate works off their ƒ debt instead of just sitting (passive
 *      sitting now pays nothing — see /api/cf/work-* endpoints).
 *   2. We capture the labor product. Bug reports, feature ideas, and data
 *      labels become real signal we can use to develop Salaryman; ad
 *      impressions and sponsor clicks become real revenue. CF is how the
 *      game pays for itself instead of leaning on Replit-generated assets.
 *
 * `kind` enumerates the activity. `payload` is whatever the activity
 * captured: free-text for bug/feature, label choice for data-label, ad
 * unit id for ad/sponsor. `payoff` is the ƒ amount the server actually
 * deducted from debt (post-cooldown, post-clamp).
 *
 * When an inmate's labor is redirected to benefit an org (via the org-scoped
 * forced-labor flow), benefitingOrgId / benefitingOrgName record which org
 * received credit for the work. Null = Pablo community projects (default).
 */
export const cfSubmissionsTable = pgTable(
  "cf_submissions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    // 'ad' | 'bug' | 'feature' | 'label' | 'sponsor' | 'build' | 'construction'
    kind: varchar("kind", { length: 24 }).notNull(),
    // Free-text body for bug/feature kinds; null for click-only kinds.
    body: text("body"),
    // Structured payload (label choice, ad unit, sponsor id, etc.).
    payload: jsonb("payload"),
    // ƒ deducted from this user's debt for this submission.
    payoff: integer("payoff").notNull(),
    // When this submission benefited an org (org-scoped labor), record which
    // org was credited. Null = Pablo community project (default path).
    benefitingOrgId: varchar("benefiting_org_id", { length: 64 }),
    benefitingOrgName: varchar("benefiting_org_name", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("cf_submissions_user_idx").on(t.userId),
    kindIdx: index("cf_submissions_kind_idx").on(t.kind),
    createdIdx: index("cf_submissions_created_idx").on(t.createdAt),
    benefitIdx: index("cf_submissions_benefit_idx").on(t.benefitingOrgId),
  }),
);

export const insertCfSubmissionSchema = createInsertSchema(cfSubmissionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCfSubmission = z.infer<typeof insertCfSubmissionSchema>;
export type CfSubmission = typeof cfSubmissionsTable.$inferSelect;
