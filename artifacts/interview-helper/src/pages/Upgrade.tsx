import { motion } from "framer-motion";
import { Zap, Check, Lock, MessageSquare, Mic, Monitor, Presentation, Users, LayoutDashboard, Star, Code2, Lightbulb } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { usePlan } from "@/hooks/use-plan";
import { useAuth } from "@workspace/replit-auth-web";

const FREE_ITEMS = [
  { icon: MessageSquare, label: "PABLO AI Chat — ask anything, anytime" },
  { icon: Code2, label: "Decipher & understand any code (via PABLO chat)" },
  { icon: Check, label: "Basic profile & account" },
];

const PRO_ITEMS = [
  { icon: MessageSquare, label: "PABLO AI Pro — priority responses, full memory & business context" },
  { icon: Mic, label: "Say This — instant verbal bullets to speak right now" },
  { icon: Lightbulb, label: "Get Hint, Full Solution, Explain Approach, Analyze Complexity" },
  { icon: Mic, label: "Live Listen — real-time voice coaching" },
  { icon: Monitor, label: "Scan Screen — AI reads your screen" },
  { icon: Presentation, label: "Presenter Mode — AI-powered slides & interviews" },
  { icon: Users, label: "Contacts & CRM — remember everyone you meet" },
  { icon: LayoutDashboard, label: "Workspace — projects, knowledge base, brand kit" },
];

export default function Upgrade() {
  const { isPro, isOwner, loading } = usePlan();
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-primary/8 blur-[140px] rounded-full pointer-events-none" />
      <NavBar />

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-10 mt-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 crt-border" style={{ background: 'rgba(0,255,65,0.06)' }}>
              <Star className="w-3 h-3" style={{ color: '#00ff41' }} />
              <span className="display-text" style={{ fontSize: '0.85rem', color: '#00ff41', letterSpacing: '0.12em' }}>PABLO CORP. — SALARYMAN</span>
            </div>
            <h1 className="display-text mb-3" style={{ fontSize: '2.5rem', color: '#00ff41', textShadow: '0 0 20px rgba(0,255,65,0.5)', letterSpacing: '0.1em' }}>
              ACCESS TIERS
            </h1>
            <p className="max-w-md mx-auto" style={{ color: 'rgba(0,255,65,0.6)', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', letterSpacing: '0.05em' }}>
              Start free with PABLO. Upgrade when you're ready to unlock the full suite.
              No tricks. No hidden fees.
            </p>
          </motion.div>
        </div>

        {/* Already pro banner */}
        {!loading && isPro && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mb-8 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {isOwner ? "You have permanent owner access" : "You're on Pro"}
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
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Free</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">Always free — no card needed</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {FREE_ITEMS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3 text-sm text-foreground">
                  <div className="w-5 h-5 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                  </div>
                  {label}
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 rounded-xl bg-muted/20 border border-border text-center text-sm text-muted-foreground font-medium">
              {!loading && !isPro ? "✓ Your current plan" : "Free tier"}
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
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Pro</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold text-foreground">$29</span>
                <span className="text-muted-foreground text-sm mb-1">/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">Full access to all tools</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {PRO_ITEMS.map(({ icon: Icon, label }) => (
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
                  disabled
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold opacity-60 cursor-not-allowed">
                  <Zap className="w-4 h-4" /> Coming soon — joining picassoo.ai
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Early access?{" "}
                  <a href="mailto:hello@picassoo.ai" className="text-primary underline underline-offset-2">
                    Contact us
                  </a>
                </p>
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
            ["How do I upgrade?", "Payments are launching soon. You can request early access by emailing hello@picassoo.ai."],
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
