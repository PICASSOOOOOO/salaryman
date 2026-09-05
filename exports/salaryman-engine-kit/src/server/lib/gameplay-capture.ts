// ---------------------------------------------------------------------------
// Gameplay capture engine
// ---------------------------------------------------------------------------
// Drives a headless Chromium ("camera bot") into the live SALARYMAN city and
// screen-records ~40s of REAL gameplay (no promo, no narration). The bot:
//   1. is a dedicated synthetic user with a known save in slot 0,
//   2. lands directly on /world/play as a guest (Clerk sessions are never
//      minted by this application),
//   3. bypasses the new-user funnel gate by
//      pre-seeding the tutorial-done localStorage flags,
//   4. roams the avatar with scripted WASD input while Playwright records.
//
// Output is a raw .webm (video only — Playwright recordVideo captures no audio).
// Finishing/music is handled downstream in weekly-tiktok.ts.

import { chromium, type Browser, type Video } from "playwright";
import path from "node:path";
import os from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  db,
  usersTable,
  salarymanSavesTable,
  worldBusinessesTable,
  playerCityVisasTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

// Stable identity for the capture bot. Kept off the real OAuth path entirely.
const CAPTURE_BOT_ID = "salaryman-capture-bot";
const CAPTURE_BOT_EMAIL = "capture-bot@salaryman.internal";
const CAPTURE_BOT_NAME = "FIELD UNIT";

// The web app (interview-helper) is served on the shared dev proxy at :80 and
// path-routed at "/". Overridable for prod / alternate hosting.
const WEB_BASE_URL = (process.env.CAPTURE_WEB_URL ?? "http://localhost:80").replace(/\/$/, "");

// Replit ships a working Chromium; Playwright must launch THAT binary (there is
// no system chromium on PATH). Recording also needs Playwright's bundled ffmpeg
// (installed via `npx playwright install ffmpeg`).
const CHROMIUM_EXECUTABLE = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

// Record in portrait so the footage is already tall; ffmpeg upscales to 1080p.
const CAPTURE_W = 720;
const CAPTURE_H = 1280;

// Landscape variant for the full-screen landing hero trailer (16:9).
const CAPTURE_W_LANDSCAPE = 1280;
const CAPTURE_H_LANDSCAPE = 720;

/** Which surface the capture bot records. */
export type CaptureScene = "city" | "office" | "terminal";

/** Aspect of the recorded footage. Portrait (default) feeds the TikTok run;
 *  landscape feeds the landing-page hero trailer. */
export type CaptureOrientation = "portrait" | "landscape";

export interface CaptureOptions {
  /** Total roam/record time in seconds (default 40). */
  durationSec?: number;
  /** Called with short status strings for progress surfacing. */
  onStage?: (stage: string) => void;
  /** Which surface to record. "city" lands on /world/play (the weekly default). */
  scene?: CaptureScene;
  /**
   * Recording aspect. "portrait" (default) is the 720x1280 TikTok cut;
   * "landscape" is the 1280x720 16:9 cut used by the landing-page hero trailer.
   */
  orientation?: CaptureOrientation;
  /**
   * Load the surface in chrome-free embed mode (?embed=1). This suppresses the
   * app shell (alpha banner, audio control, toaster) AND the office page chrome
   * (header, economy drawer, help/tutorial overlays) so the recording shows
   * clean gameplay only. Used by the landing-page hero trailer. The weekly
   * TikTok run leaves this off so its HUD/chrome are unchanged.
   */
  chromeFree?: boolean;
}

export interface CaptureResult {
  /** Absolute path to the raw .webm produced by Playwright. */
  rawPath: string;
  /** Temp working directory (caller may clean it up after finishing). */
  workDir: string;
  width: number;
  height: number;
}

