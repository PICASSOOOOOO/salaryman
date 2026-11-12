// ── Country-aware phone helpers ─────────────────────────────────────────────
// Single source of truth for E.164 normalization and the small registry of
// countries the telephony stack supports. Kept PURE (no db / no Twilio imports)
// so it can be unit-tested without DATABASE_URL and reused from any route or
// service. Historically the stack hard-coded a "+1" default everywhere, which
// broke Huda City (Vietnam, +84). Now the default country code is explicit and
// derived from the caller's city/region context.

export interface CountryDialInfo {
  /** ISO 3166-1 alpha-2 code (also the Twilio `availablePhoneNumbers(country)` key). */
  iso: string;
  name: string;
  /** International dialing code WITHOUT the leading '+', e.g. "1", "84". */
  dialCode: string;
  /**
   * National trunk prefix that locals write but which must be dropped before the
   * country code (e.g. Vietnam's leading "0": 09xx → +849xx). Omitted for the US.
   */
  trunkPrefix?: string;
  flag: string;
  /** A human example of the local format, shown in the UI. */
  example: string;
  /** Realm/region label this country's live city belongs to (matches world-servers). */
  region: string;
  /**
   * Twilio enforces a local regulatory bundle + validated local address for most
   * countries before a number can be provisioned. Set this for any country that
   * needs one (omit for countries like the US that don't). `bundleType` mirrors
   * Twilio's "Regulatory Bundle" / "End User" model. The player-facing message
   * and docs link are generated from this in `regulatoryRequirement()`.
   */
  regulatory?: { bundleType: string };
}

// Order matters for UI listings — live realms first, then planned realms in the
// order their cities appear in world-servers (Americas → Africa → Europe → Asia
// → Oceania). Each entry's `region` MUST match the matching city's region label
// in world-servers so purchased numbers stamp a consistent realm.
export const SUPPORTED_COUNTRIES: Record<string, CountryDialInfo> = {
  // ── Live realms ──────────────────────────────────────────────────────────
  US: { iso: "US", name: "United States", dialCode: "1", flag: "🇺🇸", example: "(415) 555-0100", region: "AMERICAS — NORTH" },
  VN: { iso: "VN", name: "Vietnam", dialCode: "84", trunkPrefix: "0", flag: "🇻🇳", example: "091 234 5678", region: "ASIA", regulatory: { bundleType: "individual-or-business" } },
  // ── Planned realms (numbers buyable once their city comes online) ─────────
  MX: { iso: "MX", name: "Mexico", dialCode: "52", flag: "🇲🇽", example: "55 1234 5678", region: "AMERICAS — CENTRAL", regulatory: { bundleType: "individual-or-business" } },
  BR: { iso: "BR", name: "Brazil", dialCode: "55", trunkPrefix: "0", flag: "🇧🇷", example: "(11) 91234-5678", region: "AMERICAS — SOUTH", regulatory: { bundleType: "individual-or-business" } },
  NG: { iso: "NG", name: "Nigeria", dialCode: "234", trunkPrefix: "0", flag: "🇳🇬", example: "0801 234 5678", region: "AFRICA", regulatory: { bundleType: "individual-or-business" } },
  GB: { iso: "GB", name: "United Kingdom", dialCode: "44", trunkPrefix: "0", flag: "🇬🇧", example: "07400 123456", region: "EUROPE — WEST", regulatory: { bundleType: "individual-or-business" } },
  RU: { iso: "RU", name: "Russia", dialCode: "7", trunkPrefix: "8", flag: "🇷🇺", example: "8 912 345-67-89", region: "EUROPE — EAST", regulatory: { bundleType: "individual-or-business" } },
  AE: { iso: "AE", name: "United Arab Emirates", dialCode: "971", trunkPrefix: "0", flag: "🇦🇪", example: "050 123 4567", region: "ASIA — CRESCENT", regulatory: { bundleType: "individual-or-business" } },
  IN: { iso: "IN", name: "India", dialCode: "91", trunkPrefix: "0", flag: "🇮🇳", example: "098765 43210", region: "ASIA — SOUTH", regulatory: { bundleType: "individual-or-business" } },
  JP: { iso: "JP", name: "Japan", dialCode: "81", trunkPrefix: "0", flag: "🇯🇵", example: "090-1234-5678", region: "ASIA — EAST", regulatory: { bundleType: "individual-or-business" } },
  AU: { iso: "AU", name: "Australia", dialCode: "61", trunkPrefix: "0", flag: "🇦🇺", example: "0412 345 678", region: "OCEANIA", regulatory: { bundleType: "individual-or-business" } },
};

