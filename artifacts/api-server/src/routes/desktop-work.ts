import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  desktopWorkClaimsTable,
  desktopWorkLeasesTable,
  deviceLinksTable,
} from "@workspace/db";
import { creditFiat } from "../lib/fiat-wallet";

const router: IRouter = Router();
const WORK_TYPE = "office_shift";
const FIAT_PER_HOUR = 300;
const MAX_LEASE_MINUTES = 8 * 60;
const LEASE_TTL_MS = 24 * 60 * 60 * 1000;

function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function requireDesktopLink(req: Request, res: Response) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const deviceId = req.header("x-salaryman-device-id") ?? "";
  if (!token || !/^[a-zA-Z0-9._:-]{8,128}$/.test(deviceId)) {
    res.status(401).json({ error: "Desktop credential required" });
    return null;
  }
  const [link] = await db.select().from(deviceLinksTable).where(and(
    eq(deviceLinksTable.desktopAccessTokenHash, hashDesktopToken(token)),
    eq(deviceLinksTable.desktopDeviceId, deviceId),
    eq(deviceLinksTable.status, "linked"),
  )).limit(1);
  if (!link) {
    res.status(401).json({ error: "Desktop credential is invalid or revoked" });
    return null;
  }
  await db.update(deviceLinksTable).set({ lastDesktopSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(deviceLinksTable.id, link.id));
  return link;
}

router.post("/desktop-work/lease", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  try {
    const now = new Date();
    const [lease] = await db.insert(desktopWorkLeasesTable).values({
      linkId: link.id,
      userId: link.userId,
      desktopDeviceId: link.desktopDeviceId,
      status: "active",
      issuedAt: now,
      expiresAt: new Date(now.getTime() + LEASE_TTL_MS),
      maxMinutes: MAX_LEASE_MINUTES,
      consumedMinutes: 0,
    }).returning();
    res.json({
      leaseId: lease.id,
      workType: WORK_TYPE,
      rateFiatPerHour: FIAT_PER_HOUR,
      maxMinutes: lease.maxMinutes,
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
    });
  } catch (error) {
    console.error("[desktop-work] lease failed", error);
    res.status(500).json({ error: "Could not issue work lease" });
  }
});

router.post("/desktop-work/claims", async (req, res) => {
  const link = await requireDesktopLink(req, res);
  if (!link) return;
  const eventId = typeof req.body?.eventId === "string" ? req.body.eventId.trim() : "";
  const leaseId = typeof req.body?.leaseId === "string" ? req.body.leaseId : "";
  const workType = typeof req.body?.workType === "string" ? req.body.workType : "";
  const workMinutes = Number(req.body?.workMinutes);
  const reportedAt = new Date(req.body?.reportedAt);
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)
    || !/^[0-9a-f-]{36}$/i.test(leaseId)
    || workType !== WORK_TYPE
    || !Number.isInteger(workMinutes)
    || workMinutes < 1
    || workMinutes > 60
    || Number.isNaN(reportedAt.getTime())) {
    res.status(400).json({ error: "Invalid desktop work record" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(desktopWorkClaimsTable)
        .where(eq(desktopWorkClaimsTable.eventId, eventId)).limit(1);
      if (existing) {
        if (existing.userId !== link.userId || existing.desktopDeviceId !== link.desktopDeviceId
          || existing.workMinutes !== workMinutes || existing.leaseId !== leaseId) {
          return { kind: "conflict" as const };
        }
        return {
          kind: "duplicate" as const,
          status: existing.status,
          amountFiat: existing.amountFiat,
        };
      }

      const [lease] = await tx.select().from(desktopWorkLeasesTable)
        .where(and(
          eq(desktopWorkLeasesTable.id, leaseId),
          eq(desktopWorkLeasesTable.linkId, link.id),
          eq(desktopWorkLeasesTable.userId, link.userId),
          eq(desktopWorkLeasesTable.desktopDeviceId, link.desktopDeviceId),
        ))
        .for("update")
        .limit(1);
      const now = new Date();
      const reason = !lease
        ? "unknown_lease"
        : lease.status !== "active"
          ? "lease_not_active"
          : lease.expiresAt <= now
            ? "lease_expired"
            : lease.consumedMinutes + workMinutes > lease.maxMinutes
              ? "lease_minutes_exceeded"
              : null;
      if (reason) {
        await tx.insert(desktopWorkClaimsTable).values({
          eventId,
          leaseId,
          linkId: link.id,
          userId: link.userId,
          desktopDeviceId: link.desktopDeviceId,
          workType,
          workMinutes,
          amountFiat: 0,
          status: "rejected",
          rejectionReason: reason,
          reportedAt,
        });
        return { kind: "rejected" as const, reason };
      }

      const amountFiat = Math.floor((workMinutes * FIAT_PER_HOUR) / 60);
      const wallet = await creditFiat(tx, {
        userId: link.userId,
        amountFiat,
        description: "SALARYMAN DESKTOP OFFICE WORK",
        kind: "desktop_work",
        idempotencyKey: `desktop-work:${eventId}`,
      });
      await tx.update(desktopWorkLeasesTable).set({
        consumedMinutes: lease.consumedMinutes + workMinutes,
        status: lease.consumedMinutes + workMinutes >= lease.maxMinutes ? "settled" : "active",
      }).where(eq(desktopWorkLeasesTable.id, lease.id));
      await tx.insert(desktopWorkClaimsTable).values({
        eventId,
        leaseId: lease.id,
        linkId: link.id,
        userId: link.userId,
        desktopDeviceId: link.desktopDeviceId,
        workType,
        workMinutes,
        amountFiat,
        status: "accepted",
        rejectionReason: null,
        reportedAt,
        settledAt: now,
      });
      return { kind: "accepted" as const, amountFiat, balance: wallet.newBalance };
    });

    if (result.kind === "conflict") {
      res.status(409).json({ error: "event_id_already_used" });
      return;
    }
    if (result.kind === "duplicate") {
      res.json({ ok: true, duplicate: true, status: result.status, amountFiat: result.amountFiat });
      return;
    }
    if (result.kind === "rejected") {
      res.status(422).json({ ok: false, status: "rejected", reason: result.reason });
      return;
    }
    res.json({ ok: true, status: "accepted", amountFiat: result.amountFiat, balance: result.balance });
  } catch (error) {
    console.error("[desktop-work] claim failed", error);
    res.status(500).json({ error: "Could not settle desktop work" });
  }
});

export default router;