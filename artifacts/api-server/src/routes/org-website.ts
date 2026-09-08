// ── Org website management (/api/org-website) ────────────────────────────────
// CRUD for an org's connected Framer site. Every mutating route is gated by:
//   1. auth, 2. resolveCurrentOrgId, 3. canDoInOrg("website.manage"),
//   4. org registered-business eligibility (the org owner has a real business).
// The public reverse-proxy that actually serves the site lives in sites-proxy.ts.

import { Router, type Request, type Response } from "express";
import {
  db,
  orgWebsitesTable,
  organizationsTable,
  worldBusinessesTable,
} from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { canDoInOrg, resolveCurrentOrgId } from "../lib/org-permissions";
import {
  validateSlug,
  normalizeSlug,
  classifyOrigin,
  assertPublicOrigin,
  safeFetch,
  cacheClearForSlug,
} from "../lib/site-proxy";

const router: Router = Router();

function requireAuth(req: Request, res: Response): req is Request & { user: { id: string } } {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

/** An org may connect a website only if it is a registered real business: the
 * org owner has a world_businesses row with businessType = 'real'. */
async function isOrgRegisteredBusiness(orgId: number): Promise<boolean> {
  const [org] = await db
    .select({ ownerUserId: organizationsTable.ownerUserId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org?.ownerUserId) return false;
  const [wb] = await db
    .select({ businessType: worldBusinessesTable.businessType })
    .from(worldBusinessesTable)
    .where(and(eq(worldBusinessesTable.userId, org.ownerUserId), eq(worldBusinessesTable.businessType, "real")))
    .limit(1);
  return !!wb;
}

function slugError(reason?: string): string {
  switch (reason) {
    case "reserved":
      return "That URL is reserved. Pick a different one.";
    case "format":
      return "Use 2–40 lowercase letters, numbers or hyphens (no leading/trailing hyphen).";
    default:
      return "Enter a valid URL slug.";
  }
}

function originError(reason?: string): string {
  switch (reason) {
    case "protocol":
      return "The site URL must start with https://.";
    case "private_host":
    case "bad_host":
      return "That host is not allowed.";
    default:
      return "Enter a valid published site URL.";
  }
}

/** Resolve the caller's org + manage permission, or write the proper error and
 * return null. */
async function resolveManageContext(req: Request, res: Response): Promise<{ userId: string; orgId: number } | null> {
  if (!requireAuth(req, res)) return null;
  const userId = req.user.id;
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.status(400).json({ error: "no_org", message: "You are not part of an organization." });
    return null;
  }
  const check = await canDoInOrg(userId, orgId, "website.manage");
  if (!check.allowed) {
    res.status(403).json({ error: "forbidden", message: "You don't have permission to manage this org's website." });
    return null;
  }
  return { userId, orgId };
}

// GET current org website + eligibility.
router.get("/org-website", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const userId = req.user.id;
  const orgId = await resolveCurrentOrgId(userId);
  if (!orgId) {
    res.json({ eligible: false, hasOrg: false, site: null });
    return;
  }
  const canManage = (await canDoInOrg(userId, orgId, "website.manage")).allowed;
  const eligible = await isOrgRegisteredBusiness(orgId);
  const [site] = await db
    .select()
    .from(orgWebsitesTable)
    .where(eq(orgWebsitesTable.orgId, orgId))
    .limit(1);
  res.json({
    hasOrg: true,
    eligible,
    canManage,
    site: site ?? null,
    publicPath: site ? `/sites/${site.slug}` : null,
  });
});

// POST connect a site (create). One per org.
router.post("/org-website", async (req, res) => {
  const ctx = await resolveManageContext(req, res);
  if (!ctx) return;
  if (!(await isOrgRegisteredBusiness(ctx.orgId))) {
    res.status(403).json({ error: "not_eligible", message: "Only registered businesses can publish a website." });
    return;
  }

  const { slug: rawSlug, framerOrigin: rawOrigin, title } = req.body ?? {};
  const slugCheck = validateSlug(rawSlug);
  if (!slugCheck.ok) {
    res.status(400).json({ error: "bad_slug", message: slugError(slugCheck.reason) });
    return;
  }
  const slug = normalizeSlug(rawSlug);
  const originCheck = classifyOrigin(rawOrigin);
  if (!originCheck.ok || !originCheck.origin) {
    res.status(400).json({ error: "bad_origin", message: originError(originCheck.reason) });
    return;
  }
  if (!(await assertPublicOrigin(originCheck.origin))) {
    res.status(400).json({ error: "bad_origin", message: "That site could not be resolved to a public address." });
    return;
  }

  // Org may only have one site.
  const [existing] = await db.select({ id: orgWebsitesTable.id }).from(orgWebsitesTable).where(eq(orgWebsitesTable.orgId, ctx.orgId)).limit(1);
  if (existing) {
    res.status(409).json({ error: "exists", message: "This org already has a website. Update it instead." });
    return;
  }
  // Slug must be globally unique.
  const [slugTaken] = await db.select({ id: orgWebsitesTable.id }).from(orgWebsitesTable).where(eq(orgWebsitesTable.slug, slug)).limit(1);
  if (slugTaken) {
    res.status(409).json({ error: "slug_taken", message: "That URL is already taken." });
    return;
  }

  try {
    const [created] = await db
      .insert(orgWebsitesTable)
      .values({
        orgId: ctx.orgId,
        slug,
        framerOrigin: originCheck.origin,
        title: typeof title === "string" ? title.slice(0, 120) : null,
        status: "active",
        createdByUserId: ctx.userId,
      })
      .returning();
    res.status(201).json({ site: created, publicPath: `/sites/${created.slug}` });
  } catch {
    // Unique-index race (slug or org) lost between check and insert.
    res.status(409).json({ error: "conflict", message: "That URL was just taken. Try another." });
  }
});

