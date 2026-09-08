// @vitest-environment jsdom
//
// End-to-end wiring test for the LOGGED-OUT Pablo front-door admittance flow
// The pure intent detectors in
// signup-intent.ts already have unit tests; this guards the COMPONENT wiring
// that turns those signals into the auth-choice modal:
//
//   • A returning visitor (cached salaryman_name + salaryman_email) who says
//     "let me in" or "show me your papers" is admitted STRAIGHT to the auth
//     choice modal — never re-asked for name/email (the "stuck at the door"
//     loop this flow exists to kill).
//   • A brand-new visitor (no cache) who says "let me in" is walked through
//     name -> email -> auth choice modal.
//   • The header START WORK button goes straight to sign-in with Tower as the
//     return destination.
//
// PabloNebula3D (WebGL), the art kit, TTS, and audio are all stubbed
// so the terminal mounts in jsdom. speakWithTTS fires its done callback
// synchronously, which is what drives the single-shot redirect (goLogin ->
// setAuthChoice) the real component relies on.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Logged-out visitor: not authed, not loading.
const loginWithDiscord = vi.fn();
const { spokenTts } = vi.hoisted(() => ({
  spokenTts: [] as string[],
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    logout: vi.fn(),
    loginWithDiscord,
    user: null,
  }),
}));

// No real network. The admit / name / email paths never hit the public chat
// endpoint, but the persona effect and any stray fetch must resolve cleanly.
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)),
}));

// TTS double: fire the done callback synchronously so the admittance flow runs
// without needing fake timers.
vi.mock("@/lib/tts", () => ({
  speakWithTTS: (text: string, onDone?: () => void) => {
    spokenTts.push(text);
    if (onDone) onDone();
    return { cancel: () => {} };
  },
  unlockAudio: async () => {},
  armAudioAutoUnlock: () => {},
}));

// Stub the heavy / browser-only visuals so jsdom can mount the page.
vi.mock("@/components/PabloNebula3D", () => ({
  PabloNebula3D: () => <div data-testid="canonical-pablo-nebula" />,
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
  spokenTts.length = 0;
  window.history.replaceState({}, "", "/");
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
  window.history.replaceState({}, "", "/");
});

describe("Pablo front-door admittance flow", () => {
  it("renders the canonical persona-aware nebula at full strength during intake", async () => {
    await mount();

    const nebula = qs("canonical-pablo-nebula");
    expect(nebula).not.toBeNull();
    expect((nebula!.parentElement as HTMLDivElement).style.opacity).toBe("1");
    expect(qs("pablo-frontdoor-scene")).toBeNull();
  });

  it("admits a returning visitor saying 'let me in' straight to the auth choice modal", async () => {
    window.localStorage.setItem("salaryman_name", "RETURNING RITA");
    window.localStorage.setItem("salaryman_email", "rita@example.com");

    await mount();
    expect(qs("pablo-auth-choice"), "modal should be closed on mount").toBeNull();

    await typeAndSend("let me in");

    // Admitted directly — modal open, and never bounced into name/email
    // collection (placeholder stays the generic chat prompt).
    expect(qs("pablo-auth-choice"), "auth choice modal should open").not.toBeNull();
    const input = qs("pablo-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
    expect(spokenTts).toContain("Cleared, Returning Rita. Heading in.");
    expect(spokenTts).not.toContain("Cleared, RETURNING RITA. Heading in.");
  });

  it("admits a returning visitor saying 'show me your papers' without re-asking name/email", async () => {
    window.localStorage.setItem("salaryman_name", "Paper Pete");
    window.localStorage.setItem("salaryman_email", "pete@example.com");

    await mount();
    await typeAndSend("show me your papers");

    expect(qs("pablo-auth-choice"), "auth choice modal should open").not.toBeNull();
    const input = qs("pablo-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
  });

  it("routes a brand-new visitor saying 'let me in' through name -> email -> auth choice modal", async () => {
    await mount();

    // No cache: "let me in" pivots to asking-name, NOT straight to the modal.
    await typeAndSend("let me in");
    expect(qs("pablo-auth-choice"), "should not admit a new visitor yet").toBeNull();
    let input = qs("pablo-text-input") as HTMLInputElement;
    expect(input.placeholder, "should be asking for the name now").toBe("Type your name");

    // Provide a name -> advances to asking-email.
    await typeAndSend("Alex");
    expect(qs("pablo-auth-choice"), "still collecting identity").toBeNull();
    input = qs("pablo-text-input") as HTMLInputElement;
    expect(input.placeholder, "should be asking for the email now").toBe("Type your email");

    // Provide an email -> hands off to the auth choice modal.
    await typeAndSend("alex@example.com");
    expect(qs("pablo-auth-choice"), "auth choice modal should open after email").not.toBeNull();

    // The collected identity was persisted along the way.
    expect(window.localStorage.getItem("salaryman_name")).toBe("Alex");
    expect(window.localStorage.getItem("salaryman_email")).toBe("alex@example.com");
  });

  it("sends the header START WORK button straight to sign-in", async () => {
    await mount();
    expect(qs("pablo-auth-choice")).toBeNull();

    const signIn = qs("pablo-sign-in") as HTMLButtonElement;
    expect(signIn, "header start-work button should render for logged-out users").not.toBeNull();
    await act(async () => {
      signIn.click();
    });
    await flush();

    expect(qs("pablo-auth-choice"), "header entry should not add an intermediate modal").toBeNull();
    expect(window.location.pathname).toBe("/sign-in");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/console");
  });
});
