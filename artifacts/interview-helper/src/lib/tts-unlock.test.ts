// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { playbackPathUnlocked } from "./tts";

describe("audio unlock state", () => {
  it("requires HTMLAudio readiness when that is the selected playback path", () => {
    expect(
      playbackPathUnlocked({
        usesHtmlAudio: true,
        htmlAudioOk: false,
        audioContextRunning: true,
      }),
    ).toBe(false);
  });

  it("accepts a primed HTMLAudio path even if WebAudio is unavailable", () => {
    expect(
      playbackPathUnlocked({
        usesHtmlAudio: true,
        htmlAudioOk: true,
        audioContextRunning: false,
      }),
    ).toBe(true);
  });

  it("uses AudioContext readiness when playback uses WebAudio", () => {
    expect(
      playbackPathUnlocked({
        usesHtmlAudio: false,
        htmlAudioOk: true,
        audioContextRunning: false,
      }),
    ).toBe(false);
    expect(
      playbackPathUnlocked({
        usesHtmlAudio: false,
        htmlAudioOk: false,
        audioContextRunning: true,
      }),
    ).toBe(true);
  });

  it("starts the HTMLAudio prime before awaiting WebAudio resume", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/tts.ts"), "utf8");
    const unlockStart = source.indexOf("export function unlockAudio()");
    const unlockEnd = source.indexOf("// Auto-unlock on the FIRST user gesture", unlockStart);
    const unlockBody = source.slice(unlockStart, unlockEnd);
    const htmlPrime = unlockBody.indexOf("const htmlAudioPrime = primeSilentHtmlAudio()");
    const contextResume = unlockBody.indexOf("await ctx.resume()");

    expect(htmlPrime).toBeGreaterThan(-1);
    expect(contextResume).toBeGreaterThan(htmlPrime);
    expect(unlockBody).toContain("playbackPathUnlocked({ usesHtmlAudio, htmlAudioOk");
  });
});