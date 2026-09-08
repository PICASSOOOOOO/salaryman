import { db, usageMetersTable, USAGE_LIMITS, type UsageKind } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { isOwnerEmail, isActiveDeveloperOrgMember } from "./plan";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(userId: string, kind: UsageKind): Promise<number> {
  const [row] = await db
    .select({ count: usageMetersTable.count })
    .from(usageMetersTable)
    .where(and(
      eq(usageMetersTable.userId, userId),
      eq(usageMetersTable.periodYearMonth, currentPeriod()),
      eq(usageMetersTable.kind, kind),
    ));
  return row?.count ?? 0;
}

export async function getAllUsage(userId: string): Promise<Record<UsageKind, { used: number; limit: number; remaining: number; throttled: boolean }>> {
  const rows = await db
    .select()
    .from(usageMetersTable)
    .where(and(
      eq(usageMetersTable.userId, userId),
      eq(usageMetersTable.periodYearMonth, currentPeriod()),
    ));
  const map: Record<string, number> = {};
  for (const r of rows) map[r.kind] = r.count;
  const out: Record<string, { used: number; limit: number; remaining: number; throttled: boolean }> = {};
  for (const [kind, limit] of Object.entries(USAGE_LIMITS)) {
    const used = map[kind] ?? 0;
    out[kind] = { used, limit, remaining: Math.max(0, limit - used), throttled: used >= limit };
  }
  return out as Record<UsageKind, { used: number; limit: number; remaining: number; throttled: boolean }>;
}

export async function recordUsage(userId: string, kind: UsageKind, amount = 1): Promise<number> {
  if (amount <= 0) return getUsage(userId, kind);
  const period = currentPeriod();
  await db
    .insert(usageMetersTable)
    .values({ userId, periodYearMonth: period, kind, count: amount })
    .onConflictDoUpdate({
      target: [usageMetersTable.userId, usageMetersTable.periodYearMonth, usageMetersTable.kind],
      set: { count: sql`${usageMetersTable.count} + ${amount}`, updatedAt: new Date() },
    });
  return getUsage(userId, kind);
}

/**
 * Atomic check-and-charge: in a single SQL statement, increment the meter only if
 * the new total would still be within the cap. Eliminates TOCTOU races between
 * concurrent requests AND the fail-open path of separate check+record.
 */
export async function consumeUsage(
  userId: string,
  email: string | undefined | null,
  kind: UsageKind,
  cost = 1,
): Promise<{ allowed: true; used: number; limit: number } | { allowed: false; used: number; limit: number; remaining: number }> {
  const limit = USAGE_LIMITS[kind];
  if (isOwnerEmail(email)) return { allowed: true, used: 0, limit };
  if (await isActiveDeveloperOrgMember(userId)) return { allowed: true, used: 0, limit };
  if (cost <= 0) return { allowed: true, used: await getUsage(userId, kind), limit };

  const period = currentPeriod();
  // Atomic conditional upsert: only increment if it would not exceed the cap.
  const result = await db.execute(sql`
    INSERT INTO usage_meters (user_id, period_year_month, kind, count, updated_at)
    VALUES (${userId}, ${period}, ${kind}, ${cost}, NOW())
    ON CONFLICT (user_id, period_year_month, kind)
    DO UPDATE SET count = usage_meters.count + ${cost}, updated_at = NOW()
    WHERE usage_meters.count + ${cost} <= ${limit}
    RETURNING count
  `);
  const rows = (result as unknown as { rows: Array<{ count: number }> }).rows ?? [];
  if (rows.length === 0) {
    const used = await getUsage(userId, kind);
    return { allowed: false, used, limit, remaining: Math.max(0, limit - used) };
  }
  return { allowed: true, used: Number(rows[0].count), limit };
}

/** @deprecated Prefer `consumeUsage` to avoid TOCTOU + fail-open. */
export async function checkAndEnforce(
  userId: string,
  email: string | undefined | null,
  kind: UsageKind,
  cost = 1,
): Promise<{ allowed: true } | { allowed: false; used: number; limit: number; remaining: number }> {
  const r = await consumeUsage(userId, email, kind, cost);
  return r.allowed ? { allowed: true } : r;
}

const KIND_LABELS: Record<UsageKind, string> = {
  voice_minutes: "voice minutes",
  ai_messages: "AI messages",
  sms_count: "SMS",
};

export function throttleResponse(kind: UsageKind, used: number, limit: number) {
  return {
    error: "fair_use_cap_reached",
    message: `You've reached this month's PABLO PRIME fair-use cap of ${limit.toLocaleString()} ${KIND_LABELS[kind]} (${used.toLocaleString()} used). Resets the 1st of next month.`,
    kind,
    used,
    limit,
  };
}
