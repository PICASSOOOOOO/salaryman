/**
 * Bake the landing-page hero trailer: real office → city gameplay footage under
 * a Pablo voice-over + faint music bed, written (with caption timings) into the
 * web app's served public assets so the landing loads a committed, streamable
 * file.
 *
 * Run from the api-server package root (web + api workflows must be running so
 * the capture bot can reach the live app at http://localhost:80).
 *
 * The full pipeline is long (two browser captures + voice-over + ffmpeg), and
 * some sandboxes reap long-lived background processes, so it can be run as
 * separate sub-120s FOREGROUND steps:
 *
 *   pnpm tsx src/scripts/bake-landing-trailer.ts capture office
 *   pnpm tsx src/scripts/bake-landing-trailer.ts capture city
 *   pnpm tsx src/scripts/bake-landing-trailer.ts assemble
 *
 * …or, where background processes survive, in one shot:
 *
 *   pnpm tsx src/scripts/bake-landing-trailer.ts all
 *
 * Outputs:
 *   ../interview-helper/public/brand/landing/trailer.mp4
 *   ../interview-helper/public/brand/landing/trailer-captions.json
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  bakeLandingTrailer,
  captureScene,
  cleanupTrailerWorkDir,
} from "../lib/landing-trailer";
import type { CaptureScene } from "../lib/gameplay-capture";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/scripts → api-server → artifacts → interview-helper/public/brand/landing
const OUT_DIR = path.resolve(
  __dirname,
  "../../../interview-helper/public/brand/landing",
);
// Stable scratch dir for staged captures (survives across foreground steps).
const STAGE_DIR = path.join(os.tmpdir(), "salaryman-landing-stage");
const STAGE_PATHS: Record<string, string> = {
  office: path.join(STAGE_DIR, "office.webm"),
  city: path.join(STAGE_DIR, "city.webm"),
  terminal: path.join(STAGE_DIR, "terminal.webm"),
};

const SCENE_SECONDS: Record<string, number> = { office: 14, city: 12, terminal: 10 };

async function doCapture(scene: CaptureScene) {
  await mkdir(STAGE_DIR, { recursive: true });
  console.log(`Capturing ${scene} footage (landscape)…`);
  const raw = await captureScene(scene, SCENE_SECONDS[scene] ?? 18, (s) =>
    console.log(`  · ${s}`),
  );
  if (!raw) {
    console.error(`Capture failed for ${scene}.`);
    process.exit(1);
  }
  const dest = STAGE_PATHS[scene];
  await copyFile(raw, dest);
  console.log(`Saved → ${dest}`);
}

async function doAssemble() {
  await mkdir(OUT_DIR, { recursive: true });
  const footagePaths = Object.values(STAGE_PATHS).filter((p) => existsSync(p));
  if (footagePaths.length === 0) {
    console.error(
      "No staged footage found. Run the `capture office` / `capture city` steps first.",
    );
    process.exit(1);
  }
  console.log(`Assembling trailer from ${footagePaths.length} clip(s)…`);
  const result = await bakeLandingTrailer({
    footagePaths,
    onStage: (s) => console.log(`  · ${s}`),
  });
  await writeOutputs(result);
  await cleanupTrailerWorkDir(result.workDir);
}

async function doAll() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log("Baking landing trailer (capture → Pablo VO → assemble)…");
  const result = await bakeLandingTrailer({ onStage: (s) => console.log(`  · ${s}`) });
  await writeOutputs(result);
  await cleanupTrailerWorkDir(result.workDir);
}

async function writeOutputs(result: {
  videoPath: string;
  captions: { text: string; start: number; end: number }[];
  durationSec: number;
}) {
  const mp4Out = path.join(OUT_DIR, "trailer.mp4");
  const capOut = path.join(OUT_DIR, "trailer-captions.json");
  await copyFile(result.videoPath, mp4Out);
  await writeFile(
    capOut,
    JSON.stringify(
      { durationSec: result.durationSec, captions: result.captions },
      null,
      2,
    ),
  );
  console.log(`\nDone.`);
  console.log(`  video    → ${mp4Out}`);
  console.log(`  captions → ${capOut}`);
  console.log(`  duration → ${result.durationSec}s, ${result.captions.length} lines`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "capture": {
      if (arg !== "office" && arg !== "city" && arg !== "terminal") {
        console.error("Usage: capture <office|city|terminal>");
        process.exit(1);
      }
      await doCapture(arg);
      break;
    }
    case "assemble":
      await doAssemble();
      break;
    case "all":
    case undefined:
      await doAll();
      break;
    default:
      console.error(`Unknown command "${cmd}". Use: capture <scene> | assemble | all`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
