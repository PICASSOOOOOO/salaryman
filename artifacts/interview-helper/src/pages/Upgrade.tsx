import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Check, Lock, MessageSquare, Mic, Monitor, Presentation, Users, LayoutDashboard, Star, Code2, Lightbulb, Clock, Loader2 } from "lucide-react";

import { usePlan } from "@/hooks/use-plan";
import { useAuth } from "@workspace/replit-auth-web";
import { PABLO_PRODUCTS } from "@/lib/product-names";
import { getDefaultBoomerMode } from "@/hooks/use-mobile";

const FREE_ITEMS_NORMAL = [
  { icon: MessageSquare, label: "PABLO AI Chat — ask anything, anytime" },
  { icon: Code2, label: "Decipher & understand any code (via PABLO chat)" },
  { icon: Check, label: "Basic profile & account" },
];
const FREE_ITEMS_BOOMER = [
  { icon: MessageSquare, label: "AI Chat — ask questions, get help anytime" },
  { icon: Code2, label: "Explain or simplify any code or text" },
  { icon: Check, label: "Basic profile & account" },
];

const PRO_ITEMS_NORMAL = [
  { icon: MessageSquare, label: `${PABLO_PRODUCTS.PABLO_AI_PRO.name} — ${PABLO_PRODUCTS.PABLO_AI_PRO.desc}` },
  { icon: Mic, label: `${PABLO_PRODUCTS.SAY_THIS.name} — ${PABLO_PRODUCTS.SAY_THIS.desc}` },
  { icon: Lightbulb, label: `${PABLO_PRODUCTS.GET_HINT.short}, ${PABLO_PRODUCTS.FULL_SOLUTION.short}, ${PABLO_PRODUCTS.EXPLAIN_APPROACH.short}, ${PABLO_PRODUCTS.ANALYZE_COMPLEXITY.short} — Tactical analysis modules` },
  { icon: Mic, label: `${PABLO_PRODUCTS.LIVE_LISTEN.name} — ${PABLO_PRODUCTS.LIVE_LISTEN.desc}` },
  { icon: Monitor, label: `${PABLO_PRODUCTS.SCAN_SCREEN.name} — ${PABLO_PRODUCTS.SCAN_SCREEN.desc}` },
  { icon: Presentation, label: `${PABLO_PRODUCTS.PRESENTER.name} — ${PABLO_PRODUCTS.PRESENTER.desc}` },
  { icon: Users, label: `${PABLO_PRODUCTS.CONTACTS.name} — ${PABLO_PRODUCTS.CONTACTS.desc}` },
  { icon: LayoutDashboard, label: `${PABLO_PRODUCTS.WORKSPACE.name} — ${PABLO_PRODUCTS.WORKSPACE.desc}` },
];
const PRO_ITEMS_BOOMER = [
  { icon: MessageSquare, label: "Advanced AI Chat — smarter, faster answers" },
  { icon: Mic, label: "Voice mode — speak and get real-time coaching" },
  { icon: Lightbulb, label: "Hints, solutions, and analysis tools" },
  { icon: Mic, label: "Live meeting listener — AI listens in and helps you respond" },
  { icon: Monitor, label: "Screen reader — AI reads what's on your screen" },
  { icon: Presentation, label: "Slide builder — create presentations from scratch" },
  { icon: Users, label: "Contacts — save and manage your network" },
  { icon: LayoutDashboard, label: "Workspace — projects, notes, and brand settings" },
];

