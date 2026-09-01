// @vitest-environment node
//
// Companion guard to api-client.fiat-affecting.test.ts.
//
// The world HUD "YOU ƒ..." readout (CurrencyTicker) refreshes INSTANTLY only when
// a money request goes through `apiFetch`, which fires FIAT_CHANGED_EVENT when the
// requested path matches FIAT_AFFECTING. A call that uses a RAW `fetch(...)`
// instead NEVER fires that event — no matter what the regex says — so the balance
// silently goes stale until the next poll. This is a real, recurring bug class:
// subway fares (Subway.tsx) and the bank transfer (Game/Bank.tsx) were BOTH raw
// fetch and both left the HUD stale until they were switched to apiFetch.
//
// The sibling api-client.fiat-affecting.test.ts only inspects `apiFetch(...)` call
// sites, so it is structurally blind to this bypass: a money endpoint invoked via
// raw `fetch(...)` is invisible to it. This test closes that gap. It statically
// scans the web client for raw `fetch(...)` calls whose URL targets a
// FIAT_AFFECTING money endpoint and fails if any are found — they must use
// `apiFetch(...)` so the HUD updates immediately.
//
// Genuine exceptions (a path that matches FIAT_AFFECTING only by token
// coincidence and does NOT move the player's server bank balance) go in
// EXCUSED_RAW_FETCH together with the reason. A brand-new raw-fetch money call is
// neither matched nor excused and therefore fails the test, forcing a deliberate
// decision (almost always: "use apiFetch instead").
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIAT_AFFECTING } from "./api-client";

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Allowlist: mutating raw-fetch paths that MATCH FIAT_AFFECTING by token
// coincidence but do NOT move the player's server bank balance, so they
// legitimately skip apiFetch's instant HUD refresh. `${...}` in template
// literals is normalized to `*`. Each entry must carry a reason. The
// "no stale entries" test below flags any excuse that no longer appears in
// source so the list can't rot.
// ---------------------------------------------------------------------------
const EXCUSED_RAW_FETCH = new Map<string, string>();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

type RawCall = { file: string; path: string; mutating: boolean };

// Match raw `fetch("..."/'...'/`...`)` calls — but NOT `apiFetch(...)` (the
// leading boundary char rejects a preceding word char) and NOT `obj.fetch(...)`
// (the boundary rejects a preceding `.`). The URL may be wrapped in a one-arg
// helper such as `apiUrl("...")` / `api("...")` / `url(`...`)`; we capture the
// inner string literal. `${...}` is normalized to `*`, and the option object that
// follows within the same call decides whether the request is mutating.
function findRawFetchCalls(txt: string, file: string): RawCall[] {
  const calls: RawCall[] = [];
  const callRe = /(^|[^\w$.])fetch\(\s*(?:[A-Za-z_$][\w$]*\(\s*)?(['"`])([^'"`]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(txt))) {
    const path = m[3].replace(/\$\{[^}]*\}/g, "*");
    const win = txt.slice(m.index, m.index + 280);
    const mutating = /method:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i.test(win);
    calls.push({ file, path, mutating });
  }
  return calls;
}

function scanRawFetchCalls(): RawCall[] {
  const calls: RawCall[] = [];
  for (const file of walk(SRC_ROOT)) {
    calls.push(...findRawFetchCalls(readFileSync(file, "utf8"), file));
  }
  return calls;
}

describe("no raw fetch() bypasses the instant ƒ HUD refresh", () => {
  it("routes every mutating money request through apiFetch (not raw fetch)", () => {
    const calls = scanRawFetchCalls();

    // Sanity: the scan must actually find raw fetch call sites (guards against a
    // broken regex that would make this test vacuously pass).
    expect(calls.length).toBeGreaterThan(10);

    const moneyRaw = calls.filter((c) => c.mutating && FIAT_AFFECTING.test(c.path));

    const violations = moneyRaw
      .filter((c) => !EXCUSED_RAW_FETCH.has(c.path))
      .map((c) => `${c.path}  (in ${c.file.replace(SRC_ROOT + "/", "src/")})`);

    expect(
      violations,
      `These mutating money endpoints are called via a RAW fetch(...) that bypasses ` +
        `apiFetch, so the "YOU ƒ..." HUD will NOT refresh until the next poll. ` +
        `Switch each to apiFetch(...) (from src/lib/api-client.ts). If the path ` +
        `matches FIAT_AFFECTING only by token coincidence and does NOT move the ` +
        `player's bank ƒ, add it to EXCUSED_RAW_FETCH with a reason:\n` +
        violations.join("\n"),
    ).toEqual([]);
  });

  it("keeps EXCUSED_RAW_FETCH free of stale entries", () => {
    const live = new Set(
      scanRawFetchCalls()
        .filter((c) => c.mutating && FIAT_AFFECTING.test(c.path))
        .map((c) => c.path),
    );
    const stale = [...EXCUSED_RAW_FETCH.keys()].filter((p) => !live.has(p));
    expect(
      stale,
      `EXCUSED_RAW_FETCH entries no longer found as a mutating FIAT_AFFECTING raw ` +
        `fetch in client source (remove them): ${stale.join(", ")}`,
    ).toEqual([]);
  });

  // Self-checks for the detector itself: prove a raw-fetch money call is caught
  // and the equivalent apiFetch call is not (the whole point of the guard).
  it("flags a newly-added raw-fetch money call", () => {
    const sample = `const r = await fetch("/api/economy/bank/transfer", { method: "POST", body });`;
    const hits = findRawFetchCalls(sample, "sample.ts").filter(
      (c) => c.mutating && FIAT_AFFECTING.test(c.path) && !EXCUSED_RAW_FETCH.has(c.path),
    );
    expect(hits.map((c) => c.path)).toContain("/api/economy/bank/transfer");
  });

  it("does not flag the same money call made through apiFetch", () => {
    const sample = `const r = await apiFetch("/api/economy/bank/transfer", { method: "POST", body });`;
    expect(findRawFetchCalls(sample, "sample.ts")).toEqual([]);
  });

  it("does not flag a GET (non-mutating) read of a money endpoint", () => {
    const sample = `const r = await fetch("/api/economy/bank/accounts", { credentials: "include" });`;
    const hits = findRawFetchCalls(sample, "sample.ts").filter(
      (c) => c.mutating && FIAT_AFFECTING.test(c.path),
    );
    expect(hits).toEqual([]);
  });
});
