import { motion } from "framer-motion";
import { PicassoLogo } from "@/components/PicassoLogo";
import {
  Zap, CreditCard, Check, Lock,
  ChevronRight, Loader2, AlertCircle, Mic,
  Sparkles, Bot,
  Target, MessageSquare, PenTool, Users, Search, Eye, TrendingUp, Globe,
} from "lucide-react";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePlan, invalidatePlanCache, type FeatureKey } from "@/hooks/use-plan";
import { getDefaultBoomerMode } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

interface FeatureCard {
  key: FeatureKey;
  icon: typeof Mic;
  label: string;
  boomerLabel: string;
  codename: string;
  desc: string;
  boomerDesc: string;
  price: number;
  color: string;
  borderColor: string;
  bgColor: string;
  flagship?: boolean;
  skills?: { name: string; desc: string }[];
  channels?: string[];
}

interface UpgradeProps {
  embedded?: boolean;
  onPrimeCheckout?: () => void;
  primeCheckoutLoading?: boolean;
}

const JEAN_CLAW_SKILL_ICONS: Record<string, typeof Target> = {
  'AI Sales Closer': Target,
  'Customer Support': MessageSquare,
  'Content Writer': PenTool,
  'AI Recruiter': Users,
  'LinkedIn Prospector': Search,
  'FB & IG Scout': Eye,
  'Trading Bot': TrendingUp,
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    key: "claw_bot",
    icon: Bot,
    label: "PABLO PRIME",
    boomerLabel: "PABLO PRIME",
    codename: "PABLO PRIME",
    flagship: true,
    desc: "Everything paid, in one subscription. Customize your office, your business, and your digital life. Live Listen, Screen Scan, Say This, the full Phone System with predictive dialer and secretary, plus a curated nine-agent workforce organized across four teams. One price. One platform.",
    boomerDesc: "All premium tools bundled together. Live audio coaching, screen reading, real-time speech help, unlimited business phone, secretary, and a curated nine-agent workforce across four teams — under one subscription. Customize your office, your business, your digital life.",
    price: 149,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
    skills: [
      { name: 'ECHO-7 · Live Listen', desc: 'Real-time audio intercept on meetings & interviews. Feeds you answers as people talk.' },
      { name: 'OPTIC-9 · Screen Scan', desc: 'Military-grade screen capture. Identifies code, content, and context — no copy/paste.' },
      { name: 'VOX-4 · Say This', desc: 'Live speech coaching. Three bullets you can read out loud, mid-conversation.' },
      { name: 'TTC · Phone System', desc: 'Calling, two-way SMS, SMS campaigns, call coaching, voicemail, conference calling, and a default platform toll-free number. Custom numbers are $10 one-time each.' },
      { name: 'Secretary', desc: 'Books your meetings, answers your line, takes messages, and follows up — 24/7.' },
      { name: 'Pablo Call Agent', desc: 'Outbound + inbound voice agent that handles real customer calls in your voice.' },
      { name: 'CORE COMMAND · PABLO', desc: 'Your all-purpose AI business operative for email, schedules, CRM, documents, and Q&A.' },
      { name: 'CORE COMMAND · JEAN CLAW', desc: 'The Bot Factory manager who routes work to the right specialist.' },
      { name: 'CORE COMMAND · RICK', desc: 'Jean Claw’s underboss for scheduling, escalations, and day-to-day operations.' },
      { name: 'THE ACADEMY · KENJI PRIME', desc: 'Prompt engineering coach who helps you get more from Claude and Pablo.' },
      { name: 'FINANCE DESK · VIKTOR PRIME', desc: 'AI CFO for accounting, banking, payroll, tax prep, and Sheets sync.' },
      { name: 'CREATIVE STUDIO · TERRENCE PRIME', desc: 'Music factory for beats, songs, lyrics, and instrumentals.' },
      { name: 'CREATIVE STUDIO · VIVIAN PRIME', desc: 'Social media manager for content, scheduling, engagement, and analytics.' },
      { name: 'CREATIVE STUDIO · REGINA PRIME', desc: 'Content production factory for scripts, shorts, reels, and full productions.' },
      { name: 'CREATIVE STUDIO · DEEPA PRIME', desc: 'Autonomous research engine for intelligence reports, trends, and due diligence.' },
    ],
    channels: ['Telegram', 'WhatsApp', 'Discord', 'Facebook', 'Email', 'LinkedIn', 'Web Chat'],
  },
];

