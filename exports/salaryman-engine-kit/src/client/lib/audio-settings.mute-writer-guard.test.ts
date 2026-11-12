// @vitest-environment node
//
// Guards the single-engine-MUTE-writer invariant ACROSS THE WHOLE APP.
//
// Engine mute (the soundEngine master mute) must be written in exactly ONE
// place: `lib/audio-settings.ts` (`applyToEngine()` / `setEngineMuted()`). That
// module is the central audio store every screen drives through (game settings
// page, the in-city AUDIO HUD, the office, cutscenes, story scenes, Hummingbird,
// the office radio …).
//
// Task #548 added a per-app guard for engine *volume* (setMusicVolume /
// setSfxVolume) after a bug where a screen wrote engine volume directly and the
// central sliders then did nothing because two writers fought over the gain
// nodes. The exact same single-writer rule applies to the master *mute*:
// soundEngine.ts exports `setMuted`, and only the central audio store is meant
// to call it. Any OTHER screen calling `setMuted` directly would re-introduce
// the same class of bug — fighting the central mute state.
//
// This source-scanning test mirrors the volume guard for `setMuted`. It walks
// every source file under `src/` and fails if any non-test file other than the
// documented allow-list references `setMuted`. soundEngine.ts is allowed because
// it DEFINES it; audio-settings.ts is allowed because it is the sole intended
// writer. There are intentionally NO other exceptions.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files permitted to reference the engine mute setter, with the reason each is
// allowed. Paths are relative to `src/`, using POSIX separators.
const ALLOW_LIST: Record<string, string> = {
  // DEFINES setMuted.
  "soundEngine.ts": "defines the engine mute setter",
  // The SOLE intended writer of engine mute (applyToEngine() / setEngineMuted()).
  "lib/audio-settings.ts": "central audio store — the only intended engine-mute writer",
};

const BANNED = ["setMuted"];

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

describe("only the central audio store writes engine mute", () => {
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
  it("no non-test file outside the allow-list references setMuted", () => {
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
      "These files write engine mute directly. Engine mute must be set ONLY " +
        "by lib/audio-settings.ts (applyToEngine() / setEngineMuted()); drive mute " +
        "through the central audio store (use-audio-settings hook / setAudioSettings), " +
        "never by calling soundEngine's setMuted:\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  }, 30000);
});
