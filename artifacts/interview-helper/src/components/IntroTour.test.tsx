// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { unlockAudioMock, speakWithTTSMock, completions } = vi.hoisted(() => ({
  unlockAudioMock: vi.fn<() => Promise<boolean>>(),
  speakWithTTSMock: vi.fn(),
  completions: [] as Array<() => void>,
}));

vi.mock("@/lib/tts", () => ({
  unlockAudio: unlockAudioMock,
  speakWithTTS: speakWithTTSMock,
}));
vi.mock("@/lib/art", () => ({ useArtAsset: () => null }));
vi.mock("@/lib/lowGfx", () => ({ useLowGfx: () => [false, () => {}] }));

import { ARRIVAL_TOUR_NARRATION, IntroTour } from "./IntroTour";

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  unlockAudioMock.mockReset();
  speakWithTTSMock.mockReset();
  completions.length = 0;
  speakWithTTSMock.mockImplementation((_line: string, onDone?: () => void) => {
    if (onDone) completions.push(onDone);
    return { cancel: vi.fn() };
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("arrival cinematic", () => {
  it("starts automatically, moves through both neutral landscape scenes, and keeps a visual fallback", async () => {
    unlockAudioMock.mockResolvedValue(true);
    await act(async () => root.render(<IntroTour onDone={vi.fn()} />));
    await flush();

    const stage = container.querySelector('[data-testid="intro-tour-stage"]') as HTMLElement;
    expect(stage.style.aspectRatio).toBe("16 / 9");
    expect(container.querySelector('[data-testid="intro-tour-scene-office"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="intro-tour-scene-office"]')?.getAttribute("data-asset-state")).toBe("loading");
    expect(speakWithTTSMock).toHaveBeenCalledWith(
      ARRIVAL_TOUR_NARRATION.office,
      expect.any(Function),
      expect.any(Function),
      { character: "PABLO" },
    );

    await act(async () => completions.shift()?.());
    await act(async () => vi.advanceTimersByTime(350));
    expect(container.querySelector('[data-testid="intro-tour-scene-city"]')).not.toBeNull();

    await act(async () => completions.shift()?.());
    expect(container.querySelector('[data-testid="intro-tour-intake"]')).not.toBeNull();
  });

  it("uses one clear gesture when autoplay audio is blocked", async () => {
    unlockAudioMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await act(async () => root.render(<IntroTour onDone={vi.fn()} />));
    await flush();

    const begin = container.querySelector('[data-testid="intro-tour-begin"]') as HTMLButtonElement;
    expect(begin).not.toBeNull();
    await act(async () => begin.click());
    await flush();

    expect(unlockAudioMock).toHaveBeenCalledTimes(2);
    expect(speakWithTTSMock).toHaveBeenCalledTimes(1);
  });

  it("does not narrate or select a fixed spawn city", () => {
    expect(Object.values(ARRIVAL_TOUR_NARRATION).join(" ")).not.toMatch(/\b(minx|huda)\b/i);
  });
});
