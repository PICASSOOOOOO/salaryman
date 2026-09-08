// @vitest-environment node
//
// Guards the single-engine-volume-writer invariant ACROSS THE WHOLE APP.
//
// Engine volume (the soundEngine gain nodes) must be written in exactly ONE
// place: `lib/audio-settings.ts` `applyToEngine()`. That module is the central
// audio store every screen drives through (game settings page, the in-city AUDIO
// HUD, the office, cutscenes, story scenes, Hummingbird, the office radio …).
//
// Task #545 added a per-file guard for WorldPlay.tsx (the city/world screen)
// after a bug where it wrote engine volume directly — the central sliders then
// did nothing in the city and voice ducking broke, because two writers fought
// over the gain nodes. But WorldPlay was only one screen: any OTHER screen could
// re-introduce the exact same bug by calling `setMusicVolume` / `setSfxVolume`
// from soundEngine.ts directly instead of going through the central store.
//
// This source-scanning test generalizes that guard. It walks every source file
// under `src/` and fails if any non-test file other than the documented
// allow-list references `setMusicVolume` / `setSfxVolume`. soundEngine.ts is
// allowed because it DEFINES them; audio-settings.ts is allowed because it is
// the sole intended writer. There are intentionally NO other exceptions.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files permitted to reference the engine-volume setters, with the reason each
// is allowed. Paths are relative to `src/`, using POSIX separators.
const ALLOW_LIST: Record<string, string> = {
  // DEFINES setMusicVolume / setSfxVolume.
  "soundEngine.ts": "defines the engine-volume setters",
  // The SOLE intended writer of engine volume (applyToEngine()).
  "lib/audio-settings.ts": "central audio store — the only intended engine-volume writer",
};

const BANNED = ["setMusicVolume", "setSfxVolume"];

function stripCommentsAndStrings(src: string): string {
  // Remove block comments, line comments, then string/template literals so we
  // only inspect actual code tokens (a banned identifier mentioned in a comment
  // or string must not trip the guard).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[cm]?tsx?$/.test(path);
}

function isSourceFile(path: string): boolean {
  return /\.[cm]?tsx?$/.test(path);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".vite") continue;
      walk(full, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(rel: string): string {
  return rel.split(sep).join("/");
}

describe("only the central audio store writes engine volume", () => {
  const files = walk(SRC_DIR)
    .filter(isSourceFile)
    .filter((f) => !isTestFile(f));

  // Sanity: confirm we actually walked a real source tree (guards against a
  // vacuous pass if the directory layout changes and the walk returns nothing).
  it("scanned a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // Sanity: confirm every allow-listed file still exists and is actually present
  // in the scan, so a rename can't silently turn the allow-list into dead config.
  it("every allow-listed file exists in the scan", () => {
    const scanned = new Set(files.map((f) => toPosix(relative(SRC_DIR, f))));
    for (const rel of Object.keys(ALLOW_LIST)) {
      expect(scanned.has(rel), `allow-listed file "${rel}" was not found under src/`).toBe(true);
    }
  });

  // Generous timeout: this scans the full source tree, including very large
  // files (the city/world screen is tens of thousands of lines).
  it("no non-test file outside the allow-list references setMusicVolume / setSfxVolume", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = toPosix(relative(SRC_DIR, file));
      if (rel in ALLOW_LIST) continue;
      const raw = readFileSync(file, "utf8");
      // Cheap pre-filter: only the rare file that mentions a banned token at all
      // pays the cost of stripping comments/strings (which is slow on huge files).
      if (!BANNED.some((fn) => raw.includes(fn))) continue;
      const code = stripCommentsAndStrings(raw);
      const hit = BANNED.filter((fn) => new RegExp(`\\b${fn}\\b`).test(code));
      if (hit.length) offenders.push(`${rel} → ${hit.join(", ")}`);
    }
    expect(
      offenders,
      "These files write engine volume directly. Engine volume must be set ONLY " +
        "by lib/audio-settings.ts applyToEngine(); drive volume through the central " +
        "audio store (use-audio-settings hook / setAudioSettings), never by calling " +
        "soundEngine's setMusicVolume / setSfxVolume:\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  }, 30000);
});
