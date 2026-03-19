import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";

export type Tier = "free" | "pro";

interface PlanData {
  tier: Tier;
  isOwner: boolean;
  isPro: boolean;
  isTrial: boolean;
  trialDaysLeft: number;
  trialHoursLeft: number;
  loading: boolean;
}

export function invalidatePlanCache() {}

export function usePlan(): PlanData {
  const { isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated !== undefined) {
      setLoading(false);
    }
  }, [isAuthenticated]);

  return {
    tier: "pro",
    isOwner: false,
    isPro: true,
    isTrial: false,
    trialDaysLeft: 0,
    trialHoursLeft: 0,
    loading: false,
  };
}
