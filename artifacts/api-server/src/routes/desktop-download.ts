import { existsSync } from "node:fs";
import path from "node:path";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const ARCHIVE_NAME = "salaryman-office-linux-x86_64.tar.gz";
const ARCHIVE_PATHS = [
  path.resolve(process.cwd(), "dist", "releases", ARCHIVE_NAME),
  path.resolve(process.cwd(), "..", "..", "dist", "releases", ARCHIVE_NAME),
];

router.get("/desktop/download", (_req, res) => {
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