const FREE_PERKS = [
  "PABLO — UNLIMITED CONVERSATIONS",
  "Presentation builder — create slide decks from scratch",
  "Contacts & CRM — save and manage your network",
  "Workspace — projects, notes, and brand settings",
  "Content studio, calendar, documents, and invoices",
  "CIPHER-X — code understanding, problem solving, and interview prep",
  "Hints, approach explanations, and complexity analysis",
  "Hiring tools — job descriptions, interview kits, scorecards",
];

export default function Upgrade({ embedded = false, onPrimeCheckout, primeCheckoutLoading = false }: UpgradeProps) {
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [error] = useState<string | null>(null);
  const { isAuthenticated, login } = useAuth();
  const { features, isOwner, loading: planLoading } = usePlan();
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sm_boomer") setBoomerMode(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    const id = setInterval(() => {
      try {
        setBoomerMode(localStorage.getItem("sm_boomer") === "1");
      } catch {}
    }, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      import("@/soundEngine").then(m => m.sfxRealUsdDeposit?.()).catch(() => {});
      invalidatePlanCache();
    }
  }, [location]);

  const checkoutSuccess = new URLSearchParams(window.location.search).get("checkout") === "success";
  const checkoutCancelled = new URLSearchParams(window.location.search).get("checkout") === "cancel";
  const activeCount = features.size;

  if (planLoading && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className={`${embedded ? "w-full" : "min-h-screen flex flex-col"} bg-background`}>
      {!embedded && <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-amber-500/5 blur-[160px] rounded-full pointer-events-none" />}
      {!embedded && <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-primary/6 blur-[140px] rounded-full pointer-events-none" />}

      <main className={`${embedded ? "p-0" : "flex-1 p-6"} max-w-3xl mx-auto w-full relative z-10`}>

        {!embedded && <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="upgrade-maybe-later"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            ← Maybe Later
          </button>
          <button
            type="button"
            onClick={() => navigate("/pledge")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-mono uppercase tracking-widest text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            Pledge Store →
          </button>
        </div>}

        <div className={`text-center mb-8 ${embedded ? "mt-2" : "mt-6"}`}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/8 mb-4">
              <CreditCard className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400">
                {boomerMode ? t('upgrade.premiumTools') : t('upgrade.moduleStore')}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
              {boomerMode ? t('upgrade.upgradeYourTools') : t('upgrade.activatePremiumModules')}
            </h1>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              {boomerMode ? t('upgrade.subscribeDesc') : t('upgrade.moduleStoreDesc')}
            </p>
            <p className="max-w-md mx-auto text-[11px] text-muted-foreground/60 mt-2 leading-relaxed">
              One subscription. Cosmetics, vehicles, property, passports — all earned or purchased in-game with <span className="text-amber-400 font-semibold">ƒ</span> (FIAT). Nothing else for sale on this page.
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-muted-foreground/40">
              <PicassoLogo size={10} gap={1} />
              <span className="text-[10px] font-mono tracking-widest uppercase">by PICASSO AI</span>
            </div>
          </motion.div>
        </div>

        {isOwner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? t('upgrade.corpAdminFullAccess') : t('upgrade.corpAdminAllUnlocked')}
              </p>
              <p className="text-xs text-muted-foreground">
                {boomerMode ? t('upgrade.allToolsActive') : t('upgrade.adminClearance')}
              </p>
            </div>
          </motion.div>
        )}

        {checkoutSuccess && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 bg-sky-500/10 border border-sky-500/25 rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? t('upgrade.paymentReceived') : t('upgrade.moduleActivating')}
              </p>
              <p className="text-xs text-muted-foreground">{t('upgrade.activationPending')}</p>
            </div>
          </motion.div>
        )}

        {checkoutCancelled && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-6 bg-muted/30 border border-border rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/40 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? t('upgrade.checkoutCancelled') : t('upgrade.activationCancelled')}
              </p>
              <p className="text-xs text-muted-foreground">{t('upgrade.noCharge')}</p>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/25 rounded-2xl px-6 py-3 text-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {activeCount > 0 && !isOwner && (
          <div className="mb-4 text-center">
            <span className="text-xs font-mono text-muted-foreground tracking-wider">
              {t('upgrade.modulesActive', { count: activeCount })}
            </span>
          </div>
        )}

        <div className="mb-4 text-center">
          <span className="text-[9px] font-mono text-sky-500/70 tracking-widest uppercase border border-sky-500/25 bg-sky-500/8 px-2.5 py-1 rounded">
            ALPHA {__BUILD_VERSION__} · early supporter pricing
          </span>
        </div>

        {(() => {
          const flagshipCard = FEATURE_CARDS.find(c => c.flagship);
          if (!flagshipCard) return null;
          const isActive = features.has(flagshipCard.key);
          const isLoading = primeCheckoutLoading;
          return (
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className={`rounded-2xl border relative overflow-hidden mb-8 ${
                isActive
                  ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent"
                  : "border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-emerald-500/[0.01]"
              }`}
            >
              <div className="absolute top-0 left-0 w-72 h-72 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-48 h-48 bg-emerald-500/3 blur-[60px] rounded-full pointer-events-none" />

              <div className="relative z-10 p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-mono tracking-widest uppercase text-emerald-400/80">
                    {boomerMode ? 'FLAGSHIP PRODUCT' : 'FLAGSHIP // RECOMMENDED'}
                  </span>
                  <div className="flex-1 h-px bg-emerald-500/10" />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                      <Bot className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-xl font-bold text-foreground"
                          style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.06em', fontSize: '1.5rem' }}>
                          {boomerMode ? flagshipCard.boomerLabel : flagshipCard.label}
                        </h3>
                        {!boomerMode && (
                          <span className="text-[10px] font-mono tracking-wider text-emerald-400/60">{flagshipCard.codename}</span>
                        )}
                        {isActive && (
                          <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                        {boomerMode ? flagshipCard.boomerDesc : flagshipCard.desc}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-emerald-400">${flagshipCard.price}</span>
                      <span className="text-xs text-muted-foreground">/ {t('upgrade.month')}</span>
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wider">ALL PREMIUM TOOLS · 9 AGENTS · UNLIMITED PHONE*</span>
                  </div>
                </div>

                {flagshipCard.skills && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest"
                        style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                        {boomerMode ? 'Included Agent Skills' : 'AGENT SKILLS // ALL OPERATIONAL'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                      {flagshipCard.skills.map((skill) => {
                        const SkIcon = JEAN_CLAW_SKILL_ICONS[skill.name] || Bot;
                        return (
                          <div key={skill.name}
                            className="flex items-start gap-2.5 p-2.5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03]">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                              <SkIcon className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-foreground uppercase tracking-wider"
                                  style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                                  {skill.name}
                                </span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                              </div>
                              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{skill.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {flagshipCard.channels && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="w-3 h-3 text-emerald-400/60" />
                      <span className="text-[9px] font-mono text-emerald-400/50 uppercase tracking-widest">
                        {boomerMode ? 'Deploy on' : 'DEPLOYMENT CHANNELS'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {flagshipCard.channels.map(ch => (
                        <span key={ch} className="px-2 py-1 rounded-lg text-[10px] font-mono text-muted-foreground/60 border border-emerald-500/10 bg-emerald-500/[0.02] tracking-wider">
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/40 tracking-wider">
                    <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/40" /> Pablo Call Agent</span>
                    <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/40" /> Secretary</span>
                    <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/40" /> All Premium Bots</span>
                    <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500/40" /> Future Agents</span>
                  </div>
                  <div className="flex-1" />
                  {isActive ? (
                    <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> {t('upgrade.subscribed')}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (!isAuthenticated && !onPrimeCheckout) { login(); return; }
                        if (onPrimeCheckout) onPrimeCheckout();
                        else navigate("/pledge?view=prime");
                      }}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          {isAuthenticated
                            ? (boomerMode ? 'Subscribe to PABLO PRIME' : 'ACTIVATE PABLO PRIME')
                            : t('common.signIn')}
                          <ChevronRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-3 text-[9px] font-mono text-muted-foreground/40 tracking-wider">
                  *Fair-use: 3,000 voice minutes / 50,000 messages / 250 SMS per month. Beyond that, soft throttle. No surprise overage charges.
                </p>
              </div>
            </motion.div>
          );
        })()}

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-2xl p-6 mb-6"
        >
          <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">
            {boomerMode ? t('upgrade.alreadyIncluded') : t('upgrade.standardAllocation')}
          </p>
          <ul className="space-y-2">
            {FREE_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-primary/60 shrink-0 mt-0.5" />
                {perk}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <p className="text-sm font-bold text-foreground">
            {boomerMode ? "Questions" : "Module FAQ"}
          </p>
          {[
            [
              boomerMode ? "How does billing work?" : "How is PABLO PRIME billed?",
              "One subscription, $149/month. Everything paid is bundled — Live Listen, Screen Scan, Say This, the full Phone System, and the nine-agent curated workforce. Cancel anytime.",
            ],
            [
              "What about cosmetics, properties, vehicles?",
              "All in-game. Earned through gameplay or purchased with FIAT (ƒ) inside SALARYMAN. There is nothing else to buy on this page — PABLO PRIME is the only frontend purchase.",
            ],
            [
              "What do I get for free?",
              "Chat, presentations, contacts/CRM, workspace, content studio, calendar, documents, invoices, hiring tools, and analysis are all free. Plus access to the SALARYMAN world.",
            ],
            [
              boomerMode ? "Can I cancel anytime?" : "What happens if I deactivate?",
              "Cancel from your Stripe billing portal. Module access is revoked at the end of the billing period. Your data is retained.",
            ],
          ].map(([q, a]) => (
            <div key={q} className="border-t border-border pt-4 first:border-0 first:pt-0">
              <p className="text-xs font-semibold text-foreground mb-1">{q}</p>
              <p className="text-xs text-muted-foreground">{a}</p>
            </div>
          ))}
        </motion.div>

        {activeCount === 0 && !isOwner && (
          <div className="mt-6 flex items-center gap-2 justify-center text-muted-foreground/40">
            <Lock className="w-3 h-3" />
            <p className="text-[10px] font-mono tracking-widest uppercase">
              {boomerMode ? t('upgrade.premiumToolsAbove') : t('upgrade.classifiedModulesSealed')}
            </p>
          </div>
        )}

        <div className="mt-4 text-center space-y-1.5">
          <p className="text-[10px] text-muted-foreground/50 font-mono tracking-wider">
            Subscriptions billed by <span className="text-muted-foreground/70">Picassoo.AI</span> · appears as <span className="text-muted-foreground/70">PICASSO AI LLC</span> on your bank statement
          </p>
          <p className="text-[10px] text-muted-foreground/40 font-mono tracking-wider">
            Built lean — low-compute by design, a minimal data-center footprint, moving on-device over time.
          </p>
        </div>

        <div className="mt-8 mb-4 flex items-center justify-center gap-1.5 text-muted-foreground/35">
          <PicassoLogo size={10} gap={1} />
          <span className="text-[10px] font-mono tracking-widest uppercase">A PICASSO AI Product</span>
        </div>
      </main>
    </div>
  );
}
