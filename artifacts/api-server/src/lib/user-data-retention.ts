import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";
import { getAccountProtection } from "./payment-protection";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RowCountResult = { rowCount?: number };
type QueryRows<T> = { rows?: T[] };

const objectStorage = new ObjectStorageService();

// Rows that are identity, payment, moderation, support, or audit records stay
// intact even when the user's gameplay and personal workspace data is cleared.
const PRESERVED_TABLES = new Set([
  "users",
  "sessions",
  "account_identities",
  "user_google_links",
  "user_features",
  "user_tiers",
  "feature_trials",
  "usage_meters",
  "pledge_purchases",
  "donations",
  "fiat_topups",
  "phone_number_purchases",
  "merch_orders",
  "crypto_purchases",
  "bot_subscriptions",
  "org_feature_grants",
  "pablo_tax_invoices",
  "pablo_tax_line_items",
  "pablo_tax_meter",
  "feedback_reports",
  "tickets",
  "ticket_comments",
  "bans",
  "flagged_users",
  "alpha_applications",
  "tester_applications",
  "tester_members",
  "referral_invites",
  "business_audit_events",
  "business_activities",
  "organizations",
  "business_files",
  "shared_media",
  "colleagues",
  "business_transactions",
  "legacy_recovery_snapshots",
  "legacy_recovery_events",
]);

const OWNER_COLUMNS = [
  "user_id",
  "owner_user_id",
  "uploaded_by_user_id",
  "created_by_user_id",
  "applicant_user_id",
  "student_user_id",
  "author_user_id",
  "renter_user_id",
] as const;

const ORGANIZATION_COLUMNS = [
  "org_id",
  "organization_id",
  "owning_org_id",
  "owner_org_id",
  "benefiting_org_id",
] as const;

function rowsOf<T>(result: unknown): T[] {
  return (result as QueryRows<T>).rows ?? [];
}

function affected(result: unknown): number {
  return (result as RowCountResult).rowCount ?? 0;
}