// A minimal-but-valid save blob that renders a character standing in the city.
// Mirrors the new-game shape built by WorldMenu (corporate spawn).
function captureSaveBlob(): Record<string, unknown> {
  return {
    name: CAPTURE_BOT_NAME,
    class: "corporate",
    company: "FIELD OPS",
    sx: 5555,
    sy: 5620,
    px: 5555,
    py: 5620,
    salary: 0,
    level: 1,
    exp: 0,
    hp: 100,
    hunger: 100,
    thirst: 100,
    energy: 100,
    hasBusiness: false,
    bizType: "unemployed",
    activeCostume: "suit",
    ownedClothes: ["default", "suit"],
    appearance: {
      gender: "nb",
      skinTone: "#d4906a",
      hairColor: "#1a1a1a",
      hairStyle: "short",
      faceStyle: "plain",
      outfitStyle: "suit",
      outfitColor: "#2e2e2e",
    },
    // Marks onboarding complete. Home (kept-alive, always mounted) reads this
    // from sm_save and otherwise auto-redirects every route to /immigration.
    pabloOnboardingDone: true,
    story: { active: false, chapter: 0, missionIndex: 0 },
    businesses: [],
    inventory: [],
    ownedBuildings: [],
    cityId: "minx_city",
  };
}

/**
 * Ensure the capture-bot user + a slot-0 save exist. Idempotent: keeps any
 * existing save so the bot isn't reset on every run.
 */
