// @vitest-environment jsdom
//
// Complementary front-door guarantee to PabloTerminal.admit.test.tsx
// (Task #713's ADMIT paths). That suite proves a returning visitor who
// SIGNALS they want in ("let me in", "show me your papers") is handed
// straight to the auth-choice modal. This suite guards the INVERSE:
//
//   • A returning visitor with a cached identity (salaryman_name +
//     salaryman_email) who is just CHATTING — no readiness, no papers,
//     no tool/destination intent — must NOT be auto-redirected to the
//     sign-in modal. beginIntake() greets them on mount and drops them
//     into the free "chatting" phase; a plain question ("what is a
//     salaryman?") is answered by the public LLM endpoint and the modal
//     stays closed. This is the "don't push login on people who just
//     want to chat" branch, easy to regress and previously unverified.
//   • The contrast still holds: the moment that same returning visitor
//     asks for a gated destination ("take me to my dashboard"), the
//     door opens — they ARE handed to the auth-choice modal. This is the
//     reachable carrier of the explicit-pendingDestination auto-redirect
//     (pendingDestinationRef is only ever populated by exactly this kind
//     of tool/navigation intent), so it pins the "...unless they ask"
//     half of the guarantee.
//
// Same stubbing strategy as the admit suite: WebGL nebula, TTS and
// audio are all faked so the terminal mounts under jsdom,
// and speakWithTTS fires its done callback synchronously so the
// single-shot redirect resolves without fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Logged-out visitor: not authed, not loading.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    logout: vi.fn(),
    loginWithDiscord: vi.fn(),
    user: null,
  }),
}));

// Public Pablo endpoint answers free chat (no auth, no modal). The persona
// probe and any other stray call resolve cleanly. We assert below that a
// plain chat message routes here — proof the visitor was NOT pushed to login.
const { apiFetchMock, speakWithTTSMock, playbackFailure } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("pablo/public")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ say: "A salaryman is a corporate worker grinding the daily shift." }),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }),
  speakWithTTSMock: vi.fn(),
  playbackFailure: { current: null as unknown },
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

