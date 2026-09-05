import {
  db,
  autopilotActivityLogTable,
  type AutopilotDomain,
  type AutopilotOutcome,
} from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";

// Org-scoped audit feed for autopilot. Every automated action (and every blocked
// attempt) lands here so humans can review and trust what each bot did.

export interface RecordActivityInput {
  orgId: number;
  domain: AutopilotDomain;
  botId?: number | null;
  action: string;
  summary: string;
  outcome: AutopilotOutcome;
  detail?: Record<string, unknown>;
}

/** Append one entry to the activity log. Best-effort — never throws. */
export async function recordAutopilotActivity(input: RecordActivityInput): Promise<void> {
  try {
    await db.insert(autopilotActivityLogTable).values({
      orgId: input.orgId,
      domain: input.domain,
      botId: input.botId ?? null,
      action: input.action.slice(0, 80),
      summary: input.summary.slice(0, 2000),
      outcome: input.outcome,
      detail: input.detail ?? {},
    });
  } catch (err) {
    console.error("[Autopilot] Failed to record activity:", err);
  }
}

/**
 * Recent activity for an org, newest first. Optionally filter to one domain.
 * Pass `before` (an entry id) to page backwards through older entries — the
 * query returns rows strictly older than that id, enabling load-more / infinite
 * scroll. Ordering is by (createdAt, id) desc so the id cursor is stable even
 * when several rows share a timestamp.
 */
export async function getRecentAutopilotActivity(
  orgId: number,
  opts?: { domain?: AutopilotDomain; limit?: number; before?: number }
): Promise<(typeof autopilotActivityLogTable.$inferSelect)[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const conditions = [eq(autopilotActivityLogTable.orgId, orgId)];
  if (opts?.domain) {
    conditions.push(eq(autopilotActivityLogTable.domain, opts.domain));
  }
  if (opts?.before != null && Number.isFinite(opts.before)) {
    conditions.push(lt(autopilotActivityLogTable.id, opts.before));
  }
  return db
    .select()
    .from(autopilotActivityLogTable)
    .where(and(...conditions))
    .orderBy(desc(autopilotActivityLogTable.createdAt), desc(autopilotActivityLogTable.id))
    .limit(limit);
}