// The historical default. One-arg toE164() callers (US/Minx paths) keep their
// exact prior behavior so Minx City is byte-identical.
export const DEFAULT_COUNTRY = "US";

export function isSupportedCountry(code: string | null | undefined): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(SUPPORTED_COUNTRIES, code);
}

export function getCountryInfo(code: string | null | undefined): CountryDialInfo {
  return (code && SUPPORTED_COUNTRIES[code]) || SUPPORTED_COUNTRIES[DEFAULT_COUNTRY];
}

// Map an in-world city (realm) to the country its phone numbers belong to. Each
// regional/timezone city sells local numbers from the country it physically
// serves. Cities not listed here (e.g. Minx City) fall back to the US default.
const CITY_COUNTRY: Record<string, string> = {
  minx_city: "US",       // AMERICAS — NORTH
  huda_city: "VN",       // ASIA
  solaris_drift: "MX",   // AMERICAS — CENTRAL
  verde_nexus: "BR",     // AMERICAS — SOUTH
  obsidian_reach: "NG",  // AFRICA
  cobalt_harbor: "GB",   // EUROPE — WEST
  vostok_gate: "RU",     // EUROPE — EAST
  crescent_spire: "AE",  // ASIA — CRESCENT
  amber_circuit: "IN",   // ASIA — SOUTH
  dragon_forge: "JP",    // ASIA — EAST
  coral_vault: "AU",     // OCEANIA
};

export function countryForCity(cityId: string | null | undefined): string {
  return CITY_COUNTRY[(cityId || "").toLowerCase()] ?? DEFAULT_COUNTRY;
}

/**
 * Normalize a raw, human-entered phone number to E.164.
 *
 * - An explicit international number (starts with "+") is preserved as-is
 *   (after stripping formatting) regardless of `defaultCountry`.
 * - A local number gets the `defaultCountry`'s dialing code, dropping that
 *   country's national trunk prefix first when present (e.g. VN "0").
 *
 * Returns null when the result isn't a plausible E.164 number (7–15 digits).
 */
export function toE164(raw: string, defaultCountry: string = DEFAULT_COUNTRY): string | null {
  const cleaned = (raw || "").replace(/[^+\d]/g, "");
  if (!cleaned) return null;

  // Explicit international number — trust it, just validate the digit count.
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    return /^\d{7,15}$/.test(digits) ? `+${digits}` : null;
  }

  const country = getCountryInfo(defaultCountry);
  let national = cleaned;
  if (country.trunkPrefix && national.startsWith(country.trunkPrefix)) {
    national = national.slice(country.trunkPrefix.length);
  }
  const e164 = `+${country.dialCode}${national}`;
  const digits = e164.slice(1);
  return /^\d{7,15}$/.test(digits) ? e164 : null;
}

export interface RegulatoryRequirement {
  /** Whether buying a number in this country needs a Twilio regulatory bundle. */
  required: boolean;
  /** Twilio "Regulatory Bundle" / "End User" model when required. */
  bundleType?: string;
  /** Player-facing explanation of what's needed before a purchase can complete. */
  message: string;
  /** Link players/admins can follow to provide the documents. */
  docsUrl?: string;
}

const REGULATORY_DOCS_URL = "https://www.twilio.com/docs/phone-numbers/regulatory/getting-started";

// Twilio enforces local regulatory bundles + a validated local address for many
// countries (e.g. Vietnam requires a business or individual end-user bundle); the
// US does not for standard local numbers. Whether a bundle is needed is now data
// on each country in SUPPORTED_COUNTRIES, so adding a country is mostly data. We
// surface this so a purchase fails LOUDLY with an actionable message instead of a
// raw Twilio 21649. Unknown/unsupported countries report "not required".
export function regulatoryRequirement(country: string): RegulatoryRequirement {
  const info = SUPPORTED_COUNTRIES[country];
  if (!info?.regulatory) return { required: false, message: "" };
  return {
    required: true,
    bundleType: info.regulatory.bundleType,
    message:
      `${info.name} (+${info.dialCode}) numbers require an approved Twilio regulatory bundle and a local address on file before a number can be provisioned. Ask an admin to complete the ${info.name} bundle in the Twilio console, then try again.`,
    docsUrl: REGULATORY_DOCS_URL,
  };
}
