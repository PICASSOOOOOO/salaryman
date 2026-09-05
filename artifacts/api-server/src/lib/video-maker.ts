/**
 * Video Maker (MoneyPrinterTurbo-style, native rebuild).
 *
 * Pipeline: topic -> LLM script (scenes) -> per-scene narration (TTS) +
 * per-scene image (Nano Banana / DALL-E) -> ffmpeg assembles a short
 * vertical/landscape video with burned-in captions and voiceover.
 *
 * Jobs run in-memory and asynchronously; callers poll status by id and then
 * stream the finished mp4. Generated files live under the OS temp dir and are
 * cleaned up after a TTL.
 */
import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "./openai-models";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type VideoJobStatus =
  | "queued"
  | "scripting"
  | "rendering"
  | "assembling"
  | "done"
  | "error";

export interface VideoScene {
  narration: string;
  imagePrompt: string;
  caption: string;
}

export type VideoOrientation = "portrait" | "landscape";

export interface VideoJob {
  id: string;
  ownerId: string;
  topic: string;
  orientation: VideoOrientation;
  status: VideoJobStatus;
  stage: string;
  progress: number; // 0..100
  title?: string;
  sceneCount: number;
  scenesDone: number;
  durationSec?: number;
  videoPath?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ImageGenerator = (
  prompt: string,
  orientation: VideoOrientation,
) => Promise<Buffer>;

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm, clear narrator
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
const ERROR_TTL_MS = 5 * 60 * 1000; // keep failures briefly so clients can read them
const FFMPEG_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// Admission control: protect CPU, ffmpeg processes, and paid AI calls from
// runaway/concurrent jobs.
const MAX_GLOBAL_ACTIVE = 3;
const MAX_PER_USER_ACTIVE = 1;
const SCENE_CONCURRENCY = 2; // max simultaneous scene renders within a job

const ACTIVE_STATUSES: ReadonlySet<VideoJobStatus> = new Set([
  "queued",
  "scripting",
  "rendering",
  "assembling",
]);

export class VideoCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoCapError";
  }
}

const jobs = new Map<string, VideoJob>();

function activeCounts(ownerId: string): { global: number; user: number } {
  let global = 0;
  let user = 0;
  for (const j of jobs.values()) {
    if (ACTIVE_STATUSES.has(j.status)) {
      global++;
      if (j.ownerId === ownerId) user++;
    }
  }
  return { global, user };
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await fn(items[i] as T, i);
      }
    });
  await Promise.all(workers);
}

function jobId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export function getVideoJob(id: string): VideoJob | undefined {
  return jobs.get(id);
}

