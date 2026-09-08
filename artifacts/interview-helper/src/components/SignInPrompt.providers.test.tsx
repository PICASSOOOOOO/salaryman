// @vitest-environment jsdom
//
// Guards the consolidated mobile-friendly sign-in surface. Discord and GitHub
// remain backend capabilities, but are not advertised until their production
// callbacks are verified. Platform auth must always remain available.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// useAuth only supplies the click handlers; we don't trigger logins here, we
// only assert which buttons render. Stub it so the component mounts in jsdom.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginWithDiscord: vi.fn(),
    loginWithGithub: vi.fn(),
  }),
}));

import { SignInPrompt } from "./SignInPrompt";

let root: Root;
let container: HTMLDivElement;

// The provider probe is the only fetch SignInPrompt makes. Each test installs a
// resolver returning the providers it wants to simulate (or a rejection).
function stubProvidersFetch(
  impl: () => Promise<{ replit?: boolean; discord?: boolean; github?: boolean }>,
) {
  (globalThis as any).fetch = vi.fn((url: string) => {
    if (typeof url === "string" && url.includes("/api/auth/providers")) {
      return impl().then((body) => ({ ok: true, json: async () => body }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function buttonLabels(): string[] {
  return Array.from(container.querySelectorAll("button")).map(
    (b) => (b.textContent || "").trim(),
  );
}

function hasDiscordButton(): boolean {
  return buttonLabels().some((t) => t.includes("CONTINUE WITH DISCORD"));
}
function hasGithubButton(): boolean {
  return buttonLabels().some((t) => t.includes("CONTINUE WITH GITHUB"));
}
function hasReplitSignIn(): boolean {
  // The plain Replit-Auth button reads "SIGN IN" (no "CONTINUE WITH").
  return buttonLabels().some((t) => t === "SIGN IN");
}

async function mount() {
  await act(async () => {
    root.render(<SignInPrompt inline />);
  });
  // Let the providers fetch + its .then chain resolve and re-render.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  if (!window.matchMedia) {
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

describe("SignInPrompt keeps one verified sign-in method", () => {
  it("hides optional providers even when the probe reports them enabled", async () => {
    stubProvidersFetch(async () => ({ replit: true, discord: true, github: true }));
    await mount();
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });

  it("hides GitHub when github=false", async () => {
    stubProvidersFetch(async () => ({ replit: true, discord: true, github: false }));
    await mount();
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });

  it("hides Discord when discord=false", async () => {
    stubProvidersFetch(async () => ({ replit: true, discord: false, github: true }));
    await mount();
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });

  it("hides both GitHub and Discord when only replit is enabled", async () => {
    stubProvidersFetch(async () => ({ replit: true, discord: false, github: false }));
    await mount();
    // The primary account sign-in option must always remain clickable.
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });
});

describe("SignInPrompt stays compact when provider discovery fails", () => {
  it("keeps only platform auth when the providers fetch rejects", async () => {
    (globalThis as any).fetch = vi.fn(() => Promise.reject(new Error("network down")));
    await mount();
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });

  it("keeps only platform auth when the probe returns a non-ok response", async () => {
    (globalThis as any).fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    );
    await mount();
    expect(hasReplitSignIn()).toBe(true);
    expect(hasDiscordButton()).toBe(false);
    expect(hasGithubButton()).toBe(false);
  });
});
