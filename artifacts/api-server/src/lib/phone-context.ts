// ── Per-user phone country context ──────────────────────────────────────────
// Resolves the default phone country for a given user from their in-world home
// city. Minx + Huda share ONE deployment, so SERVER_CITY_ID can't distinguish
// users — the home city is stored per-user on the world registry's meta bag
// (set via POST /world/home-city). Huda City → Vietnam (+84); everything else
// → US (+1). Kept separate from the pure `phone.ts` so that module stays
// db-free and trivially unit-testable.
import { db, worldBusinessesTable, phoneNumbersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { countryForCity, DEFAULT_COUNTRY, toE164, isSupportedCountry } from "./phone";

/** The user's home city id (e.g. "huda_city"), or null if not yet onboarded. */
export async function resolveUserCity(userId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ meta: worldBusinessesTable.meta })
      .from(worldBusinessesTable)
      .where(eq(worldBusinessesTable.userId, userId))
      .orderBy(sql`${worldBusinessesTable.createdAt} DESC`)
      .limit(1);
    const meta = (row?.meta && typeof row.meta === "object") ? (row.meta as Record<string, unknown>) : null;
    const cityId = meta && typeof meta.homeCityId === "string" ? meta.homeCityId : null;
    return cityId || null;
  } catch {
    return null;
  }
}

/**
 * The default phone country code (ISO, e.g. "US" / "VN") for a user, derived
 * from their home city. Falls back to the US default if the user has no city
 * on file. Never throws — telephony paths degrade to the US default.
 */
export async function resolveUserCountry(userId: string): Promise<string> {
  const city = await resolveUserCity(userId);
  return city ? countryForCity(city) : DEFAULT_COUNTRY;
}

/**
 * The default phone country for an OWNING (dialed) number on an inbound call.
 * Inbound webhooks must normalize the caller against the number that was
 * actually dialed — a user can own numbers in several countries, so the user's
 * home city is the wrong default here. Resolves the persisted `countryCode` on
 * the matching `phone_numbers` row, falling back to the user's home country and
 * finally the US default. Never throws — telephony paths degrade gracefully.
 */
export async function resolveOwningNumberCountry(
  userId: string,
  toNumber: string | null | undefined,
): Promise<string> {
  try {
    if (toNumber) {
      const e164 = toE164(toNumber) ?? toNumber;
      const [row] = await db
        .select({ countryCode: phoneNumbersTable.countryCode })
        .from(phoneNumbersTable)
        .where(eq(phoneNumbersTable.number, e164))
        .limit(1);
      if (row?.countryCode && isSupportedCountry(row.countryCode)) {
        return row.countryCode;
      }
    }
  } catch {
    // fall through to user-country default
  }
  return resolveUserCountry(userId);
}
