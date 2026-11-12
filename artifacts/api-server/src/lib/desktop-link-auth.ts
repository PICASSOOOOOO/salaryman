import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, deviceLinksTable } from "@workspace/db";

function hashDesktopToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Resolve a linked desktop credential without exposing the raw token to storage.
 * Callers must still apply the user/org permissions required for their data.
 */
export async function requireDesktopLink(req: Request, res: Response) {
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
  if (!link || !link.scopes.includes("salaryman_app")) {
    res.status(401).json({ error: "Desktop credential is invalid, revoked, or lacks SALARYMAN access" });
    return null;
  }

  const now = new Date();
  await db.update(deviceLinksTable)
    .set({ lastDesktopSeenAt: now, updatedAt: now })
    .where(eq(deviceLinksTable.id, link.id));
  return link;
}