async function ensureCaptureBot(): Promise<void> {
  await db
    .insert(usersTable)
    .values({
      id: CAPTURE_BOT_ID,
      email: CAPTURE_BOT_EMAIL,
      firstName: CAPTURE_BOT_NAME,
    })
    .onConflictDoNothing({ target: usersTable.id });

  const existing = await db
    .select({ id: salarymanSavesTable.id })
    .from(salarymanSavesTable)
    .where(
      and(
        eq(salarymanSavesTable.userId, CAPTURE_BOT_ID),
        eq(salarymanSavesTable.slotIndex, 0),
      ),
    );

  if (existing.length === 0) {
    await db.insert(salarymanSavesTable).values({
      userId: CAPTURE_BOT_ID,
      slotIndex: 0,
      charName: CAPTURE_BOT_NAME,
      charClass: "corporate",
      level: 1,
      salary: 0,
      lastZone: "MINX CITY",
      playtime: 0,
      data: captureSaveBlob(),
    });
  }

  // Mark the bot as onboarded server-side. WorldPlay/Home fetch the world
  // registry (worldBusinessesTable); a 404 there drops the user back into the
  // /immigration onboarding funnel even when the localStorage tutorial flag is
  // set — which is exactly what trapped the capture bot. A single "unemployed"
  // registry row (no org side-effects) clears the funnel. Idempotent.
  const reg = await db
    .select({ id: worldBusinessesTable.id })
    .from(worldBusinessesTable)
    .where(eq(worldBusinessesTable.userId, CAPTURE_BOT_ID))
    .limit(1);
  if (reg.length === 0) {
    await db.insert(worldBusinessesTable).values({
      playerName: CAPTURE_BOT_NAME.slice(0, 32).toUpperCase(),
      userId: CAPTURE_BOT_ID,
      businessType: "unemployed",
      declaredMonthlyIncome: 0,
      incomeVerified: false,
      pendingOwnerVerification: false,
      meta: { faction: null, jobClass: null, pace: null },
      isPaid: false,
    });
  }

  // Grant the bot a visa for every city it might be asked to capture.
  // The world-server WS gate checks playerCityVisasTable — without a row the
  // bot is immediately disconnected and /world/play never exits "LOADING...".
  for (const cityId of ["minx_city", "huda_city"]) {
    await db
      .insert(playerCityVisasTable)
      .values({ userId: CAPTURE_BOT_ID, cityId, status: "visa" })
      .onConflictDoNothing();
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Launch the bot, land in the world, roam while recording, and return the raw
 * video path. Throws VideoCapError if the environment can't support capture.
 */
export async function captureGameplay(opts: CaptureOptions = {}): Promise<CaptureResult> {
  if (!CHROMIUM_EXECUTABLE || !existsSync(CHROMIUM_EXECUTABLE)) {
    throw new GameplayCaptureError(
      "No Chromium available for capture (REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE unset/missing).",
    );
  }

  const scene: CaptureScene = opts.scene ?? "city";
  const orientation: CaptureOrientation = opts.orientation ?? "portrait";
  const capW = orientation === "landscape" ? CAPTURE_W_LANDSCAPE : CAPTURE_W;
  const capH = orientation === "landscape" ? CAPTURE_H_LANDSCAPE : CAPTURE_H;
  const durationSec = Math.max(15, Math.min(90, opts.durationSec ?? 40));
  const stage = opts.onStage ?? (() => {});

  const workDir = path.join(os.tmpdir(), `salaryman-capture-${Date.now().toString(36)}`);
  await mkdir(workDir, { recursive: true });

  stage("Preparing capture bot");
  await ensureCaptureBot();

  let browser: Browser | null = null;
  try {
    stage("Launching browser");
    browser = await chromium.launch({
      executablePath: CHROMIUM_EXECUTABLE,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: { width: capW, height: capH },
      deviceScaleFactor: 1,
      recordVideo: { dir: workDir, size: { width: capW, height: capH } },
    });

    // Seed the client state WorldPlay actually reads: it loads the character
    // from localStorage `sm_char` (set by WorldMenu), NOT the server — without
    // it the page redirects to the menu and never mounts the world canvas. We
    // also pre-clear the new-user funnel gate (tutorial/passcode flags).
    const saveBlob = captureSaveBlob();
    const clientChar = {
      name: (saveBlob.name as string) ?? CAPTURE_BOT_NAME,
      class: (saveBlob.class as string) ?? "corporate",
      company: (saveBlob.company as string) ?? "FIELD OPS",
      sx: 5555,
      sy: 5620,
      salary: 0,
      governmentBaseSalary: 100,
      businessProfit: 0,
      realSalaryAmount: 0,
      hasBusiness: false,
      bizType: "unemployed",
      workstation: null,
      workstationLabel: null,
      workstationSlot: null,
      bizRegisteredAt: null,
      createdAt: Date.now(),
      activeCostume: "suit",
      ownedClothes: ["default", "suit"],
      _savedState: saveBlob,
    };
    // Injected via a plain STRING (not a function) on purpose: tsx/esbuild
    // rewrites function-form init scripts with a `__name` keep-names helper that
    // is undefined in the browser, throwing before the body runs. A string is
    // shipped verbatim.
    //
    // Why each key matters to clear the new-user funnel and land on /world/play:
    //   - salaryman_tutorial_done: AppShell's new-user gate (App.tsx).
    //   - sm_char / sm_save / sm_slot: WorldPlay loads the character + save from
    //     localStorage, not the server.
    //   - sm_intro_redirected: Home is kept-alive (always mounted) and its intro
    //     effect auto-redirects EVERY route to /immigration once per session
    //     unless this sessionStorage flag is already set.
    const initContent = `
      try {
        localStorage.setItem("salaryman_tutorial_done", "1");
        localStorage.setItem("salaryman_passcode_unlocked", "1");
        localStorage.setItem("sm_char", ${JSON.stringify(JSON.stringify(clientChar))});
        localStorage.setItem("sm_save", ${JSON.stringify(JSON.stringify(saveBlob))});
        localStorage.setItem("sm_slot", "0");
        sessionStorage.setItem("sm_intro_redirected", "1");
        // /world/play opens on a full-screen CLASSIFIED BRIEFING lore cinematic
        // (YEAR 2047 → "FIND A TERMINAL"…) that sits above the canvas and
        // swallows movement until skipped. Pre-set the same flag its SKIP button
        // writes so the bot drops straight into real city gameplay.
        localStorage.setItem("sm_intro_seen", "1");
      } catch (e) { /* ignore */ }
    `;
    await context.addInitScript({ content: initContent });

    const page = await context.newPage();
    const video: Video | null = page.video();

    if (process.env.CAPTURE_DEBUG === "1") {
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) console.error(`[capture] nav → ${f.url()}`);
      });
      page.on("console", (m) => {
        const t = m.text();
        const cap = t.startsWith("[nav-trace]") ? 2500 : 200;
        console.error(`[capture] page.${m.type()}: ${t.slice(0, cap)}`);
      });
    }

    // City → the open world; office → the player's pixel office floor. Both
    // mount a <canvas> once ready and accept WASD/E, so driveAvatar drives both.
    const basePath =
      scene === "office" ? "/office" :
      scene === "terminal" ? "/pablo" :
      "/world/play";
    const targetUrl = `${WEB_BASE_URL}${basePath}${opts.chromeFree ? "?embed=1" : ""}`;
    const stageLabel =
      scene === "office" ? "Loading the office" :
      scene === "terminal" ? "Loading the terminal" :
      "Loading the city";
    stage(stageLabel);
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    // World is ready once a canvas is mounted and the boot animation settles.
    try {
      await page.waitForSelector("canvas", { timeout: 45_000 });
    } catch (err) {
      // On failure the bot is usually stuck somewhere in the new-user funnel.
      // Snapshot the URL + a screenshot so the cause is diagnosable without a
      // live browser. Best-effort; never mask the original timeout.
      try {
        const shot = `${workDir}/diag.png`;
        await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
        // eslint-disable-next-line no-console
        console.error(`[capture] canvas wait failed. url=${page.url()} screenshot=${shot}`);
      } catch {
        /* ignore diag errors */
      }
      throw err;
    }

    // /world/play shows a "LOADING..." overlay for ~15–20 s while the world
    // server hydrates. The canvas is mounted immediately (canvas selector fires
    // during load), but the city isn't visible until the overlay clears.
    // Wait for it so the recording starts on real gameplay, not a black screen.
    if (scene === "city") {
      try {
        await page.waitForFunction(
          () =>
            !(
              (globalThis as unknown as {
                document: { body: { innerText: string } };
              }).document.body.innerText.includes("LOADING...")
            ),
          { timeout: 50_000 },
        );
      } catch {
        // If the loading never clears we still try to record; the footage may
        // be dark but we don't hard-fail.
      }
      // Short additional settle after the loading clears for the city to paint.
      await sleep(2_000);
    } else {
      // Office and terminal surfaces are ready once the canvas is mounted;
      // a brief settle is enough.
      await sleep(3_000);
    }

    stage("Recording gameplay");
    await driveAvatar(page, durationSec);

    stage("Finalizing recording");
    // Close the context to flush the .webm, THEN resolve its path.
    await context.close();
    const rawPath = video ? await video.path() : "";
    if (!rawPath || !existsSync(rawPath)) {
      throw new GameplayCaptureError("Capture produced no video file.");
    }

    return { rawPath, workDir, width: capW, height: capH };
  } catch (err) {
    // On success the caller owns workDir (it holds the video) and cleans it on
    // job release. On failure nobody else knows about it, so clean it here.
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Scripted, gentle roam: hold a direction for a beat, release, occasionally
 * press E to interact. Deliberately avoids P/C/V/Esc/Space so footage stays
 * clean (no UI overlays, no combat).
 */
async function driveAvatar(
  page: import("playwright").Page,
  durationSec: number,
): Promise<void> {
  const dirs = ["w", "d", "s", "a", "d", "w", "a", "s"] as const;
  const deadline = Date.now() + durationSec * 1000;
  let i = 0;

  // Ensure window keydown listeners receive focus.
  await page.keyboard.press("Shift").catch(() => {});

  while (Date.now() < deadline) {
    const key = dirs[i % dirs.length];
    i++;

    const holdMs = 1200 + Math.floor(Math.random() * 1400);
    await page.keyboard.down(key);
    await sleep(Math.min(holdMs, Math.max(0, deadline - Date.now())));
    await page.keyboard.up(key);

    // Periodically attempt an interaction (enter building / use terminal).
    if (i % 4 === 0 && Date.now() < deadline) {
      await page.keyboard.press("e").catch(() => {});
      await sleep(900);
    } else {
      await sleep(250);
    }
  }

  // Release any keys still held.
  for (const k of dirs) await page.keyboard.up(k).catch(() => {});
}

export class GameplayCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameplayCaptureError";
  }
}
