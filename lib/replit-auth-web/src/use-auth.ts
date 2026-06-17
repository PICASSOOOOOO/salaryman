import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  loginWithDiscord: (returnTo?: string) => void;
  loginWithGithub: (returnTo?: string) => void;
  logout: () => void;
}

function currentBasePath(): string {
  let base = "/";
  try {
    const meta: ImportMeta & { env?: { BASE_URL?: string } } = import.meta;
    if (meta.env?.BASE_URL) base = meta.env.BASE_URL;
  } catch {
    /* non-Vite context */
  }
  return base.replace(/\/+$/, "") || "/";
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Bound the auth probe with a hard timeout. Without it, a stalled
    // /api/auth/user request (e.g. returning to the app after an aborted
    // external OAuth flow, or a flaky network) would leave isLoading=true
    // forever — and every consumer that holds a loading screen behind it (the
    // home front door, protected-route gates) would freeze indefinitely.
    // On timeout we resolve to "logged out": a usable screen always renders,
    // and a real session re-resolves on the next load. This is strictly safer
    // than an unbounded hang.
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      controller?.abort();
      if (!cancelled) {
        setUser(null);
        setIsLoading(false);
      }
    }, 8000);

    fetch("/api/auth/user", {
      credentials: "include",
      signal: controller?.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller?.abort();
    };
  }, []);

  const login = useCallback(() => {
    const base = currentBasePath();
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const loginWithDiscord = useCallback((returnTo?: string) => {
    const dest = returnTo && returnTo.startsWith("/") ? returnTo : currentBasePath();
    window.location.href = `/api/auth/discord?returnTo=${encodeURIComponent(dest)}`;
  }, []);

  const loginWithGithub = useCallback((returnTo?: string) => {
    const dest = returnTo && returnTo.startsWith("/") ? returnTo : currentBasePath();
    window.location.href = `/api/auth/github?returnTo=${encodeURIComponent(dest)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithDiscord,
    loginWithGithub,
    logout,
  };
}
