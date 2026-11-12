import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Lock, Zap, Clock } from "lucide-react";
import { invalidatePlanCache, usePlan, type FeatureKey } from "@/hooks/use-plan";
import { apiFetch } from "@/lib/api-client";

interface ProGateProps {
  children?: React.ReactNode;
  feature?: string;
  featureKey?: FeatureKey;
  inline?: boolean;
}

export function ProGate({ children, feature, featureKey, inline }: ProGateProps) {
  const { isPro, features, isOwner, trials, loading, loadError } = usePlan();

  const trial = featureKey ? trials.find((t) => t.featureKey === featureKey) : undefined;
  const hasPaidAccess = isOwner || (featureKey ? features.has(featureKey) : isPro);
  const hasAccess = hasPaidAccess || !!trial;

  if (loading) {
    return inline ? (
      <span className="inline-block w-16 h-4 bg-muted/30 rounded animate-pulse" />
    ) : (
      <div className="w-full h-20 rounded-xl bg-muted/10 animate-pulse" />
    );
  }

  if (loadError) {
    const retry = () => invalidatePlanCache();
    return inline ? (
      <button
        type="button"
        onClick={retry}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
      >
        Retry access check
      </button>
    ) : (
      <div role="alert" className="w-full rounded-xl border border-black/15 bg-white p-4 text-sm text-black">
        <p>Couldn’t verify service access, so pricing is not being shown yet.</p>
        <button type="button" onClick={retry} className="mt-3 underline underline-offset-2">
          Retry access check
        </button>
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  const displayName = feature ?? "Premium";
  return <CatalogGate feature={displayName} featureKey={featureKey} inline={inline} />;
}

function CatalogGate({ feature, featureKey, inline }: { feature: string; featureKey?: FeatureKey; inline?: boolean }) {
  const [price, setPrice] = useState<number | undefined>();
  useEffect(() => {
    let cancelled = false;
    setPrice(undefined);
    apiFetch("/api/pledge/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error("Pricing unavailable");
        const data = await response.json();
        const planKey = featureKey === "phone_advanced" ? "phone_system" : featureKey;
        const item = data.items?.find((entry: { subscriptionFeature?: string }) => entry.subscriptionFeature === planKey);
        if (!cancelled && typeof item?.priceUsd === "number" && Number.isFinite(item.priceUsd) && item.priceUsd > 0) setPrice(item.priceUsd);
      })
      .catch(() => { /* Never invent a price when the catalog is unavailable. */ });
    return () => { cancelled = true; };
  }, [featureKey]);
  return <PaidAccessNotice feature={feature} priceUsd={price} inline={inline} />;
}

/** Presentation only: never renders protected children or starts checkout. */
export function PaidAccessNotice({ feature, priceUsd, inline, preview = false }: {
  feature: string; priceUsd?: number; inline?: boolean; preview?: boolean;
}) {
  const [, navigate] = useLocation();
  const price = priceUsd !== undefined ? `USD $${priceUsd.toFixed(2)} / month` : "View current pricing";
  if (inline) {
    return (
      <button
        type="button"
        onClick={() => navigate("/pricing")}
        title={`${feature} — ${price}`}
        className="inline-flex items-center gap-1 text-black underline underline-offset-2"
      >
        <Lock className="w-3 h-3" />
        <span className="text-xs">{price}</span>
      </button>
    );
  }
  return (
    <section className="border border-black/20 bg-white p-4 text-black" aria-label={`${feature} paid access`}>
      <p className="flex items-center gap-2 text-sm font-bold"><Lock className="h-4 w-4" />{feature} — Paid access required</p>
      <p className="mt-2 text-sm">{price}</p>
      <p className="mt-2 text-xs text-black/60">
        {preview ? "Preview only. No payment or access changes." : "Review the plan before subscribing. Opening pricing does not charge you."}
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {!preview && <button type="button" onClick={() => navigate("/pricing")} className="underline underline-offset-2">View pricing</button>}
        <button type="button" onClick={() => navigate("/")} className="underline underline-offset-2">Not now — home</button>
      </div>
    </section>
  );
}

export function ProBadge() {
  const { isPro, isOwner, features } = usePlan();
  if (!isPro && features.size === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-400">
      <Zap className="w-2.5 h-2.5" />
      {isOwner ? "CORP ADMIN" : `${features.size} MODULE${features.size !== 1 ? "S" : ""}`}
    </span>
  );
}

export function TrialBadge({ featureKey }: { featureKey?: FeatureKey }) {
  const { trials } = usePlan();

  const relevantTrials = featureKey
    ? trials.filter((t) => t.featureKey === featureKey)
    : trials;

  if (relevantTrials.length === 0) return null;

  const trial = relevantTrials[0];

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-widest uppercase bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
      <Clock className="w-2.5 h-2.5" />
      {trial.daysLeft} DAY{trial.daysLeft !== 1 ? "S" : ""} LEFT
    </span>
  );
}
