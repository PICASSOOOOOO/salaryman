// ── Framer site reverse-proxy support ────────────────────────────────────────
// SALARYMAN hosts an org's OWN published Framer site under `/sites/<slug>` by
// reverse-proxying it (Framer has no HTML export; reverse-proxy is its
// officially supported self-hosting path). This module holds the pure,
// security-critical helpers: slug validation, SSRF origin classification, and
// HTML rewriting so a site that assumes it lives at the domain root still
// resolves its links/assets under a sub-path. The org-supplied `framerOrigin`
// is UNTRUSTED — it is fetched server-side, so every URL must pass the SSRF
// guard before any request is made.

import { lookup as dnsLookup } from "dns/promises";
import net from "net";
// Use undici's OWN fetch (not the Node global): a standalone-undici Agent is not
// accepted as a `dispatcher` by Node's built-in fetch (version-mismatched
// internal handler interface), so the pinned-IP dispatcher only works here.
import { Agent, fetch as undiciFetch } from "undici";

// Path segments we never let an org claim as a slug (they collide with real
// app/routing surfaces or are confusing as a public brand URL).
export const RESERVED_SLUGS = new Set([
  "api", "ws", "sites", "site", "admin", "www", "app", "assets", "static",
  "public", "dashboard", "world", "game", "office", "pablo", "mila", "login",
  "logout", "auth", "callback", "pledge", "upgrade", "billing", "stripe",
  "health", "healthz", "robots", "favicon", "sitemap", "internal", "system",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export interface SlugCheck {
  ok: boolean;
  reason?: "empty" | "format" | "reserved";
}

/** Validate a public URL slug: 2–40 chars, lowercase a–z/0–9/hyphen, no edge
 * hyphens, not a reserved word. */
export function validateSlug(raw: unknown): SlugCheck {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const slug = raw.trim().toLowerCase();
  if (!slug) return { ok: false, reason: "empty" };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "format" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface OriginCheck {
  ok: boolean;
  origin?: string; // normalized scheme://host[:port]
  reason?: "invalid_url" | "protocol" | "private_host" | "bad_host";
}

// Hostnames that always resolve to the local machine / metadata services.
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal",
]);

/** Is a literal IP address in a private / loopback / link-local / reserved
 * range that must never be reachable from a user-supplied fetch target. */
export function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split(".").map((n) => parseInt(n, 10));
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true; // loopback / unspecified
    if (v.startsWith("fe80")) return true; // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP literal — treat as blocked when used as IP
}

/** Synchronous structural classification of an org-supplied origin URL. Returns
 * the normalized origin (scheme://host[:port]) when it is an https URL whose
 * host is not an obviously-internal name or private IP literal. DNS-based
 * resolution is a second layer applied at request time (see assertPublicOrigin). */
export function classifyOrigin(raw: unknown): OriginCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "invalid_url" };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "protocol" };
  const host = u.hostname.toLowerCase();
  if (!host || host.includes("..")) return { ok: false, reason: "bad_host" };
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: "private_host" };
  if (host.endsWith(".local") || host.endsWith(".internal")) return { ok: false, reason: "private_host" };
  // Bare hostname with no dot (e.g. "router") is suspicious as an origin.
  if (!host.includes(".") && net.isIP(host) === 0) return { ok: false, reason: "bad_host" };
  if (net.isIP(host) !== 0 && isPrivateIp(host)) return { ok: false, reason: "private_host" };
  return { ok: true, origin: u.origin };
}

/** Request-time SSRF guard: resolve the host and confirm no resolved address is
 * private. Layered on top of classifyOrigin to defend against DNS that points a
 * public-looking name at an internal IP. */
