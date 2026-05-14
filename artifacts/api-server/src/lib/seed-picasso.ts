import { db, organizationsTable, orgMembersTable, usersTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { isPicassoOrgMemberEmail } from "./plan";

const PICASSO_ORG_NAME = "PICASSO";
const SHADOW_TOWER = "Shadow Tower";

/**
 * Ensure the PICASSO org exists, is flagged as a developer org, and that
 * every email on PICASSO_ORG_MEMBER_EMAILS (a strict subset of the broader
 * owner-email list — testers like kozzy2k11 are NOT included) is stitched
 * in as an active member with the `owner` role. This is what makes the
 * org membership and the isOwnerEmail bypass agree for actual Picasso
 * staff — without it, a staff email would unlock all features (via
 * plan.ts) but the org's member list would still show them as missing,
 * which breaks any UI that lists Picasso staff.
 *
 * Idempotent: rerun on every boot.
 */
export async function seedPicassoOrg(): Promise<void> {
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = 'picasso'`);

  let orgId: number;
  if (existing) {
    orgId = existing.id;
    if (!existing.isDeveloper) {
      await db
        .update(organizationsTable)
        .set({ isDeveloper: true })
        .where(eq(organizationsTable.id, existing.id));
      console.log("[Picasso Seed] Flagged existing Picasso org as developer org.");
    } else {
      console.log("[Picasso Seed] Picasso org already configured correctly.");
    }

    await db
      .update(orgMembersTable)
      .set({ spawnLocation: SHADOW_TOWER })
      .where(
        sql`${orgMembersTable.orgId} = ${existing.id} AND (${orgMembersTable.spawnLocation} IS NULL OR ${orgMembersTable.spawnLocation} != ${SHADOW_TOWER})`
      );
  } else {
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: PICASSO_ORG_NAME,
        ownerUserId: "system",
        isDeveloper: true,
      })
      .returning();
    orgId = org.id;
    console.log(`[Picasso Seed] Created Picasso developer org (id=${org.id}).`);
  }

  await ensureAdminMemberships(orgId);
}

/**
 * Look up every user whose email is on the PICASSO_ORG_MEMBER_EMAILS list
 * (a strict subset of the owner-email list — testers like kozzy2k11 are
 * NOT included) and make sure they're an active `owner` member of the
 * Picasso org. New Picasso staff member? Add their email to
 * PICASSO_ORG_MEMBER_EMAILS in plan.ts and the next boot picks them up.
 */
async function ensureAdminMemberships(orgId: number): Promise<void> {
  // Pull every user — the hardcoded list is tiny (<10), so this is cheaper
  // than `lower(email) IN (...)` against an unindexed lowered column.
  const allUsers = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable);
  const orgMemberUsers = allUsers.filter(u => isPicassoOrgMemberEmail(u.email));

  if (orgMemberUsers.length === 0) {
    console.log("[Picasso Seed] No Picasso-member-email users registered yet — nothing to stitch.");
    return;
  }

  // Existing memberships in the org for any of these Picasso members.
  const memberIds = orgMemberUsers.map(u => u.id);
  const existingRows = await db
    .select({ userId: orgMembersTable.userId, status: orgMembersTable.status, role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      inArray(orgMembersTable.userId, memberIds),
    ));
  const existingByUserId = new Map(existingRows.map(r => [r.userId, r]));

  let inserted = 0;
  let promoted = 0;
  for (const u of orgMemberUsers) {
    const cur = existingByUserId.get(u.id);
    if (!cur) {
      await db
        .insert(orgMembersTable)
        .values({
          orgId,
          userId: u.id,
          role: "owner",
          status: "active",
          memberType: "employee",
          spawnLocation: SHADOW_TOWER,
          title: "Picasso Admin",
          joinedAt: new Date(),
        })
        .onConflictDoNothing();
      inserted++;
    } else if (cur.status !== "active" || cur.role !== "owner") {
      // Heal stale rows so an admin who was once "invited" or downgraded
      // doesn't sit there inactive.
      await db
        .update(orgMembersTable)
        .set({ status: "active", role: "owner" })
        .where(and(
          eq(orgMembersTable.orgId, orgId),
          eq(orgMembersTable.userId, u.id),
        ));
      promoted++;
    }
  }
  if (inserted > 0 || promoted > 0) {
    console.log(`[Picasso Seed] Picasso members reconciled: ${inserted} added, ${promoted} promoted (${orgMemberUsers.length} total Picasso member user(s)).`);
  } else {
    console.log(`[Picasso Seed] All ${orgMemberUsers.length} Picasso member user(s) already active owners of Picasso.`);
  }
}
