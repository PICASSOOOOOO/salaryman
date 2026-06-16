// @vitest-environment jsdom
//
// Wiring test for the LOGGED-OUT Pablo front-door RETURNING-USER shortcut
// (detectSignInIntent -> setAuthChoice). This is distinct from the admit
// flow tested in PabloTerminal.admit.test.tsx:
//
//   • The admit path (isReadyToEnter / isShowPapers) walks a brand-new
//     visitor through name -> email before handing off, and only short-
//     circuits straight to the modal when name+email are already CACHED.
//   • The sign-in shortcut here fires for phrases like "I already have an
//     account" / "log me in" / "sign me in" BEFORE the new-user intake,
//     with NO cache required — a returning user is handed straight to the
//     auth-choice modal and is NEVER asked for name or email.
//
// Negative case guards the false-positive exclusion: an informational
// "how do I log in?" must NOT open the modal (it's a question, not an
// intent to be signed in).
//
// PabloNebula3D / SceneFX (WebGL), the art kit, TTS, and audio are all
// stubbed so the terminal mounts in jsdom. speakWithTTS fires its done
// callback synchronously, which drives the goLogin -> setAuthChoice
// redirect the real component relies on.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Logged-out visitor: not authed, not loading.
const loginWithDiscord = vi.fn();
vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    logout: vi.fn(),
    loginWithDiscord,
    user: null,
  }),
}));

// No real network. The sign-in shortcut fires before any chat endpoint is
// hit, but the persona effect and any stray fetch must resolve cleanly.
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)),
}));

// TTS double: fire the done callback synchronously so the goLogin redirect
// (which opens the auth-choice modal) runs without needing fake timers.
vi.mock("@/lib/tts", () => ({
  speakWithTTS: (_text: string, onDone?: () => void) => {
    if (onDone) onDone();
    return { cancel: () => {} };
  },
  // Never auto-fire the greeting sequence — keeps the terminal in a clean
  // pre-intake state so each test drives the flow explicitly.
  whenAudioUnlocked: () => () => {},
  unlockAudio: async () => {},
  armAudioAutoUnlock: () => {},
}));

// Stub the heavy / browser-only visuals so jsdom can mount the page.
vi.mock("@/components/PabloNebula3D", () => ({
  PabloNebula3D: () => null,
  PABLO_VARIANT: {},
  MILA_VARIANT: {},
}));
vi.mock("@/components/SceneFX", () => ({ SceneFX: () => null }));
vi.mock("@/components/HummingBirdAttachStrip", () => ({ HummingBirdAttachStrip: () => null }));
vi.mock("@/components/VisionIntake", () => ({ VisionIntake: () => null }));
vi.mock("@/lib/art", () => ({ useArtAsset: () => null }));
vi.mock("@/lib/lowGfx", () => ({ useLowGfx: () => [true, () => {}] }));
vi.mock("@/hooks/use-mobile", () => ({ useBoomerMode: () => [false, () => {}] }));

import PabloTerminal from "./PabloTerminal";

let root: Root;
let container: HTMLDivElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  await act(async () => {
    root.render(<PabloTerminal />);
  });
  await flush();
}

function qs(testid: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testid}"]`);
}

// Type a message into the intro input and submit the intake form, driving the
// real onChange -> state -> onSubmit -> sendToPablo pipeline.
async function typeAndSend(text: string) {
  const input = qs("pablo-intro-text-input") as HTMLInputElement;
  if (!input) throw new Error("intro text input not rendered");
  const setValue = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = input.closest("form");
  if (!form) throw new Error("intake form not found");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

beforeEach(() => {
  loginWithDiscord.mockClear();
  try {
    window.localStorage.clear();
  } catch {}
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  try {
    window.localStorage.clear();
  } catch {}
});

describe("Pablo front-door sign-in shortcut (detectSignInIntent)", () => {
  it("sends a returning user saying 'I already have an account' straight to the auth choice modal — no cache, no name/email prompt", async () => {
    // Deliberately NO cached salaryman_name / salaryman_email: the sign-in
    // shortcut must fire for a returning user purely on intent.
    await mount();
    expect(qs("pablo-auth-choice"), "modal should be closed on mount").toBeNull();

    await typeAndSend("I already have an account");

    // Handed straight to OAuth — modal open, and never bounced into name or
    // email collection (placeholder stays the generic chat prompt).
    expect(qs("pablo-auth-choice"), "auth choice modal should open").not.toBeNull();
    const input = qs("pablo-intro-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
    // Nothing was persisted — we never asked for identity.
    expect(window.localStorage.getItem("salaryman_name")).toBeNull();
    expect(window.localStorage.getItem("salaryman_email")).toBeNull();
  });

  it("sends a returning user saying 'log me in' straight to the auth choice modal without collecting identity", async () => {
    await mount();
    expect(qs("pablo-auth-choice"), "modal should be closed on mount").toBeNull();

    await typeAndSend("log me in");

    expect(qs("pablo-auth-choice"), "auth choice modal should open").not.toBeNull();
    const input = qs("pablo-intro-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
    expect(window.localStorage.getItem("salaryman_name")).toBeNull();
    expect(window.localStorage.getItem("salaryman_email")).toBeNull();
  });

  it("does NOT open the auth choice modal for an informational 'how do I log in?'", async () => {
    await mount();
    expect(qs("pablo-auth-choice"), "modal should be closed on mount").toBeNull();

    await typeAndSend("how do I log in?");

    // Informational question — the sign-in shortcut must not fire.
    expect(qs("pablo-auth-choice"), "auth choice modal must stay closed").toBeNull();
  });
});
