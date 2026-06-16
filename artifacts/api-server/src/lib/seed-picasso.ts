import { db, organizationsTable, orgMembersTable, usersTable, salarymanSavesTable, adminAuditLogTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { isPicassoOrgMemberEmail } from "./plan";
import { assignGuildRole, removeGuildRole } from "./discord-auth";

const PICASSO_ORG_NAME = "PICASSO";
const SHADOW_TOWER = "Shadow Tower";
const PICASSO_ADMIN_FIAT = 999_999_999;

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

  // Apply perks (one-time fiat + Discord admin role) to ALL active PICASSO org
  // owners — not just those reconciled from the hardcoded email list. This
  // ensures that any user promoted to owner-role in the PICASSO org through
  // any path (not just boot-time email seeding) receives their entitlements.
  await applyPerksToAllPicassoOrgOwners(orgId);

  // Flush any pending fiat grants for users who now have a save but didn't
  // have one the last time this ran.
  await flushPendingAdminFiatGrants();
}

/**
 * Run grantPicassoAdminPerks for every current active `owner`-role member of
 * the PICASSO org. This is the authoritative sweep that covers non-email-list
 * admins and any promotions that happened between boots.
 */
async function applyPerksToAllPicassoOrgOwners(orgId: number): Promise<void> {
  const allOwners = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.status, "active"),
      eq(orgMembersTable.role, "owner"),
    ));

  if (allOwners.length === 0) return;

  for (const { userId } of allOwners) {
    await grantPicassoAdminPerks(userId);
  }
  console.log(`[Picasso Seed] Perks applied/verified for ${allOwners.length} active PICASSO org owner(s).`);
}

/**
 * Look up every user whose email is on the PICASSO_ORG_MEMBER_EMAILS list
 * (a strict subset of the owner-email list — testers like kozzy2k11 are
 * NOT included) and make sure they're an active `owner` member of the
 * Picasso org. New Picasso staff member? Add their email to
 * PICASSO_ORG_MEMBER_EMAILS in plan.ts and the next boot picks them up.
 *
 * On every promotion/insert the function also:
 *  - Grants a one-time 999,999,999 fiat to their active game save
 *    (idempotent: tracked in admin_audit_log as action="picasso_admin_fiat_grant").
 *  - Assigns the Discord admin role (best-effort, silent when unconfigured).
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

    // Grant the one-time fiat and assign the Discord admin role for every
    // confirmed Picasso admin, regardless of whether they were just added or
    // were already present.
    await grantPicassoAdminPerks(u.id);
  }
  if (inserted > 0 || promoted > 0) {
    console.log(`[Picasso Seed] Picasso members reconciled: ${inserted} added, ${promoted} promoted (${orgMemberUsers.length} total Picasso member user(s)).`);
  } else {
    console.log(`[Picasso Seed] All ${orgMemberUsers.length} Picasso member user(s) already active owners of Picasso.`);
  }
}

/**
 * Apply all perks that a Picasso org admin should receive exactly once:
 *  1. 999,999,999 fiat to their active game save (idempotent).
 *  2. Discord admin role (best-effort, silent when unconfigured).
 *
 * Safe to call on every boot — the fiat grant is guarded by a permanent
 * admin_audit_log marker and will never be re-applied once delivered.
 */
export async function grantPicassoAdminPerks(userId: string): Promise<void> {
  await grantAdminFiat(userId);
  await assignAdminDiscordRole(userId);
}

/**
 * Grant 999,999,999 fiat to the user's active game save — exactly once.
 * Idempotency marker: admin_audit_log row with action="picasso_admin_fiat_grant"
 * and targetId=userId. Details:
 *   "granted"  — fiat was applied to a save successfully.
 *   "pending"  — user had no save at grant time; call again once a save exists.
 *
 * Callers (boot-time seed + flushPendingAdminFiatGrants) handle both paths.
 */
