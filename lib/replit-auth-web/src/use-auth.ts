import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (returnTo?: string) => void;
  logout: (returnTo?: string) => void;
}

function getBasePath(): string {
  const env = (import.meta as ImportMeta & {
    env?: { BASE_URL?: string };
  }).env;
  return (env?.BASE_URL ?? "/").replace(/\/+$/, "");
}

function apiPath(path: string): string {
  return `${getBasePath()}${path}`;
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return getBasePath() || "/";
  return value;
}

function navigateTopLevel(url: string): void {
  // The app preview is rendered inside an iframe. Replit's auth pages refuse
  // to render when they are navigated inside that frame. Open the OAuth
  // handoff in a normal browser tab so the workspace preview stays intact.
  if (window.top && window.top !== window) {
    const authWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (authWindow) return;
    // A popup blocker may reject the new tab. Preserve the handoff as a
    // last-resort same-window navigation rather than leaving a dead button.
    window.location.assign(url);
    return;
  }
  window.location.assign(url);
}

let authBootstrap: Promise<AuthUser | null> | null = null;

async function loadAuthUser(): Promise<AuthUser | null> {
  if (authBootstrap) return authBootstrap;

  const request = (async () => {
    const retryDelays = [0, 250, 750];
    let lastError: unknown;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
      try {
        const res = await fetch(apiPath("/api/auth/user"), { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { user: AuthUser | null };
          return data.user ?? null;
        }
        lastError = new Error(`HTTP ${res.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Auth bootstrap failed");
  })();

  authBootstrap = request;
  try {
    return await request;
  } finally {
    if (authBootstrap === request) authBootstrap = null;
  }
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadAuthUser()
      .then((nextUser) => {
        if (!cancelled) {
          setUser(nextUser);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((returnTo?: string) => {
    navigateTopLevel(
      `${apiPath("/api/login")}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`,
    );
  }, []);

  const logout = useCallback((returnTo?: string) => {
    navigateTopLevel(
      `${apiPath("/api/logout")}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`,
    );
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}