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
  auth: { isAuthenticated: true, isLoading: false },
  music: {
    tracks: [] as any[],
    refresh: vi.fn(),
    previewTrack: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: h.apiFetch }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => h.auth }));
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
      onended: null as (() => void) | null,
    };
    audioSources.push(source);
    return source as any;
  }
  createGain() {
    const gain = {
      gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    audioGains.push(gain);
    return gain as any;
  }
  createBiquadFilter() {
    return {
      type: "lowpass",
      frequency: { setValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    } as any;
  }
  createDelay() {
    return { delayTime: { setValueAtTime: vi.fn() }, connect: vi.fn() } as any;
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
    return { gain: { value: 1, setValueAtTime: vi.fn() }, connect: vi.fn() } as any;
  }
  createBiquadFilter() {
    return { type: "lowpass", frequency: { setValueAtTime: vi.fn() }, Q: { setValueAtTime: vi.fn() }, connect: vi.fn() } as any;
  }
  createDelay() {
    return { delayTime: { setValueAtTime: vi.fn() }, connect: vi.fn() } as any;
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

function setValue(testId: string, value: string, eventName: "input" | "change" = "input") {
  const target = container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | HTMLSelectElement | null;
  if (!target) throw new Error(`Missing element: ${testId}`);
  act(() => {
    const prototype = target instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
}

beforeEach(() => {
  h.auth.isAuthenticated = true;
  h.auth.isLoading = false;
  window.localStorage.removeItem("salaryman.1999-midi-input.v1");
  window.sessionStorage.removeItem("salaryman.1999.pending-save.v1");
  Object.defineProperty(navigator, "requestMIDIAccess", { configurable: true, value: undefined });
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
    if (path === "/api/vault/entries" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      currentProject = body.content;
      currentUpdatedAt = "2026-11-10T00:00:01.000Z";
      return jsonResponse({ entry: projectEntry() });
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
    if (path === "/api/music/stream/501" || path === "/api/music/stream/502" || path === "/api/music/stream/503") {
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
  delete (navigator as any).requestMIDIAccess;
  vi.unstubAllGlobals();
});

describe("1999 recorded-loop persistence", () => {
  it("lets guests use the workstation without loading or saving Vault data", async () => {
    h.auth.isAuthenticated = false;
    await mount();

    expect(container.querySelector('[data-testid="page-1999"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="text-1999-brand"]')?.textContent).toBe("1999");
    expect(container.querySelector('[data-testid="button-save-project"]')?.textContent).toContain("Sign in to save");
    expect(container.querySelector('[data-testid="status-autosave"]')?.textContent).toContain("Guest");
    expect(container.querySelector('[data-testid="empty-projects"]')?.textContent).toContain("SIGN IN TO OPEN");
    expect(h.apiFetch).not.toHaveBeenCalled();

    setValue("input-project-name", "Guest session draft");
    await new Promise(resolve => window.setTimeout(resolve, 900));
    await flush();
    expect(container.querySelector('[data-testid="status-autosave"]')?.textContent).toContain("Guest");
    expect(h.apiFetch).not.toHaveBeenCalled();
  });

  it("restores a guest draft after sign-in and then saves it to Vault", async () => {
    window.sessionStorage.setItem(
      "salaryman.1999.pending-save.v1",
      JSON.stringify({ ...savedProject, name: "Guest session draft" }),
    );
    await mount();

    await new Promise(resolve => window.setTimeout(resolve, 950));
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/vault/entries", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(currentProject).name).toBe("Guest session draft");
    expect(container.querySelector('[data-testid="status-autosave"]')?.textContent).toContain("All changes saved");
  });

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

  it("previews every loop layer together for one pass and supports stopping early", async () => {
    const layeredProject = {
      ...savedProject,
      tracks: savedProject.tracks.map((track, index) => index === 1
        ? { ...track, muted: false, overdubTrackIds: [502, 503] }
        : track),
    };
    currentProject = JSON.stringify(layeredProject);
    await mount();

    click("button-play-loop-trk-loop");
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/501");
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/502");
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/503");
    expect(audioSources).toHaveLength(3);
    expect(audioSources.every(source => !source.loop && source.start.mock.calls.length === 1)).toBe(true);
    expect(audioSources[0].start.mock.calls[0]).toEqual(audioSources[1].start.mock.calls[0]);
    expect(audioSources[1].start.mock.calls[0]).toEqual(audioSources[2].start.mock.calls[0]);
    expect(audioSources.every(source => source.connect.mock.calls.length === 1)).toBe(true);
    expect(audioSources.every(source => source.connect.mock.calls[0][0] === audioGains[0])).toBe(true);
    expect(audioGains[0].gain.value).toBe(0.68);
    expect(h.music.previewTrack).not.toHaveBeenCalled();
    expect((container.querySelector('[data-testid="button-record"]') as HTMLButtonElement).disabled).toBe(true);

    act(() => audioSources.slice(0, 3).forEach(source => source.onended?.()));
    await flush();
    expect(container.querySelector('[data-testid="button-play-loop-trk-loop"]')?.getAttribute("aria-label"))
      .toBe("Preview all loop layers");

    click("button-play-loop-trk-loop");
    await flush();
    const latestSources = audioSources.slice(3);
    expect(latestSources).toHaveLength(3);
    click("button-play-loop-trk-loop");
    expect(latestSources.every(source => source.stop.mock.calls.length === 1)).toBe(true);
    expect((container.querySelector('[data-testid="button-record"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("uploads, chops, tunes, sequences, and saves an MPC pad sample", async () => {
    await mount();
    click("row-track-trk-main");
    setValue("select-machine", "mpc_sample", "change");
    await flush();
    expect(container.querySelectorAll('[data-testid^="button-mpc-pad-"]')).toHaveLength(16);

    const file = new File(["sampler audio"], "chop.wav", { type: "audio/wav" });
    const uploadInput = container.querySelector('[data-testid="input-mpc-upload"]') as HTMLInputElement;
    Object.defineProperty(uploadInput, "files", { configurable: true, value: [file] });
    act(() => uploadInput.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/storage/uploads/request-url", expect.objectContaining({ method: "POST" }));
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/tracks", expect.objectContaining({ method: "POST" }));

    setValue("select-project-key", "D", "change");
    setValue("select-time-signature", "3/4", "change");
    setValue("input-mpc-trim-start", "0.2");
    setValue("input-mpc-trim-end", "0.8");
    setValue("input-mpc-tune", "12");
    setValue("input-mpc-speed", "1.5");
    setValue("select-mpc-root-key", "2", "change");
    setValue("input-mpc-echo", "50");
    click("button-mpc-pad-1");
    await flush();

    expect(audioSources[0].start.mock.calls[0][1]).toBe(0.2);
    expect(audioSources[0].start.mock.calls[0][2]).toBeCloseTo(0.6);
    expect(audioSources[0].playbackRate.value).toBeCloseTo(3);
    expect(h.apiFetch).not.toHaveBeenCalledWith("/api/music/stream/502");
    expect(container.querySelector('[data-testid="panel-mpc-sampler"]')).not.toBeNull();

    click("button-step-trk-main-1");
    const sourcesBeforeSequence = audioSources.length;
    click("button-toggle-playback");
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 35)); });
    await flush();
    expect(audioSources.length).toBeGreaterThan(sourcesBeforeSequence + 1);
    expect(audioSources.slice(sourcesBeforeSequence).some(source => source.start.mock.calls.some((args: number[]) => args.length === 3))).toBe(true);
    click("button-toggle-playback");

    await act(async () => {
      (container.querySelector('[data-testid="button-save-project"]') as HTMLButtonElement).click();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved).toMatchObject({ key: "D", timeSignature: "3/4" });
    expect(saved.tracks[0].samplerPads[0]).toMatchObject({
      audioTrackId: 502,
      startSec: 0.2,
      endSec: 0.8,
      tune: 12,
      speed: 1.5,
      rootKey: 2,
      echo: 50,
    });
    expect(saved.tracks[0].padPatterns[0][0]).toBe(100);

    offlineSources.length = 0;
    click("button-export-wav");
    await flush();
    const exportedPadSources = offlineSources.filter(source => source.start.mock.calls.some((args: number[]) => args.length === 3));
    expect(exportedPadSources.length).toBeGreaterThan(0);
    expect(exportedPadSources[0].playbackRate.value).toBeCloseTo(3);
  });

  it("migrates SP-404 lanes into the shared sampler and sequences uploaded audio", async () => {
    const sp404Project = {
      ...savedProject,
      tracks: [
        { ...savedProject.tracks[0], machineId: "sp404mkii" as const },
        savedProject.tracks[1],
      ],
    };
    currentProject = JSON.stringify(sp404Project);
    await mount();
    click("row-track-trk-main");

    expect(container.querySelector('[data-testid="panel-sp404-sampler"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="button-mpc-pad-"]')).toHaveLength(16);

    const file = new File(["SP-404 sample"], "sp404.wav", { type: "audio/wav" });
    const uploadInput = container.querySelector('[data-testid="input-mpc-upload"]') as HTMLInputElement;
    Object.defineProperty(uploadInput, "files", { configurable: true, value: [file] });
    act(() => uploadInput.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/tracks", expect.objectContaining({ method: "POST" }));

    click("button-step-trk-main-1");
    await act(async () => {
      (container.querySelector('[data-testid="button-save-project"]') as HTMLButtonElement).click();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved.tracks[0].machineId).toBe("sp404mkii");
    expect(saved.tracks[0].samplerPads[0].audioTrackId).toBe(502);
    expect(saved.tracks[0].padPatterns[0][0]).toBe(100);

    click("button-toggle-playback");
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 35)); });
    await flush();
    expect(audioSources.some(source => source.start.mock.calls.some((args: number[]) => args.length === 3))).toBe(true);
    click("button-toggle-playback");
    offlineSources.length = 0;
    click("button-export-wav");
    await flush();
    expect(offlineSources.some(source => source.start.mock.calls.some((args: number[]) => args.length === 3))).toBe(true);
  });

  it("chops a library sample into unused pads and saves shared audio references", async () => {
    const pads = Array.from({ length: 16 }, (_, index) => ({
      audioTrackId: null,
      startSec: 0,
      endSec: 0,
      tune: 0,
      speed: 1,
      level: 100,
      tone: 100,
      echo: 0,
      rootKey: null,
    }));
    currentProject = JSON.stringify({
      ...savedProject,
      tracks: [
        {
          ...savedProject.tracks[0],
          machineId: "mpc_sample" as const,
          samplerPads: pads,
          padPatterns: Array.from({ length: 16 }, () => Array(16).fill(0)),
        },
        savedProject.tracks[1],
      ],
    });
    await mount();
    click("row-track-trk-main");
    setValue("select-mpc-sample", "501", "change");
    await flush();
    setValue("select-mpc-slice-count", "4", "change");
    click("button-mpc-chop");
    await flush();

    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/501");
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The original audio stays in your library."));
    click("button-save-project");
    await flush();

    const put = h.apiFetch.mock.calls.find(([path, init]) => path === "/api/vault/entries/77" && init?.method === "PUT");
    expect(put).toBeDefined();
    const saved = JSON.parse(JSON.parse(String(put![1].body)).content);
    expect(saved.tracks[0].samplerPads.slice(0, 4)).toEqual([
      expect.objectContaining({ audioTrackId: 501, startSec: 0, endSec: 0.25 }),
      expect.objectContaining({ audioTrackId: 501, startSec: 0.25, endSec: 0.5 }),
      expect.objectContaining({ audioTrackId: 501, startSec: 0.5, endSec: 0.75 }),
      expect.objectContaining({ audioTrackId: 501, startSec: 0.75, endSec: 1 }),
    ]);
  });

  it("triggers MPC pads from MIDI notes and learns a browser-local mapping", async () => {
    const pads = Array.from({ length: 16 }, (_, index) => ({
      audioTrackId: index < 2 ? 501 : null,
      startSec: 0,
      endSec: 0,
      tune: 0,
      speed: 1,
      level: 100,
      tone: 100,
      echo: 0,
      rootKey: null,
    }));
    const midiProject = {
      ...savedProject,
      tracks: [
        {
          ...savedProject.tracks[0],
          machineId: "mpc_sample" as const,
          samplerPads: pads,
          padPatterns: Array.from({ length: 16 }, () => Array(16).fill(0)),
        },
        savedProject.tracks[1],
      ],
    };
    currentProject = JSON.stringify(midiProject);
    const input: any = { id: "usb-pad", name: "USB Pad Controller", state: "connected", onmidimessage: null };
    const access: any = { inputs: new Map([["usb-pad", input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: vi.fn(async () => access),
    });
    await mount();

    click("button-connect-midi");
    await flush();
    expect((container.querySelector('[data-testid="select-midi-input"]') as HTMLSelectElement).value).toBe("usb-pad");
    expect(typeof input.onmidimessage).toBe("function");

    act(() => input.onmidimessage({ data: new Uint8Array([0x90, 36, 100]) }));
    await flush();
    expect(h.apiFetch).toHaveBeenCalledWith("/api/music/stream/501");
    expect(audioSources).toHaveLength(1);
    expect(audioSources[0].playbackRate.value).toBe(1);
    expect(audioGains[0].gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(0.72 * (100 / 127) * 0.35);

    click("button-mpc-pad-2");
    click("button-learn-midi-pad");
    await flush();
    act(() => input.onmidimessage({ data: new Uint8Array([0x9f, 60, 110]) }));
    await flush();
    expect(audioSources).toHaveLength(3);
    expect(audioGains[2].gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(0.72 * (110 / 127) * 0.35);
    const learnedSettings = JSON.parse(window.localStorage.getItem("salaryman.1999-midi-input.v1") || "{}");
    expect(learnedSettings.inputId).toBe("usb-pad");
    expect(learnedSettings.padNotes.slice(0, 2)).toEqual([36, 60]);
    expect(container.querySelector('[data-testid="status-midi-input"]')?.textContent).toContain("velocity 110");

    act(() => input.onmidimessage({ data: new Uint8Array([0x80, 60, 100]) }));
    await flush();
    expect(audioSources).toHaveLength(3);

    click("button-reset-midi-map");
    await flush();
    const resetSettings = JSON.parse(window.localStorage.getItem("salaryman.1999-midi-input.v1") || "{}");
    expect(resetSettings.padNotes.slice(0, 4)).toEqual([36, 37, 38, 39]);

    access.inputs.delete("usb-pad");
    act(() => access.onstatechange?.());
    await flush();
    expect((container.querySelector('[data-testid="select-midi-input"]') as HTMLSelectElement).value).toBe("");
    expect(container.querySelector('[data-testid="status-midi-input"]')?.textContent).toContain("no input devices");
    expect(input.onmidimessage).toBeNull();
  });

  it("reports unsupported MIDI input without hiding sampler controls", async () => {
    currentProject = JSON.stringify({
      ...savedProject,
      tracks: [{ ...savedProject.tracks[0], machineId: "mpc_sample" as const }, savedProject.tracks[1]],
    });
    await mount();
    click("button-connect-midi");
    await flush();
    expect(container.querySelector('[data-testid="status-midi-input"]')?.textContent).toContain("Web MIDI input is unavailable");
    expect(container.querySelector('[data-testid="section-midi-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="panel-mpc-sampler"]')).not.toBeNull();
  });
});
