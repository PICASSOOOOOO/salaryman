import { existsSync } from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, alphaApplicationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { isOwnerEmail, isPicassoOrgOwner } from "../lib/plan";

const router: IRouter = Router();
const DESKTOP_RELEASES = {
  windows: { archiveName: "salaryman-office-windows-x86_64.zip", label: "Windows" },
  macos: { archiveName: "salaryman-office-macos-arm64.zip", label: "macOS" },
  linux: { archiveName: "salaryman-office-linux-x86_64.tar.gz", label: "Linux" },
} as const;

type DesktopPlatform = keyof typeof DESKTOP_RELEASES;
const DESKTOP_PLATFORMS = Object.keys(DESKTOP_RELEASES) as DesktopPlatform[];

function archivePaths(archiveName: string): string[] {
  return [
    path.resolve(process.cwd(), "dist", "releases", archiveName),
    path.resolve(process.cwd(), "..", "..", "dist", "releases", archiveName),
  ];
}

function availableDesktopPlatforms(): DesktopPlatform[] {
  return DESKTOP_PLATFORMS.filter((platform) =>
    archivePaths(DESKTOP_RELEASES[platform].archiveName).some((candidate) => existsSync(candidate)),
  );
}

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
    const availablePlatforms = availableDesktopPlatforms();
    res.json({
      allowed: true,
      availablePlatforms,
    });
  } catch (error) {
    console.error("[desktop-download] access check failed", error);
    if (!res.headersSent) res.status(500).json({ error: "Could not verify desktop release access." });
  }
});

router.get("/desktop/download", async (req, res) => {
  const platform = req.query.platform;
  if (typeof platform !== "string" || !DESKTOP_PLATFORMS.includes(platform as DesktopPlatform)) {
    res.status(400).json({
      error: "Choose an operating-system-specific desktop package.",
      availablePlatforms: DESKTOP_PLATFORMS,
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

  const release = DESKTOP_RELEASES[platform as DesktopPlatform];
  const archivePath = archivePaths(release.archiveName).find((candidate) => existsSync(candidate));
  if (!archivePath) {
    res.status(503).json({
      error: `The ${release.label} desktop release is not available on this server.`,
    });
    return;
  }

  res.download(archivePath, release.archiveName, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: "The desktop release could not be downloaded." });
    }
  });
});

export default router;