export async function assertPublicOrigin(origin: string): Promise<boolean> {
  const c = classifyOrigin(origin);
  if (!c.ok || !c.origin) return false;
  const host = new URL(c.origin).hostname;
  if (net.isIP(host) !== 0) return !isPrivateIp(host);
  try {
    const addrs = await dnsLookup(host, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/** Resolve a hostname to a single validated PUBLIC address to pin the outbound
 * connection to. Returns null when the host (or ANY of its resolved addresses)
 * is private/loopback/link-local — defending against DNS that mixes public and
 * private answers. Pinning the connect address also closes the DNS-rebinding
 * TOCTOU window: we validate and connect to the SAME IP. */
async function resolvePinnedAddress(
  hostname: string,
): Promise<{ address: string; family: number } | null> {
  const literal = net.isIP(hostname);
  if (literal !== 0) {
    return isPrivateIp(hostname) ? null : { address: hostname, family: literal };
  }
  try {
    const addrs = await dnsLookup(hostname, { all: true });
    if (!addrs.length) return null;
    if (addrs.some((a) => isPrivateIp(a.address))) return null;
    const first = addrs[0];
    return { address: first.address, family: first.family };
  } catch {
    return null;
  }
}

export class SafeFetchError extends Error {
  constructor(
    public code:
      | "blocked_host"
      | "private_host"
      | "too_many_redirects"
      | "fetch_failed"
      | "timeout",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  method?: string;
}

/**
 * SSRF-hardened fetch for UNTRUSTED, org-supplied URLs. Unlike a plain `fetch`
 * with `redirect: "follow"` (which validates only the first hop), this:
 *  - re-runs the full origin classification + DNS public-IP check on EVERY hop,
 *  - follows redirects MANUALLY (capped depth) so each Location is re-validated,
 *  - PINS the outbound TCP connection to the validated resolved IP via a custom
 *    undici dispatcher, closing the DNS-rebinding window (TLS SNI/Host still use
 *    the real hostname, so certificate validation is unaffected).
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  let url = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new SafeFetchError("blocked_host", "invalid_url");
    }
    if (!classifyOrigin(parsed.origin).ok) {
      throw new SafeFetchError("blocked_host", parsed.origin);
    }
    const pin = await resolvePinnedAddress(parsed.hostname);
    if (!pin) throw new SafeFetchError("private_host", parsed.hostname);

    const dispatcher = new Agent({
      connect: {
        // Force the connection to the validated IP (rebinding-proof). undici
        // still uses parsed.hostname for SNI + cert validation. Handle both the
        // `all` array form and the classic (address, family) callback form.
        lookup: (_hostname: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (options && options.all) {
            cb(null, [{ address: pin.address, family: pin.family }]);
          } else {
            cb(null, pin.address, pin.family);
          }
        },
      },
    } as ConstructorParameters<typeof Agent>[0]);

    let resp: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      resp = await undiciFetch(url, {
        method: opts.method ?? "GET",
        redirect: "manual",
        headers: opts.headers,
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher,
      });
    } catch (err) {
      await dispatcher.destroy().catch(() => {});
      const name = (err as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SafeFetchError("timeout");
      }
      throw new SafeFetchError("fetch_failed", String((err as Error)?.message ?? err));
    }

    const location = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && location) {
      let next: string;
      try {
        next = new URL(location, url).toString();
      } catch {
        await resp.body?.cancel().catch(() => {});
        await dispatcher.destroy().catch(() => {});
        throw new SafeFetchError("blocked_host", location);
      }
      await resp.body?.cancel().catch(() => {});
      await dispatcher.destroy().catch(() => {});
      url = next;
      continue;
    }

    const body = Buffer.from(await resp.arrayBuffer());
    const headers = resp.headers;
    await dispatcher.destroy().catch(() => {});
    return { status: resp.status, headers, body, finalUrl: url };
  }

  throw new SafeFetchError("too_many_redirects");
}

/**
 * Rewrite a proxied HTML document so a site authored for the domain root works
 * when mounted under `/sites/<slug>/`. We:
 *  - inject a <base> tag (covers relative URLs), and
 *  - prefix root-relative href/src/srcset/action/poster/data-* values that point
 *    at the SAME origin (i.e. start with a single "/") with the mount prefix.
 * Absolute URLs (https://…, //cdn…) — including Framer's framerusercontent.com
 * CDN — are left untouched.
 */
export function rewriteHtml(html: string, slug: string): string {
  const prefix = `/sites/${slug}`;

  // Prefix root-relative URLs in common attributes: ="/path" or ='/path'
  // (but NOT "//" protocol-relative, and NOT already-prefixed).
  const attrs = ["href", "src", "action", "poster", "data-src", "data-href"];
  let out = html;
  for (const attr of attrs) {
    const re = new RegExp(`(\\b${attr}\\s*=\\s*)(["'])/(?!/)`, "gi");
    out = out.replace(re, (_m, lead, quote) => `${lead}${quote}${prefix}/`);
  }

  // srcset: a comma-separated list of "<url> <descriptor>" entries.
  out = out.replace(/(\bsrcset\s*=\s*)(["'])([^"']*)\2/gi, (_m, lead, quote, val) => {
    const rewritten = String(val)
      .split(",")
      .map((entry: string) => {
        const trimmed = entry.trim();
        if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return prefix + trimmed;
        return trimmed;
      })
      .join(", ");
    return `${lead}${quote}${rewritten}${quote}`;
  });

  // CSS url(/path) inside inline <style> / style="" attributes.
  out = out.replace(/url\(\s*(["']?)\/(?!\/)/gi, (_m, quote) => `url(${quote}${prefix}/`);

  // Inject <base> right after <head> so any remaining relative URLs resolve
  // under the mount. (Root-relative "/" URLs ignore <base>, which is why we
  // rewrite them above; <base> catches the relative ones.)
  const baseTag = `<base href="${prefix}/">`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (m) => `${m}${baseTag}`);
  } else {
    out = baseTag + out;
  }
  return out;
}

// ── Tiny in-memory response cache ────────────────────────────────────────────
// Keeps the proxy from hammering Framer on every hit. Bounded by entry count and
// per-entry size; entries expire by TTL. Process-local (fine for a single
// deployment; resets on restart).
interface CacheEntry {
  status: number;
  contentType: string;
  body: Buffer;
  expires: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 300;
const CACHE_MAX_BYTES = 5 * 1024 * 1024; // don't cache anything over 5 MB

export function cacheGet(key: string): CacheEntry | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    CACHE.delete(key);
    return null;
  }
  // refresh LRU position
  CACHE.delete(key);
  CACHE.set(key, hit);
  return hit;
}

export function cacheSet(key: string, entry: Omit<CacheEntry, "expires">): void {
  if (entry.body.length > CACHE_MAX_BYTES) return;
  while (CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest === undefined) break;
    CACHE.delete(oldest);
  }
  CACHE.set(key, { ...entry, expires: Date.now() + CACHE_TTL_MS });
}

export function cacheClearForSlug(slug: string): void {
  const p = `${slug}::`;
  for (const k of CACHE.keys()) if (k.startsWith(p)) CACHE.delete(k);
}