export default function Upgrade() {
  const { isPro, isOwner, isTrial, trialDaysLeft, trialHoursLeft, loading } = usePlan();
  const { isAuthenticated, login } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const checkoutResult = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("checkout")
    : null;

  async function handleUpgrade() {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.error || "Failed to start checkout");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-primary/8 blur-[140px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-10 mt-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 rounded-full border border-primary/25 bg-primary/8">
              <Star className="w-3 h-3 text-primary" />
              <span className="text-xs font-mono tracking-widest text-primary uppercase">PABLO CORP — SALARYMAN</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
              {boomerMode ? 'Plans & Pricing' : 'Product Catalog'}
            </h1>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              {boomerMode ? `Choose the plan that works for you. Free gets you started. Pro unlocks everything.` : `Browse Pablo Corp augmentation modules. ${PABLO_PRODUCTS.FREE_TIER.name} grants basic terminal access. ${PABLO_PRODUCTS.PRO_TIER.name} unlocks the full implant suite.`}
            </p>
          </motion.div>
        </div>

        {checkoutResult === "success" && !loading && isPro && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-300 mb-0.5">
                Payment confirmed — {PABLO_PRODUCTS.PRO_TIER.name} activated
              </p>
              <p className="text-xs text-emerald-400/60">
                All augmentation modules are now unlocked. Welcome to the full suite, salaryman.
              </p>
            </div>
          </motion.div>
        )}

        {checkoutResult === "cancel" && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-amber-500/30 bg-amber-500/15 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300 mb-0.5">
                Checkout cancelled — no changes made
              </p>
              <p className="text-xs text-amber-400/60">
                Your account remains unchanged. You can try again anytime.
              </p>
            </div>
          </motion.div>
        )}

        {/* Trial status banner */}
        {!loading && isTrial && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl border border-amber-500/30 bg-amber-500/15 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300 mb-0.5">
                7-day free trial active — {trialDaysLeft > 1 ? `${trialDaysLeft} days remaining` : `${trialHoursLeft} hours remaining`}
              </p>
              <p className="text-xs text-amber-400/60">
                All augmentation modules active. No payment required during trial. Upgrade before it ends to maintain clearance.
              </p>
            </div>
            <div className="w-[120px] h-1.5 bg-amber-500/15 rounded-full shrink-0 overflow-hidden">
              <div className="h-full bg-amber-500/60 rounded-full transition-all duration-300" style={{ width: `${(trialDaysLeft / 7) * 100}%` }} />
            </div>
          </motion.div>
        )}

        {/* Already pro banner */}
        {!loading && isPro && !isTrial && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-8 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {isOwner ? "Permanent owner clearance granted" : `${PABLO_PRODUCTS.PRO_TIER.name} ACTIVE`}
              </p>
              <p className="text-xs text-muted-foreground">All features are unlocked for your account.</p>
            </div>
          </motion.div>
        )}

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">

          {/* Free */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-card border border-border rounded-2xl p-6 flex flex-col">
            <div className="mb-5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{PABLO_PRODUCTS.FREE_TIER.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">Basic terminal access — no card needed</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {(boomerMode ? FREE_ITEMS_BOOMER : FREE_ITEMS_NORMAL).map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3 text-sm text-foreground">
                  <div className="w-5 h-5 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                  </div>
                  {label}
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 rounded-xl bg-muted/20 border border-border text-center text-sm text-muted-foreground font-medium">
              {!loading && !isPro ? `✓ ${PABLO_PRODUCTS.FREE_TIER.name} ACTIVE` : PABLO_PRODUCTS.FREE_TIER.name}
            </div>
          </motion.div>

          {/* Pro */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-card border-2 border-primary/40 rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold border border-primary/30">
                <Zap className="w-2.5 h-2.5" /> MOST POPULAR
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">{PABLO_PRODUCTS.PRO_TIER.name}</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-foreground">$25</span>
                <span className="text-muted-foreground text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">Full augmentation suite — 7-day free trial, all modules unlocked</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {(boomerMode ? PRO_ITEMS_BOOMER : PRO_ITEMS_NORMAL).map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3 text-sm text-foreground">
                  <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-primary" />
                  </div>
                  {label}
                </li>
              ))}
            </ul>

            {!loading && isPro ? (
              <div className="px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-center text-sm text-emerald-300 font-semibold">
                ✓ Active
              </div>
            ) : !isAuthenticated ? (
              <button onClick={login}
                className="px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity text-center">
                Sign in to upgrade
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
                  {checkoutLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Upgrade to {PABLO_PRODUCTS.PRO_TIER.name}</>
                  )}
                </button>
                {checkoutError && (
                  <p className="text-center text-xs" style={{ color: 'rgba(255,100,100,0.9)' }}>{checkoutError}</p>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* FAQ-style notes */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <p className="text-sm font-bold text-foreground">Good to know</p>
          {[
            ["Will PABLO always be free?", "Yes. PABLO chat is the core of Salaryman and will always be available on the free tier."],
            ["How do I upgrade?", "Click the upgrade button above. You'll be taken to a secure Stripe checkout to complete your subscription."],
            ["Can I cancel anytime?", "Absolutely. No contracts, no lock-in."],
            ["I'm a startup — is there a discount?", "Yes. Reach out and we'll work something out."],
          ].map(([q, a]) => (
            <div key={q} className="border-t border-border pt-4 first:border-0 first:pt-0">
              <p className="text-xs font-semibold text-foreground mb-1">{q}</p>
              <p className="text-xs text-muted-foreground">{a}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
