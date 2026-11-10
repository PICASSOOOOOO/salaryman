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
      overdubTrackIds: [],
      loopBars: 2,
      loopBpm: 92,
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
const offlineSources: any[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  async resume() {}
  async close() {}
  async decodeAudioData() { return { duration: 1 } as AudioBuffer; }
  createBufferSource() {
    const playbackRate = {
      value: 1,
      setValueAtTime: vi.fn((value: number) => { playbackRate.value = value; }),
      setTargetAtTime: vi.fn((value: number) => { playbackRate.value = value; }),
    };
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      playbackRate,
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

class FakeOfflineAudioContext {
  destination = {};
  constructor(_channels: number, private readonly length: number, _sampleRate: number) {}
  createBufferSource() {
    const playbackRate = {
      value: 1,
      setValueAtTime: vi.fn((value: number) => { playbackRate.value = value; }),
      setTargetAtTime: vi.fn((value: number) => { playbackRate.value = value; }),
    };
    const source = {
      buffer: null as AudioBuffer | null,
      loop: false,
      playbackRate,
      connect: vi.fn(),
      start: vi.fn(),
    };
    offlineSources.push(source);
    return source as any;
  }
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn() } as any;
  }
  async startRendering() {
    return { getChannelData: () => new Float32Array(this.length) } as any;
  }
}

