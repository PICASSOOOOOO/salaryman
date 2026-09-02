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
// PabloNebula3D (WebGL), the art kit, TTS, and audio are all
// stubbed so the terminal mounts in jsdom. speakWithTTS fires its done
// callback synchronously, which drives the goLogin -> setAuthChoice
// redirect the real component relies on.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Logged-out visitor: not authed, not loading.
const loginWithDiscord = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
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
  unlockAudio: async () => {},
  armAudioAutoUnlock: () => {},
}));

// Stub the heavy / browser-only visuals so jsdom can mount the page.
vi.mock("@/components/PabloNebula3D", () => ({
  PabloNebula3D: () => null,
  PABLO_VARIANT: {},
  MILA_VARIANT: {},
}));
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

// Type a message into the standard input and submit the form, driving the
// real onChange -> state -> onSubmit -> sendToPablo pipeline.
async function typeAndSend(text: string) {
  const input = qs("pablo-text-input") as HTMLInputElement;
  if (!input) throw new Error("text input not rendered");
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
    const input = qs("pablo-text-input") as HTMLInputElement | null;
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
    const input = qs("pablo-text-input") as HTMLInputElement | null;
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

  // The shortcut fires before the interview-phase branches so it works at
  // every step of identity collection. The tests above only
  // exercise it from the fresh idle state. The cases below drive the terminal
  // INTO a later intake phase first, then say "log me in", and assert it still
  // short-circuits straight to the auth modal without finishing the new-user
  // sequence.

  it("short-circuits to the auth modal mid-intake from the asking-name phase", async () => {
    await mount();

    // "let me in" is a readiness signal (NOT a sign-in intent), so with no
    // cached identity it pivots a brand-new visitor into asking-name.
    await typeAndSend("let me in");
    expect(qs("pablo-auth-choice"), "should still be collecting identity").toBeNull();
    let input = qs("pablo-text-input") as HTMLInputElement;
    expect(input.placeholder, "should be mid-intake asking for the name").toBe("Type your name");

    // Now they reveal they're a returning user. The shortcut must fire from
    // THIS phase too — straight to the modal, never finishing name -> email.
    await typeAndSend("log me in");
    expect(qs("pablo-auth-choice"), "auth choice modal should open from asking-name").not.toBeNull();
    // The new-user sequence was abandoned — no identity was captured, so the
    // walkthrough never advanced past the door.
    expect(window.localStorage.getItem("salaryman_name")).toBeNull();
    expect(window.localStorage.getItem("salaryman_email")).toBeNull();
  });

  it("short-circuits to the auth modal mid-intake from the asking-email phase", async () => {
    await mount();

    // Walk a new visitor partway through: readiness -> asking-name -> name ->
    // asking-email. They've now given a name but not an email.
    await typeAndSend("let me in");
    await typeAndSend("Alex");
    const emailInput = qs("pablo-text-input") as HTMLInputElement;
    expect(emailInput.placeholder, "should be mid-intake asking for the email").toBe("Type your email");
    expect(window.localStorage.getItem("salaryman_name")).toBe("Alex");

    // Returning-user intent from the asking-email phase still wins: straight
    // to the modal without ever collecting the email.
    await typeAndSend("log me in");
    expect(qs("pablo-auth-choice"), "auth choice modal should open from asking-email").not.toBeNull();
    // The email step was never completed — the walkthrough was skipped.
    expect(window.localStorage.getItem("salaryman_email")).toBeNull();
  });

  it("short-circuits to the auth modal after some free chatting", async () => {
    await mount();

    // A non-sign-in message drops a brand-new visitor into the free CHATTING
    // phase (the public LLM call is mocked to fail, leaving us in chatting).
    await typeAndSend("what is this place?");
    expect(qs("pablo-auth-choice"), "chatting should not open the modal").toBeNull();

    // "I already have an account" from the chatting phase short-circuits.
    await typeAndSend("I already have an account");
    expect(qs("pablo-auth-choice"), "auth choice modal should open from chatting").not.toBeNull();
    expect(window.localStorage.getItem("salaryman_name")).toBeNull();
    expect(window.localStorage.getItem("salaryman_email")).toBeNull();
  });

  it("passes a cached email as the OAuth login_hint when present mid-intake", async () => {
    // Returning visitor with a remembered email but no name yet — exactly the
    // partial-return state where the shortcut should pre-fill the login hint.
    window.localStorage.setItem("salaryman_email", "returning@example.com");

    // Capture the location.href the SIGN IN button assigns. jsdom won't let us
    // read back a real navigation, so swap in a writable stand-in (restored in
    // the finally) that still answers the origin/search/pathname reads the
    // component makes during mount and routing.
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: originalLocation.origin,
        pathname: "/",
        search: "",
        href: "",
        assign: () => {},
        replace: () => {},
      },
    });

    try {
      await mount();

      // Drive into a later phase first (asking-name) so we exercise the
      // hint hand-off from MID-intake, not the fresh idle state.
      await typeAndSend("let me in");
      expect((qs("pablo-text-input") as HTMLInputElement).placeholder).toBe("Type your name");

      await typeAndSend("log me in");
      const modal = qs("pablo-auth-choice");
      expect(modal, "auth choice modal should open").not.toBeNull();

      // Click the modal's SIGN IN button — it builds the /sign-in URL and is
      // the only place the cached-email hint surfaces.
      const signInBtn = Array.from(modal!.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "CONTINUE WITH SALARYMAN",
      ) as HTMLButtonElement | undefined;
      expect(signInBtn, "modal CONTINUE WITH SALARYMAN button should render").not.toBeUndefined();

      await act(async () => {
        signInBtn!.click();
      });

      expect(window.location.href).toContain("/sign-in");
      expect(window.location.href).toContain(
        `login_hint=${encodeURIComponent("returning@example.com")}`,
      );
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
