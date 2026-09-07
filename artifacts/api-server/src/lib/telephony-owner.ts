import { and, eq, or } from "drizzle-orm";
import { db, orgMembersTable, phoneNumbersTable } from "@workspace/db";
import { DEFAULT_COUNTRY, toE164 } from "./phone";

export interface TelephonyOwner {
  userId: string;
  orgId: number | null;
  phoneNumberId: number | null;
  source: "number" | "platform-fallback" | "legacy-hint";
}

interface ResolveTelephonyOwnerInput {
  destinationNumber?: string | null;
  hintedUserId?: string | null;
}

async function resolveOrgId(userId: string, numberOrgId: number | null | undefined): Promise<number | null> {
  if (numberOrgId != null) return numberOrgId;
  const [membership] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")))
    .limit(1);
  return membership?.orgId ?? null;
}

/**
 * Resolve the owner of a provider callback from the destination number first.
 *
 * Twilio callback URLs can contain a legacy userId hint, but that hint is not
 * authoritative: numbers can be reassigned or belong to an organization pool.
 * A persisted active number always wins. The hint is only retained for the
 * platform DID and older callbacks that did not include a destination number.
 */
export async function resolveTelephonyOwner({
  destinationNumber,
  hintedUserId,
}: ResolveTelephonyOwnerInput): Promise<TelephonyOwner | null> {
  const rawDestination = destinationNumber?.trim() || "";
  const normalizedDestination = rawDestination ? toE164(rawDestination, DEFAULT_COUNTRY) : null;
  const candidates = Array.from(new Set(
    [normalizedDestination, rawDestination].filter((value): value is string => Boolean(value)),
  ));

  if (candidates.length > 0) {
    const rows = await db
      .select({
        id: phoneNumbersTable.id,
        userId: phoneNumbersTable.userId,
        orgId: phoneNumbersTable.orgId,
        isActive: phoneNumbersTable.isActive,
      })
      .from(phoneNumbersTable)
      .where(candidates.length === 1
        ? eq(phoneNumbersTable.number, candidates[0])
        : or(...candidates.map((candidate) => eq(phoneNumbersTable.number, candidate))))
      .limit(2);

    const activeRows = rows.filter((row) => row.isActive);
    if (activeRows.length === 1) {
      const row = activeRows[0];
      return {
        userId: row.userId,
        orgId: await resolveOrgId(row.userId, row.orgId),
        phoneNumberId: row.id,
        source: "number",
      };
    }

    // More than one active row for the same callback target is an unsafe
    // configuration. Fail closed rather than guessing between organizations.
    if (activeRows.length > 1 || rows.length > 0) return null;
  }

  const platformNumber = process.env.TWILIO_PHONE_NUMBER
    ? toE164(process.env.TWILIO_PHONE_NUMBER, DEFAULT_COUNTRY)
    : null;
  const isPlatformFallback = !normalizedDestination
    || (platformNumber != null && normalizedDestination === platformNumber);

  if (!hintedUserId) return null;

  return {
    userId: hintedUserId,
    orgId: await resolveOrgId(hintedUserId, null),
    phoneNumberId: null,
    source: isPlatformFallback ? (normalizedDestination ? "platform-fallback" : "legacy-hint") : "legacy-hint",
  };
}