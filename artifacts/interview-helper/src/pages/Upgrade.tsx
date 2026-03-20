import { motion } from "framer-motion";
import { PicassoLogo } from "@/components/PicassoLogo";
import {
  Zap, CreditCard, Check, Lock, Phone,
  ChevronRight, Loader2, AlertCircle, Mic, Monitor,
  ShoppingBag, Heart, Package, Shield, Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { usePlan, invalidatePlanCache, type FeatureKey } from "@/hooks/use-plan";
import { getDefaultBoomerMode } from "@/hooks/use-mobile";
import { useLocation } from "wouter";

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
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    key: "live_listen",
    icon: Mic,
    label: "ECHO-7 NERVE TAP",
    boomerLabel: "Live Listen",
    codename: "ECHO-7",
    desc: "Real-time audio intercept. AI listens to your meetings and interviews and feeds you responses instantly.",
    boomerDesc: "AI listens to your meetings live and gives you real-time answers and coaching.",
    price: 5,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "screen_scan",
    icon: Monitor,
    label: "OPTIC-9 RETINAL SCANNER",
    boomerLabel: "Screen Scan",
    codename: "OPTIC-9",
    desc: "Military-grade screen capture. Identifies code, languages, and content on your screen automatically.",
    boomerDesc: "AI sees your screen and identifies code, content, and context — no copy-paste needed.",
    price: 5,
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "say_this",
    icon: Zap,
    label: "VOX-4 LARYNX MODULE",
    boomerLabel: "Say This — Live Coaching",
    codename: "VOX-4",
    desc: "Real-time speech coaching. AI tells you exactly what to say during live conversations.",
    boomerDesc: "AI gives you 3 bullet points to read aloud — coaching in real time.",
    price: 5,
    color: "text-purple-400",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/10",
  },
  {
    key: "phone_system",
    icon: Phone,
    label: "TTC",
    boomerLabel: "Phone System",
    codename: "TTC",
    desc: "Unlimited predictive dialing, SMS campaigns, AI call coaching, voicemail, and conference calling for business and marketing partners.",
    boomerDesc: "Unlimited predictive dialing and text messaging for your business. AI call coaching, voicemail, SMS campaigns, and conference calling included.",
    price: 95,
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/10",
  },
];

const FREE_PERKS = [
  "PABLO AI Chat — unlimited conversations",
  "Presentation builder — create slide decks from scratch",
  "Contacts & CRM — save and manage your network",
  "Workspace — projects, notes, and brand settings",
  "Content studio, calendar, documents, and invoices",
  "CIPHER-X — code understanding, problem solving, and interview prep",
  "Hints, approach explanations, and complexity analysis",
  "Hiring tools — job descriptions, interview kits, scorecards",
];

interface ComingSoonItem {
  name: string;
  codename: string;
  desc: string;
  price: string;
  priceNote: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: typeof ShoppingBag;
}

const COSMETIC_ITEMS: ComingSoonItem[] = [
  {
    name: "CRYPTO — Premium Currency",
    codename: "PABLO COIN",
    desc: "The in-game currency of Pablo Corp. Spend CRYPTO on exclusive skins, avatar upgrades, and cosmetic implants in the SALARYMAN world.",
    price: "Starting at $4.99",
    priceNote: "CRYPTO packs",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/10",
    icon: Sparkles,
  },
  {
    name: "Corporate Skin Pack",
    codename: "SKIN-MODULE v1.0",
    desc: "Exclusive avatar skins and visual implant themes. Stand out in the SALARYMAN social environment. First pack includes 5 unique operator looks.",
    price: "50–200 CRYPTO",
    priceNote: "per item",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/10",
    icon: Sparkles,
  },
  {
    name: "UI Theme Implants",
    codename: "CHROME-X VISUAL MODULE",
    desc: "Swap your dashboard color scheme, terminal font, and UI animations. Cosmetic upgrades with zero effect on performance — purely aesthetic dominance.",
    price: "25–100 CRYPTO",
    priceNote: "per theme",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/10",
    icon: Sparkles,
  },
];

const DONATION_ITEMS: ComingSoonItem[] = [
  {
    name: "Pablo's Slush Fund",
    codename: "TIP JAR v1.0",
    desc: "Throw a few dollars into Pablo's slush fund. One-time or recurring. 100% goes toward server costs, feature development, and keeping the lights on at PABLO CORP HQ.",
    price: "$1 – $100+",
    priceNote: "one-time or monthly",
    color: "text-pink-400",
    borderColor: "border-pink-500/30",
    bgColor: "bg-pink-500/10",
    icon: Heart,
  },
  {
    name: "Sustaining Patron",
    codename: "PATRON CLEARANCE",
    desc: "Become a monthly sustaining patron of Pablo Corp. You'll receive a unique patron badge visible in the SALARYMAN social world and early access to experimental features.",
    price: "$5 / month",
    priceNote: "recurring",
    color: "text-pink-400",
    borderColor: "border-pink-500/30",
    bgColor: "bg-pink-500/10",
    icon: Heart,
  },
];

