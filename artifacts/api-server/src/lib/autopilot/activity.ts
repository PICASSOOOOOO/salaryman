import {
  db,
  autopilotActivityLogTable,
  type AutopilotDomain,
  type AutopilotOutcome,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

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

/** Recent activity for an org, newest first. Optionally filter to one domain. */
export async function getRecentAutopilotActivity(
  orgId: number,
  opts?: { domain?: AutopilotDomain; limit?: number }
): Promise<(typeof autopilotActivityLogTable.$inferSelect)[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const where = opts?.domain
    ? and(eq(autopilotActivityLogTable.orgId, orgId), eq(autopilotActivityLogTable.domain, opts.domain))
    : eq(autopilotActivityLogTable.orgId, orgId);
  return db
    .select()
    .from(autopilotActivityLogTable)
    .where(where)
    .orderBy(desc(autopilotActivityLogTable.createdAt))
    .limit(limit);
}