class FakeMediaRecorder {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream) {}
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["overdub audio"], { type: this.mimeType }) });
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
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
  offlineSources.length = 0;
  h.music.tracks = [
    { id: 501, title: "1999 take", artist: "SALARYMAN 1999", mimeType: "audio/webm", durationSec: 5, objectPath: "/objects/test/501" },
    { id: 502, title: "Overdub one", artist: "SALARYMAN 1999", mimeType: "audio/webm", durationSec: 5, objectPath: "/objects/test/502" },
    { id: 503, title: "Overdub two", artist: "SALARYMAN 1999", mimeType: "audio/webm", durationSec: 5, objectPath: "/objects/test/503" },
    { id: 504, title: "Video", artist: "Library", mimeType: "video/mp4", durationSec: 5, objectPath: "/objects/test/504" },
    { id: 505, title: "Long sample", artist: "Library", mimeType: "audio/mpeg", durationSec: 34, objectPath: "/objects/test/505" },
    { id: 506, title: "Unknown length", artist: "Library", mimeType: "audio/mpeg", durationSec: 0, objectPath: "/objects/test/506" },
  ];
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
    if (path === "/api/storage/uploads/request-url") {
      return jsonResponse({ uploadURL: "https://storage.test/upload", objectPath: "/objects/test/overdub" });
    }
    if (path === "/api/music/tracks" && init?.method === "POST") {
      return jsonResponse({ track: { id: 502 } });
    }
    if (path === "/api/music/stream/501" || path === "/api/music/stream/502") {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response;
    }
    return jsonResponse({ error: `Unexpected request: ${path}` });
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
  });
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
  it("overdubs without replacing the original, saves both takes, and reloads them in sync", async () => {
    await mount();
    click("row-track-trk-loop");
    expect(container.querySelector('[data-testid="panel-audio-loop"]')?.textContent).toContain("READY");
    expect((container.querySelector('[data-testid="input-track-volume"]') as HTMLInputElement).value).toBe("68");
    const loopLength = container.querySelector('[data-testid="select-loop-bars"]') as HTMLSelectElement;
    expect(loopLength.value).toBe("2");
    expect(loopLength.disabled).toBe(true);
    expect(container.querySelector('[data-testid="button-record"]')?.textContent).toContain("Overdub 2 bars");

    const recorderTimerSpy = vi.spyOn(window, "setTimeout");
    click("button-record");
    await flush();
    expect(container.querySelector('[data-testid="button-record"]')?.textContent).toContain("Stop loop");
    expect(recorderTimerSpy.mock.calls.some(([, delay]) => (
      Math.abs(Number(delay) - ((60_000 / 92) * 4 * 2)) < 1
    ))).toBe(true);
    recorderTimerSpy.mockRestore();
    click("button-record");
    await flush();
    expect(container.querySelector('[data-testid="status-recording"]')?.textContent).toContain("Overdub added to loop.");

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
      overdubTrackIds: [502],
      loopBars: 2,
      loopBpm: 92,
      muted: true,
      volume: 68,
    });
    expect(JSON.parse(String(h.apiFetch.mock.calls.find(([path]) => path === "/api/music/tracks")?.[1]?.body))
      .source).toBe("upload");

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
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/502");
    expect(audioSources).toHaveLength(2);
    expect(audioSources.every(source => source.loop && source.start.mock.calls.length === 1)).toBe(true);
    expect(audioSources.every(source => source.playbackRate.value === 1)).toBe(true);
    expect(audioSources[0].start.mock.calls[0]).toEqual(audioSources[1].start.mock.calls[0]);
    expect(audioSources[0].connect).toHaveBeenCalledWith(audioGains[0]);
    expect(audioSources[1].connect).toHaveBeenCalledWith(audioGains[0]);
    expect(audioGains[0].gain.value).toBe(0);

    click("button-mute-trk-loop");
    await flush();
    expect(audioGains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.68, expect.any(Number), 0.02);

    const bpmInput = container.querySelector('[data-testid="input-bpm"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(bpmInput, "110");
      bpmInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    expect(audioSources[0].playbackRate.setTargetAtTime).toHaveBeenLastCalledWith(110 / 92, expect.any(Number), 0.02);
    expect(audioSources[1].playbackRate.setTargetAtTime).toHaveBeenLastCalledWith(110 / 92, expect.any(Number), 0.02);
    click("button-toggle-playback");
  });

  it("tempo-matches every saved loop layer in WAV renders", async () => {
    const fasterProject = {
      ...savedProject,
      bpm: 110,
      tracks: savedProject.tracks.map((track, index) => index === 1
        ? { ...track, muted: false, overdubTrackIds: [502] }
        : track),
    };
    currentProject = JSON.stringify(fasterProject);

    await mount();
    click("button-save-mix-library");
    await flush();

    expect(offlineSources).toHaveLength(2);
    expect(offlineSources.every(source => Math.abs(source.playbackRate.value - (110 / 92)) < 0.0001)).toBe(true);
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/501");
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/502");
  });

  it("removes only the chosen overdub and keeps its audio-library take", async () => {
    const layeredProject = {
      ...savedProject,
      tracks: savedProject.tracks.map((track, index) => index === 1
        ? { ...track, overdubTrackIds: [502, 503] }
        : track),
    };
    currentProject = JSON.stringify(layeredProject);

    await mount();
    click("row-track-trk-loop");

    expect(container.querySelector('[data-testid="row-loop-take-base-trk-loop"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-501"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-502"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-503"]')).not.toBeNull();

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click("button-remove-overdub-trk-loop-502");
    expect(JSON.parse(currentProject).tracks[1].overdubTrackIds).toEqual([502, 503]);

    click("button-remove-overdub-trk-loop-502");
    expect(window.confirm).toHaveBeenCalledWith(
      "Remove this overdub from the loop? The take will remain in your music library.",
    );
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-502"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-503"]')).not.toBeNull();
    expect(h.music.tracks.some(track => track.id === 502)).toBe(true);

    await act(async () => {
      (container.querySelector('[data-testid="button-save-project"]') as HTMLButtonElement).click();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved.tracks[1].audioTrackId).toBe(501);
    expect(saved.tracks[1].overdubTrackIds).toEqual([503]);
    expect(h.apiFetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    click("row-track-trk-loop");
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-502"]')).toBeNull();
    expect(container.querySelector('[data-testid="button-remove-overdub-trk-loop-503"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="row-loop-take-base-trk-loop"]')).not.toBeNull();
  });

  it("reattaches a matching library take without uploading another copy", async () => {
    await mount();
    click("row-track-trk-loop");

    const select = container.querySelector('[data-testid="select-library-overdub"]') as HTMLSelectElement;
    const optionValues = Array.from(select.options, option => option.value);
    expect(optionValues).toContain("502");
    expect(optionValues).toContain("503");
    expect(optionValues).not.toContain("501");
    expect(optionValues).not.toContain("504");
    expect(optionValues).not.toContain("505");
    expect(optionValues).not.toContain("506");

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, "502");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect((container.querySelector('[data-testid="button-add-library-overdub"]') as HTMLButtonElement).disabled).toBe(false);

    click("button-add-library-overdub");
    await flush();
    expect(container.querySelector('[data-testid="row-loop-overdub-trk-loop-502"]')?.textContent).toContain("Overdub one");
    expect((container.querySelector('[data-testid="select-library-overdub"]') as HTMLSelectElement).value).toBe("");
    expect(container.querySelector('[data-testid="option-library-take-502"]')).toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="button-save-project"]') as HTMLButtonElement).click();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved.tracks[1]).toMatchObject({
      audioTrackId: 501,
      overdubTrackIds: [502],
      loopBars: 2,
      loopBpm: 92,
    });
    expect(h.apiFetch.mock.calls.some(([path, init]) => (
      path === "/api/storage/uploads/request-url"
      || (path === "/api/music/tracks" && init?.method === "POST")
    ))).toBe(false);

    act(() => root.unmount());
    root = createRoot(container);
    await mount();
    click("row-track-trk-loop");
    expect(container.querySelector('[data-testid="row-loop-overdub-trk-loop-502"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="option-library-take-502"]')).toBeNull();

    click("button-toggle-playback");
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/502");
    click("button-toggle-playback");
  });
});
