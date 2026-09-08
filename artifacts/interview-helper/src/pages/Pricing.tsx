import { apiFetch } from '@/lib/api-client';
import { motion } from "framer-motion";
import { Check, ChevronRight, Loader2, Sparkles, Bot, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, invalidatePlanCache } from "@/hooks/use-plan";
import { useLocation } from "wouter";

// Paid services are deliberately separate: Automation Pixel Agents and the
// Twilio-backed Phone System each require their own USD subscription.
const BOT_CATEGORIES = [
  { name: "CORE COMMAND", count: 3, agents: "Pablo · Jean Claw · Rick", color: "#06b6d4" },
  { name: "THE ACADEMY", count: 1, agents: "Kenji Prime", color: "#22d3ee" },
  { name: "FINANCE DESK", count: 1, agents: "Viktor Prime", color: "#a3e635" },
  { name: "CREATIVE STUDIO", count: 4, agents: "Terrence · Vivian · Regina · Deepa", color: "#f472b6" },
];

const PRIME_FEATURES = [
  "ECHO-7 · LIVE LISTEN — REAL-TIME AUDIO INTERCEPT",
  "OPTIC-9 · SCREEN SCAN — READS YOUR SCREEN",
  "VOX-4 · SAY THIS — LIVE SPEECH COACHING",
  "PIXEL AGENTS · 9 CURATED AGENTS · 4 TEAMS",
  "BOT-TO-BOT CHAINING · COMMAND CENTER",
  "ALL FUTURE BOTS & TOOLS INCLUDED",
  "CUSTOMIZE OFFICE · BUSINESS · DIGITAL LIFE",
  "PRIORITY PROCESSING · UNLIMITED TASKS",
  "CANCEL ANYTIME · NO CONTRACTS",
];

