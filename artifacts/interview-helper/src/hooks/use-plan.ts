import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";

export type Tier = "free" | "pro";

const TRIAL_KEY     = "sm_trial_start";
const TRIAL_MS      = 7 * 24 * 60 * 60 * 1000; // 7 days

function getTrialInfo(): { isTrial: boolean; trialDaysLeft: number; trialHoursLeft: number; trialStart: number } {
  let start = parseInt(localStorage.getItem(TRIAL_KEY) ?? "0", 10);
  if (!start) {
    start = Date.now();
    localStorage.setItem(TRIAL_KEY, String(start));
  }
  const elapsed   = Date.now() - start;
  const remaining = Math.max(0, TRIAL_MS - elapsed);
  const isTrial   = remaining > 0;
  const trialDaysLeft  = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  const trialHoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
  return { isTrial, trialDaysLeft, trialHoursLeft, trialStart: start };
}

interface PlanData {
  tier: Tier;
  isOwner: boolean;
  isPro: boolean;
  isTrial: boolean;
  trialDaysLeft: number;
  trialHoursLeft: number;
  loading: boolean;
}

const cache: { data: PlanData | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const CACHE_TTL = 60_000;

export function invalidatePlanCache() {
  cache.data = null;
  cache.fetchedAt = 0;
}

export function usePlan(): PlanData {
  const { isAuthenticated } = useAuth();

  const trialInit = getTrialInfo();
  const [plan, setPlan] = useState<PlanData>({
    tier: "free",
    isOwner: false,
    isPro: trialInit.isTrial,
    isTrial: trialInit.isTrial,
    trialDaysLeft: trialInit.trialDaysLeft,
    trialHoursLeft: trialInit.trialHoursLeft,
    loading: true,
  });

  const checkoutResult = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("checkout")
    : null;

  useEffect(() => {
    if (checkoutResult === "success") {
      invalidatePlanCache();
    }
  }, [checkoutResult]);

  useEffect(() => {
    const trial = getTrialInfo();
    if (!isAuthenticated) {
      setPlan({
        tier: "free",
        isOwner: false,
        isPro: trial.isTrial,
        isTrial: trial.isTrial,
        trialDaysLeft: trial.trialDaysLeft,
        trialHoursLeft: trial.trialHoursLeft,
        loading: false,
      });
      return;
    }

    const skipCache = checkoutResult === "success";
    const now = Date.now();
    if (!skipCache && cache.data && now - cache.fetchedAt < CACHE_TTL) {
      const cached = cache.data;
      setPlan({
        ...cached,
        isPro: cached.tier === "pro" || cached.isOwner || trial.isTrial,
        isTrial: trial.isTrial && cached.tier !== "pro" && !cached.isOwner,
        trialDaysLeft: trial.trialDaysLeft,
        trialHoursLeft: trial.trialHoursLeft,
        loading: false,
      });
      return;
    }
    fetch("/api/plan")
      .then(r => r.json())
      .then(d => {
        const tier: Tier    = d.tier ?? "free";
        const isOwner: boolean = d.isOwner ?? false;
        const alreadyPro    = tier === "pro" || isOwner;
        const data: PlanData = {
          tier,
          isOwner,
          isPro: alreadyPro || trial.isTrial,
          isTrial: trial.isTrial && !alreadyPro,
          trialDaysLeft: trial.trialDaysLeft,
          trialHoursLeft: trial.trialHoursLeft,
          loading: false,
        };
        cache.data = data;
        cache.fetchedAt = Date.now();
        setPlan(data);
      })
      .catch(() => {
        const trial2 = getTrialInfo();
        setPlan({
          tier: "free", isOwner: false,
          isPro: trial2.isTrial,
          isTrial: trial2.isTrial,
          trialDaysLeft: trial2.trialDaysLeft,
          trialHoursLeft: trial2.trialHoursLeft,
          loading: false,
        });
      });
  }, [isAuthenticated, checkoutResult]);

  return plan;
}
