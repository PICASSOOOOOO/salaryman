// @vitest-environment node
//
// Guards against a second engine-volume writer creeping back into WorldPlay.
//
// Task #537 fixed a bug where the in-game AUDIO HUD sliders wrote engine volume
// directly (calling `setMusicVolume`/`setSfxVolume` and persisting their own
// `sm_output_vol`/`sm_sfx_vol` localStorage keys). That made the central AUDIO
// HUB / Settings sliders do nothing once in the city, and broke voice ducking,
// because two writers fought over the engine gain nodes.
//
// The fix made `lib/audio-settings.ts` `applyToEngine()` the SOLE writer of
// engine volume. WorldPlay must drive audio ONLY through the central store
// (via the use-audio-settings hook / audio-settings API), never by poking the
// engine directly. This source-scanning test fails if a future edit re-adds a
// direct `setMusicVolume`/`setSfxVolume` call or a `sm_output_vol`/`sm_sfx_vol`
// key into WorldPlay, silently re-breaking in-game volume.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WORLDPLAY = join(dirname(fileURLToPath(import.meta.url)), "WorldPlay.tsx");

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

describe("WorldPlay does not write engine volume directly", () => {
  const raw = readFileSync(WORLDPLAY, "utf8");
  const code = stripCommentsAndStrings(raw);

  // Sanity: confirm we actually loaded WorldPlay (guards against a vacuous pass
  // if the file moves or the read silently returns empty).
  it("loaded the WorldPlay source", () => {
    expect(raw.length).toBeGreaterThan(10000);
  });

  it("does not import or call setMusicVolume / setSfxVolume", () => {
    for (const fn of ["setMusicVolume", "setSfxVolume"]) {
      const re = new RegExp(`\\b${fn}\\b`);
      expect(
        re.test(code),
        `WorldPlay.tsx references ${fn}. Engine volume must be written ONLY by ` +
          `lib/audio-settings.ts applyToEngine(); drive in-game volume through the ` +
          `central audio store (use-audio-settings hook), never the engine directly.`,
      ).toBe(false);
    }
  });

  it("does not reference the private sm_output_vol / sm_sfx_vol localStorage keys", () => {
    for (const key of ["sm_output_vol", "sm_sfx_vol"]) {
      const re = new RegExp(key);
      expect(
        re.test(raw),
        `WorldPlay.tsx references the "${key}" localStorage key. The in-game HUD ` +
          `must not persist its own engine-volume keys; volume state lives in the ` +
          `central audio-settings store.`,
      ).toBe(false);
    }
  });
});
