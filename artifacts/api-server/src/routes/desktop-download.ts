import { existsSync } from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, alphaApplicationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { isOwnerEmail, isPicassoOrgOwner } from "../lib/plan";

const router: IRouter = Router();
const ARCHIVE_NAME = "salaryman-office-linux-x86_64.tar.gz";
const ARCHIVE_PATHS = [
  path.resolve(process.cwd(), "dist", "releases", ARCHIVE_NAME),
  path.resolve(process.cwd(), "..", "..", "dist", "releases", ARCHIVE_NAME),
];

async function hasDesktopReleaseAccess(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }

  const user = req.user!;
  if (isOwnerEmail(user.email) || await isPicassoOrgOwner(user.id)) return true;

  const [moderator] = await db
    .select({ id: alphaApplicationsTable.id })
    .from(alphaApplicationsTable)
    .where(and(
      eq(alphaApplicationsTable.userId, user.id),
      eq(alphaApplicationsTable.role, "alpha_tester"),
      eq(alphaApplicationsTable.status, "approved"),
    ))
    .limit(1);

  if (moderator) return true;
  res.status(403).json({ error: "Admin or approved moderator access required" });
  return false;
}

router.get("/desktop/access", async (req, res) => {
  try {
    if (!(await hasDesktopReleaseAccess(req, res))) return;
    res.json({ allowed: true, archiveName: ARCHIVE_NAME });
  } catch (error) {
    console.error("[desktop-download] access check failed", error);
    if (!res.headersSent) res.status(500).json({ error: "Could not verify desktop release access." });
  }
});

router.get("/desktop/download", async (req, res) => {
  if (req.query.platform !== "linux") {
    res.status(400).json({
      error: "Choose an operating-system-specific desktop package.",
      availablePlatforms: ["linux"],
    });
    return;
  }

  try {
    if (!(await hasDesktopReleaseAccess(req, res))) return;
  } catch (error) {
    console.error("[desktop-download] authorization failed", error);
    if (!res.headersSent) res.status(500).json({ error: "Could not verify desktop release access." });
    return;
  }

  const archivePath = ARCHIVE_PATHS.find((candidate) => existsSync(candidate));
  if (!archivePath) {
    res.status(503).json({
      error: "The Linux desktop release is not available on this server.",
    });
    return;
  }

  res.download(archivePath, ARCHIVE_NAME, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: "The desktop release could not be downloaded." });
    }
  });
});

export default router;