const MERCH_ITEMS: ComingSoonItem[] = [
  {
    name: "PABLO CORP Merch Dept",
    codename: "SUPPLY-CHAIN v1.0",
    desc: "Official PABLO CORP merchandise — shirts, hoodies, mugs, hats. Wear the brand. Ship worldwide from the PABLO CORP fulfillment center.",
    price: "Starting at $24.99",
    priceNote: "physical goods",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/10",
    icon: Package,
  },
  {
    name: "Digital Print Shop",
    codename: "INK-6 PHANTOM SHOP",
    desc: "High-resolution downloadable prints of PABLO CORP propaganda, SALARYMAN system maps, and limited-edition digital art. Instant delivery.",
    price: "$4.99 – $19.99",
    priceNote: "digital download",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/10",
    icon: Package,
  },
];

const BATTLE_PASS_ITEMS: ComingSoonItem[] = [
  {
    name: "Corporate Quarter — Season Pass",
    codename: "BATTLE PASS Q1",
    desc: "Seasonal progression system for SALARYMAN. Complete corporate objectives to unlock exclusive rewards: CRYPTO, skins, titles, and classified intel. Each quarter, a new campaign.",
    price: "$9.99 / quarter",
    priceNote: "per season",
    color: "text-violet-400",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/10",
    icon: Shield,
  },
  {
    name: "Premium Season Pass",
    codename: "EXECUTIVE CLEARANCE PASS",
    desc: "Double the rewards, exclusive executive-tier skins, and priority access to seasonal content before it goes live. The Corporate Quarter, upgraded.",
    price: "$19.99 / quarter",
    priceNote: "premium tier",
    color: "text-violet-400",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/10",
    icon: Shield,
  },
];

type Tab = "subscriptions" | "cosmetics" | "donations" | "merch" | "battle_pass";

const TABS: { key: Tab; label: string; boomerLabel: string; icon: typeof CreditCard }[] = [
  { key: "subscriptions", label: "Modules", boomerLabel: "Subscriptions", icon: CreditCard },
  { key: "cosmetics", label: "Cosmetic Store", boomerLabel: "Cosmetic Store", icon: Sparkles },
  { key: "donations", label: "Tip Jar", boomerLabel: "Donate", icon: Heart },
  { key: "merch", label: "Merch", boomerLabel: "Merchandise", icon: Package },
  { key: "battle_pass", label: "Season Pass", boomerLabel: "Battle Pass", icon: Shield },
];

function ComingSoonCard({ item, index }: { item: ComingSoonItem; index: number }) {
  const Icon = item.icon;
  return (
    <motion.div
      key={item.name}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-2xl border p-5 relative overflow-hidden flex flex-col ${item.borderColor} ${item.bgColor} transition-all`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${item.bgColor} border ${item.borderColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${item.color}`} />
        </div>
        <span className={`text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full ${item.bgColor} ${item.color} border ${item.borderColor}`}>
          COMING SOON
        </span>
      </div>

      <p className={`text-[10px] font-mono tracking-wider uppercase mb-1 ${item.color}`}>
        {item.codename}
      </p>
      <h3 className="text-base font-bold text-foreground mb-1">{item.name}</h3>
      <p className="text-xs text-muted-foreground mb-4 flex-1">{item.desc}</p>

      <div className="flex items-end justify-between mt-auto">
        <div className="flex items-baseline gap-1">
          <span className={`text-lg font-bold ${item.color}`}>{item.price}</span>
          <span className="text-xs text-muted-foreground">· {item.priceNote}</span>
        </div>
        <button
          disabled
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-wide bg-muted/30 text-muted-foreground cursor-not-allowed border border-border"
        >
          Coming Soon
        </button>
      </div>
    </motion.div>
  );
}

