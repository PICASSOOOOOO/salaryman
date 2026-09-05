import { pgTable, serial, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per credit-score snapshot, recorded each time the engine recomputes
 * a player's score (hourly cadence or on-demand refresh). Used to render the
 * score-history sparkline in the CREDIT tab of the bank panel.
 *
 * We keep at most 20 rows per user (pruned by the write path) so the table
 * stays bounded without a separate cron job.
 */
export const creditScoreHistoryTable = pgTable(
  "credit_score_history",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    score: integer("score").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("credit_score_history_user_idx").on(t.userId),
    userTimeIdx: index("credit_score_history_user_time_idx").on(t.userId, t.recordedAt),
  }),
);

export type CreditScoreHistory = typeof creditScoreHistoryTable.$inferSelect;
