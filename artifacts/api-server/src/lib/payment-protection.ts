import { eq, sql } from "drizzle-orm";
import { db, organizationsTable, usersTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;
type ProtectionRow = { kind: "user" | "org"; id: string };

export type AccountProtection = {
  userIds: Set<string>;
  organizationIds: Set<string>;
};

/**
 * Deliberately errs on the side of retention: an attempted, pending, or
 * ambiguous billing record protects the account just like a settled payment.
 * The paid-history flags cover subscription invoices after Stripe revokes the
 * live feature row.
 */
export async function getAccountProtection(executor: Executor = db): Promise<AccountProtection> {
  const result = await executor.execute(sql`
    WITH direct_paid_users AS (
      SELECT id::text AS id
      FROM users
      WHERE has_paid_history = true
         OR stripe_connect_account_id IS NOT NULL
      UNION SELECT user_id::text FROM pledge_purchases
      UNION SELECT user_id::text FROM donations
      UNION SELECT user_id::text FROM fiat_topups
      UNION SELECT user_id::text FROM phone_number_purchases
      UNION SELECT user_id::text FROM merch_orders
      UNION SELECT user_id::text FROM crypto_purchases
      UNION SELECT user_id::text FROM user_features
      UNION SELECT user_id::text FROM bot_subscriptions
      UNION SELECT user_id::text FROM world_businesses WHERE is_paid = true
      UNION
        SELECT user_id::text
        FROM player_inventory
        WHERE lower(acquired_via) LIKE '%stripe%'
      UNION
        SELECT user_id::text
        FROM salaryman_player_pass
        WHERE is_premium = true OR stripe_session_id IS NOT NULL
      UNION
        SELECT source_user_id::text
        FROM legacy_recovery_snapshots
        WHERE jsonb_typeof(pledges) = 'array' AND jsonb_array_length(pledges) > 0
      UNION
        SELECT source_user_id::text
        FROM legacy_recovery_events
        WHERE kind = 'pledge_entitlement'
           OR payload->>'stripeSessionId' IS NOT NULL
    ),
    protected_orgs AS (
      SELECT o.id
      FROM organizations o
      WHERE o.has_paid_history = true
         OR o.stripe_customer_id IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM org_feature_grants g
           WHERE g.org_id = o.id AND g.stripe_subscription_id IS NOT NULL
         )
         OR EXISTS (
           SELECT 1 FROM bot_subscriptions b
           WHERE b.org_id = o.id AND b.stripe_subscription_id IS NOT NULL
         )
         OR o.owner_user_id::text IN (SELECT id FROM direct_paid_users)
         OR EXISTS (
           SELECT 1 FROM org_members m
           WHERE m.org_id = o.id AND m.user_id::text IN (SELECT id FROM direct_paid_users)
         )
    ),
    protected_users AS (
      SELECT id FROM direct_paid_users
      UNION
      SELECT o.owner_user_id::text FROM organizations o
      JOIN protected_orgs p ON p.id = o.id
      UNION
      SELECT m.user_id::text FROM org_members m
      JOIN protected_orgs p ON p.id = m.org_id
    )
    SELECT 'user'::text AS kind, id::text AS id FROM protected_users WHERE id IS NOT NULL
    UNION
    SELECT 'org'::text AS kind, id::text AS id FROM protected_orgs
  `) as unknown as { rows: ProtectionRow[] };

  const userIds = new Set<string>();
  const organizationIds = new Set<string>();
  for (const row of result.rows ?? []) {
    if (row.kind === "user") userIds.add(row.id);
    else organizationIds.add(row.id);
  }
  return { userIds, organizationIds };
}

export async function markUserAsPaid(executor: Tx, userId: string): Promise<void> {
  await executor.update(usersTable)
    .set({ hasPaidHistory: true, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

export async function markOrganizationAsPaid(executor: Tx, organizationId: number): Promise<void> {
  await executor.update(organizationsTable)
    .set({ hasPaidHistory: true, updatedAt: new Date() })
    .where(eq(organizationsTable.id, organizationId));
}