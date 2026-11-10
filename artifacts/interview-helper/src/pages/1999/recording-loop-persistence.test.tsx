// @vitest-environment jsdom
//
// A recorded lane stores its audio in the SALARYMAN music library and keeps the
// library ID in the 1999 project. Guard the full client round-trip:
// load -> save project JSON -> reload -> fetch and loop the referenced audio.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  music: {
    tracks: [] as any[],
    refresh: vi.fn(),
    previewTrack: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));
vi.mock("@/contexts/MusicPlayerContext", () => ({ useMusicPlayer: () => h.music }));
vi.mock("@/components/Fm1EmulatorPanel", () => ({ default: () => null }));
vi.mock("@/components/MinimoogEmulatorPanel", () => ({ default: () => null }));

import Salaryman1999 from "./index";

const savedProject = {
  schemaVersion: 1,
  name: "Loop persistence check",
  bpm: 92,
  emulatorState: { firmwareIds: {}, patchSaves: {} },
  tracks: [
    {
      id: "trk-main",
      name: "Pulse",
      kind: "instrument",
      machineId: "op1",
      steps: Array(16).fill(0),
      audioTrackId: null,
      muted: false,
      volume: 72,
      soundState: { tone: 72, decayMs: 240 },
    },
    {
      id: "trk-loop",
      name: "Mic loop",
      kind: "recording",
      machineId: "op1",
      steps: Array(16).fill(0),
      audioTrackId: 501,
      muted: true,
      volume: 68,
      soundState: { tone: 72, decayMs: 240 },
    },
  ],
};

let currentProject = JSON.stringify(savedProject);
let currentUpdatedAt = "2026-11-10T00:00:00.000Z";
let root: Root;
let container: HTMLDivElement;
const audioSources: any[] = [];
const audioGains: any[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  async resume() {}
  async close() {}
  async decodeAudioData() { return { duration: 1 } as AudioBuffer; }
  createBufferSource() {
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    audioSources.push(source);
    return source as any;
  }
  createGain() {
    const gain = {
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
    };
    audioGains.push(gain);
    return gain as any;
  }
}

function projectEntry() {
  return {
    id: 77,
    title: "Loop persistence check",
    content: currentProject,
    entryType: "1999_project",
    tags: ["1999", "audio"],
    folder: "/1999",
    updatedAt: currentUpdatedAt,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function mount() {
  await act(async () => { root.render(<Salaryman1999 />); });
  await flush();
}

function click(testId: string) {
  const target = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  if (!target) throw new Error(`Missing element: ${testId}`);
  act(() => target.click());
}

beforeEach(() => {
  currentProject = JSON.stringify(savedProject);
  currentUpdatedAt = "2026-11-10T00:00:00.000Z";
  audioSources.length = 0;
  audioGains.length = 0;
  h.music.tracks = [{ id: 501, title: "1999 take" }];
  h.music.refresh.mockReset();
  h.music.previewTrack.mockReset();
  h.apiFetch.mockReset();
  h.apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/vault/entries?folder=%2F1999") {
      return jsonResponse({ entries: [projectEntry()] });
    }
    if (path === "/api/vault/entries/77" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      currentProject = body.content;
      currentUpdatedAt = "2026-11-10T00:00:01.000Z";
      return jsonResponse({ entry: projectEntry() });
    }
    if (path === "/api/music/stream/501") {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response;
    }
    return jsonResponse({ error: `Unexpected request: ${path}` });
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("1999 recorded-loop persistence", () => {
  it("saves the library reference and mix state, reloads it, and loops the same audio", async () => {
    await mount();
    click("row-track-trk-loop");
    expect(container.querySelector('[data-testid="panel-audio-loop"]')?.textContent).toContain("READY");
    expect((container.querySelector('[data-testid="input-track-volume"]') as HTMLInputElement).value).toBe("68");

    await act(async () => {
      (container.querySelector('[data-testid="button-save-project"]') as HTMLButtonElement).click();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });

    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved.tracks[1]).toMatchObject({
      id: "trk-loop",
      kind: "recording",
      audioTrackId: 501,
      muted: true,
      volume: 68,
    });

    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    click("row-track-trk-loop");

    expect(container.querySelector('[data-testid="clip-loop-trk-loop"]')?.textContent).toContain("AUDIO LOOP");
    expect(container.querySelector('[data-testid="panel-audio-loop"]')?.textContent).toContain("READY");
    expect((container.querySelector('[data-testid="input-track-volume"]') as HTMLInputElement).value).toBe("68");
    expect(container.querySelector('[data-testid="button-mute-trk-loop"]')?.getAttribute("aria-pressed")).toBe("true");

    click("button-toggle-playback");
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/501");
    expect(audioSources).toHaveLength(1);
    expect(audioSources[0].loop).toBe(true);
    expect(audioSources[0].start).toHaveBeenCalled();
    expect(audioGains[0].gain.value).toBe(0);

    click("button-mute-trk-loop");
    await flush();
    expect(audioGains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.68, expect.any(Number), 0.02);
    click("button-toggle-playback");
  });
});
