// ── Public reverse-proxy for org Framer sites ────────────────────────────────
// Mounted top-level at `/sites` (NOT under /api). Serves an org's connected
// Framer site at `/sites/<slug>/...` by fetching from the org's published Framer
// origin, rewriting root-relative links, and caching. Read-only (GET only).

import { Router, type Request, type Response } from "express";
import { db, orgWebsitesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  safeFetch,
  rewriteHtml,
  cacheGet,
  cacheSet,
} from "./lib/site-proxy";

const router: Router = Router();

const FETCH_TIMEOUT_MS = 10_000;

function notFoundPage(res: Response, slug: string) {
  res
    .status(404)
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><title>Site not found</title>` +
        `<meta name="robots" content="noindex"></head>` +
        `<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
        `<div style="text-align:center"><h1 style="font-size:20px;letter-spacing:.05em">SITE NOT FOUND</h1>` +
        `<p style="opacity:.6;font-size:14px">No site is published at <code>/sites/${escapeHtml(slug)}</code>.</p></div>` +
        `</body></html>`
    );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

router.get("/{*splat}", async (req: Request, res: Response) => {
  // req.path here is relative to the /sites mount, e.g. "/acme/about".
  const rel = req.path.replace(/^\/+/, "");
  const firstSlash = rel.indexOf("/");
  const slug = (firstSlash === -1 ? rel : rel.slice(0, firstSlash)).toLowerCase();
  const subPath = firstSlash === -1 ? "" : rel.slice(firstSlash); // includes leading "/"

  if (!slug) {
    res.status(404).type("html").send("<!doctype html><title>Not found</title>");
    return;
  }

  const [site] = await db
    .select({ framerOrigin: orgWebsitesTable.framerOrigin, status: orgWebsitesTable.status })
    .from(orgWebsitesTable)
    .where(and(eq(orgWebsitesTable.slug, slug), eq(orgWebsitesTable.status, "active")))
    .limit(1);

  if (!site) {
    notFoundPage(res, slug);
    return;
  }

  // Redirect bare "/sites/<slug>" to "/sites/<slug>/" so relative URLs and the
  // injected <base> resolve correctly in the browser.
  if (subPath === "" && !req.originalUrl.endsWith("/")) {
    const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(302, `/sites/${slug}/${qs}`);
    return;
  }

  const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  const target = `${site.framerOrigin}${subPath || "/"}${query}`;

  const cacheKey = `${slug}::${subPath || "/"}${query}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.status(cached.status).type(cached.contentType).set("X-Proxy-Cache", "HIT").send(cached.body);
    return;
  }

  // SSRF-hardened fetch: re-validates the origin + every redirect hop and pins
  // the outbound connection to a validated public IP (no rebinding/redirect
  // bypass). Throws SafeFetchError on any blocked host / timeout.
  let upstream: Awaited<ReturnType<typeof safeFetch>>;
  try {
    upstream = await safeFetch(target, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: {
        // Forward a normal browser UA + accept so Framer serves the real page.
        "user-agent": req.get("user-agent") || "Mozilla/5.0 (SALARYMAN site proxy)",
        accept: req.get("accept") || "*/*",
        "accept-language": req.get("accept-language") || "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "timeout") {
      res.status(504).type("html").send("<!doctype html><title>Gateway timeout</title><p>The site took too long to respond.</p>");
    } else {
      res.status(502).type("html").send("<!doctype html><title>Bad gateway</title><p>Site origin is not reachable.</p>");
    }
    return;
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const isHtml = contentType.includes("text/html");
  let body = upstream.body;

  if (isHtml) {
    body = Buffer.from(rewriteHtml(body.toString("utf-8"), slug), "utf-8");
  }

  // Preserve a few safe passthrough headers; drop hop-by-hop + framing headers.
  res.status(upstream.status).type(contentType);
  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl) res.set("Cache-Control", cacheControl);
  res.set("X-Proxy-Cache", "MISS");
  // These pages are third-party content; don't let them be framed as us elsewhere
  // beyond our own preview. (We still iframe them same-origin in the dashboard.)
  res.removeHeader("X-Frame-Options");

  if (upstream.status === 200) {
    cacheSet(cacheKey, { status: upstream.status, contentType, body });
  }

  res.send(body);
});

export default router;