// TTS double: fire the done callback synchronously so any admit redirect
// (which opens the auth-choice modal) runs without needing fake timers.
vi.mock("@/lib/tts", () => ({
  speakWithTTS: (text: string, onDone?: () => void, onError?: (err: Error) => void, options?: unknown) => {
    speakWithTTSMock(text, options);
    if (playbackFailure.current) onError?.(playbackFailure.current as Error);
    if (onDone) onDone();
    return { cancel: () => {} };
  },
  whenAudioUnlocked: (callback: () => void) => {
    callback();
    return () => {};
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

// Type a message into the standard input and submit, driving the real
// onChange -> state -> onSubmit -> sendToPablo pipeline.
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

// Returning visitor with a cached identity.
function seedReturningVisitor(name: string, email: string) {
  window.localStorage.setItem("salaryman_name", name);
  window.localStorage.setItem("salaryman_email", email);
}

beforeEach(() => {
  apiFetchMock.mockClear();
  speakWithTTSMock.mockClear();
  playbackFailure.current = null;
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
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
    window.sessionStorage.clear();
  } catch {}
  // Reset the URL so a ?returnTo= param from one test doesn't leak into the next.
  window.history.pushState({}, "", "/");
});

describe("Pablo front-door: returning visitors aren't pushed to log in unless they ask", () => {
  it("greets immediately and speaks with Pablo's assigned voice", async () => {
    await mount();

    expect(qs("pablo-reply-bubble")?.textContent).toContain(
      "Hey, I'm Pablo. What can I help you with?",
    );
    expect(speakWithTTSMock).toHaveBeenCalledWith(
      "Hey, I'm Pablo. What can I help you with?",
      { character: "PABLO" },
    );
  });

  it("opens directly on the canonical nebula and keeps it present while chatting", async () => {
    await mount();
    expect(qs("canonical-pablo-nebula")).not.toBeNull();
    expect(qs("pablo-frontdoor-scene")).toBeNull();

    await typeAndSend("what is a salaryman?");

    expect(qs("canonical-pablo-nebula")).not.toBeNull();
  });

  it("routes the header chat action into COMMS", async () => {
    await mount();

    const modeToggle = qs("pablo-mode-toggle") as HTMLButtonElement;
    const chatButton = qs("pablo-ai-choice") as HTMLButtonElement;
    expect(modeToggle).not.toBeNull();
    expect(chatButton).not.toBeNull();

    await act(async () => {
      modeToggle.click();
    });
    expect(qs("pablo-text-input")).toBeNull();

    await act(async () => {
      chatButton.click();
    });
    expect(window.location.pathname).toBe("/comms");
  });

  it("greets a returning visitor on mount WITHOUT opening the auth-choice modal", async () => {
    seedReturningVisitor("Returning Rita", "rita@example.com");

    await mount();

    // The normal welcome must not push a returning visitor to sign in.
    expect(qs("pablo-auth-choice"), "mount must not push a returning visitor to login").toBeNull();
  });

  it("answers a plain chat question without pushing the returning visitor to login", async () => {
    seedReturningVisitor("Returning Rita", "rita@example.com");

    await mount();
    expect(qs("pablo-auth-choice"), "modal closed after mount").toBeNull();

    await typeAndSend("what is a salaryman?");

    // Pure chat — no readiness / papers / tool / pending destination — must
    // stay in the free conversation lane: the public LLM endpoint answers
    // and the auth-choice modal never opens.
    expect(qs("pablo-auth-choice"), "plain chat must not open the sign-in modal").toBeNull();
    const publicCalls = apiFetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("pablo/public"),
    );
    expect(publicCalls.length, "plain chat should be answered by the public Pablo endpoint").toBeGreaterThan(0);
  });

  it("offers a visible replay control for Pablo's current reply", async () => {
    seedReturningVisitor("Returning Rita", "rita@example.com");
    await mount();
    await typeAndSend("what is a salaryman?");

    const replay = qs("pablo-replay-button") as HTMLButtonElement | null;
    expect(replay?.textContent).toContain("Hear reply");

    await act(async () => {
      replay?.click();
    });

    expect(speakWithTTSMock).toHaveBeenCalledWith(
      "A salaryman is a corporate worker grinding the daily shift.",
      { character: "PABLO" },
    );
  });

  it("explains when voice replay is unavailable to a logged-out visitor", async () => {
    await mount();
    playbackFailure.current = new Error("Pablo voice access required");

    await act(async () => {
      (qs("pablo-replay-button") as HTMLButtonElement)?.click();
    });

    expect(qs("pablo-voice-notice")?.textContent).toContain("Sign in to check voice access.");
    expect(qs("pablo-voice-notice")?.textContent).toContain("Pablo Prime or CALLL HOME");
  });

  it("shows a retry control after a temporary chat failure and retries the message", async () => {
    seedReturningVisitor("Returning Rita", "rita@example.com");
    let publicRequests = 0;
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("pablo/public")) {
        publicRequests += 1;
        if (publicRequests === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: "Pablo is offline" }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ say: "Here is the answer." }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    });

    await mount();
    await typeAndSend("Can you help me?");

    expect(qs("pablo-reply-bubble")?.textContent).toContain("couldn’t reach the conversation service");
    const retry = qs("pablo-chat-retry-button") as HTMLButtonElement | null;
    expect(retry?.textContent).toContain("Try again");

    await act(async () => {
      retry?.click();
    });
    await flush();

    expect(publicRequests).toBe(2);
    expect(qs("pablo-reply-bubble")?.textContent).toContain("Here is the answer.");
    expect(qs("pablo-chat-retry-button")).toBeNull();
  });

  it("DOES hand the returning visitor to the modal when they ask for a gated destination", async () => {
    seedReturningVisitor("Returning Rita", "rita@example.com");

    await mount();
    expect(qs("pablo-auth-choice"), "modal closed after mount").toBeNull();

    // Now she asks for something behind the door (a gated destination /
    // tool). This is the "...unless they ask" half: the door opens and she
    // is handed straight to the auth-choice modal — never re-asked for
    // name/email she already has on file.
    await typeAndSend("take me to my dashboard");

    expect(qs("pablo-auth-choice"), "a gated-destination request should open the sign-in modal").not.toBeNull();
    const input = qs("pablo-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
  });

  it("auto-opens the modal on mount when a ?returnTo= deep-link is present (expired-session redirect)", async () => {
    // Simulate a returning visitor whose session expired while on /dashboard.
    // The app redirects them to /pablo?returnTo=/dashboard. On mount,
    // beginIntake reads the URL param, sees cached name+email AND a
    // pendingDestination, and must immediately open the auth-choice modal
    // without re-asking for identity they already provided.
    window.history.pushState({}, "", "?returnTo=/dashboard");
    seedReturningVisitor("Deep-link Dana", "dana@example.com");

    await mount();

    expect(
      qs("pablo-auth-choice"),
      "?returnTo= deep-link must auto-open the sign-in modal on mount for a returning visitor",
    ).not.toBeNull();
    // Must never regress to re-asking for name or email that are already on file.
    const input = qs("pablo-text-input") as HTMLInputElement | null;
    if (input) {
      expect(input.placeholder).not.toBe("Type your name");
      expect(input.placeholder).not.toBe("Type your email");
    }
  });
});
