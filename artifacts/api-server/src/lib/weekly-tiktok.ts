// ---------------------------------------------------------------------------
// Weekly SALARYMAN TikTok pipeline
// ---------------------------------------------------------------------------
// Captures REAL gameplay (gameplay-capture.ts), finishes it into a vertical
// 1080x1920 short with a factual caption + an instrumental music bed (NO AI
// narration / NO promo), then delivers it:
//   • auto-post to TikTok if the owner has connected an account AND the app
//     credentials exist (TIKTOK_CLIENT_KEY/SECRET), otherwise
//   • upload to object storage (best-effort) + email the owner the clip.
//
// Runs once a week (Mondays, 12:00 America/Los_Angeles) and on-demand via the
// owner-only route. A single global job runs at a time (Chromium is heavy).

import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db, socialConnectionsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { captureGameplay } from "./gameplay-capture";
import { getProvider, isProviderConfigured } from "./social-providers";
import { ObjectStorageService } from "./objectStorage";
import { getUncachableResendClient } from "./resend";
import { ownerEmails, getPicassoAdminUserIds } from "./plan";

const FFMPEG_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FINAL_W = 1080;
const FINAL_H = 1920;
const JOB_TTL_MS = 30 * 60 * 1000; // keep a finished/failed job readable for 30m

export type TikTokJobStatus =
  | "queued"
  | "capturing"
  | "finishing"
  | "delivering"
  | "done"
  | "error";

const ACTIVE_STATUSES: ReadonlySet<TikTokJobStatus> = new Set([
  "queued",
  "capturing",
  "finishing",
  "delivering",
]);

export interface DeliveryInfo {
  method: "tiktok" | "email" | "none";
  objectPath?: string;
  tiktokPublishId?: string;
  tiktokSkippedReason?: string;
  emailedTo?: number;
  note?: string;
}

export interface TikTokJob {
  id: string;
  status: TikTokJobStatus;
  stage: string;
  progress: number;
  ownerInitiated: boolean;
  createdAt: number;
  updatedAt: number;
  videoPath?: string;
  delivery?: DeliveryInfo;
  error?: string;
  /** Temp dir holding all capture/render artifacts; removed when the job is released. */
  workDir?: string;
}

export class TikTokBusyError extends Error {
  constructor() {
    super("A weekly clip is already being produced. Please wait for it to finish.");
    this.name = "TikTokBusyError";
  }
}

let currentJob: TikTokJob | null = null;

