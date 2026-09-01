import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";

export type AlphaStatus = "pending" | "approved" | "rejected" | "revoked";
export type AlphaRole = "alpha_tester" | "alpha_dev";

export interface AlphaApplication {
  id: number;
  userId: string;
  role: AlphaRole;
  status: AlphaStatus;
  reason: string;
  experience: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlphaMe {
  applications: AlphaApplication[];
  tester: AlphaApplication | null;
  dev: AlphaApplication | null;
  isApprovedTester: boolean;
  isApprovedDev: boolean;
  isAdmin: boolean;
}

const EMPTY: AlphaMe = {
  applications: [],
  tester: null,
  dev: null,
  isApprovedTester: false,
  isApprovedDev: false,
  isAdmin: false,
};

export function useAlpha() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<AlphaMe>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setData(EMPTY); setLoading(false); return; }
    // Mark loading on every (re)fetch — including auth transitions — so gates
    // that depend on this (e.g. the city GameLock) keep showing a fallback
    // instead of briefly denying authorized users with stale-empty data.
    setLoading(true);
    try {
      const res = await apiFetch("/api/alpha/me", { credentials: "include" });
      if (!res.ok) { setData(EMPTY); return; }
      const json = await res.json();
      setData({
        applications: json.applications ?? [],
        tester: json.tester ?? null,
        dev: json.dev ?? null,
        isApprovedTester: !!json.isApprovedTester,
        isApprovedDev: !!json.isApprovedDev,
        isAdmin: !!json.isAdmin,
      });
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...data, loading, refresh, canSubmitBugs: data.isApprovedTester || data.isApprovedDev || data.isAdmin };
}
