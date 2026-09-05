// Shared in-app path sanitizer. Used by the Pablo terminal front door AND the
// global command palette so navigation safety is enforced identically in both
// surfaces. Returns a normalized same-origin in-app path, or null if the path
// is unsafe (off-platform, /api machinery, the off-limits /phone system, a
// protocol-relative open-redirect, or control characters).
export function sanitizeReturnPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  if (path.length === 0 || path.length > 2048) return null;
  if (!path.startsWith("/")) return null;
  // Protocol-relative bait: //evil.com → an absolute URL once the browser
  // resolves it. Cut it off here.
  if (path.startsWith("//")) return null;
  // Control characters, including newlines and tabs, can break header
  // construction or smuggle a redirect. Bail.
  if (/[\x00-\x1f\x7f]/.test(path)) return null;
  if (typeof window === "undefined") return null;
  let parsed: URL;
  try { parsed = new URL(path, window.location.origin); }
  catch { return null; }
  if (parsed.origin !== window.location.origin) return null;
  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath === "/api" || lowerPath.startsWith("/api/")) return null;
  // The call / phone system is OFF-LIMITS (user request). Landing the user on
  // /phone after a search is effectively handing them the dialer. Drop any
  // /phone* destination.
  if (lowerPath === "/phone" || lowerPath.startsWith("/phone/") || lowerPath.startsWith("/phone?")) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
