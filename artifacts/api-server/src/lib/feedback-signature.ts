import { createHash } from "crypto";

/**
 * Compute a stable 64-char hex fingerprint for an error report so the ingest
 * path can collapse repeated occurrences into one row instead of spamming the
 * inbox with N identical entries.
 *
 * Inputs are aggressively normalized so cosmetic noise (line/column numbers
 * that shift across builds, hashed asset URLs, full URLs vs. relative paths)
 * does NOT split a real recurring bug into N "different" signatures:
 *   - lowercase
 *   - strip query strings + asset hashes
 *   - replace digit runs with `N`
 *   - keep only the top-most stack frame (deeper frames are call-site noise
 *     and the same bug can have a slightly different deep tail per session)
 */
export function computeErrorSignature(input: {
  message?: string | null;
  stack?: string | null;
  source?: string | null;
}): string {
  const msg = normalize(input.message ?? "");
  const frames = appFrames(input.stack ?? "", 3).map(normalize).join("||");
  const src = (input.source ?? "").toLowerCase().slice(0, 32);
  const seed = `${src}|${msg}|${frames}`;
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Pull the top N application-specific frames from a stack. Filters out
 * `node_modules`, vite deps, and react internals so two unrelated bugs
 * that happen to share a leaf-level lib frame (lodash.get, react render,
 * etc.) don't get merged into the same signature. Falls back to whatever
 * frames exist if filtering leaves us with nothing (better to over-merge
 * than to silently produce empty signatures).
 */
function appFrames(stack: string, count: number): string[] {
  const lines = stack.split("\n").map(l => l.trim()).filter(Boolean);
  const stackLines = lines.filter(l => /^at\b/.test(l) || /@/.test(l));
  const isNoise = (l: string) =>
    /node_modules/i.test(l) ||
    /\.vite\/deps/i.test(l) ||
    /react-stack-bottom-frame|renderWithHooks|beginWork|workLoop|performUnitOfWork|performWorkOnRoot|runWithFiberInDEV/.test(l);
  const appOnly = stackLines.filter(l => !isNoise(l));
  const picked = (appOnly.length ? appOnly : stackLines).slice(0, count);
  return picked.length ? picked : (lines[0] ? [lines[0]] : []);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/[^\s)]+/g, (u) => {
      // Keep just the pathname's last segment (e.g. App.tsx) so different
      // origins / build hashes don't fork the signature.
      try {
        const url = new URL(u);
        const last = url.pathname.split("/").pop() ?? "";
        return last;
      } catch { return ""; }
    })
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}
