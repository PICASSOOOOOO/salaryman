const BASE = import.meta.env.BASE_URL;

// Guard against multiple simultaneous 401s all racing to redirect.
// Flips to true the moment the first session-expired redirect fires and
// stays set for the lifetime of the page (the redirect will reload it).
let _sessionExpiredRedirecting = false;

export function apiUrl(path: string): string {
  if (path.startsWith('/api/')) return `${BASE}${path.slice(1)}`;
  if (path.startsWith('api/')) return `${BASE}${path}`;
  if (path.startsWith('/')) return `${BASE}api${path}`;
  return `${BASE}api/${path}`;
}

export function stableRequestId(scope: string, key: string): string {
  const storageKey = `salaryman_request:${scope}:${key}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

export function clearStableRequestIds(scope: string): void {
  const prefix = `salaryman_request:${scope}:`;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  }
}

// Window event dispatched after a successful money-affecting request so any
// surface that shows the player's ƒ balance (e.g. the world HUD CurrencyTicker)
// can refresh immediately instead of waiting for its polling timer.
export const FIAT_CHANGED_EVENT = 'salaryman:fiat-changed';

// Paths whose mutating (POST/PUT/PATCH/DELETE) requests can change the player's
// spendable fiat balance shown in the HUD (CurrencyTicker reads the server bank
// via GET /api/economy/bank/accounts): bank transfers/deposits, salary claims,
// loan payments, buying/selling (gear/items, cosmetics, real estate, businesses,
// pledge store + vending), subway fares, construction labor, and Pablo commands
// (which can spend ƒ).
//
// IMPORTANT: this regex is the single gate for the instant HUD refresh. Any NEW
// money-spending endpoint must be added here or the "YOU ƒ..." readout will go
// stale until the next poll. The src/lib/api-client.fiat-affecting.test.ts guard
// enumerates the real spend endpoints and fails if one isn't covered.
export const FIAT_AFFECTING =
  /(economy|bank|transfer|deposit|withdraw|salary|credit\/plan|gameplay\/fiat\/action|armory|gear|construction\/.+\/work|real-estate|business-market|marketplace|shadow-tower\/floors\/.+\/acquire|pledge\/(buy|checkout|purchase|vend)|items\/buy|cosmetics\/buy|vending\/food\/purchase|subway\/travel|pablo\/command|wallet|payroll|recreation\/arcade\/charge)/i;

// Paths for the AI features (Pablo chat, image generation, character portraits)
// whose cost is billed through the Pablo-Tax meter. Unlike the FIAT_AFFECTING
// spends above — which deduct ƒ synchronously inside the request handler before
// responding — Pablo-Tax is charged FIRE-AND-FORGET *after* the response is sent
// (so billing latency never blocks the AI reply, and a billing hang can't fail
// it). The bank draw therefore commits shortly AFTER the client receives the
// response, so an immediate refetch would race the charge. For these paths we
// refresh the HUD on a short delay (see notifyFiatChangedSoon) instead.
//
// NOTE: most individual AI calls accrue cost but draw 0 ƒ — the waterfall only
// bills once accrued usage crosses a $20 increment — so the delayed refetch is
// usually a no-op. That's fine: it's debounced in CurrencyTicker and only runs
// when the HUD is mounted, and it guarantees the readout drops the moment a draw
// actually lands instead of waiting for the next 30s poll.
export const PABLO_TAX_AFFECTING =
  /(chat\/pablo\/message|ai\/image|salaryman\/character\/portrait)/i;

// How long to wait after an AI response before refreshing the balance, giving
// the fire-and-forget Pablo-Tax charge time to commit to the bank.
const PABLO_TAX_REFRESH_DELAY_MS = 1500;

function notifyFiatChanged() {
  try {
    window.dispatchEvent(new CustomEvent(FIAT_CHANGED_EVENT));
  } catch {}
}

// Fire FIAT_CHANGED_EVENT after a short delay. Use this after an AI action that
// incurs Pablo-Tax (the charge is fire-and-forget, so the draw lands just after
// the response). Callers that bypass apiFetch (e.g. raw fetch / WebSocket Pablo
// chat) should call this themselves once the AI response resolves OK.
export function notifyFiatChangedSoon(delayMs: number = PABLO_TAX_REFRESH_DELAY_MS) {
  try {
    setTimeout(notifyFiatChanged, delayMs);
  } catch {}
}

// Paths that legitimately return 401 as part of normal app operation (e.g. the
// auth-state polling endpoint for logged-out users). These must NOT trigger the
// session-expired redirect or every logged-out page load would loop.
const SESSION_EXPIRY_SKIP_PATHS =
  /\/(auth\/user|auth\/providers)(\/|$|\?)/;

// Public routes that remain browseable without an account. A rejected write
// here is handled by the feature itself rather than by a global route change.
// This includes public chat, the guest workstation, and guest meetings.
const SESSION_EXPIRY_PUBLIC_ROUTES = [
  "/tower",
  "/desktop",
  "/phone",
  "/pablo",
  "/onboarding",
  "/device-link",
  "/sms-opt-in",
  "/1999",
  "/meet",
  // Keep auth forms mounted if an action unexpectedly returns 401.
  "/sign-in",
  "/sign-up",
];
function isSessionExpiryPublicRoute(currentPath: string): boolean {
  return (
    currentPath === "/" ||
    SESSION_EXPIRY_PUBLIC_ROUTES.some(
      (r) => currentPath === r || currentPath.startsWith(r + "/"),
    )
  );
}

export type ApiFetchOptions = RequestInit & {
  /**
   * Auth/bootstrap reads can briefly receive a 401 while Clerk's browser
   * session is becoming available to the API. Those reads should retry or
   * resolve their own state instead of redirecting the whole app mid-login.
   */
  skipSessionExpiryRedirect?: boolean;
  /**
   * Opt in to a sign-in redirect for a specific request. By default, only
   * rejected writes redirect; a background read must not gate free browsing.
   */
  redirectOnUnauthorized?: boolean;
};

export function apiFetch(path: string, opts?: ApiFetchOptions): Promise<Response> {
  const fullPath = path.startsWith('/api/')
    ? `${BASE}${path.slice(1)}`
    : path.startsWith('api/')
    ? `${BASE}${path}`
    : path;
  const { skipSessionExpiryRedirect, redirectOnUnauthorized, ...requestInit } = opts ?? {};
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const shouldRedirectOnUnauthorized = redirectOnUnauthorized ?? isMutating;
  const p = fetch(fullPath, { ...requestInit, credentials: 'include' });

  // A rejected background read is not consent to sign in. Writes default to a
  // sign-in redirect because they represent a user-initiated save/action; read
  // requests can opt in when the specific feature requires an account.
  p.then((r) => {
    if (
      r.status === 401 &&
      !_sessionExpiredRedirecting &&
      shouldRedirectOnUnauthorized &&
      !skipSessionExpiryRedirect &&
      typeof window !== "undefined" &&
      !SESSION_EXPIRY_SKIP_PATHS.test(path)
    ) {
      const currentPath = window.location.pathname;
      // Don't redirect on routes where an anonymous 401 is expected; feature
      // actions on those routes prompt for sign-in explicitly when needed.
      if (!isSessionExpiryPublicRoute(currentPath)) {
        _sessionExpiredRedirecting = true;
        const safePath = currentPath + window.location.search;
        const returnTo = encodeURIComponent(safePath);
        window.location.replace(`${BASE}sign-in?returnTo=${returnTo}`);
      }
    }
  }).catch(() => {});

  // Check the AI/Pablo-Tax paths FIRST: their charge is fire-and-forget so they
  // need the DELAYED refresh, and some of them incidentally match FIAT_AFFECTING
  // (e.g. "/salaryman/character/portrait" contains the "salary" substring) — we
  // must not let them fall into the immediate branch and race the charge.
  if (isMutating && PABLO_TAX_AFFECTING.test(path)) {
    p.then((r) => { if (r.ok) notifyFiatChangedSoon(); }).catch(() => {});
  } else if (isMutating && FIAT_AFFECTING.test(path)) {
    p.then((r) => { if (r.ok) notifyFiatChanged(); }).catch(() => {});
  }
  return p;
}
