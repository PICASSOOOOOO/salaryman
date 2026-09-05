import { pgTable, varchar, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// Cross-org friend graph. Same-org coworkers are derived from
// org_members and don't need a row here.
//
// Pair is stored canonically: userAId < userBId (lexicographic). This makes
// (userAId, userBId) the primary key and prevents duplicate symmetric rows.
// requesterId records who initiated so we can show pending requests in the
// right inbox/outbox.
//
// Status:
//   pending  — request sent by requesterId, awaiting addressee
//   accepted — colleagues; can share media both ways
//   blocked  — addressee blocked the requester (no shares either way)
export const colleaguesTable = pgTable(
  "colleagues",
  {
    userAId: varchar("user_a_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    userBId: varchar("user_b_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    requesterId: varchar("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userAId, t.userBId] }),
    index("colleagues_user_a_idx").on(t.userAId),
    index("colleagues_user_b_idx").on(t.userBId),
    index("colleagues_status_idx").on(t.status),
  ],
);

export type Colleague = typeof colleaguesTable.$inferSelect;
export type InsertColleague = typeof colleaguesTable.$inferInsert;

// Helper: canonicalize a pair so the smaller string id is always userA.
export function canonicalPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}