function touch(job: VideoJob, patch: Partial<VideoJob>): void {
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export interface CreateVideoOptions {
  ownerId: string;
  topic: string;
  orientation?: VideoOrientation;
  voiceId?: string;
  sceneCount?: number;
  imageGenerator: ImageGenerator;
}

export function createVideoJob(opts: CreateVideoOptions): VideoJob {
  const { global, user } = activeCounts(opts.ownerId);
  if (user >= MAX_PER_USER_ACTIVE) {
    throw new VideoCapError("You already have a video generating. Please wait for it to finish.");
  }
  if (global >= MAX_GLOBAL_ACTIVE) {
    throw new VideoCapError("The video engine is busy right now. Please try again in a moment.");
  }

  const sceneCount = Math.max(3, Math.min(8, opts.sceneCount ?? 5));
  const job: VideoJob = {
    id: jobId(),
    ownerId: opts.ownerId,
    topic: opts.topic,
    orientation: opts.orientation ?? "portrait",
    status: "queued",
    stage: "Queued",
    progress: 0,
    sceneCount,
    scenesDone: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);

  // Fire and forget; failures are captured on the job object.
  void processVideo(job, {
    voiceId: opts.voiceId ?? DEFAULT_VOICE_ID,
    sceneCount,
    imageGenerator: opts.imageGenerator,
  }).catch((err) => {
    console.error(`[video-maker] job ${job.id} failed:`, err);
    touch(job, {
      status: "error",
      stage: "Failed",
      error: err instanceof Error ? err.message : "Video generation failed",
    });
    // Evict failed jobs after a short grace period so clients can read the
    // error, preventing unbounded growth of the in-memory map.
    setTimeout(() => jobs.delete(job.id), ERROR_TTL_MS).unref?.();
  });

  return job;
}

interface ProcessOptions {
  voiceId: string;
  sceneCount: number;
  imageGenerator: ImageGenerator;
}

async function processVideo(job: VideoJob, opts: ProcessOptions): Promise<void> {
  const workDir = path.join(os.tmpdir(), `salaryman-video-${job.id}`);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. SCRIPT --------------------------------------------------------------
    touch(job, { status: "scripting", stage: "Writing script", progress: 5 });
    const script = await generateScript(job.topic, opts.sceneCount);
    touch(job, { title: script.title, sceneCount: script.scenes.length });

    // 2. RENDER (image + voiceover per scene) --------------------------------
    touch(job, {
      status: "rendering",
      stage: "Generating visuals & voiceover",
      progress: 15,
    });

    const dims =
      job.orientation === "portrait"
        ? { w: 1080, h: 1920 }
        : { w: 1920, h: 1080 };

    const clipPaths: string[] = new Array(script.scenes.length);

    await mapLimit(
      script.scenes,
      SCENE_CONCURRENCY,
      async (scene, i) => {
        const imgPath = path.join(workDir, `scene_${i}.png`);
        const audioPath = path.join(workDir, `scene_${i}.mp3`);
        const capPath = path.join(workDir, `scene_${i}.txt`);
        const clipPath = path.join(workDir, `clip_${i}.mp4`);

        const [imgBuf, audioBuf] = await Promise.all([
          opts.imageGenerator(scene.imagePrompt, job.orientation),
          synthesizeSpeech(scene.narration, opts.voiceId),
        ]);
        await writeFile(imgPath, imgBuf);
        await writeFile(audioPath, audioBuf);
        await writeFile(capPath, wrapCaption(scene.caption));

        const audioDur = await probeDuration(audioPath);
        const sceneDur = Math.max(2.2, audioDur + 0.4);

        await renderClip({
          imgPath,
          audioPath,
          capPath,
          clipPath,
          w: dims.w,
          h: dims.h,
          duration: sceneDur,
        });

        clipPaths[i] = clipPath;
        const done = job.scenesDone + 1;
        touch(job, {
          scenesDone: done,
          progress: 15 + Math.round((done / script.scenes.length) * 65),
        });
      },
    );

    // 3. ASSEMBLE ------------------------------------------------------------
    touch(job, {
      status: "assembling",
      stage: "Stitching final cut",
      progress: 85,
    });

    const finalPath = path.join(workDir, "final.mp4");
    await concatClips(clipPaths, workDir, finalPath, dims);
    const totalDur = await probeDuration(finalPath);

    touch(job, {
      status: "done",
      stage: "Ready",
      progress: 100,
      videoPath: finalPath,
      durationSec: Math.round(totalDur),
    });

    // Schedule cleanup of the work dir (keeps the mp4 long enough to download).
    setTimeout(() => {
      jobs.delete(job.id);
      void rm(workDir, { recursive: true, force: true });
    }, JOB_TTL_MS).unref?.();
  } catch (err) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------
interface Script {
  title: string;
  scenes: VideoScene[];
}

async function generateScript(topic: string, sceneCount: number): Promise<Script> {
  const sys = `You are a short-form video director. Produce a punchy, fast-paced ${sceneCount}-scene script for a vertical social video about the user's topic.
Respond with STRICT JSON only, shape:
{"title": string, "scenes": [{"narration": string, "imagePrompt": string, "caption": string}]}
Rules:
- Exactly ${sceneCount} scenes.
- "narration": 1-2 spoken sentences (max ~30 words), conversational, energetic.
- "caption": a SHORT on-screen punch line (max 8 words), no emojis.
- "imagePrompt": a vivid, cinematic, photoreal image description for this scene (lighting, subject, mood). One clear focal point, deliberate composition, restrained 2-3 tone palette, real material texture — avoid generic AI-stock staging, dead-centered symmetry, and over-saturation. No text in the image.`;

  const completion = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Topic: ${topic}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Script generation returned invalid JSON");
  }

  const obj = parsed as { title?: unknown; scenes?: unknown };
  const scenesRaw = Array.isArray(obj.scenes) ? obj.scenes : [];
  const scenes: VideoScene[] = scenesRaw
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        narration: String(o.narration ?? "").trim(),
        imagePrompt: String(o.imagePrompt ?? "").trim(),
        caption: String(o.caption ?? "").trim(),
      };
    })
    .filter((s) => s.narration && s.imagePrompt);

  if (scenes.length === 0) {
    throw new Error("Script generation produced no usable scenes");
  }

  return {
    title: String(obj.title ?? topic).trim() || topic,
    scenes,
  };
}

