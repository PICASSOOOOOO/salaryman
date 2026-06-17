import { Router, type IRouter, type Request, type Response } from "express";
import { isOwnerEmail } from "../lib/plan";
import {
  startTourBake,
  getCurrentTourJob,
  getTourClipStates,
  getTourClipBuffer,
  TourBusyError,
  TOUR_SCENES,
} from "../lib/intro-tour";
import type { CaptureScene } from "../lib/gameplay-capture";

const router: IRouter = Router();

// Baking drives a headless browser session, so kicking off a run is owner-only
// (same posture as the weekly TikTok route). Serving a finished clip is open —
// it's just silent gameplay footage and is needed during onboarding.
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

function jobView(job: ReturnType<typeof getCurrentTourJob>) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    baked: job.baked,
    error: job.error ?? null,
    done: job.status === "done",
  };
}

function isTourScene(v: string): v is CaptureScene {
  return (TOUR_SCENES as readonly string[]).includes(v);
}

// Kick off a bake of the intro-tour footage (office + city, starring a Deckard).
router.post("/intro-tour/bake", (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const { force } = (req.body ?? {}) as { force?: boolean };
  try {
    const job = startTourBake({ force: !!force });
    return res.json(jobView(job));
  } catch (err) {
    if (err instanceof TourBusyError) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }
});

// Current bake job + per-scene clip readiness (owner-only diagnostics).
router.get("/intro-tour/status", async (req: Request, res: Response) => {
  if (!requireOwner(req, res)) return;
  const clips = await getTourClipStates();
  return res.json({ job: jobView(getCurrentTourJob()), clips });
});

// Stream a baked clip. 404 (not 500) when the footage hasn't been baked yet so
// the client falls back to its painted-scene + live narration gracefully.
router.get("/intro-tour/clip/:scene", async (req: Request, res: Response) => {
  const scene = String(req.params.scene || "");
  if (!isTourScene(scene)) {
    res.status(404).json({ error: "Unknown tour scene" });
    return;
  }

  let buf: Buffer | null;
  try {
    buf = await getTourClipBuffer(scene);
  } catch (err) {
    console.error("[IntroTour] clip serve error", err);
    res.status(500).json({ error: "Failed to load clip" });
    return;
  }
  if (!buf) {
    res.status(404).json({ error: "Clip not baked yet" });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Accept-Ranges", "bytes");

  // Honor a single Range request (mobile Safari needs 206 to start playback).
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const total = buf.length;
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
        return;
      }
      const chunk = buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(chunk.length));
      res.end(chunk);
      return;
    }
  }

  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
});

export default router;
