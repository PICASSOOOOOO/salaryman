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

// Paths whose mutating (POST/PUT/PATCH/DELETE) requests can change the player's
// spendable fiat balance: bank transfers/deposits, salary claims, loan
// payments, buying/selling (gear, real estate, businesses, pledge store),
// construction labor, and Pablo commands (which can spend ƒ).
const FIAT_AFFECTING =
  /(economy|bank|transfer|deposit|withdraw|salary|credit\/plan|armory|gear|construction\/.+\/work|real-estate|business-market|marketplace|pledge\/(buy|checkout|purchase)|pablo\/command|wallet|payroll)/i;

function notifyFiatChanged() {
  try {
    window.dispatchEvent(new CustomEvent(FIAT_CHANGED_EVENT));
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
  if (isMutating && FIAT_AFFECTING.test(path)) {
    p.then((r) => { if (r.ok) notifyFiatChanged(); }).catch(() => {});
  }
  return p;
}
