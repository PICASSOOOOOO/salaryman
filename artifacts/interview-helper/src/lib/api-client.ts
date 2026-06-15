const BASE = import.meta.env.BASE_URL;

export function apiUrl(path: string): string {
  if (path.startsWith('/api/')) return `${BASE}${path.slice(1)}`;
  if (path.startsWith('api/')) return `${BASE}${path}`;
  if (path.startsWith('/')) return `${BASE}api${path}`;
  return `${BASE}api/${path}`;
}

// Window event dispatched after a successful money-affecting request so any
// surface that shows the player's ƒ balance (e.g. the world HUD CurrencyTicker)
// can refresh immediately instead of waiting for its polling timer.
export const FIAT_CHANGED_EVENT = 'salaryman:fiat-changed';

// Window event dispatched (on the same delay as the Pablo-Tax HUD refresh) after
// an AI action that incurs Pablo-Tax. The PabloTaxToaster listens for this to
// re-read the billing meter and surface a one-line toast IF the fire-and-forget
// waterfall actually drew ƒ this period (billedCents increased). Distinct from
// FIAT_CHANGED_EVENT — which fires on EVERY money change — so the toaster only
// re-checks the meter after AI usage, not after ordinary bank/shop spends.
export const PABLO_TAX_DRAW_CHECK_EVENT = 'salaryman:pablo-tax-check';

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
  /(economy|bank|transfer|deposit|withdraw|salary|credit\/plan|armory|gear|construction\/.+\/work|real-estate|business-market|marketplace|pledge\/(buy|checkout|purchase|vend)|items\/buy|cosmetics\/buy|subway\/travel|pablo\/command|wallet|payroll)/i;

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
    setTimeout(() => {
      notifyFiatChanged();
      // Also nudge the Pablo-Tax toaster to re-read the meter: if this AI call
      // pushed accrued usage across a $20 increment and the waterfall drew ƒ,
      // the toaster surfaces a one-line "you were charged" notice.
      try { window.dispatchEvent(new CustomEvent(PABLO_TAX_DRAW_CHECK_EVENT)); } catch {}
    }, delayMs);
  } catch {}
}

export function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const fullPath = path.startsWith('/api/')
    ? `${BASE}${path.slice(1)}`
    : path.startsWith('api/')
    ? `${BASE}${path}`
    : path;
  const method = (opts?.method ?? 'GET').toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const p = fetch(fullPath, { credentials: 'include', ...opts });
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
