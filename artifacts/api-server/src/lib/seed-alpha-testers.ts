import { db, usersTable, alphaApplicationsTable } from "@workspace/db";
import { inArray, and, eq, sql } from "drizzle-orm";
import { ownerEmails } from "./plan";

/**
 * Idempotent boot job: every Picasso owner / tester email (HARDCODED_OWNER_EMAILS
 * + OWNER_EMAILS env var) gets an *approved* alpha_tester row so they appear
 * in the admin alpha dashboard and can submit BUG reports without applying.
 *
 * - No-op for owners who haven't signed up yet (no users.id to reference).
 * - No-op for rows already approved (skip).
 * - Promotes pending/rejected/revoked rows to approved (the email being on
 *   the owner list is the decision; the row just records it).
 *
 * Uses a single SELECT + per-row upsert so it stays cheap even as the owner
 * list grows. Runs once at boot, errors are logged but never crash the
 * server.
 */
export async function ensureOwnersAreApprovedAlphaTesters(): Promise<void> {
  const emails = ownerEmails();
  if (emails.length === 0) return;
  try {
    // Case-insensitive match: ownerEmails() lowercases its list, but stored
    // emails may be mixed case if any auth path skipped normalization.
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(sql`LOWER(${usersTable.email})`, emails));

    if (users.length === 0) {
      console.log(`[Alpha Seed] No signed-up owners yet (${emails.length} emails on list).`);
      return;
    }

    let granted = 0;
    let failed = 0;
    for (const u of users) {
      // Atomic upsert: insert approved, or force-promote whatever exists
      // to approved. Race-safe against concurrent boots and against any
      // pending/rejected/revoked row a user may have submitted manually.
      // Per-user try/catch isolates failures so one bad row can't block
      // the rest of the list.
      try {
        await db.insert(alphaApplicationsTable).values({
          userId: u.id,
          role: "alpha_tester",
          status: "approved",
          reason: "Picasso staff / tester — auto-enrolled.",
          experience: "",
          decidedByUserId: "system:owner-list",
          decidedAt: new Date(),
          decisionNote: "Auto-approved at boot.",
        }).onConflictDoUpdate({
          target: [alphaApplicationsTable.userId, alphaApplicationsTable.role],
          set: {
            status: "approved",
            decidedByUserId: "system:owner-list",
            decidedAt: new Date(),
            decisionNote: "Auto-approved: email on Picasso owner/tester list.",
            updatedAt: new Date(),
          },
        });
        granted++;
      } catch (err) {
        failed++;
        console.error(`[Alpha Seed] Failed to approve ${u.email}:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`[Alpha Seed] Owners approved as alpha testers: ${granted} ok, ${failed} failed (${users.length} signed-up of ${emails.length} on list).`);
  } catch (err) {
    console.error("[Alpha Seed] Failed:", err instanceof Error ? err.message : err);
  }
}
