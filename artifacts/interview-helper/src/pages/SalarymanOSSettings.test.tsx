// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ isAuthenticated: true }));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: authState.isAuthenticated }),
}));

vi.mock("@/pages/Game/Settings", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="game-settings-panel" data-embedded={String(Boolean(embedded))}>Game controls</div>
  ),
}));

vi.mock("@/components/SignInPrompt", () => ({
  SignInPage: ({ context }: { context: string }) => <div data-testid="sign-in">{context}</div>,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import SalarymanOSSettings from "./SalarymanOSSettings";

describe("SALARYMAN OS settings", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authState.isAuthenticated = true;
    window.history.replaceState({}, "", "/settings/os");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("groups game controls, live office locations, and economy topics", () => {
    act(() => root.render(<SalarymanOSSettings />));

    expect(container.querySelector('[data-testid="game-settings-panel"]')?.getAttribute("data-embedded"))
      .toBe("true");
    expect(container.textContent).toContain("SALARYMAN OS");

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("CITY SERVERS"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("MINX CITY");
    expect(container.textContent).toContain("America/Los_Angeles");
    expect(container.textContent).toContain("HUDA CITY");
    expect(container.textContent).toContain("Asia/Ho_Chi_Minh");
    expect(container.querySelectorAll("article")).toHaveLength(2);

    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("ECONOMY & FINANCE"))
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('a[href="/game/economy"]')).not.toBeNull();
    expect(container.querySelector('a[href^="/game/bank?returnTo="]')).not.toBeNull();
    expect(container.querySelector('a[href="/business/accounting"]')).not.toBeNull();
  });

  it("opens the finance topic for legacy economy and banking links", () => {
    window.history.replaceState({}, "", "/settings/os?topic=finance");
    act(() => root.render(<SalarymanOSSettings />));
    expect(container.textContent).toContain("Economy, banking & finance");
    expect(container.querySelector('a[href="/game/economy"]')).not.toBeNull();
  });

  it("requires sign-in before showing SALARYMAN OS settings", () => {
    authState.isAuthenticated = false;
    act(() => root.render(<SalarymanOSSettings />));
    expect(container.querySelector('[data-testid="sign-in"]')?.textContent)
      .toContain("Sign in to manage SALARYMAN OS settings.");
    expect(container.querySelector('[data-testid="game-settings-panel"]')).toBeNull();
  });
});
