// @vitest-environment jsdom
//
// Shadow Radio has one global owner. This guards the lifecycle that used to be
// split between the office and WorldPlay: no re-created player on toggles, and
// phone traffic always pauses then resumes the same player.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("wouter", () => ({ useLocation: () => ["/pablo"] }));
vi.mock("../soundEngine", () => ({
  setSfxVolume: vi.fn(),
  setMusicVolume: vi.fn(),
  setMuted: vi.fn(),
}));
vi.mock("../lib/audio-bus", () => ({
  BG_OWNERS: { radioPablo: "radio-pablo" },
  claimBackgroundAudio: vi.fn(),
  releaseBackgroundAudio: vi.fn(),
  registerBackgroundAudio: vi.fn(() => () => {}),
  subscribeVoicePriority: vi.fn(() => () => {}),
}));
vi.mock("../lib/tts", () => ({
  speakGameTTS: vi.fn(() => ({ cancel: vi.fn() })),
}));

import { OfficeRadio } from "./OfficeRadio";
import { AUDIO_DEFAULTS, setAudioSettings } from "../lib/audio-settings";
import { setPhoneBusy } from "../lib/phone-busy";

class FakeAudio extends EventTarget {
  src = "";
  preload = "";
  loop = false;
  volume = 1;
  muted = false;
  currentTime = 0;
  duration = 180;
  paused = true;
  ended = false;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
}

let root: Root;
let host: HTMLDivElement;
let players: FakeAudio[];
const OriginalAudio = globalThis.Audio;

class StubAudio extends FakeAudio {
  constructor() {
    super();
    players.push(this);
  }
}

beforeEach(() => {
  localStorage.clear();
  players = [];
  (globalThis as any).Audio = StubAudio;
  setPhoneBusy("office-radio-test", false);
  setAudioSettings({ ...AUDIO_DEFAULTS, musicEnabled: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setPhoneBusy("office-radio-test", false);
  (globalThis as any).Audio = OriginalAudio;
});

describe("OfficeRadio", () => {
  it("keeps one player across toggles and yields to an active phone call", async () => {
    await act(async () => { root.render(<OfficeRadio />); });
    const player = players[0];
    expect(players).toHaveLength(1);
    // Shadow Radio is positional: it only plays after WorldPlay reports that
    // the player is near a physical radio source.
    act(() => {
      window.dispatchEvent(new CustomEvent("salaryman:radio-proximity", { detail: { gain: 1 } }));
    });
    expect(player.play).toHaveBeenCalled();

    act(() => { setAudioSettings({ musicEnabled: false }); });
    expect(player.pause).toHaveBeenCalled();

    act(() => { setAudioSettings({ musicEnabled: true }); });
    expect(players).toHaveLength(1);
    expect(player.play.mock.calls.length).toBeGreaterThan(1);

    act(() => { setPhoneBusy("office-radio-test", true); });
    expect(player.pause.mock.calls.length).toBeGreaterThan(1);

    act(() => { setPhoneBusy("office-radio-test", false); });
    expect(player.play.mock.calls.length).toBeGreaterThan(2);
  });
});