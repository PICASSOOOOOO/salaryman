// ---------------------------------------------------------------------------
// Landing-page hero trailer pipeline
// ---------------------------------------------------------------------------
// Produces the single landscape MP4 played (and scroll-scrubbed) on the public
// "/" landing page: REAL gameplay footage (office → city) under a Pablo
// voice-over that explains what SALARYMAN is, plus a faint ambient music bed.
//
// Building blocks reused: the Playwright gameplay-capture bot (landscape mode),
// the ElevenLabs Pablo voice (with an OpenAI TTS fallback), and ffmpeg.
//
// The narration is generated line-by-line so we can measure each line's real
// audio duration and emit exact caption timings — the landing shows these
// captions as a muted/scrubbing fallback while Pablo's voice plays as a
// continuous audio track.
//
// Output is consumed by a one-off bake script (scripts/bake-landing-trailer.ts)
// that writes the finished MP4 + captions JSON into the web app's served public
// assets, so the landing loads a committed, reliably-streamed file.

import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { captureGameplay, type CaptureScene } from "./gameplay-capture";
import { PABLO_VOICE_ID } from "./pablo-voice";

// Pablo's headline ElevenLabs voice is shared with the live TTS route so
// generated narration cannot drift to a different actor.

const FINAL_W = 1280;
const FINAL_H = 720;

// Silence appended after each spoken line so the narration breathes.
const LINE_GAP_SEC = 0.7;

/**
 * Pablo's narration — an invitation/commercial for the player ("salaryman")
 * to come compete. Tone: cold, direct, urgent. SALARYMAN is the player, not
 * the city. Minx City is the arena. The pitch: come grind, compete, get rich.
 */
export const LANDING_NARRATION: string[] = [
  "Minx City runs on work.",
  "Every morning, thousands show up — competing for jobs, clients, a way up.",
  "Salaryman. That is what they call the ones who grind for something better.",
  "There are desks here. Businesses to build. Real money to make.",
  "The city does not hand you anything. You earn every coin.",
  "Some make it. Most do not. The difference is hunger.",
  "If you are ready — your shift starts now.",
];

export interface TrailerCaption {
  text: string;
  /** Seconds into the voice-over track when this line begins. */
  start: number;
  /** Seconds into the voice-over track when this line ends. */
  end: number;
}

export interface BakeResult {
  /** Absolute path to the finished landscape MP4. */
  videoPath: string;
  /** Caption timings aligned to the continuous voice-over audio track. */
  captions: TrailerCaption[];
  /** Total trailer duration in seconds. */
  durationSec: number;
  /** Temp working directory (caller cleans it up). */
  workDir: string;
}

export interface BakeOptions {
  /** Status callback for progress surfacing. */
  onStage?: (stage: string) => void;
  /** Per-scene record seconds. Default office=16, city=26. */
  officeSec?: number;
  citySec?: number;
  /**
   * Pre-captured footage (e.g. raw .webm paths from a prior staged capture).
   * When provided and non-empty, the in-process capture step is skipped — this
   * lets the bake run as separate sub-120s foreground steps in environments
   * where long-lived background processes are reaped.
   */
  footagePaths?: string[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LandingTrailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LandingTrailerError";
  }
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
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-700)}`));
    });
  });
}

function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", reject);
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
}

// ---------------------------------------------------------------------------
// Voice-over (Pablo) — ElevenLabs primary, OpenAI fallback
// ---------------------------------------------------------------------------
async function synthLine(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${PABLO_VOICE_ID}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.6,
              similarity_boost: 0.8,
              style: 0.25,
              use_speaker_boost: true,
              speed: 0.9,
            },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (res.ok) return Buffer.from(new Uint8Array(await res.arrayBuffer()));
      const body = await res.text().catch(() => "");
      console.warn(`[landing-trailer] ElevenLabs line failed ${res.status}: ${body.slice(0, 160)}`);
    } catch (err) {
      console.warn("[landing-trailer] ElevenLabs error:", err);
    }
  }
  // Fallback: OpenAI TTS helper (works through the Replit AI proxy).
  const { textToSpeech } = await import(
    "@workspace/integrations-openai-ai-server/audio"
  );
  return textToSpeech(text, "onyx", "mp3");
}

/**
 * Generate the per-line voice-over, stitch into one continuous track with
 * breathing gaps, and return the track path + exact caption timings.
 */
async function buildVoiceOver(
  workDir: string,
  onStage: (s: string) => void,
): Promise<{ voPath: string; captions: TrailerCaption[]; durationSec: number }> {
  const concatList: string[] = [];
  const captions: TrailerCaption[] = [];
  let cursor = 0;

  for (let i = 0; i < LANDING_NARRATION.length; i++) {
    const text = LANDING_NARRATION[i];
    onStage(`Narrating line ${i + 1}/${LANDING_NARRATION.length}`);
    const mp3 = await synthLine(text);
    const linePath = path.join(workDir, `vo_${i}.mp3`);
    await writeFile(linePath, mp3);

    const dur = await ffprobeDuration(linePath);
    captions.push({ text, start: round(cursor), end: round(cursor + dur) });
    cursor += dur + LINE_GAP_SEC;

    // Normalize + append the breathing gap, into a uniform wav for safe concat.
    const wavPath = path.join(workDir, `vo_${i}.wav`);
    await runFfmpeg([
      "-y",
      "-i",
      linePath,
      "-af",
      `apad=pad_dur=${LINE_GAP_SEC}`,
      "-ar",
      "44100",
      "-ac",
      "2",
      wavPath,
    ]);
    concatList.push(`file '${wavPath.replace(/'/g, "'\\''")}'`);
  }

  const listPath = path.join(workDir, "vo_list.txt");
  await writeFile(listPath, concatList.join("\n"));
  const voPath = path.join(workDir, "voiceover.wav");
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
    voPath,
  ]);

  return { voPath, captions, durationSec: round(cursor) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Footage — capture office + city (landscape), concat into one stream
// ---------------------------------------------------------------------------
export async function captureScene(
  scene: CaptureScene,
  durationSec: number,
  onStage: (s: string) => void = () => {},
): Promise<string | null> {
  try {
    const res = await captureGameplay({
      scene,
      orientation: "landscape",
      durationSec,
      onStage,
      // Hero trailer wants clean gameplay — suppress the alpha banner, nav, HUD
      // and office onboarding overlays via chrome-free embed mode.
      chromeFree: true,
    });
    return res.rawPath;
  } catch (err) {
    console.warn(`[landing-trailer] ${scene} capture failed:`, err);
    return null;
  }
}

async function buildFootage(
  workDir: string,
  rawPaths: string[],
): Promise<string> {
  const out = path.join(workDir, "footage.mp4");
  const scaleChain =
    `scale=${FINAL_W}:${FINAL_H}:force_original_aspect_ratio=increase,` +
    `crop=${FINAL_W}:${FINAL_H},setsar=1,fps=30,format=yuv420p`;

  const args = ["-y"];
  for (const p of rawPaths) args.push("-i", p);

  const labels: string[] = [];
  const filters: string[] = [];
  rawPaths.forEach((_, i) => {
    filters.push(`[${i}:v]${scaleChain}[v${i}]`);
    labels.push(`[v${i}]`);
  });
  if (rawPaths.length > 1) {
    filters.push(`${labels.join("")}concat=n=${rawPaths.length}:v=1:a=0[v]`);
  } else {
    filters.push(`${labels[0]}null[v]`);
  }

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    out,
  );
  await runFfmpeg(args);
  return out;
}

