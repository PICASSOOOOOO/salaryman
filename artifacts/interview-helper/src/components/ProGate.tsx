import { useEffect } from "react";
import { useLocation } from "wouter";
import { Lock, Zap, Clock } from "lucide-react";
import { invalidatePlanCache, usePlan, type FeatureKey } from "@/hooks/use-plan";

interface ProGateProps {
  children?: React.ReactNode;
  feature?: string;
  featureKey?: FeatureKey;
  inline?: boolean;
}

export function ProGate({ children, feature, featureKey, inline }: ProGateProps) {
  const { isPro, features, isOwner, trials, loading, loadError } = usePlan();
  const [, navigate] = useLocation();

  const trial = featureKey ? trials.find((t) => t.featureKey === featureKey) : undefined;
  const hasPaidAccess = isOwner || (featureKey ? features.has(featureKey) : isPro);
  const hasAccess = hasPaidAccess || !!trial;
  const shouldRedirect = !loading && !loadError && featureKey && !hasAccess && !inline;

  useEffect(() => {
    if (shouldRedirect) {
      navigate("/pricing");
    }
  }, [shouldRedirect, navigate]);

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

  if (shouldRedirect) {
    return null;
  }

  const displayName = feature ?? "Premium";
  if (inline) {
    return (
      <span
        onClick={() => navigate("/pricing")}
        title={`${displayName} — view pricing`}
        className="inline-flex items-center gap-1 cursor-pointer text-amber-400/70 hover:text-amber-400 transition-colors"
      >
        <Lock className="w-3 h-3" />
        <span className="text-[10px] font-mono uppercase tracking-wider">PAID</span>
      </span>
    );
  }

  return (
    <div
      onClick={() => navigate("/pricing")}
      className="relative rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 cursor-pointer hover:bg-amber-500/8 hover:border-amber-500/30 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-300 mb-0.5">
            {displayName} — Paid Access Required
          </p>
          <p className="text-xs text-muted-foreground">
            Choose the service plan that fits your needs. Stripe shows the authoritative price before payment.{" "}
            <span className="text-amber-400/80 group-hover:text-amber-400 underline underline-offset-2 transition-colors">
              View pricing →
            </span>
          </p>
        </div>
        <Zap className="w-4 h-4 text-amber-500/40 shrink-0 group-hover:text-amber-500/70 transition-colors" />
      </div>
    </div>
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
