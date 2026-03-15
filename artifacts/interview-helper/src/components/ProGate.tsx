import { motion } from "framer-motion";
import { Zap, Lock, Clock } from "lucide-react";
import { usePlan } from "../hooks/use-plan";
import { PABLO_PRODUCTS } from "../lib/product-names";

interface ProGateProps {
  children: React.ReactNode;
  feature?: string;
  inline?: boolean;
}

export function ProGate({ children, feature = "This feature", inline = false }: ProGateProps) {
  const { isPro, isTrial, trialDaysLeft, trialHoursLeft, loading } = usePlan();

  if (loading) return <>{children}</>;
  if (isPro) {
    // During trial, render children + a subtle trial countdown ribbon
    if (isTrial) {
      return (
        <div className="relative">
          {children}
          <div
            className="absolute top-0 right-0 flex items-center gap-1 px-2 py-0.5 z-10 pointer-events-none"
            style={{
              background: 'rgba(255,165,0,0.12)',
              border: '1px solid rgba(255,165,0,0.25)',
              fontSize: '0.55rem',
              fontFamily: "'Share Tech Mono', monospace",
              color: 'rgba(255,165,0,0.7)',
              letterSpacing: '0.08em',
            }}
          >
            <Clock className="w-2.5 h-2.5" />
            TRIAL · {trialDaysLeft > 1 ? `${trialDaysLeft}d` : `${trialHoursLeft}h`} LEFT
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  if (inline) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-30 select-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-background/90 backdrop-blur-sm border border-border rounded-xl px-4 py-3 flex items-center gap-2.5 shadow-lg">
            <Lock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">{PABLO_PRODUCTS.PRO_TIER.name} REQUIRED</span>
            <a href="/upgrade" className="text-xs text-primary underline underline-offset-2 font-semibold">Upgrade →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="max-w-sm w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-5">
          <Zap className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">{PABLO_PRODUCTS.PRO_TIER.name} REQUIRED</h3>
        <p className="text-sm text-muted-foreground mb-6">
          <span className="font-semibold text-foreground">{feature}</span> requires {PABLO_PRODUCTS.PRO_TIER.name}.
          Upgrade to unlock {PABLO_PRODUCTS.LIVE_LISTEN.short}, {PABLO_PRODUCTS.SCAN_SCREEN.short}, {PABLO_PRODUCTS.PRESENTER.short}, {PABLO_PRODUCTS.CONTACTS.short}, {PABLO_PRODUCTS.HIRING.short}, and {PABLO_PRODUCTS.WORKSPACE.short}.
        </p>
        <a href="/upgrade"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
          <Zap className="w-4 h-4" /> See upgrade options
        </a>
        <p className="text-xs text-muted-foreground mt-4">PABLO chat is always free, forever.</p>
      </motion.div>
    </div>
  );
}

export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold tracking-wider border border-primary/20 ml-1">
      <Zap className="w-2.5 h-2.5" /> {PABLO_PRODUCTS.PRO_TIER.short}
    </span>
  );
}

export function TrialBadge() {
  const { isTrial, trialDaysLeft, trialHoursLeft } = usePlan();
  if (!isTrial) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold tracking-wider ml-1"
      style={{
        border: '1px solid rgba(255,165,0,0.4)',
        background: 'rgba(255,165,0,0.1)',
        color: 'rgba(255,165,0,0.9)',
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      <Clock className="w-2.5 h-2.5" />
      {trialDaysLeft > 1 ? `${trialDaysLeft}D TRIAL` : `${trialHoursLeft}H LEFT`}
    </span>
  );
}