async function grantAdminFiat(userId: string): Promise<void> {
  // Check for an existing non-pending grant marker.
  const existing = await db
    .select({ id: adminAuditLogTable.id, details: adminAuditLogTable.details })
    .from(adminAuditLogTable)
    .where(and(
      eq(adminAuditLogTable.action, "picasso_admin_fiat_grant"),
      eq(adminAuditLogTable.targetId, userId),
    ))
    .limit(1);

  if (existing.length > 0 && existing[0].details !== "pending") {
    // Already granted (or otherwise resolved) — nothing to do.
    return;
  }

  // Find their active save.
  const [save] = await db
    .select({ id: salarymanSavesTable.id, salary: salarymanSavesTable.salary })
    .from(salarymanSavesTable)
    .where(eq(salarymanSavesTable.userId, userId))
    .limit(1);

  if (!save) {
    // No save yet. Record a pending marker so we retry at the next boot.
    if (existing.length === 0) {
      await db.insert(adminAuditLogTable).values({
        adminId: "system",
        action: "picasso_admin_fiat_grant",
        targetType: "user",
        targetId: userId,
        details: "pending",
      });
      console.log(`[Picasso Seed] Admin fiat grant pending (no save yet) for user ${userId}.`);
    }
    return;
  }

  // Apply the grant.
  const newSalary = save.salary + PICASSO_ADMIN_FIAT;
  await db
    .update(salarymanSavesTable)
    .set({ salary: newSalary })
    .where(eq(salarymanSavesTable.id, save.id));

  // Persist the idempotency marker. If a pending row exists, update it;
  // otherwise insert a fresh one.
  if (existing.length > 0) {
    await db
      .update(adminAuditLogTable)
      .set({ details: "granted" })
      .where(eq(adminAuditLogTable.id, existing[0].id));
  } else {
    await db.insert(adminAuditLogTable).values({
      adminId: "system",
      action: "picasso_admin_fiat_grant",
      targetType: "user",
      targetId: userId,
      details: "granted",
    });
  }

  console.log(`[Picasso Seed] Granted ${PICASSO_ADMIN_FIAT} fiat to Picasso admin ${userId} (new salary: ${newSalary}).`);
}

/**
 * Flush any "pending" admin fiat grant for a specific user who now has a save.
 * Called from the PUT save route so the grant lands as soon as the user's first
 * save is created, without waiting for the next boot.
 */
export async function flushPendingAdminFiatGrant(userId: string): Promise<void> {
  const [pending] = await db
    .select({ id: adminAuditLogTable.id })
    .from(adminAuditLogTable)
    .where(and(
      eq(adminAuditLogTable.action, "picasso_admin_fiat_grant"),
      eq(adminAuditLogTable.targetId, userId),
      sql`${adminAuditLogTable.details} = 'pending'`,
    ))
    .limit(1);
  if (!pending) return;
  await grantAdminFiat(userId);
}

/**
 * Flush any "pending" admin fiat grants for users who now have a save.
 * Runs at boot after ensureAdminMemberships so the grant eventually lands
 * even if the user had no save the first time they were seeded as admin.
 */
async function flushPendingAdminFiatGrants(): Promise<void> {
  const pendingRows = await db
    .select({ id: adminAuditLogTable.id, targetId: adminAuditLogTable.targetId })
    .from(adminAuditLogTable)
    .where(and(
      eq(adminAuditLogTable.action, "picasso_admin_fiat_grant"),
      sql`${adminAuditLogTable.details} = 'pending'`,
    ));

  if (pendingRows.length === 0) return;

  for (const row of pendingRows) {
    if (!row.targetId) continue;
    const [save] = await db
      .select({ id: salarymanSavesTable.id, salary: salarymanSavesTable.salary })
      .from(salarymanSavesTable)
      .where(eq(salarymanSavesTable.userId, row.targetId))
      .limit(1);

    if (!save) continue;

    const newSalary = save.salary + PICASSO_ADMIN_FIAT;
    await db
      .update(salarymanSavesTable)
      .set({ salary: newSalary })
      .where(eq(salarymanSavesTable.id, save.id));

    await db
      .update(adminAuditLogTable)
      .set({ details: "granted" })
      .where(eq(adminAuditLogTable.id, row.id));

    console.log(`[Picasso Seed] Flushed pending admin fiat grant: ${PICASSO_ADMIN_FIAT} fiat → user ${row.targetId} (new salary: ${newSalary}).`);
  }
}

/**
 * Assign the Discord admin role (DISCORD_ADMIN_ROLE_ID) to the user if their
 * userId indicates a Discord login. Best-effort: silent no-op when the env
 * isn't configured or the user signed in via a different provider.
 */
async function assignAdminDiscordRole(userId: string): Promise<void> {
  if (!userId.startsWith("discord:")) return;
  const discordId = userId.slice("discord:".length);
  assignGuildRole({ userId: discordId, role: "admin" })
    .then((r) => { if (r !== "skipped") console.log(`[Picasso Seed] Admin Discord role for ${discordId}: ${r}`); })
    .catch((e) => console.error("[Picasso Seed] Admin Discord role assign error:", e));
}

/**
 * Remove the Discord admin role from a user who has lost Picasso admin status.
 * Best-effort, mirrors the tester moderator-role removal pattern.
 */
export async function removeAdminDiscordRole(userId: string): Promise<void> {
  if (!userId.startsWith("discord:")) return;
  const discordId = userId.slice("discord:".length);
  removeGuildRole({ userId: discordId, role: "admin" })
    .then((r) => { if (r !== "skipped") console.log(`[Picasso Seed] Admin Discord role removed for ${discordId}: ${r}`); })
    .catch((e) => console.error("[Picasso Seed] Admin Discord role removal error:", e));
}
