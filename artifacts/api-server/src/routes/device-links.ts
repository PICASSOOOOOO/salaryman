import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { db, deviceLinkEventsTable, deviceLinksTable } from "@workspace/db";

const router: IRouter = Router();
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_TTL_MS = 10 * 60 * 1000;

function makePairingCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function hashPairingCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicLink(link: typeof deviceLinksTable.$inferSelect, pairingCode?: string) {
  return {
    id: link.id,
    status: link.status,
    desktopName: link.desktopName,
    mobileName: link.mobileName,
    desktopDeviceId: link.desktopDeviceId,
    mobileDeviceId: link.mobileDeviceId,
    scopes: link.scopes,
    pairingCode: pairingCode ?? null,
    pairingCodeExpiresAt: link.pairingCodeExpiresAt,
    desktopApprovedAt: link.desktopApprovedAt,
    mobileApprovedAt: link.mobileApprovedAt,
    linkedAt: link.linkedAt,
    revokedAt: link.revokedAt,
    lastDesktopSeenAt: link.lastDesktopSeenAt,
    lastMobileSeenAt: link.lastMobileSeenAt,
    hasDesktopCredential: Boolean(link.desktopAccessTokenHash),
    createdAt: link.createdAt,
  };
}

function requireUser(req: any, res: any): string | null {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return req.user.id;
}

router.get("/device-links", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const rows = await db
      .select()
      .from(deviceLinksTable)
      .where(eq(deviceLinksTable.userId, userId))
      .orderBy(desc(deviceLinksTable.createdAt));
    res.json({ links: rows.map((row) => publicLink(row)) });
  } catch (error) {
    console.error("[device-links] list failed", error);
    res.status(500).json({ error: "Could not load device links" });
  }
});

router.post("/device-links/pairing-request", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { desktopDeviceId, desktopName } = req.body as {
    desktopDeviceId?: unknown;
    desktopName?: unknown;
  };
  if (typeof desktopDeviceId !== "string" || !/^[a-zA-Z0-9._:-]{8,128}$/.test(desktopDeviceId)) {
    res.status(400).json({ error: "A valid desktop device id is required" });
    return;
  }
  const safeName = typeof desktopName === "string" && desktopName.trim()
    ? desktopName.trim().slice(0, 80)
    : "SALARYMAN desktop";
  const code = makePairingCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(deviceLinksTable)
        .where(and(
          eq(deviceLinksTable.userId, userId),
          eq(deviceLinksTable.desktopDeviceId, desktopDeviceId),
        ))
        .limit(1);

      if (existing?.status === "linked") {
        throw Object.assign(new Error("This desktop already has a trusted phone. Revoke it before pairing another."), { status: 409 });
      }

      const values = {
        userId,
        desktopDeviceId,
        desktopName: safeName,
        status: "pending",
        pairingCodeHash: hashPairingCode(code),
        pairingCodeExpiresAt: expiresAt,
        desktopApprovedAt: now,
        mobileDeviceId: null,
        mobileName: null,
        mobileApprovedAt: null,
        linkedAt: null,
        revokedAt: null,
        updatedAt: now,
      };
      const [link] = existing
        ? await tx.update(deviceLinksTable).set(values).where(eq(deviceLinksTable.id, existing.id)).returning()
        : await tx.insert(deviceLinksTable).values(values).returning();
      if (!link) throw new Error("Pairing request was not created");
      await tx.insert(deviceLinkEventsTable).values({
        linkId: link.id,
        userId,
        actor: "desktop",
        eventType: "pairing_requested",
        metadata: { expiresAt: expiresAt.toISOString() },
      });
      return link;
    });
    res.status(201).json({ link: publicLink(result, code), expiresInSeconds: CODE_TTL_MS / 1000 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    if (status === 409) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Desktop is already linked" });
      return;
    }
    console.error("[device-links] pairing request failed", error);
    res.status(500).json({ error: "Could not create pairing request" });
  }
});

router.post("/device-links/resolve", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    res.status(400).json({ error: "Enter the full 8-character pairing code" });
    return;
  }
  try {
    const [link] = await db
      .select()
      .from(deviceLinksTable)
      .where(and(
        eq(deviceLinksTable.userId, userId),
        eq(deviceLinksTable.pairingCodeHash, hashPairingCode(code)),
        eq(deviceLinksTable.status, "pending"),
        gt(deviceLinksTable.pairingCodeExpiresAt, new Date()),
      ))
      .limit(1);
    if (!link) {
      res.status(404).json({ error: "Pairing code is invalid or expired" });
      return;
    }
    res.json({ link: publicLink(link) });
  } catch (error) {
    console.error("[device-links] resolve failed", error);
    res.status(500).json({ error: "Could not resolve pairing code" });
  }
});