export default function Upgrade() {
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [loadingFeature, setLoadingFeature] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("subscriptions");
  const { isAuthenticated, login } = useAuth();
  const { features, isOwner, loading: planLoading } = usePlan();
  const [location] = useLocation();

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
      invalidatePlanCache();
    }
  }, [location]);

  const checkoutSuccess = new URLSearchParams(window.location.search).get("checkout") === "success";
  const checkoutCancelled = new URLSearchParams(window.location.search).get("checkout") === "cancel";
  const activeCount = features.size;

  const handleCheckout = async (feature: FeatureKey) => {
    if (!isAuthenticated) {
      login();
      return;
    }
    setLoadingFeature(feature);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start checkout");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingFeature(null);
    }
  };

  if (planLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-amber-500/5 blur-[160px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-primary/6 blur-[140px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full relative z-10">

        <div className="text-center mb-8 mt-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/8 mb-4">
              <CreditCard className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400">
                {boomerMode ? "Premium Tools" : "Pablo Corp Module Store"}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
              {boomerMode
                ? "Upgrade Your Tools"
                : "Activate Premium Modules"}
            </h1>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              {boomerMode
                ? "Subscribe to individual tools, buy cosmetics, support the project, or grab merch — only pay for what you want."
                : "Each module is independently activated. Browse the full Pablo Corp product catalog below."}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-muted-foreground/40">
              <PicassoLogo size={10} gap={1} />
              <span className="text-[10px] font-mono tracking-widest uppercase">by PICASSO AI</span>
            </div>
          </motion.div>
        </div>

        {isOwner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? "Corporate Admin — Full Access" : "CORP ADMIN — All Modules Unlocked"}
              </p>
              <p className="text-xs text-muted-foreground">
                {boomerMode ? "All tools are active on your account." : "Admin clearance grants access to all classified modules."}
              </p>
            </div>
          </motion.div>
        )}

        {checkoutSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? "Payment received — activating" : "Module Activation Processing"}
              </p>
              <p className="text-xs text-muted-foreground">
                Your subscription is being activated. This may take a moment.
              </p>
            </div>
          </motion.div>
        )}

        {checkoutCancelled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 bg-muted/30 border border-border rounded-2xl px-6 py-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/40 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? "Checkout cancelled" : "Activation cancelled"}
              </p>
              <p className="text-xs text-muted-foreground">No charge was made.</p>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/25 rounded-2xl px-6 py-3 text-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono tracking-wider uppercase transition-all ${
                  isActive
                    ? "bg-foreground text-background font-bold"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-border"
                }`}
              >
                <Icon className="w-3 h-3" />
                {boomerMode ? tab.boomerLabel : tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "subscriptions" && (
          <>
            {activeCount > 0 && !isOwner && (
              <div className="mb-4 text-center">
                <span className="text-xs font-mono text-muted-foreground tracking-wider">
                  {activeCount} module{activeCount !== 1 ? "s" : ""} active
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {FEATURE_CARDS.map((card, i) => {
                const Icon = card.icon;
                const isActive = features.has(card.key);
                const isLoading = loadingFeature === card.key;
                const isPhoneSystem = card.key === "phone_system";

                return (
                  <motion.div
                    key={card.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`rounded-2xl border p-5 relative overflow-hidden flex flex-col ${
                      isActive
                        ? `${card.borderColor} ${card.bgColor}`
                        : "border-border bg-card hover:border-muted-foreground/20"
                    } ${isPhoneSystem && !isActive ? "sm:col-span-2" : ""} transition-all`}
                  >
                    {isPhoneSystem && (
                      <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 blur-[60px] rounded-full pointer-events-none" />
                    )}

                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl ${card.bgColor} border ${card.borderColor} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      {isActive && (
                        <span className={`text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full ${card.bgColor} ${card.color} border ${card.borderColor}`}>
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <p className={`text-[10px] font-mono tracking-wider uppercase mb-1 ${card.color}`}>
                      {boomerMode ? "" : card.codename}
                    </p>
                    <h3 className="text-lg font-bold text-foreground mb-1">
                      {boomerMode ? card.boomerLabel : card.label}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4 flex-1">
                      {boomerMode ? card.boomerDesc : card.desc}
                    </p>

                    <div className="flex items-end justify-between mt-auto">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold ${isActive ? card.color : "text-foreground"}`}>
                          ${card.price}
                        </span>
                        <span className="text-xs text-muted-foreground">/ month</span>
                      </div>

                      {isActive ? (
                        <span className="text-xs text-muted-foreground font-mono">Subscribed</span>
                      ) : (
                        <button
                          onClick={() => handleCheckout(card.key)}
                          disabled={isLoading || loadingFeature !== null}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isPhoneSystem
                              ? "bg-amber-500 hover:bg-amber-400 text-black"
                              : "bg-foreground hover:bg-foreground/80 text-background"
                          }`}
                        >
                          {isLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              {isAuthenticated
                                ? (boomerMode ? "Subscribe" : "Activate")
                                : "Sign In"}
                              <ChevronRight className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card border border-border rounded-2xl p-6 mb-6"
            >
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">
                {boomerMode ? "Already Included — Free Forever" : "Standard Employee Allocation — Always Free"}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-4"
            >
              <p className="text-sm font-bold text-foreground">
                {boomerMode ? "Questions" : "Module FAQ"}
              </p>
              {[
                [
                  boomerMode ? "How does billing work?" : "How are modules billed?",
                  boomerMode
                    ? "Each tool is a separate monthly subscription. Subscribe to one or all — you only pay for what you use. Cancel any tool anytime."
                    : "Each module is an independent monthly subscription. Activate your operational loadout selectively. Termination of any module is immediate per Pablo Corp Clause 7.4.",
                ],
                [
                  boomerMode ? "What do I get for free?" : "What's included for standard employees?",
                  boomerMode
                    ? "AI chat, presentations, contacts/CRM, workspace, content studio, calendar, documents, invoices, hiring tools, and analysis are all free."
                    : "All standard-issue modules: PABLO AI, presentation fabrication, contact registry, workspace terminal, content studio, temporal array, documents, invoice engine, and hiring toolkit.",
                ],
                [
                  boomerMode ? "Can I cancel anytime?" : "What happens if I deactivate a module?",
                  boomerMode
                    ? "Yes — cancel any individual subscription from your Stripe billing portal. No questions asked."
                    : "Module access is revoked immediately. Your data is retained. Pablo Corp does not issue implant removals.",
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
                  {boomerMode ? "Premium tools available above" : "Classified modules sealed — activate to unlock"}
                </p>
              </div>
            )}

            <div className="mt-4 text-center">
              <p className="text-[10px] text-muted-foreground/50 font-mono tracking-wider">
                Subscriptions billed by <span className="text-muted-foreground/70">Picassoo.AI</span> · appears as <span className="text-muted-foreground/70">PICASSO AI LLC</span> on your bank statement
              </p>
            </div>
          </>
        )}

        {activeTab === "cosmetics" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6 bg-cyan-500/10 border border-cyan-500/25 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <p className="text-sm font-bold text-foreground">
                  {boomerMode ? "Cosmetic Store" : "PABLO CORP COSMETIC DIVISION"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {boomerMode
                  ? "Purchase premium currency (CRYPTO) and use it to buy skins, themes, and cosmetic upgrades. No gameplay advantage — pure style."
                  : "Acquire CRYPTO — Pablo Corp's premium currency. Spend it on implant skins, UI themes, and exclusive cosmetic augmentations. Zero tactical advantage. Pure aesthetic dominance."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COSMETIC_ITEMS.map((item, i) => (
                <ComingSoonCard key={item.name} item={item} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "donations" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6 bg-pink-500/10 border border-pink-500/25 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3 mb-2">
                <Heart className="w-4 h-4 text-pink-400" />
                <p className="text-sm font-bold text-foreground">
                  {boomerMode ? "Pablo's Tip Jar" : "PABLO'S SLUSH FUND"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {boomerMode
                  ? "SALARYMAN is built by one person. If it's helped you, consider leaving a tip. One-time or recurring — every bit helps."
                  : "Pablo Corp runs on a skeleton crew and black market server credits. If SALARYMAN has served you well, consider contributing to the slush fund. Funds are used at Pablo's sole discretion."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DONATION_ITEMS.map((item, i) => (
                <ComingSoonCard key={item.name} item={item} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "merch" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6 bg-orange-500/10 border border-orange-500/25 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-4 h-4 text-orange-400" />
                <p className="text-sm font-bold text-foreground">
                  {boomerMode ? "Official Merchandise" : "PABLO CORP MERCH DEPT"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {boomerMode
                  ? "Official SALARYMAN and Pablo Corp merchandise. Shirts, hoodies, hats, and digital prints. Worldwide shipping."
                  : "The official PABLO CORP supply chain. Wear the implant. Ship the brand. Physical goods and digital downloads from the PABLO CORP fulfillment division."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MERCH_ITEMS.map((item, i) => (
                <ComingSoonCard key={item.name} item={item} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "battle_pass" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6 bg-violet-500/10 border border-violet-500/25 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-4 h-4 text-violet-400" />
                <p className="text-sm font-bold text-foreground">
                  {boomerMode ? "Seasonal Battle Pass" : "CORPORATE QUARTER — SEASON PASS"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {boomerMode
                  ? "A seasonal progression system. Complete objectives each quarter to unlock exclusive rewards — cosmetics, CRYPTO, and limited-edition items. New campaign every quarter."
                  : "Each Corporate Quarter brings a new campaign of classified objectives. Complete missions to earn CRYPTO, exclusive implant skins, and limited-access titles. The Executive pass doubles your take."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BATTLE_PASS_ITEMS.map((item, i) => (
                <ComingSoonCard key={item.name} item={item} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        <div className="mt-8 mb-4 flex items-center justify-center gap-1.5 text-muted-foreground/35">
          <PicassoLogo size={10} gap={1} />
          <span className="text-[10px] font-mono tracking-widest uppercase">A PICASSO AI Product</span>
        </div>
      </main>
    </div>
  );
}
