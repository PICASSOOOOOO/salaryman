// ---------------------------------------------------------------------------
// Onboarding intro-tour clip pipeline
// ---------------------------------------------------------------------------
// Bakes the TWO short vertical clips the new-player intro tour plays before
// intake: one of the OFFICE and one of the open CITY, both starring a Deckard
// (PABLO CORP · MAINTENANCE replicant). Reuses the existing gameplay-capture
// engine and the same ffmpeg-finish + object-storage upload approach as the
// weekly TikTok pipeline — nothing here redesigns those building blocks.
//
// The clips are SILENT (footage only). Pablo narration is spoken live in the
// client over the footage via the established TTS path, so the same baked
// footage serves every player and the voice stays Pablo's.
//
// Produced clips are uploaded to object storage and recorded as `art_assets`
// rows (keys tour_clip_office / tour_clip_city, mediaType "video") so the set
// is baked once and identical for everyone. The clips are streamed back to the
// client through /api/intro-tour/clip/:scene (object paths aren't reachable as
// a raw <video src> through the web proxy).

import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db, artAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { captureGameplay, type CaptureScene } from "./gameplay-capture";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

const FINAL_W = 1080;
const FINAL_H = 1920;
const JOB_TTL_MS = 30 * 60 * 1000;

// Tight cinematic beats — long enough to read the world, short enough to keep
// the tour brisk. The office is a smaller space so it needs less roam time.
const OFFICE_DURATION_SEC = 14;
const CITY_DURATION_SEC = 18;

export const TOUR_SCENES: readonly CaptureScene[] = ["office", "city"] as const;

/** art_assets key for a baked tour clip. */
export function tourClipKey(scene: CaptureScene): string {
  return `tour_clip_${scene}`;
}

export type TourJobStatus =
  | "queued"
  | "capturing"
  | "finishing"
  | "uploading"
  | "done"
  | "error";

const ACTIVE_STATUSES: ReadonlySet<TourJobStatus> = new Set([
  "queued",
  "capturing",
  "finishing",
  "uploading",
]);

export interface TourJob {
  id: string;
  status: TourJobStatus;
  stage: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  /** Which scenes finished baking this run. */
  baked: CaptureScene[];
  error?: string;
  workDir?: string;
}

export class TourBusyError extends Error {
  constructor() {
    super("The intro-tour footage is already being baked. Please wait for it to finish.");
    this.name = "TourBusyError";
  }
}

let currentJob: TourJob | null = null;

