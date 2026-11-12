import { Router, type IRouter, type Request, type Response } from "express";
import { createReadStream } from "node:fs";
import { isOwnerEmail } from "../lib/plan";
import {
  startWeeklyTikTokRun,
  getCurrentTikTokJob,
  getTikTokJob,
  TikTokBusyError,
} from "../lib/weekly-tiktok";

const router: IRouter = Router();

// Owner-only: the capture bot drives a real browser session, so this is gated
// to Picasso owners rather than any logged-in user.
function requireOwner(req: Request, res: Response): boolean {
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  const email = (req.user as { email?: string | null } | undefined)?.email;
  if (!isOwnerEmail(email)) {
    res.status(403).json({ error: "Owner only" });
    return false;
  }
  return true;
}

function jobView(job: ReturnType<typeof getCurrentTikTokJob>) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    ownerInitiated: job.ownerInitiated,
    ready: job.status === "done",
    delivery: job.delivery ?? null,
    error: job.error ?? null,
    hasVideo: !!job.videoPath,
  };
}

// Kick off an on-demand weekly clip run.
router.post("/gameplay-tiktok/run", async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const { durationSec } = (req.body ?? {}) as { durationSec?: number };
  try {
    const job = startWeeklyTikTokRun({
      ownerInitiated: true,
      durationSec: typeof durationSec === "number" ? durationSec : undefined,
    });
    return res.json(jobView(job));
  } catch (err) {
    if (err instanceof TikTokBusyError) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }
});

// Current job status (single global job).
router.get("/gameplay-tiktok/status", (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  return res.json(jobView(getCurrentTikTokJob()));
});

router.get("/gameplay-tiktok/:id", (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const job = getTikTokJob(String(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(jobView(job));
});

// Preview/download the produced mp4.
router.get("/gameplay-tiktok/:id/file", (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const job = getTikTokJob(String(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "done" || !job.videoPath) {
    return res.status(409).json({ error: "Video not ready" });
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="salaryman-tiktok-${job.id}.mp4"`,
  );
  const stream = createReadStream(job.videoPath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "Stream failed" });
    else res.end();
  });
  return stream.pipe(res);
});

export default router;
