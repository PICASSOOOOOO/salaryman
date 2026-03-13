import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";

export type Tier = "free" | "pro";

interface PlanData {
  tier: Tier;
  isOwner: boolean;
  isPro: boolean;
  loading: boolean;
}

const cache: { data: PlanData | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const CACHE_TTL = 60_000;

export function usePlan(): PlanData {
  const { isAuthenticated } = useAuth();
  const [plan, setPlan] = useState<PlanData>({ tier: "free", isOwner: false, isPro: false, loading: true });

  useEffect(() => {
    if (!isAuthenticated) {
      setPlan({ tier: "free", isOwner: false, isPro: false, loading: false });
      return;
    }
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL) {
      setPlan({ ...cache.data, loading: false });
      return;
    }
    fetch("/api/plan")
      .then(r => r.json())
      .then(d => {
        const data: PlanData = {
          tier: d.tier ?? "free",
          isOwner: d.isOwner ?? false,
          isPro: d.tier === "pro" || d.isOwner,
          loading: false,
        };
        cache.data = data;
        cache.fetchedAt = Date.now();
        setPlan(data);
      })
      .catch(() => setPlan({ tier: "free", isOwner: false, isPro: false, loading: false }));
  }, [isAuthenticated]);

  return plan;
}
