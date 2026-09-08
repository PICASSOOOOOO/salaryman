import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

export type Tier = "free" | "pro";
export type FeatureKey = "live_listen" | "screen_scan" | "say_this" | "phone_system" | "claw_bot";

export interface TrialInfo {
  featureKey: FeatureKey;
  trialExpiresAt: string;
  daysLeft: number;
}

interface PlanData {
  tier: Tier;
  isOwner: boolean;
  isPro: boolean;
  isTrial?: boolean;
  trialDaysLeft?: number;
  features: Set<FeatureKey>;
  trials: TrialInfo[];
  loading: boolean;
}

let _cachedPlan: PlanData | null = null;
let _cachedForAuth: boolean | undefined = undefined;
let _cacheListeners: Array<() => void> = [];

export function invalidatePlanCache() {
  _cachedPlan = null;
  _cachedForAuth = undefined;
  _cacheListeners.forEach(fn => fn());
}

const DEFAULT_PLAN: PlanData = {
  tier: "free",
  isOwner: false,
  isPro: false,
  features: new Set(),
  trials: [],
  loading: true,
};

export function usePlan(): PlanData {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // While auth is still resolving we must stay in the loading state. useAuth
  // reports isAuthenticated=false (not undefined) during its initial fetch, so
  // keying a plan/gate decision off isAuthenticated alone would briefly treat a
  // logged-in user as free and bounce them to /upgrade on a hard refresh.
  const [plan, setPlan] = useState<PlanData>(
    !authLoading && _cachedPlan && _cachedForAuth === isAuthenticated ? _cachedPlan : DEFAULT_PLAN,
  );
  const prevAuth = useRef<boolean | undefined>(undefined);
  // Monotonic request id: a slow /api/plan response from a prior auth state
  // (e.g. fired right before a login/logout transition) must not overwrite the
  // result of a newer fetch. Only the latest request is allowed to commit.
  const reqIdRef = useRef(0);

  const fetchPlan = useCallback(async () => {
    if (authLoading) {
      return;
    }

    const reqId = ++reqIdRef.current;
    const isStale = () => reqId !== reqIdRef.current;

    if (!isAuthenticated) {
      const p: PlanData = { ...DEFAULT_PLAN, loading: false };
      _cachedPlan = p;
      _cachedForAuth = false;
      if (!isStale()) setPlan(p);
      return;
    }

    try {
      const res = await apiFetch('/api/plan');
      if (!res.ok) throw new Error("plan fetch failed");
      const data = await res.json();
      const featureSet = new Set<FeatureKey>((data.features ?? []) as FeatureKey[]);
      const trials: TrialInfo[] = (data.trials ?? []) as TrialInfo[];
      const tier: Tier = (data.tier as Tier) ?? (featureSet.size > 0 ? "pro" : "free");
      const p: PlanData = {
        tier,
        isOwner: !!data.isOwner,
        isPro: tier === "pro" || !!data.isOwner,
        features: featureSet,
        trials,
        loading: false,
      };
      if (isStale()) return;
      _cachedPlan = p;
      _cachedForAuth = true;
      setPlan(p);
    } catch {
      if (isStale()) return;
      const p: PlanData = { ...DEFAULT_PLAN, loading: false };
      _cachedPlan = p;
      _cachedForAuth = isAuthenticated;
      setPlan(p);
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (authLoading) return;

    const authChanged = prevAuth.current !== isAuthenticated;
    prevAuth.current = isAuthenticated;

    if (authChanged) {
      _cachedPlan = null;
      _cachedForAuth = undefined;
    }

    if (_cachedPlan && _cachedForAuth === isAuthenticated) {
      setPlan(_cachedPlan);
      return;
    }

    fetchPlan();
  }, [isAuthenticated, authLoading, fetchPlan]);

  useEffect(() => {
    const invalidate = () => {
      _cachedPlan = null;
      _cachedForAuth = undefined;
      fetchPlan();
    };
    _cacheListeners.push(invalidate);
    return () => {
      _cacheListeners = _cacheListeners.filter(fn => fn !== invalidate);
    };
  }, [fetchPlan]);

  return plan;
}