// PUT update slug / origin / title / status.
router.put("/org-website", async (req, res) => {
  const ctx = await resolveManageContext(req, res);
  if (!ctx) return;
  if (!(await isOrgRegisteredBusiness(ctx.orgId))) {
    res.status(403).json({ error: "not_eligible", message: "Only registered businesses can manage a website." });
    return;
  }
  const [current] = await db.select().from(orgWebsitesTable).where(eq(orgWebsitesTable.orgId, ctx.orgId)).limit(1);
  if (!current) {
    res.status(404).json({ error: "not_found", message: "No website connected yet." });
    return;
  }

  const updates: Partial<typeof orgWebsitesTable.$inferInsert> = {};
  const { slug: rawSlug, framerOrigin: rawOrigin, title, status } = req.body ?? {};

  if (rawSlug !== undefined) {
    const slugCheck = validateSlug(rawSlug);
    if (!slugCheck.ok) {
      res.status(400).json({ error: "bad_slug", message: slugError(slugCheck.reason) });
      return;
    }
    const slug = normalizeSlug(rawSlug);
    if (slug !== current.slug) {
      const [taken] = await db
        .select({ id: orgWebsitesTable.id })
        .from(orgWebsitesTable)
        .where(and(eq(orgWebsitesTable.slug, slug), ne(orgWebsitesTable.id, current.id)))
        .limit(1);
      if (taken) {
        res.status(409).json({ error: "slug_taken", message: "That URL is already taken." });
        return;
      }
      updates.slug = slug;
    }
  }

  if (rawOrigin !== undefined) {
    const originCheck = classifyOrigin(rawOrigin);
    if (!originCheck.ok || !originCheck.origin) {
      res.status(400).json({ error: "bad_origin", message: originError(originCheck.reason) });
      return;
    }
    if (!(await assertPublicOrigin(originCheck.origin))) {
      res.status(400).json({ error: "bad_origin", message: "That site could not be resolved to a public address." });
      return;
    }
    updates.framerOrigin = originCheck.origin;
  }

  if (title !== undefined) updates.title = typeof title === "string" ? title.slice(0, 120) : null;
  if (status !== undefined) {
    if (status !== "active" && status !== "disabled") {
      res.status(400).json({ error: "bad_status", message: "Status must be active or disabled." });
      return;
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    res.json({ site: current, publicPath: `/sites/${current.slug}` });
    return;
  }

  try {
    const [updated] = await db
      .update(orgWebsitesTable)
      .set(updates)
      .where(eq(orgWebsitesTable.id, current.id))
      .returning();
    // Stored content for the old AND new slug may be stale now.
    cacheClearForSlug(current.slug);
    if (updated.slug !== current.slug) cacheClearForSlug(updated.slug);
    res.json({ site: updated, publicPath: `/sites/${updated.slug}` });
  } catch {
    res.status(409).json({ error: "conflict", message: "That URL was just taken. Try another." });
  }
});

// DELETE disconnect the site.
router.delete("/org-website", async (req, res) => {
  const ctx = await resolveManageContext(req, res);
  if (!ctx) return;
  const [current] = await db.select({ slug: orgWebsitesTable.slug }).from(orgWebsitesTable).where(eq(orgWebsitesTable.orgId, ctx.orgId)).limit(1);
  if (current) cacheClearForSlug(current.slug);
  await db.delete(orgWebsitesTable).where(eq(orgWebsitesTable.orgId, ctx.orgId));
  res.json({ ok: true });
});

// POST verify — best-effort reachability + title sniff for the connect form.
router.post("/org-website/verify", async (req, res) => {
  const ctx = await resolveManageContext(req, res);
  if (!ctx) return;
  const originCheck = classifyOrigin(req.body?.framerOrigin);
  if (!originCheck.ok || !originCheck.origin) {
    res.status(400).json({ ok: false, message: originError(originCheck.reason) });
    return;
  }
  if (!(await assertPublicOrigin(originCheck.origin))) {
    res.status(400).json({ ok: false, message: "That site could not be resolved to a public address." });
    return;
  }
  try {
    const r = await safeFetch(originCheck.origin, {
      timeoutMs: 8000,
      headers: { "user-agent": "Mozilla/5.0 (SALARYMAN site proxy)" },
    });
    const ct = r.headers.get("content-type") || "";
    let title: string | null = null;
    if (ct.includes("text/html")) {
      const m = r.body.toString("utf-8").match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      title = m ? m[1].trim() : null;
    }
    const ok = r.status >= 200 && r.status < 400;
    res.json({ ok, status: r.status, title });
  } catch {
    res.status(502).json({ ok: false, message: "Could not reach that site." });
  }
});

export default router;
