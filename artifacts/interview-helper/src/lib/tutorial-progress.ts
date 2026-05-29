// Single source of truth for whether the user has completed the Pablo
// onboarding tutorial. The tutorial plays once on the user's first /game
// visit and never replays (per product direction). Returning users skip
// straight to /pablo.

const KEY = "salaryman_tutorial_done";

export function isTutorialDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markTutorialDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {}
}

// Used by a future "replay tutorial" admin/debug action.
export function resetTutorial(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(PASSCODE_KEY);
  } catch {}
}

// Tracks whether the user has spoken/entered the Pablo passcode at least
// once. Distinct from tutorial-done: hearing the passcode unlocks the
// landing page, but the actual app/world is only unlocked after Pablo
// runs the guided tour from landing -> Get Started -> /pablo?guided=1.
const PASSCODE_KEY = "salaryman_passcode_unlocked";

export function isPasscodeUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PASSCODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPasscodeUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSCODE_KEY, "1");
  } catch {}
}

// Tracks whether the user has seen the purple "ask Pablo" promo landing
// at least once. Per product direction the promo is a ONE-TIME pitch:
// after the first view we route returning visitors to the clean menu
// (/menu) instead of forcing the promo on every default landing.
const PROMO_SEEN_KEY = "salaryman_pablo_promo_seen";

export function isPabloPromoSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PROMO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPabloPromoSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROMO_SEEN_KEY, "1");
  } catch {}
}

// Salaryman identity Pablo collects during the post-passcode intro. Email
// is informational here — the actual login is OAuth — but we keep both so
// the rest of the app can address the player by name without a round-trip.
const NAME_KEY = "salaryman_name";
const EMAIL_KEY = "salaryman_email";

export function setSalarymanName(name: string): void {
  if (typeof window === "undefined") return;
  // 64 to match the parser cap in PabloTerminal.tsx — prior 32 was the
  // root cause of the production loop ("Alex Duong. My email is Alejandr"
  // truncation). Keep the two caps aligned.
  try { window.localStorage.setItem(NAME_KEY, name.slice(0, 64)); } catch {}
}
export function getSalarymanName(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(NAME_KEY); } catch { return null; }
}
export function setSalarymanEmail(email: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(EMAIL_KEY, email.slice(0, 120)); } catch {}
}
export function getSalarymanEmail(): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

// Pre-onboarding employment intent: captured in the Pablo intro before
// the user signs in, so the post-OAuth PabloOnboarding modal in WorldPlay
// can pre-select the right path (business vs unemployed) instead of
// re-asking. Mirrors the bizPath union the modal already uses.
const BIZ_PATH_KEY = "salaryman_biz_path";
export type SalarymanBizPath = "business" | "unemployed";
export function setSalarymanBizPath(path: SalarymanBizPath): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(BIZ_PATH_KEY, path); } catch {}
}
export function getSalarymanBizPath(): SalarymanBizPath | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(BIZ_PATH_KEY);
    return v === "business" || v === "unemployed" ? v : null;
  } catch {
    return null;
  }
}

// Onboarding office tier — kept client-side so the live /office view can
// reflect the user's choice (capsule / studio / coworking / suite) without
// a server round-trip on every page load. Server is still the source of
// truth for billing; this is just for visual presentation.
const OFFICE_TIER_KEY = "salaryman_office_tier";
export type SalarymanOfficeTier = "capsule" | "studio" | "coworking" | "suite";
export function setSalarymanOfficeTier(tier: SalarymanOfficeTier): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(OFFICE_TIER_KEY, tier); } catch {}
}
export function getSalarymanOfficeTier(): SalarymanOfficeTier | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(OFFICE_TIER_KEY);
    return v === "capsule" || v === "studio" || v === "coworking" || v === "suite" ? v : null;
  } catch {
    return null;
  }
}

// Short aliases — the rest of the world (LiveOffice, PabloOffice, future
// tier-aware surfaces) doesn't need the "salaryman_" prefix in the call
// site to know what tier it's talking about. Keeping the prefixed names
// alive so existing call sites don't churn.
export const setOfficeTier = setSalarymanOfficeTier;
export const getOfficeTier = getSalarymanOfficeTier;

// Player gender — drives whether we address the user as "salaryman",
// "salarywoman", or the gender-neutral "salaryperson". Stored client-side
// only; the server doesn't need to know. "neither" covers both
// non-binary and "rather not say" cases — neutral lexicon.
const GENDER_KEY = "salaryman_gender";
export type SalarymanGender = "man" | "woman" | "neither";
export function setSalarymanGender(g: SalarymanGender): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(GENDER_KEY, g); } catch {}
}
export function getSalarymanGender(): SalarymanGender | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(GENDER_KEY);
    return v === "man" || v === "woman" || v === "neither" ? v : null;
  } catch {
    return null;
  }
}

/** Word the system should use to refer to one Salaryman, gendered when
 *  we know the gender. `case` controls capitalization for inline use:
 *  - "lower":  salaryman / salarywoman / salaryperson
 *  - "title":  Salaryman / Salarywoman / Salaryperson
 *  - "upper":  SALARYMAN / SALARYWOMAN / SALARYPERSON
 *  Plural form is "salarymen" regardless of gender — that's the
 *  collective noun for the player base in the SALARYMAN brand. */
export function salarymanTerm(
  gender: SalarymanGender | null | undefined,
  textCase: "lower" | "title" | "upper" = "lower",
): string {
  const base = gender === "woman" ? "salarywoman"
             : gender === "neither" ? "salaryperson"
             : "salaryman";
  if (textCase === "upper") return base.toUpperCase();
  if (textCase === "title") return base[0].toUpperCase() + base.slice(1);
  return base;
}

// Lightweight email validation. Pablo isn't doing RFC 5322 here — just
// enough to reject obvious garbage so we don't ship the user into the
// OAuth flow with a malformed identifier.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isLikelyEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}