router.post("/device-links/:id/approve", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const mobileDeviceId = typeof req.body?.mobileDeviceId === "string" ? req.body.mobileDeviceId : "";
  const mobileName = typeof req.body?.mobileName === "string" && req.body.mobileName.trim()
    ? req.body.mobileName.trim().slice(0, 80)
    : "SALARYMAN mobile";
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(mobileDeviceId)) {
    res.status(400).json({ error: "A valid mobile device id is required" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [link] = await tx
        .select()
        .from(deviceLinksTable)
        .where(and(eq(deviceLinksTable.id, req.params.id), eq(deviceLinksTable.userId, userId)))
        .limit(1);
      if (!link) throw Object.assign(new Error("Device link not found"), { status: 404 });
      if (link.status === "linked" && link.mobileDeviceId === mobileDeviceId) return link;
      if (link.status !== "pending" || !link.pairingCodeExpiresAt || link.pairingCodeExpiresAt <= new Date()) {
        throw Object.assign(new Error("Pairing request is invalid or expired"), { status: 409 });
      }
      const [updated] = await tx.update(deviceLinksTable).set({
        status: "linked",
        mobileDeviceId,
        mobileName,
        mobileApprovedAt: new Date(),
        linkedAt: new Date(),
        pairingCodeHash: null,
        pairingCodeExpiresAt: null,
        updatedAt: new Date(),
      }).where(and(eq(deviceLinksTable.id, link.id), eq(deviceLinksTable.status, "pending"))).returning();
      if (!updated) throw Object.assign(new Error("Pairing request was already used"), { status: 409 });
      await tx.insert(deviceLinkEventsTable).values({
        linkId: updated.id,
        userId,
        actor: "mobile",
        eventType: "pairing_approved",
        metadata: { mobileDeviceId },
      });
      return updated;
    });
    res.json({ link: publicLink(result) });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    if (status === 404 || status === 409) {
      res.status(status).json({ error: error instanceof Error ? error.message : "Pairing approval failed" });
      return;
    }
    console.error("[device-links] approval failed", error);
    res.status(500).json({ error: "Could not approve device link" });
  }
});

router.post("/device-links/:id/desktop-credential", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const token = `sm_desktop_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const [link] = await db.update(deviceLinksTable).set({
      desktopAccessTokenHash: hashDesktopToken(token),
      desktopAccessTokenIssuedAt: now,
      updatedAt: now,
    }).where(and(
      eq(deviceLinksTable.id, req.params.id),
      eq(deviceLinksTable.userId, userId),
      eq(deviceLinksTable.status, "linked"),
    )).returning();
    if (!link) {
      res.status(404).json({ error: "A linked desktop is required" });
      return;
    }
    await db.insert(deviceLinkEventsTable).values({
      linkId: link.id,
      userId,
      actor: "user",
      eventType: "desktop_credential_issued",
      metadata: { desktopDeviceId: link.desktopDeviceId },
    });
    res.json({
      credential: token,
      link: publicLink(link),
      warning: "This credential is shown once. Store it in the desktop client and revoke the device if it is lost.",
    });
  } catch (error) {
    console.error("[device-links] desktop credential failed", error);
    res.status(500).json({ error: "Could not issue desktop credential" });
  }
});

router.delete("/device-links/:id", async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const [link] = await db.update(deviceLinksTable).set({
      status: "revoked",
      revokedAt: new Date(),
      pairingCodeHash: null,
      pairingCodeExpiresAt: null,
    desktopAccessTokenHash: null,
    desktopAccessTokenIssuedAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(deviceLinksTable.id, req.params.id),
      eq(deviceLinksTable.userId, userId),
      or(eq(deviceLinksTable.status, "pending"), eq(deviceLinksTable.status, "linked")),
    )).returning();
    if (!link) {
      res.status(404).json({ error: "Device link not found" });
      return;
    }
    await db.insert(deviceLinkEventsTable).values({
      linkId: link.id,
      userId,
      actor: "user",
      eventType: "link_revoked",
      metadata: {},
    });
    res.json({ link: publicLink(link) });
  } catch (error) {
    console.error("[device-links] revoke failed", error);
    res.status(500).json({ error: "Could not revoke device link" });
  }
});

export default router;