// ---------------------------------------------------------------------------
// Text-to-speech (ElevenLabs -> OpenAI fallback), returns an mp3 Buffer
// ---------------------------------------------------------------------------
async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.6,
              similarity_boost: 0.78,
              style: 0.25,
              use_speaker_boost: true,
            },
          }),
        },
      );
      if (res.ok) {
        return Buffer.from(new Uint8Array(await res.arrayBuffer()));
      }
      console.warn(
        "[video-maker] ElevenLabs TTS failed, falling back:",
        res.status,
      );
    } catch (err) {
      console.warn("[video-maker] ElevenLabs TTS error, falling back:", err);
    }
  }

  // OpenAI fallback (gpt-audio via the integration TTS helper; the proxy does
  // not support the legacy tts-1 speech API).
  const { textToSpeech } = await import(
    "@workspace/integrations-openai-ai-server/audio"
  );
  return textToSpeech(text, "onyx", "mp3");
}

// ---------------------------------------------------------------------------
// ffmpeg helpers
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

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
}

interface RenderClipOptions {
  imgPath: string;
  audioPath: string;
  capPath: string;
  clipPath: string;
  w: number;
  h: number;
  duration: number;
}

async function renderClip(o: RenderClipOptions): Promise<void> {
  const hasFont = existsSync(FFMPEG_FONT);
  const captionFontSize = Math.round(o.w * 0.05);
  const filters = [
    `scale=${o.w}:${o.h}:force_original_aspect_ratio=increase`,
    `crop=${o.w}:${o.h}`,
    `format=yuv420p`,
  ];
  if (hasFont) {
    filters.push(
      [
        `drawtext=fontfile=${FFMPEG_FONT}`,
        `textfile=${o.capPath}`,
        `reload=0`,
        `fontcolor=white`,
        `fontsize=${captionFontSize}`,
        `line_spacing=12`,
        `box=1`,
        `boxcolor=black@0.55`,
        `boxborderw=28`,
        `x=(w-text_w)/2`,
        `y=h-text_h-${Math.round(o.h * 0.12)}`,
      ].join(":"),
    );
  }

  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-t",
    o.duration.toFixed(2),
    "-i",
    o.imgPath,
    "-i",
    o.audioPath,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    o.clipPath,
  ]);
}

async function concatClips(
  clipPaths: string[],
  workDir: string,
  finalPath: string,
  dims: { w: number; h: number },
): Promise<void> {
  const valid = clipPaths.filter((p) => p && existsSync(p));
  if (valid.length === 0) throw new Error("No scene clips were produced");

  const listPath = path.join(workDir, "concat.txt");
  const listBody = valid
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, listBody);

  try {
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      finalPath,
    ]);
  } catch {
    // Fallback: re-encode if stream-copy concat fails.
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      `scale=${dims.w}:${dims.h}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      finalPath,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Caption wrapping (drawtext renders newlines from a textfile)
// ---------------------------------------------------------------------------
function wrapCaption(caption: string, maxChars = 22): string {
  const words = caption.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}