// ---------------------------------------------------------------------------
// Optional ambient music bed (best-effort; silent if unavailable)
// ---------------------------------------------------------------------------
async function generateMusicBed(
  workDir: string,
  seconds: number,
): Promise<string | null> {
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
        text: "dark cinematic ambient drone, slow neon-noir synth pad, brooding corporate tension, no drums, no vocals",
        duration_seconds: dur,
        prompt_influence: 0.3,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    const p = path.join(workDir, "music.mp3");
    await writeFile(p, buf);
    return p;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
export async function bakeLandingTrailer(opts: BakeOptions = {}): Promise<BakeResult> {
  const onStage = opts.onStage ?? (() => {});
  const officeSec = Math.max(8, Math.min(40, opts.officeSec ?? 16));
  const citySec = Math.max(8, Math.min(60, opts.citySec ?? 26));

  const workDir = path.join(os.tmpdir(), `salaryman-trailer-${Date.now().toString(36)}`);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. FOOTAGE — office then city, landscape. Skipped if pre-captured paths
    // were supplied (staged-bake path).
    let raws: string[];
    if (opts.footagePaths && opts.footagePaths.length > 0) {
      raws = opts.footagePaths.filter((p) => existsSync(p));
      onStage(`Using ${raws.length} pre-captured clip(s)`);
    } else {
      onStage("Capturing office footage");
      const office = await captureScene("office", officeSec, onStage);
      // Brief pause so the heavy browser fully releases before the next launch.
      await sleep(1500);
      onStage("Capturing city footage");
      const city = await captureScene("city", citySec, onStage);
      raws = [office, city].filter((p): p is string => !!p);
    }
    if (raws.length === 0) {
      throw new LandingTrailerError(
        "No footage available to assemble (capture failed or paths missing).",
      );
    }
    onStage("Assembling footage");
    const footage = await buildFootage(workDir, raws);

    // 2. VOICE-OVER — Pablo, line by line, with exact caption timings.
    onStage("Generating Pablo voice-over");
    const { voPath, captions, durationSec } = await buildVoiceOver(workDir, onStage);

    // 3. MUSIC BED — faint, best-effort.
    onStage("Generating music bed");
    const music = await generateMusicBed(workDir, durationSec);

    // 4. FINAL MUX — loop footage to cover the VO, mix VO + faint music.
    onStage("Rendering final trailer");
    const out = path.join(workDir, "trailer.mp4");
    const args = [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      footage,
      "-i",
      voPath,
    ];
    if (music) args.push("-stream_loop", "-1", "-i", music);

    if (music) {
      args.push(
        "-filter_complex",
        "[1:a]volume=1.0[vo];[2:a]volume=0.1[mus];[vo][mus]amix=inputs=2:duration=first:dropout_transition=0[a]",
        "-map",
        "0:v:0",
        "-map",
        "[a]",
      );
    } else {
      args.push("-map", "0:v:0", "-map", "1:a:0");
    }
    args.push(
      "-t",
      String(durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      out,
    );
    await runFfmpeg(args);

    if (!existsSync(out)) {
      throw new LandingTrailerError("Final trailer render produced no file.");
    }
    return { videoPath: out, captions, durationSec, workDir };
  } catch (err) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function cleanupTrailerWorkDir(workDir: string | undefined): Promise<void> {
  if (!workDir) return;
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
}

// Re-exported for callers that want to read the finished bytes (e.g. to host it).
export async function readTrailer(videoPath: string): Promise<Buffer> {
  return readFile(videoPath);
}
