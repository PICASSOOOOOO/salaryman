import { and, eq } from "drizzle-orm";
import { db, callHistoryTable, sharedMediaTable } from "@workspace/db";
import { canDoInOrg } from "./org-permissions";

/**
 * A phone recording is available to its owner, a phone supervisor in the
 * recording's organization, or a user who received an explicit recording share.
 * Organization membership alone does not expose call audio.
 */
export async function getCallRecordingAccess(userId: string, callId: number) {
  const [call] = await db
    .select()
    .from(callHistoryTable)
    .where(eq(callHistoryTable.id, callId))
    .limit(1);

  if (!call) return { call: null, allowed: false as const };
  if (call.userId === userId) return { call, allowed: true as const };

  if (call.orgId != null && (await canDoInOrg(userId, call.orgId, "phone.supervise")).allowed) {
    return { call, allowed: true as const };
  }

  const [share] = await db
    .select({ id: sharedMediaTable.id })
    .from(sharedMediaTable)
    .where(and(
      eq(sharedMediaTable.toUserId, userId),
      eq(sharedMediaTable.callHistoryId, call.id),
      eq(sharedMediaTable.mediaType, "recording"),
    ))
    .limit(1);

  return { call, allowed: Boolean(share) as boolean };
}