function textValues(values: readonly string[]) {
  if (values.length === 0) return sql`(NULL)`;
  return sql`(${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;
}

async function collectPrivateObjectPaths(
  tx: Tx,
  userIds: string[],
  organizationIds: string[],
): Promise<string[]> {
  const result = await tx.execute(sql`
    SELECT object_path AS path
    FROM files_folders
    WHERE user_id::text IN ${textValues(userIds)}
      AND object_path IS NOT NULL
    UNION
    SELECT object_path AS path
    FROM business_files
    WHERE object_path IS NOT NULL
      AND (
        org_id::text IN ${textValues(organizationIds)}
        OR (
          uploaded_by_user_id::text IN ${textValues(userIds)}
          AND (org_id IS NULL OR org_id::text IN ${textValues(organizationIds)})
        )
      )
    UNION
    SELECT object_path AS path
    FROM shared_media
    WHERE object_path IS NOT NULL
      AND (
        org_id::text IN ${textValues(organizationIds)}
        OR (
          from_user_id::text IN ${textValues(userIds)}
          AND (to_user_id IS NULL OR to_user_id::text IN ${textValues(userIds)})
        )
      )
  `);

  return rowsOf<{ path: string | null }>(result)
    .map((row) => row.path)
    .filter((path): path is string => Boolean(path));
}

async function deletePrivateObjects(paths: string[]): Promise<void> {
  for (const rawPath of [...new Set(paths)]) {
    const path = objectStorage.normalizeObjectEntityPath(rawPath);
    // Public assets and external URLs may be shared by unrelated users. Only
    // private App Storage objects owned by the rows being removed are deleted.
    if (!path.startsWith("/objects/")) continue;
    try {
      const file = await objectStorage.getObjectEntityFile(path);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) continue;
      throw new Error(`Could not remove an owned App Storage object: ${error instanceof Error ? error.message : "unknown storage error"}`);
    }
  }
}

async function deleteSharedRows(tx: Tx, userIds: string[], organizationIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const media = await tx.execute(sql`
    DELETE FROM shared_media
    WHERE org_id::text IN ${textValues(organizationIds)}
       OR (
         from_user_id::text IN ${textValues(userIds)}
         AND (to_user_id IS NULL OR to_user_id::text IN ${textValues(userIds)})
       )
  `);
  counts.shared_media = affected(media);

  const files = await tx.execute(sql`
    DELETE FROM business_files
    WHERE org_id::text IN ${textValues(organizationIds)}
       OR (
         uploaded_by_user_id::text IN ${textValues(userIds)}
         AND (org_id IS NULL OR org_id::text IN ${textValues(organizationIds)})
       )
  `);
  counts.business_files = affected(files);

  return counts;
}

async function deleteNonForeignOrganizationRows(tx: Tx, organizationIds: string[]): Promise<Record<string, number>> {
  if (organizationIds.length === 0) return {};
  const result = await tx.execute(sql`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ${textValues(ORGANIZATION_COLUMNS)}
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.key_column_usage k
        JOIN information_schema.table_constraints tc
          ON tc.constraint_schema = k.constraint_schema
         AND tc.constraint_name = k.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND k.table_schema = c.table_schema
          AND k.table_name = c.table_name
          AND k.column_name = c.column_name
      )
  `);
  const columns = rowsOf<{ table_name: string; column_name: string }>(result);
  const byTable = new Map<string, Set<string>>();
  for (const { table_name, column_name } of columns) {
    if (table_name === "organizations" || PRESERVED_TABLES.has(table_name)) continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(table_name) || !ORGANIZATION_COLUMNS.includes(column_name as typeof ORGANIZATION_COLUMNS[number])) continue;
    const set = byTable.get(table_name) ?? new Set<string>();
    set.add(column_name);
    byTable.set(table_name, set);
  }

  const counts: Record<string, number> = {};
  for (const [tableName, tableColumns] of byTable) {
    const belongsToResetOrganization = [...tableColumns].map((column) => sql`
      ${sql.identifier(column)}::text IN ${textValues(organizationIds)}
    `);
    const guards = [...tableColumns].map((column) => sql`
      (${sql.identifier(column)} IS NULL OR ${sql.identifier(column)}::text IN ${textValues(organizationIds)})
    `);
    const result = await tx.execute(sql`
      DELETE FROM ${sql.identifier("public")}.${sql.identifier(tableName)}
      WHERE (${sql.join(belongsToResetOrganization, sql` OR `)})
        AND ${sql.join(guards, sql` AND `)}
    `);
    counts[`org:${tableName}`] = affected(result);
  }
  return counts;
}

async function deleteUserRows(tx: Tx, userIds: string[], organizationIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};

  // Capture the profile-to-world join keys before player_profiles itself is
  // removed from the user-owned table set below.
  const profileNamesResult = await tx.execute(sql`
    SELECT player_name
    FROM player_profiles
    WHERE user_id::text IN ${textValues(userIds)}
  `);
  const profileNames = rowsOf<{ player_name: string }>(profileNamesResult).map((row) => row.player_name);

  const metadata = await tx.execute(sql`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ${textValues([...OWNER_COLUMNS, ...ORGANIZATION_COLUMNS])}
  `);
  const columns = rowsOf<{ table_name: string; column_name: string }>(metadata);
  const ownerByTable = new Map<string, Set<string>>();
  for (const { table_name, column_name } of columns) {
    if (PRESERVED_TABLES.has(table_name)) continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(table_name) || !OWNER_COLUMNS.includes(column_name as typeof OWNER_COLUMNS[number])) continue;
    const set = ownerByTable.get(table_name) ?? new Set<string>();
    set.add(column_name);
    ownerByTable.set(table_name, set);
  }

  const counts: Record<string, number> = {};
  for (const [tableName, ownerColumns] of ownerByTable) {
    // user_id is the canonical row owner. For tables without it, use the
    // strongest ownership column available rather than attribution columns.
    const ownerColumn = OWNER_COLUMNS.find((column) => ownerColumns.has(column));
    if (!ownerColumn) continue;

    const tableOrgColumns = columns
      .filter((row) => row.table_name === tableName && ORGANIZATION_COLUMNS.includes(row.column_name as typeof ORGANIZATION_COLUMNS[number]))
      .map((row) => row.column_name);
    const organizationGuards = [...new Set(tableOrgColumns)].map((column) => sql`
      (${sql.identifier(column)} IS NULL OR ${sql.identifier(column)}::text IN ${textValues(organizationIds)})
    `);
    const where = [
      sql`${sql.identifier(ownerColumn)}::text IN ${textValues(userIds)}`,
      ...organizationGuards,
    ];
    const result = await tx.execute(sql`
      DELETE FROM ${sql.identifier("public")}.${sql.identifier(tableName)}
      WHERE ${sql.join(where, sql` AND `)}
    `);
    counts[tableName] = affected(result);
  }

  if (profileNames.length > 0) {
    const transactions = await tx.execute(sql`
      DELETE FROM business_transactions bt
      WHERE bt.player_name IN ${textValues(profileNames)}
        AND NOT EXISTS (
          SELECT 1 FROM player_profiles pp
          WHERE pp.player_name = bt.player_name
            AND pp.user_id::text <> ALL(${userIds}::text[])
        )
    `);
    counts.business_transactions = affected(transactions);
  }

  const legacyEvents = await tx.execute(sql`
    DELETE FROM legacy_recovery_events
    WHERE source_user_id::text IN ${textValues(userIds)}
  `);
  counts.legacy_recovery_events = affected(legacyEvents);
  const legacySnapshots = await tx.execute(sql`
    DELETE FROM legacy_recovery_snapshots
    WHERE source_user_id::text IN ${textValues(userIds)}
  `);
  counts.legacy_recovery_snapshots = affected(legacySnapshots);

  const colleagues = await tx.execute(sql`
    DELETE FROM colleagues
    WHERE user_a_id::text IN ${textValues(userIds)}
      AND user_b_id::text IN ${textValues(userIds)}
  `);
  counts.colleagues = affected(colleagues);

  return counts;
}

async function resetUsersInTransaction(
  tx: Tx,
  userIds: string[],
  organizationIds: string[],
  options: { revokeSessions: boolean; markDataDeleted?: boolean },
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (userIds.length === 0) return counts;

  const privatePaths = await collectPrivateObjectPaths(tx, userIds, organizationIds);
  // Remove owned files before deleting their metadata. A storage error aborts
  // the database transaction, leaving remaining metadata available to retry.
  await deletePrivateObjects(privatePaths);

  Object.assign(counts, await deleteSharedRows(tx, userIds, organizationIds));
  Object.assign(counts, await deleteUserRows(tx, userIds, organizationIds));
  Object.assign(counts, await deleteNonForeignOrganizationRows(tx, organizationIds));

  if (organizationIds.length > 0) {
    const organizations = await tx.execute(sql`
      DELETE FROM organizations
      WHERE id::text IN ${textValues(organizationIds)}
        AND has_paid_history = false
        AND stripe_customer_id IS NULL
        AND is_developer = false
    `);
    counts.organizations = affected(organizations);
  }

  if (options.revokeSessions) {
    const sessions = await tx.execute(sql`
      DELETE FROM sessions
      WHERE sess->'user'->>'id' IN ${textValues(userIds)}
    `);
    counts.sessions = affected(sessions);
  }

  const now = new Date();
  await tx.update(usersTable)
    .set({
      activeProfileId: null,
      currentOrgId: null,
      abandonmentWarnedAt: null,
      ...(options.markDataDeleted
        ? { dataDeletedAt: now }
        : { lastActiveAt: now, dataDeletedAt: null }),
      updatedAt: now,
    })
    .where(sql`${usersTable.id} IN ${textValues(userIds)}`);

  return counts;
}

export async function getUnpaidResetCandidates(): Promise<string[]> {
  const [allUsers, protection] = await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable),
    getAccountProtection(),
  ]);
  const ownerEmails = new Set(
    (process.env.OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return allUsers
    .filter((user) => !protection.userIds.has(user.id))
    .filter((user) => !user.email || !ownerEmails.has(user.email.toLowerCase()))
    .map((user) => user.id);
}

export async function getUnpaidOrganizationCandidates(
  tx: Tx,
  userIds: string[],
  protectedOrganizationIds: Set<string>,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await tx.execute(sql`
    SELECT o.id::text AS id
    FROM organizations o
    WHERE o.owner_user_id::text IN ${textValues(userIds)}
      AND o.has_paid_history = false
      AND o.stripe_customer_id IS NULL
      AND o.is_developer = false
      AND lower(o.name) NOT IN ('picasso', 'picassoo', 'picasso ai', 'picasso ai llc', 'picassoo.ai')
      AND NOT EXISTS (
        SELECT 1 FROM org_feature_grants g
        WHERE g.org_id = o.id AND g.stripe_subscription_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM bot_subscriptions b
        WHERE b.org_id = o.id AND b.stripe_subscription_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM org_members m
        WHERE m.org_id = o.id
          AND m.user_id::text NOT IN ${textValues(userIds)}
      )
  `);
  return rowsOf<{ id: string }>(result)
    .map((row) => row.id)
    .filter((id) => !protectedOrganizationIds.has(id));
}

export async function runUnpaidAlphaReset(): Promise<{
  userCount: number;
  protectedUserCount: number;
  counts: Record<string, number>;
}> {
  return db.transaction(async (tx) => {
    const allUsers = await tx.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
    const protection = await getAccountProtection(tx);
    const ownerEmails = new Set(
      (process.env.OWNER_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    const candidates = allUsers
      .filter((user) => !protection.userIds.has(user.id))
      .filter((user) => !user.email || !ownerEmails.has(user.email.toLowerCase()))
      .map((user) => user.id);
    if (candidates.length > 0) {
      await tx.execute(sql`SELECT id FROM users WHERE id IN ${textValues(candidates)} FOR UPDATE`);
    }
    // Re-check every candidate against the same transaction snapshot as the
    // deletes, so Stripe history added after the initial lookup wins.
    const currentProtection = await getAccountProtection(tx);
    const userIds = candidates.filter((id) => !currentProtection.userIds.has(id));
    const organizationIds = await getUnpaidOrganizationCandidates(tx, userIds, currentProtection.organizationIds);
    const counts = await resetUsersInTransaction(tx, userIds, organizationIds, { revokeSessions: false });
    return {
      userCount: userIds.length,
      protectedUserCount: protection.userIds.size,
      counts,
    };
  });
}

export async function deleteInactiveUnpaidUserData(
  userIds: string[],
  thresholds: { inactiveBefore: Date; warnedBefore: Date },
): Promise<{ userIds: string[]; counts: Record<string, number> }> {
  if (userIds.length === 0) return { userIds: [], counts: {} };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id IN ${textValues(userIds)} FOR UPDATE`);
    const protection = await getAccountProtection(tx);
    const ownerEmails = new Set(
      (process.env.OWNER_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    const selectedUsers = await tx.select({
      id: usersTable.id,
      email: usersTable.email,
      lastActiveAt: usersTable.lastActiveAt,
      abandonmentWarnedAt: usersTable.abandonmentWarnedAt,
      dataDeletedAt: usersTable.dataDeletedAt,
    })
      .from(usersTable)
      .where(sql`${usersTable.id} IN ${textValues(userIds)}`);
    const eligible = selectedUsers
      .filter((user) => !protection.userIds.has(user.id))
      .filter((user) => !user.email || !ownerEmails.has(user.email.toLowerCase()))
      .filter((user) => !user.dataDeletedAt && new Date(user.lastActiveAt) < thresholds.inactiveBefore)
      .filter((user) => Boolean(user.abandonmentWarnedAt) && new Date(user.abandonmentWarnedAt!) < thresholds.warnedBefore)
      .map((user) => user.id);
    const organizationIds = await getUnpaidOrganizationCandidates(tx, eligible, protection.organizationIds);
    const counts = await resetUsersInTransaction(tx, eligible, organizationIds, {
      revokeSessions: true,
      markDataDeleted: true,
    });
    return { userIds: eligible, counts };
  });
}