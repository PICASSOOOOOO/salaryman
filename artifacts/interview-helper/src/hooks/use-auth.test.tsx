// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  isLoaded: false,
  isSignedIn: false,
  user: null as null | {
    id: string;
    externalId: string | null;
    primaryEmailAddress: { emailAddress: string } | null;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string;
  },
  signOut: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: clerk.user, isLoaded: clerk.isLoaded }),
  useAuth: () => ({ isSignedIn: clerk.isSignedIn }),
  useClerk: () => ({ signOut: clerk.signOut }),
}));

import { useAuth } from "./use-auth";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let latest: ReturnType<typeof useAuth>;
let root: Root;
let container: HTMLDivElement;

function Probe() {
  latest = useAuth();
  return null;
}

function render() {
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  clerk.isLoaded = false;
  clerk.isSignedIn = false;
  clerk.user = null;
  clerk.signOut.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Clerk-backed useAuth adapter", () => {
  it("uses Clerk's loading and signed-out state without an auth probe", () => {
    render();
    expect(latest.isLoading).toBe(true);
    expect(latest.isAuthenticated).toBe(false);
    expect(latest.user).toBeNull();
  });

  it("exposes the migrated external ID as the local application ID", () => {
    clerk.isLoaded = true;
    clerk.isSignedIn = true;
    clerk.user = {
      id: "user_clerk_native",
      externalId: "legacy-local-id",
      primaryEmailAddress: { emailAddress: "clerk@example.com" },
      firstName: "Clerk",
      lastName: "Bridge",
      imageUrl: "https://example.com/avatar.png",
    };
    render();
    expect(latest.isLoading).toBe(false);
    expect(latest.isAuthenticated).toBe(true);
    expect(latest.user).toMatchObject({
      id: "legacy-local-id",
      email: "clerk@example.com",
      firstName: "Clerk",
      lastName: "Bridge",
    });
  });
});