export default function Pricing() {
  const { isAuthenticated, login } = useAuth();
  const { features, isOwner, loading } = usePlan();
  const [location, navigate] = useLocation();
  const [checkoutFeature, setCheckoutFeature] = useState<"claw_bot" | "phone_system" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      import("@/soundEngine").then(m => m.sfxRealUsdDeposit?.()).catch(() => {});
      invalidatePlanCache();
    }
  }, [location]);

  const checkoutSuccess = new URLSearchParams(window.location.search).get("checkout") === "success";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06080d" }}>
        <Loader2 className="w-6 h-6 animate-spin text-red-400/40" />
      </div>
    );
  }

  const clawActive = features.has("claw_bot");
  const phoneActive = features.has("phone_system");

  const startCheckout = async (feature: "claw_bot" | "phone_system") => {
    if (!isAuthenticated) { login(); return; }
    setCheckoutFeature(feature);
    try {
      const response = await apiFetch('/api/stripe/create-checkout-session', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ feature }),
      });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Checkout unavailable");
      window.location.assign(body.url);
    } finally {
      setCheckoutFeature(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #06080d 0%, #0a0e1a 50%, #06080d 100%)" }}>
      <div className="max-w-4xl mx-auto px-4 py-12">

        <div className="mb-6">
          <button
            type="button"
            data-testid="pricing-maybe-later"
            onClick={() => navigate("/")}
            style={{ fontFamily: "var(--font-sans)", fontSize: 12, letterSpacing: "0.2em", color: "#94a3b8" }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 hover:border-white/25 hover:text-white transition-colors"
          >
            ← MAYBE LATER
          </button>
        </div>

        <motion.div className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-red-500/30 mb-6"
            style={{ background: "rgba(239,68,68,0.08)" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: "0.3em", color: "#ef4444" }}>
              PRICING
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "clamp(36px, 8vw, 56px)", letterSpacing: "0.08em", color: "#fff", lineHeight: 1.1 }}>
            PAID SERVICES
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#94a3b8", letterSpacing: "0.15em", marginTop: 8 }}>
            AUTOMATION AND PHONE · SEPARATE USD SUBSCRIPTIONS
          </p>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748b", letterSpacing: "0.1em", marginTop: 4 }}>
            CUSTOMIZE YOUR OFFICE · YOUR BUSINESS · YOUR DIGITAL LIFE
          </p>
        </motion.div>

        {checkoutSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-8 rounded-xl border border-emerald-500/30 px-6 py-4 flex items-center gap-3"
            style={{ background: "rgba(16,185,129,0.08)" }}>
            <Check className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-white">SUBSCRIPTION ACTIVATED</p>
              <p style={{ fontSize: 11, color: "#94a3b8" }}>Your bots are being deployed. This may take a moment.</p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border relative overflow-hidden mb-8"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.02) 50%, transparent 100%)",
          }}
        >
          <div className="absolute top-0 left-0 w-80 h-80 rounded-full pointer-events-none" style={{ background: "rgba(239,68,68,0.04)", filter: "blur(80px)" }} />

          <div className="relative z-10 p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.4em", color: "rgba(239,68,68,0.7)" }}>
                FLAGSHIP PRODUCT
              </span>
              <div className="flex-1 h-px" style={{ background: "rgba(239,68,68,0.15)" }} />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <Bot className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 32, letterSpacing: "0.06em", color: "#ef4444", lineHeight: 1 }}>
                    AUTOMATION PIXEL AGENTS
                  </h2>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, maxWidth: 460, lineHeight: 1.5 }}>
                    A curated nine-agent automation workforce managed across four teams. Includes automation tools, bot chaining, and business workflows. The Twilio Phone System is billed separately.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <div className="flex items-baseline gap-1">
                  <span style={{ fontSize: 48, fontWeight: 800, color: "#ef4444", fontFamily: "var(--font-sans)" }}>$149</span>
                  <span style={{ fontSize: 13, color: "#64748b" }}>/MO</span>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.3em", color: "rgba(239,68,68,0.6)" }}>
                  CURATED WORKFORCE · 9 AGENTS · 4 TEAMS
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {BOT_CATEGORIES.map((cat) => (
                  <div key={cat.name} className="rounded-lg p-3"
                    style={{ background: `${cat.color}08`, border: `1px solid ${cat.color}20` }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 20, color: cat.color }}>{cat.count}</div>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: cat.color, letterSpacing: "0.08em", opacity: 0.8 }}>{cat.name}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, lineHeight: 1.35 }}>{cat.agents}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRIME_FEATURES.map((feat) => (
                  <div key={feat} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#e2e8f0", letterSpacing: "0.05em" }}>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {clawActive ? (
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#10b981", letterSpacing: "0.1em" }}>ACTIVE</span>
                </div>
              ) : (
                <button
                  onClick={() => startCheckout("claw_bot")}
                  disabled={checkoutFeature !== null}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all"
                  style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 30px rgba(239,68,68,0.3)" }}
                >
                  {checkoutFeature === "claw_bot" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isAuthenticated ? "SUBSCRIBE IN USD" : "SIGN IN TO SUBSCRIBE"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <span style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--font-sans)", letterSpacing: "0.15em" }}>
                CANCEL ANYTIME · NO CONTRACTS
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-sky-500/25 p-6 sm:p-8 mb-8"
          style={{ background: "linear-gradient(135deg, rgba(14,165,233,.07), rgba(2,6,23,.4))" }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl grid place-items-center border border-sky-500/25 bg-sky-500/10">
                <Phone className="w-6 h-6 text-sky-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-sky-300">TWILIO PHONE SYSTEM</h2>
                <p className="mt-1 text-xs text-slate-400 max-w-xl">
                  Business calling, SMS, phone numbers, call campaigns, recordings, and the AI secretary. Locked until this separate USD subscription is active.
                </p>
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <div><span className="text-4xl font-extrabold text-sky-300">$95</span><span className="text-xs text-slate-500">/MO USD</span></div>
              {phoneActive ? (
                <div className="mt-2 text-sm font-bold text-emerald-400">ACTIVE</div>
              ) : (
                <button type="button" onClick={() => startCheckout("phone_system")}
                  disabled={checkoutFeature !== null}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
                  {checkoutFeature === "phone_system" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isAuthenticated ? "SUBSCRIBE IN USD" : "SIGN IN TO SUBSCRIBE"}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="rounded-xl p-6 mb-8"
          style={{ border: "1px solid #ffffff10", background: "#ffffff04" }}>
          <h3 style={{ fontFamily: "var(--font-sans)", fontSize: 20, color: "#38bdf8", letterSpacing: "0.08em", marginBottom: 12 }}>
            FREE TIER — ALWAYS FREE
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "PABLO — UNLIMITED",
              "PRESENTATION BUILDER",
              "CRM & CONTACTS",
              "WORKSPACE & PROJECTS",
              "CONTENT STUDIO & CALENDAR",
              "DOCUMENTS & INVOICES",
              "SALARYMAN MMO ACCESS",
              "INTERVIEW PREP TOOLS",
            ].map((perk) => (
              <div key={perk} className="flex items-center gap-2">
                <Check className="w-3 h-3 text-sky-400/50 shrink-0" />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#94a3b8", letterSpacing: "0.05em" }}>{perk}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="text-center pb-8">
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#475569", letterSpacing: "0.2em" }}>
            THE SALARYMAN PLATFORM · EARLY ALPHA PRICING
          </p>
        </div>
      </div>
    </div>
  );
}