function jobId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function touch(job: TourJob, patch: Partial<TourJob>): void {
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getCurrentTourJob(): TourJob | null {
  return currentJob;
}

export interface TourClipState {
  scene: CaptureScene;
  ready: boolean;
  updatedAt: number | null;
}

/** Current readiness of each baked clip (from the art_assets rows). */
export async function getTourClipStates(): Promise<TourClipState[]> {
  const out: TourClipState[] = [];
  for (const scene of TOUR_SCENES) {
    const [row] = await db
      .select()
      .from(artAssetsTable)
      .where(eq(artAssetsTable.key, tourClipKey(scene)));
    const ready = !!row && row.status === "ready" && !!row.url;
    out.push({
      scene,
      ready,
      updatedAt:
        row?.updatedAt instanceof Date
          ? row.updatedAt.getTime()
          : row?.updatedAt
            ? Date.parse(String(row.updatedAt))
            : null,
    });
  }
  return out;
}

export interface BakeOptions {
  /** Re-bake even if both clips already exist. */
  force?: boolean;
}

/** Start a bake run. Throws TourBusyError if one is already active. */
export function startTourBake(opts: BakeOptions = {}): TourJob {
  if (currentJob && ACTIVE_STATUSES.has(currentJob.status)) {
    throw new TourBusyError();
  }
  const job: TourJob = {
    id: jobId(),
    status: "queued",
    stage: "Queued",
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    baked: [],
  };
  currentJob = job;

  void runPipeline(job, opts)
    .catch((err) => {
      console.error(`[IntroTour] job ${job.id} failed:`, err);
      touch(job, {
        status: "error",
        stage: "Failed",
        error: err instanceof Error ? err.message : "Bake failed",
      });
    })
    .finally(() => {
      setTimeout(() => {
        void cleanupWorkDir(job.workDir);
        if (currentJob && currentJob.id === job.id) currentJob = null;
      }, JOB_TTL_MS).unref?.();
    });

  return job;
}

async function cleanupWorkDir(workDir: string | undefined): Promise<void> {
  if (!workDir) return;
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[IntroTour] failed to clean temp dir ${workDir}:`, err);
  }
}

async function runPipeline(job: TourJob, opts: BakeOptions): Promise<void> {
  // Skip scenes that are already baked unless forced.
  const states = await getTourClipStates();
  const todo = TOUR_SCENES.filter(
    (scene) => opts.force || !states.find((s) => s.scene === scene)?.ready,
  );

  if (todo.length === 0) {
    touch(job, {
      status: "done",
      stage: "Already baked",
      progress: 100,
      baked: [...TOUR_SCENES],
    });
    return;
  }

  const workDir = path.join(os.tmpdir(), `salaryman-tour-${Date.now().toString(36)}`);
  await mkdir(workDir, { recursive: true });
  touch(job, { workDir });

  const baked: CaptureScene[] = [...TOUR_SCENES].filter(
    (scene) => !todo.includes(scene),
  );
  const total = todo.length;

  for (let i = 0; i < todo.length; i++) {
    const scene = todo[i];
    const base = Math.round((i / total) * 90);

    touch(job, {
      status: "capturing",
      stage: `Capturing ${scene}`,
      progress: Math.max(job.progress, base + 5),
    });
    const cap = await captureGameplay({
      scene,
      deckard: true,
      durationSec: scene === "office" ? OFFICE_DURATION_SEC : CITY_DURATION_SEC,
      onStage: (s) => touch(job, { stage: `${scene}: ${s}` }),
    });

    try {
      touch(job, {
        status: "finishing",
        stage: `Rendering ${scene}`,
        progress: Math.max(job.progress, base + 18),
      });
      const finalPath = await finishVerticalSilent(cap.rawPath, cap.workDir, scene);

      touch(job, {
        status: "uploading",
        stage: `Storing ${scene}`,
        progress: Math.max(job.progress, base + 26),
      });
      const objectPath = await uploadClip(finalPath);
      await upsertTourClipRow(scene, objectPath);

      baked.push(scene);
      touch(job, { baked: [...baked] });
    } finally {
      // Each scene captures into its OWN workDir; clean it now (the bake job's
      // top-level workDir is kept for the TTL window).
      await cleanupWorkDir(cap.workDir);
    }
  }

  touch(job, {
    status: "done",
    stage: "Footage baked",
    progress: 100,
    baked: [...new Set(baked)],
  });
  console.log(`[IntroTour] job ${job.id} baked: ${baked.join(", ")}`);
}

// ---------------------------------------------------------------------------
// ffmpeg finishing → silent vertical 1080x1920 mp4 (no caption, no music)
// ---------------------------------------------------------------------------
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

async function finishVerticalSilent(
  rawPath: string,
  workDir: string,
  scene: CaptureScene,
): Promise<string> {
  const out = path.join(workDir, `tour-${scene}.mp4`);
  const vf = [
    `scale=${FINAL_W}:${FINAL_H}:force_original_aspect_ratio=increase`,
    `crop=${FINAL_W}:${FINAL_H}`,
    // Soft cinematic edge darkening — on-brand neon-noir vignette, no overlays.
    `vignette=PI/5`,
    `format=yuv420p`,
  ].join(",");

  // A silent stereo track keeps the mp4 broadly playable; narration is layered
  // live in the client.
  const args = [
    "-y",
    "-i",
    rawPath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf",
    vf,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    // Web-friendly progressive playback (moov atom up front for streaming).
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    out,
  ];

  await runFfmpeg(args);
  if (!existsSync(out)) throw new Error(`ffmpeg produced no file for ${scene}`);
  return out;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
async function uploadClip(filePath: string): Promise<string> {
  const svc = new ObjectStorageService();
  const uploadURL = await svc.getObjectEntityUploadURL();
  const data = await readFile(filePath);
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "content-type": "video/mp4" },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return svc.normalizeObjectEntityPath(uploadURL);
}

/**
 * Record (or refresh) the baked clip as an art_assets row. These keys are NOT
 * in SALARYMAN_ART_KIT, so the art pipeline never tries to (re)generate them —
 * GET /art/asset/:key just returns the existing row. We read them directly here
 * and stream the underlying object via /api/intro-tour/clip/:scene.
 */
async function upsertTourClipRow(scene: CaptureScene, objectPath: string): Promise<void> {
  const key = tourClipKey(scene);
  const [existing] = await db
    .select({ id: artAssetsTable.id })
    .from(artAssetsTable)
    .where(eq(artAssetsTable.key, key));

  if (existing) {
    await db
      .update(artAssetsTable)
      .set({ url: objectPath, status: "ready", mediaType: "video", updatedAt: new Date() })
      .where(eq(artAssetsTable.id, existing.id));
    return;
  }

  await db.insert(artAssetsTable).values({
    key,
    category: "tour",
    subject: `Baked onboarding intro-tour clip: ${scene} (Deckard)`,
    prompt: `Real gameplay capture of the ${scene} starring a PABLO CORP maintenance Deckard.`,
    aspectRatio: "9:16",
    url: objectPath,
    status: "ready",
    mediaType: "video",
    backend: "capture",
  });
}

// ---------------------------------------------------------------------------
// Serving — stream a baked clip back to the client (cached in-process)
// ---------------------------------------------------------------------------
const bufferCache = new Map<string, Buffer>();

/**
 * Resolve a baked clip into an in-memory Buffer, or null if it isn't baked yet.
 * Cached per object path for the process lifetime (small clips, low traffic).
 */
export async function getTourClipBuffer(scene: CaptureScene): Promise<Buffer | null> {
  const [row] = await db
    .select({ url: artAssetsTable.url, status: artAssetsTable.status })
    .from(artAssetsTable)
    .where(eq(artAssetsTable.key, tourClipKey(scene)));
  const objectPath = row?.url;
  if (!row || row.status !== "ready" || !objectPath) return null;

  const cached = bufferCache.get(objectPath);
  if (cached) return cached;

  try {
    const svc = new ObjectStorageService();
    const file = await svc.getObjectEntityFile(objectPath);
    const response = await svc.downloadObject(file);
    const buf = Buffer.from(new Uint8Array(await response.arrayBuffer()));
    bufferCache.set(objectPath, buf);
    return buf;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
}
