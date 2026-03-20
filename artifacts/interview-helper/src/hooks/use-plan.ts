import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@workspace/replit-auth-web";

export type Tier = "free" | "pro";
export type FeatureKey = "live_listen" | "screen_scan" | "say_this" | "phone_system";

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
  const { isAuthenticated } = useAuth();
  const [plan, setPlan] = useState<PlanData>(_cachedPlan && _cachedForAuth === isAuthenticated ? _cachedPlan : DEFAULT_PLAN);
  const prevAuth = useRef<boolean | undefined>(undefined);

  const fetchPlan = useCallback(async () => {
    if (isAuthenticated === undefined) {
      return;
    }

    if (!isAuthenticated) {
      const p: PlanData = { ...DEFAULT_PLAN, loading: false };
      _cachedPlan = p;
      _cachedForAuth = false;
      setPlan(p);
      return;
    }

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/plan`);
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
      _cachedPlan = p;
      _cachedForAuth = true;
      setPlan(p);
    } catch {
      const p: PlanData = { ...DEFAULT_PLAN, loading: false };
      _cachedPlan = p;
      _cachedForAuth = isAuthenticated;
      setPlan(p);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === undefined) return;

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
  }, [isAuthenticated, fetchPlan]);

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
