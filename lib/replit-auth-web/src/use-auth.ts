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

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(apiPath("/api/auth/user"), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
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