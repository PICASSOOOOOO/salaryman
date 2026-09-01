// @vitest-environment jsdom
//
// The verified sign-in entry point must preserve a requested destination. This
// protects deep-link sign-in flows such as /console without advertising
// unverified provider callbacks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWithDiscord: vi.fn(),
  loginWithGithub: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => authMocks,
}));

import { SignInPrompt } from "./SignInPrompt";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  (globalThis as any).fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ replit: true, discord: true, github: true }),
    }),
  );
  authMocks.login.mockClear();
  authMocks.loginWithDiscord.mockClear();
  authMocks.loginWithGithub.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("SignInPrompt return path", () => {
  it("forwards the requested destination to platform auth", async () => {
    await act(async () => {
      root.render(<SignInPrompt inline returnTo="/console" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const button = (label: string) => {
      const found = buttons.find((item) => (item.textContent ?? "").includes(label));
      if (!found) throw new Error(`button not found: ${label}`);
      return found;
    };

    act(() => {
      button("SIGN IN").click();
    });

    expect(authMocks.login).toHaveBeenCalledWith("/console");
    expect(authMocks.loginWithDiscord).not.toHaveBeenCalled();
    expect(authMocks.loginWithGithub).not.toHaveBeenCalled();
  });
});