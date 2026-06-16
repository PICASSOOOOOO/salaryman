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
}

// Order matters for UI listings — primary realms first.
export const SUPPORTED_COUNTRIES: Record<string, CountryDialInfo> = {
  US: { iso: "US", name: "United States", dialCode: "1", flag: "🇺🇸", example: "(415) 555-0100", region: "AMERICAS — NORTH" },
  VN: { iso: "VN", name: "Vietnam", dialCode: "84", trunkPrefix: "0", flag: "🇻🇳", example: "091 234 5678", region: "ASIA" },
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

// Map an in-world city to the country its phone numbers belong to. Huda City is
// the Asian (Vietnam) realm; everything else defaults to the US (Minx + future
// americas realms keep +1 until their own realm goes live).
export function countryForCity(cityId: string | null | undefined): string {
  switch ((cityId || "").toLowerCase()) {
    case "huda_city":
      return "VN";
    default:
      return DEFAULT_COUNTRY;
  }
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

// Twilio enforces local regulatory bundles + a validated local address for many
// countries. Vietnam requires a bundle (business or individual end-user proof);
// the US does not for standard local numbers. We surface this so a purchase
// fails LOUDLY with an actionable message instead of a raw Twilio 21649.
export function regulatoryRequirement(country: string): RegulatoryRequirement {
  switch (country) {
    case "VN":
      return {
        required: true,
        bundleType: "individual-or-business",
        message:
          "Vietnam (+84) numbers require an approved Twilio regulatory bundle and a local address on file before a number can be provisioned. Ask an admin to complete the Vietnam bundle in the Twilio console, then try again.",
        docsUrl: "https://www.twilio.com/docs/phone-numbers/regulatory/getting-started",
      };
    default:
      return { required: false, message: "" };
  }
}