function jobId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function touch(job: TikTokJob, patch: Partial<TikTokJob>): void {
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getCurrentTikTokJob(): TikTokJob | null {
  return currentJob;
}

export function getTikTokJob(id: string): TikTokJob | null {
  return currentJob && currentJob.id === id ? currentJob : null;
}

export interface RunOptions {
  durationSec?: number;
  ownerInitiated?: boolean;
}

/** Start a run. Throws TikTokBusyError if one is already active. */
export function startWeeklyTikTokRun(opts: RunOptions = {}): TikTokJob {
  if (currentJob && ACTIVE_STATUSES.has(currentJob.status)) {
    throw new TikTokBusyError();
  }
  const job: TikTokJob = {
    id: jobId(),
    status: "queued",
    stage: "Queued",
    progress: 0,
    ownerInitiated: opts.ownerInitiated ?? false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  currentJob = job;

  void runPipeline(job, opts).catch((err) => {
    console.error(`[TikTok] job ${job.id} failed:`, err);
    touch(job, {
      status: "error",
      stage: "Failed",
      error: err instanceof Error ? err.message : "Pipeline failed",
    });
  }).finally(() => {
    // Allow the job to be read briefly, then release the slot AND delete its
    // temp artifacts. Cleaning here (not right after delivery) keeps the final
    // mp4 streamable via the owner preview route for the TTL window.
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
    console.warn(`[TikTok] failed to clean temp dir ${workDir}:`, err);
  }
}

async function runPipeline(job: TikTokJob, opts: RunOptions): Promise<void> {
  const durationSec = opts.durationSec ?? 40;

  // 1. CAPTURE -------------------------------------------------------------
  touch(job, { status: "capturing", stage: "Capturing gameplay", progress: 5 });
  const cap = await captureGameplay({
    durationSec,
    onStage: (s) => touch(job, { stage: s }),
  });
  // Record the temp dir so it gets cleaned when the job is released.
  touch(job, { progress: 55, workDir: cap.workDir });

  // 2. FINISH --------------------------------------------------------------
  touch(job, { status: "finishing", stage: "Generating music bed", progress: 60 });
  const music = await generateMusicBed(cap.workDir, durationSec);

  touch(job, { stage: "Rendering vertical cut", progress: 70 });
  const finalPath = await finishVertical(cap.rawPath, cap.workDir, music, captionText());
  touch(job, { videoPath: finalPath, progress: 85 });

  // 3. DELIVER -------------------------------------------------------------
  touch(job, { status: "delivering", stage: "Delivering", progress: 90 });
  const delivery = await deliverVideo(finalPath);

  touch(job, {
    status: "done",
    stage: deliveryStage(delivery),
    progress: 100,
    delivery,
  });
  console.log(`[TikTok] job ${job.id} done via ${delivery.method}`);
}

function deliveryStage(d: DeliveryInfo): string {
  if (d.method === "tiktok") return "Posted to TikTok";
  if (d.method === "email") return "Emailed to owner";
  return "Produced";
}

// ---------------------------------------------------------------------------
// Captions (non-promotional: location + date only)
// ---------------------------------------------------------------------------
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function captionText(): string {
  return `MINX CITY · ${todayStr()}`;
}

// ---------------------------------------------------------------------------
// Music bed (instrumental only — NOT narration)
// ---------------------------------------------------------------------------
async function generateMusicBed(workDir: string, seconds: number): Promise<string | null> {
  const envPath = process.env.CAPTURE_MUSIC_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  try {
    const dur = Math.min(22, Math.max(5, Math.round(seconds)));
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: "calm lo-fi ambient instrumental background loop, soft synth pads, mellow downtempo beat, no vocals",
        duration_seconds: dur,
        prompt_influence: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.warn(`[TikTok] music generation failed (${res.status}); using silent track`);
      return null;
    }
    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    const p = path.join(workDir, "music.mp3");
    await writeFile(p, buf);
    return p;
  } catch (err) {
    console.warn("[TikTok] music generation error; using silent track:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ffmpeg finishing → vertical 1080x1920 mp4
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

async function finishVertical(
  rawPath: string,
  workDir: string,
  musicPath: string | null,
  caption: string,
): Promise<string> {
  const out = path.join(workDir, "final.mp4");
  const capPath = path.join(workDir, "caption.txt");
  await writeFile(capPath, caption);

  const hasFont = existsSync(FFMPEG_FONT);
  const vf = [
    `scale=${FINAL_W}:${FINAL_H}:force_original_aspect_ratio=increase`,
    `crop=${FINAL_W}:${FINAL_H}`,
    `format=yuv420p`,
  ];
  if (hasFont && caption) {
    vf.push(
      [
        `drawtext=fontfile=${FFMPEG_FONT}`,
        `textfile=${capPath}`,
        `reload=0`,
        `fontcolor=white`,
        `fontsize=${Math.round(FINAL_W * 0.045)}`,
        `box=1`,
        `boxcolor=black@0.5`,
        `boxborderw=20`,
        `x=(w-text_w)/2`,
        `y=${Math.round(FINAL_H * 0.06)}`,
      ].join(":"),
    );
  }

  const args = ["-y", "-i", rawPath];
  if (musicPath) {
    args.push("-stream_loop", "-1", "-i", musicPath);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }
  args.push(
    "-vf",
    vf.join(","),
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
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    out,
  );

  await runFfmpeg(args);
  return out;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
async function deliverVideo(finalPath: string): Promise<DeliveryInfo> {
  // Best-effort durable backup to object storage.
  let objectPath: string | undefined;
  try {
    objectPath = await uploadToStorage(finalPath);
  } catch (err) {
    console.warn("[TikTok] object storage upload failed:", err);
  }

  // Auto-post to TikTok when wired up; otherwise fall back to email.
  const tk = await tryPostToTikTok(finalPath);
  if (tk.ok) {
    return { method: "tiktok", objectPath, tiktokPublishId: tk.publishId };
  }

  const emailedTo = await emailOwner(finalPath, objectPath, tk.reason);
  return {
    method: emailedTo > 0 ? "email" : "none",
    objectPath,
    tiktokSkippedReason: tk.reason,
    emailedTo,
    note: emailedTo > 0 ? undefined : "No OWNER_EMAILS configured — clip stored only.",
  };
}

async function uploadToStorage(filePath: string): Promise<string> {
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

async function tryPostToTikTok(
  filePath: string,
): Promise<{ ok: boolean; reason?: string; publishId?: string }> {
  const provider = getProvider("tiktok");
  if (!provider || !isProviderConfigured(provider)) {
    return { ok: false, reason: "TikTok app credentials (TIKTOK_CLIENT_KEY/SECRET) not configured" };
  }

  // SECURITY: only ever post to an OWNER's connected TikTok account. Without
  // this scope the first connected row of any user could be used, posting the
  // weekly SALARYMAN clip to a stranger's account. Fail closed if no owner has
  // connected one.
  const ownerUserIds = await getPicassoAdminUserIds();
  if (ownerUserIds.length === 0) {
    return { ok: false, reason: "No owner account is registered to post from" };
  }
  const [conn] = await db
    .select()
    .from(socialConnectionsTable)
    .where(
      and(
        eq(socialConnectionsTable.provider, "tiktok"),
        eq(socialConnectionsTable.status, "connected"),
        inArray(socialConnectionsTable.userId, ownerUserIds),
      ),
    );
  const creds = (conn?.credentials ?? {}) as Record<string, string>;
  const token = creds.accessToken || creds.access_token;
  if (!token) return { ok: false, reason: "No owner-connected TikTok account" };

  try {
    const data = await readFile(filePath);
    const size = data.length;
    const privacy = process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY";

    const initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: { title: captionText(), privacy_level: privacy, disable_comment: false },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: size,
            chunk_size: size,
            total_chunk_count: 1,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!initRes.ok) return { ok: false, reason: `TikTok init failed (${initRes.status})` };
    const initJson = (await initRes.json()) as {
      data?: { upload_url?: string; publish_id?: string };
    };
    const uploadUrl = initJson.data?.upload_url;
    const publishId = initJson.data?.publish_id;
    if (!uploadUrl) return { ok: false, reason: "TikTok init returned no upload_url" };

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "video/mp4",
        "content-range": `bytes 0-${size - 1}/${size}`,
      },
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(180_000),
    });
    if (put.status !== 200 && put.status !== 201) {
      return { ok: false, reason: `TikTok upload failed (${put.status})` };
    }
    return { ok: true, publishId };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "TikTok error" };
  }
}

async function emailOwner(
  finalPath: string,
  objectPath: string | undefined,
  tiktokReason: string | undefined,
): Promise<number> {
  const recipients = ownerEmails();
  if (recipients.length === 0) {
    console.warn("[TikTok] no OWNER_EMAILS configured — cannot email the weekly clip");
    return 0;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const data = await readFile(finalPath);
    const sizeMb = data.length / 1e6;
    const filename = `salaryman-${todayStr()}.mp4`;
    const attachments =
      sizeMb <= 20 ? [{ filename, content: data.toString("base64") }] : undefined;

    const lines = [
      `<p>Your weekly SALARYMAN gameplay clip is ready (${sizeMb.toFixed(1)} MB).</p>`,
      attachments
        ? `<p>The vertical 1080×1920 MP4 is attached.</p>`
        : `<p>The clip was too large to attach (${sizeMb.toFixed(1)} MB).</p>`,
      objectPath ? `<p>Stored at: <code>${objectPath}</code></p>` : "",
      tiktokReason
        ? `<p style="color:#888">Auto-post to TikTok was skipped: ${tiktokReason}. Connect a TikTok account and add the app credentials to enable direct posting.</p>`
        : "",
    ].filter(Boolean);

    await client.emails.send({
      from: fromEmail,
      to: recipients,
      subject: `SALARYMAN weekly clip — ${todayStr()}`,
      html: lines.join("\n"),
      attachments,
    });
    return recipients.length;
  } catch (err) {
    console.error("[TikTok] owner email failed:", err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Weekly schedule — Mondays 12:00 America/Los_Angeles
// ---------------------------------------------------------------------------
function laOffsetMs(at: Date): number {
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  const la = new Date(at.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return la.getTime() - utc.getTime();
}

/** Resolve an LA wall-clock (y,mo,d,h) to the correct real UTC instant. */
function laWallClockToUTC(y: number, mo: number, d: number, h: number): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, 0, 0));
  let off = laOffsetMs(guess);
  let result = new Date(guess.getTime() - off);
  off = laOffsetMs(result); // refine once for DST boundaries
  result = new Date(guess.getTime() - off);
  return result;
}

export function nextMondayNoonLA(now: Date = new Date()): Date {
  const off = laOffsetMs(now);
  const laNow = new Date(now.getTime() + off); // UTC fields == LA wall clock
  const laWd = laNow.getUTCDay(); // 0=Sun … 1=Mon
  const add = (1 - laWd + 7) % 7;
  let target = laWallClockToUTC(
    laNow.getUTCFullYear(),
    laNow.getUTCMonth(),
    laNow.getUTCDate() + add,
    12,
  );
  if (target.getTime() <= now.getTime()) {
    target = laWallClockToUTC(
      laNow.getUTCFullYear(),
      laNow.getUTCMonth(),
      laNow.getUTCDate() + add + 7,
      12,
    );
  }
  return target;
}

let scheduled = false;

/** Arm the self-rescheduling weekly timer. Safe to call once at boot. */
export function scheduleWeeklyTikTok(): void {
  if (scheduled) return;
  scheduled = true;

  const arm = () => {
    const next = nextMondayNoonLA(new Date());
    const ms = Math.max(1000, next.getTime() - Date.now());
    console.log(`[TikTok] next weekly capture scheduled for ${next.toISOString()}`);
    const timer = setTimeout(() => {
      try {
        startWeeklyTikTokRun({ ownerInitiated: false });
      } catch (err) {
        console.error("[TikTok] weekly trigger error:", err);
      }
      arm(); // reschedule for next week
    }, ms);
    timer.unref?.();
  };

  arm();
}
