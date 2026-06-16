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

    fetch("/api/auth/user", { credentials: "include" })
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
