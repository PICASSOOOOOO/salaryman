import { motion } from "framer-motion";
import { Check, MessageSquare, Mic, Monitor, Presentation, Users, LayoutDashboard, Code2, Lightbulb } from "lucide-react";
import { PABLO_PRODUCTS } from "@/lib/product-names";
import { getDefaultBoomerMode } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";

const ALL_FEATURES_NORMAL = [
  { icon: MessageSquare, label: `${PABLO_PRODUCTS.PABLO_AI_PRO.name} — ${PABLO_PRODUCTS.PABLO_AI_PRO.desc}` },
  { icon: Mic, label: `${PABLO_PRODUCTS.SAY_THIS.name} — ${PABLO_PRODUCTS.SAY_THIS.desc}` },
  { icon: Lightbulb, label: `${PABLO_PRODUCTS.GET_HINT.short}, ${PABLO_PRODUCTS.FULL_SOLUTION.short}, ${PABLO_PRODUCTS.EXPLAIN_APPROACH.short}, ${PABLO_PRODUCTS.ANALYZE_COMPLEXITY.short} — Tactical analysis modules` },
  { icon: Mic, label: `${PABLO_PRODUCTS.LIVE_LISTEN.name} — ${PABLO_PRODUCTS.LIVE_LISTEN.desc}` },
  { icon: Monitor, label: `${PABLO_PRODUCTS.SCAN_SCREEN.name} — ${PABLO_PRODUCTS.SCAN_SCREEN.desc}` },
  { icon: Presentation, label: `${PABLO_PRODUCTS.PRESENTER.name} — ${PABLO_PRODUCTS.PRESENTER.desc}` },
  { icon: Users, label: `${PABLO_PRODUCTS.CONTACTS.name} — ${PABLO_PRODUCTS.CONTACTS.desc}` },
  { icon: LayoutDashboard, label: `${PABLO_PRODUCTS.WORKSPACE.name} — ${PABLO_PRODUCTS.WORKSPACE.desc}` },
  { icon: Code2, label: "Interview Solver, Live Listen, Screen Scan — Full augmentation suite" },
];

const ALL_FEATURES_BOOMER = [
  { icon: MessageSquare, label: "AI Chat — ask questions, get help anytime" },
  { icon: Mic, label: "Voice mode — speak and get real-time coaching" },
  { icon: Lightbulb, label: "Hints, solutions, and analysis tools" },
  { icon: Mic, label: "Live meeting listener — AI listens in and helps you respond" },
  { icon: Monitor, label: "Screen reader — AI reads what's on your screen" },
  { icon: Presentation, label: "Slide builder — create presentations from scratch" },
  { icon: Users, label: "Contacts — save and manage your network" },
  { icon: LayoutDashboard, label: "Workspace — projects, notes, and brand settings" },
];

export default function Upgrade() {
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[40%] h-[40%] bg-primary/8 blur-[140px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full relative z-10">
        <div className="text-center mb-10 mt-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
              {boomerMode ? 'Everything is Free' : 'All Features Unlocked'}
            </h1>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              {boomerMode
                ? 'Every feature in SALARYMAN is completely free. No subscription required.'
                : 'Every Pablo Corp augmentation module is available at no cost. The full implant suite is yours.'}
            </p>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mb-8 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {boomerMode ? 'All features included — completely free' : 'Full access granted — all modules unlocked'}
            </p>
            <p className="text-xs text-muted-foreground">No subscription, no payment, no lock-in.</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-6 flex flex-col mb-8">
          <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">
            {boomerMode ? 'EVERYTHING INCLUDED' : 'FULL SUITE — ALL FREE'}
          </p>
          <ul className="space-y-3 flex-1">
            {(boomerMode ? ALL_FEATURES_BOOMER : ALL_FEATURES_NORMAL).map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm text-foreground">
                <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3 h-3 text-primary" />
                </div>
                {label}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <p className="text-sm font-bold text-foreground">Good to know</p>
          {[
            ["Is everything really free?", "Yes. Every feature in SALARYMAN is completely free — no subscription, no credit card, no catch."],
            ["Will this always be free?", "Yes. The full suite is available to all users at no cost."],
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
