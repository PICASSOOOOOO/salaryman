import { useLocation } from "wouter";
import { Lock, Zap } from "lucide-react";
import { usePlan, type FeatureKey } from "@/hooks/use-plan";

interface ProGateProps {
  children?: React.ReactNode;
  feature?: string;
  featureKey?: FeatureKey;
  inline?: boolean;
}

export function ProGate({ children, feature, featureKey, inline }: ProGateProps) {
  const { isPro, features, isOwner, loading } = usePlan();
  const [, navigate] = useLocation();

  if (loading) {
    return inline ? (
      <span className="inline-block w-16 h-4 bg-muted/30 rounded animate-pulse" />
    ) : (
      <div className="w-full h-20 rounded-xl bg-muted/10 animate-pulse" />
    );
  }

  const hasAccess = isOwner || (featureKey ? features.has(featureKey) : isPro);

  if (hasAccess) {
    return <>{children}</>;
  }

  const displayName = feature ?? "Premium";
  const priceHint = featureKey
    ? (featureKey === "phone_system" ? "$95/mo" : "$5/mo")
    : "";

  if (inline) {
    return (
      <span
        onClick={() => navigate("/upgrade")}
        title={`${displayName} — subscription required${priceHint ? ` (${priceHint})` : ""}`}
        className="inline-flex items-center gap-1 cursor-pointer text-amber-400/70 hover:text-amber-400 transition-colors"
      >
        <Lock className="w-3 h-3" />
        <span className="text-[10px] font-mono uppercase tracking-wider">{priceHint || "PRO"}</span>
      </span>
    );
  }

  return (
    <div
      onClick={() => navigate("/upgrade")}
      className="relative rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 cursor-pointer hover:bg-amber-500/8 hover:border-amber-500/30 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-300 mb-0.5">
            {displayName} — Subscription Required{priceHint ? ` (${priceHint})` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            This module requires a separate subscription.{" "}
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

export function TrialBadge() {
  return null;
}
