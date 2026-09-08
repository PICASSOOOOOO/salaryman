// @vitest-environment node
//
// Guards the FIAT_AFFECTING regex against the REAL set of money-mutating API
// routes the client calls. The world HUD "YOU ƒ..." readout (CurrencyTicker)
// only refreshes instantly when `apiFetch` matches the requested path against
// FIAT_AFFECTING. A new spend feature whose endpoint isn't covered silently
// breaks that instant refresh with no other test failure — this file is that
// missing test.
//
// Two complementary checks:
//
//   1. CATALOG — an explicit, server-verified list of the endpoints that change
//      the player's server bank balance (the value GET /api/economy/bank/accounts
//      returns and the HUD displays). Each MUST match FIAT_AFFECTING. This is the
//      authoritative contract; if a regex edit drops one of these, this fails.
//
//   2. STATIC SCAN — walks the client source for every *mutating*
//      (POST/PUT/PATCH/DELETE) `apiFetch(...)` whose path looks like a spend
//      (buy / purchase / checkout / vend / acquire / deposit / withdraw /
//      transfer / claim / payoff / fare / toll). Each such path must EITHER match
//      FIAT_AFFECTING or be in EXCUSED_NON_BANK_SPENDS (paths that intentionally
//      do NOT move the server bank balance — Stripe card checkouts and
//      client-save-only spends). A brand-new spend endpoint that is neither
//      covered nor excused fails the test, forcing a deliberate decision.
//
// Why a scan and not just a list: a hand-maintained list has the same blind spot
// as the regex (a dev can forget to update it). The scan reads the actual call
// sites, so a newly-added `apiFetch("/api/.../buy", { method: "POST" })` is seen
// automatically.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIAT_AFFECTING } from "./api-client";

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// 1. CATALOG — real client endpoints that change the server bank balance.
// Verified against artifacts/api-server (spendEarnedFiat / claimSalary /
// creditFiat / spendCrypto write player_bank_accounts.balance). Keep in sync
// with the call sites; each entry is exercised by an `apiFetch` in the client.
// ---------------------------------------------------------------------------
const BANK_MUTATING_ENDPOINTS = [
  "/api/economy/bank/transfer", // Game/Bank.tsx — moves ƒ between/out of accounts
  "/api/economy/salary/claim", // useUnemploymentSalary — credits stipend
  "/api/economy/verified-salary/claim", // useVerifiedSalary — credits verified salary
  "/api/items/buy", // Armory — spendEarnedFiat
  "/api/cosmetics/buy", // Cosmetic/Vending — spendCrypto → bank
  "/api/vending/food/purchase", // VendKing food — atomic bank debit + effect
  "/api/pledge/vend", // VendingMachine — spendEarnedFiat
  "/api/subway/travel", // Subway intra-city fare — debits bank
  "/api/subway/travel-intercity", // Subway cross-city toll — debits bank
  "/api/chat/pablo/command", // Pablo command — can spendEarnedFiat
  "/api/construction/123/work", // LandRegistry — creditFiat construction wage
  "/api/shadow-tower/floors/66/units/1/acquire", // RealtyStore — acquires a paid Tower unit
];

// ---------------------------------------------------------------------------
// 2. STATIC SCAN config.
// ---------------------------------------------------------------------------

// Path "looks like a spend" — keep narrow to avoid noise. `\bvend\b` so it
// matches /pledge/vend but NOT /business/vendors.
const SPEND_VOCAB =
  /(\bbuy\b|purchase|checkout|\bvend\b|acquire|deposit|withdraw|transfer|claim|payoff|fare|toll)/i;

// Spend-vocab endpoints that intentionally do NOT change the server bank
// balance, so they're allowed to miss FIAT_AFFECTING. If one of these is
// removed from the client, the "excuses are live" test below flags the stale
// entry. `${...}` in template literals is normalized to `*`.
const EXCUSED_NON_BANK_SPENDS = new Set([
  "/api/items/checkout", // Stripe card checkout (real money, not bank ƒ)
  "/api/cosmetics/checkout", // Stripe card checkout (real money, not bank ƒ)
  "/api/stripe/create-checkout-session", // PABLO PRIME Stripe subscription checkout
  "/api/stripe/create-bot-checkout-session", // Stripe checkout session
  "/api/services/*/claim", // grants a service listing, no player-bank mutation
  "/api/twilio/purchase-number", // Stripe/Twilio purchase path, not in-game FIAT
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

type Call = { file: string; path: string; mutating: boolean };

// Find every apiFetch("..."/'...'/`...`) call, capture the path literal
// (normalizing `${...}` → `*`), and decide if it's mutating by looking at the
// option object that follows within the same call.
function scanApiFetchCalls(): Call[] {
  const calls: Call[] = [];
  const callRe = /apiFetch\(\s*(?:apiUrl\(\s*)?(['"`])([^'"`]+)\1/g;
  for (const file of walk(SRC_ROOT)) {
    const txt = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(txt))) {
        const literalPath = m[2].replace(/\$\{[^}]*\}/g, "*");
        // apiUrl("twilio/...") is the base-aware spelling of /api/twilio/....
        const path = m[0].includes("apiUrl(")
          ? `/api/${literalPath.replace(/^\//, "")}`
          : literalPath;
      const win = txt.slice(m.index, m.index + 280);
      const mutating = /method:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i.test(win);
      calls.push({ file, path, mutating });
    }
  }
  return calls;
}

describe("FIAT_AFFECTING covers every money-mutating endpoint", () => {
  it("matches every known server-bank-mutating endpoint", () => {
    for (const path of BANK_MUTATING_ENDPOINTS) {
      expect(FIAT_AFFECTING.test(path), `bank-mutating path not covered: ${path}`).toBe(true);
    }
  });

  it("matches (or explicitly excuses) every mutating spend-vocab apiFetch call in the client", () => {
    const calls = scanApiFetchCalls();
    const spendCalls = calls.filter((c) => c.mutating && SPEND_VOCAB.test(c.path));

    // Sanity: the scan must actually find call sites (guards against a broken
    // regex/path that would make this test vacuously pass).
    expect(spendCalls.length).toBeGreaterThan(5);

    const violations = spendCalls
      .filter((c) => !FIAT_AFFECTING.test(c.path) && !EXCUSED_NON_BANK_SPENDS.has(c.path))
      .map((c) => `${c.path}  (in ${c.file.replace(SRC_ROOT + "/", "src/")})`);

    expect(
      violations,
      `These mutating spend endpoints are neither matched by FIAT_AFFECTING nor ` +
        `listed in EXCUSED_NON_BANK_SPENDS. If the endpoint moves the player's ` +
        `bank ƒ, add it to FIAT_AFFECTING (in api-client.ts) so the HUD refreshes. ` +
        `If it does NOT (Stripe / client-save only), add it to EXCUSED_NON_BANK_SPENDS:\n` +
        violations.join("\n"),
    ).toEqual([]);
  });

  it("keeps the EXCUSED_NON_BANK_SPENDS list free of stale entries", () => {
    const scanned = new Set(scanApiFetchCalls().map((c) => c.path));
    const stale = [...EXCUSED_NON_BANK_SPENDS].filter((p) => !scanned.has(p));
    expect(stale, `EXCUSED_NON_BANK_SPENDS entries no longer found in client source: ${stale.join(", ")}`).toEqual([]);
  });
});
