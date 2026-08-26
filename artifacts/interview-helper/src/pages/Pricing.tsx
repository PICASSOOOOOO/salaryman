import { motion } from "framer-motion";
import { Check, ChevronRight, Loader2, Sparkles, Bot } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { usePlan, invalidatePlanCache } from "@/hooks/use-plan";
import { useLocation } from "wouter";

// Note: Zap/Mic/Monitor/Phone icons were removed along with the legacy
// à-la-carte ADD_ONS section — PRIME bundles all of those tools now.
// PABLO PRIME — single bundle. Server auto-grants live_listen / screen_scan
// / say_this / phone_system as soon as a user holds claw_bot, so this page
// no longer surfaces them as standalone add-ons.
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
  "TTC · UNLIMITED PHONE + SMS CAMPAIGNS",
  "SECRETARY · 24/7 CALL HANDLING",
  "PABLO CALL AGENT · OUTBOUND VOICE BOT",
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
            PABLO PRIME
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#94a3b8", letterSpacing: "0.15em", marginTop: 8 }}>
            EVERY PREMIUM TOOL · ONE SUBSCRIPTION · $149/MO
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
                    PABLO PRIME
                  </h2>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, maxWidth: 460, lineHeight: 1.5 }}>
                    Every premium tool, one bundle. Live Listen, Screen Scan, Say This, the full Phone System with predictive dialer and secretary, plus a curated nine-agent workforce managed by Jean Claw across four teams. Customize your office, business, and digital life. One subscription unlocks everything — current and future.
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
                  onClick={() => {
                    if (!isAuthenticated) { login(); return; }
                    navigate("/pledge?view=prime");
                  }}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all"
                  style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 30px rgba(239,68,68,0.3)" }}
                >
                  <Sparkles className="w-4 h-4" />
                  {isAuthenticated ? "VIEW PABLO PRIME IN STORE" : "SIGN IN TO SUBSCRIBE"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <span style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--font-sans)", letterSpacing: "0.15em" }}>
                CANCEL ANYTIME · NO CONTRACTS
              </span>
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
