import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch } from "@/lib/api-client";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import {
  PixelAgentFace,
  divisionFor,
  DIVISION_ORDER,
  type PixelFaceTheme,
} from "@/components/PixelAgentFace";
import {
  ChevronLeft, Loader2, Crown, Sparkles, Zap, X, ArrowRight, Check, Cpu,
} from "lucide-react";

const PRIME_PAYMENT_LINK = "https://buy.stripe.com/7sYaEZfg3c3h2Kd8CteZ200";

// The most useful / complex specialists — the agents worth showing off first.
// Filtered against the live roster, so a missing slug is simply skipped.
const STRIKE_TEAM_SLUGS = [
  "claw-bot",
  "finance-tracker",
  "lead-gen-bot",
  "seo-bot",
  "music-bot",
  "research-bot",
  "movie-bot",
];

interface Agent {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  priceMonthly: number;
  capabilities: string[];
  featured: boolean;
}

export default function PixelAgents() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch("/api/bots/marketplace/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents((data.items ?? []) as Agent[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const goPrime = useCallback(() => {
    const url = user?.id
      ? `${PRIME_PAYMENT_LINK}?client_reference_id=${encodeURIComponent(user.id)}`
      : PRIME_PAYMENT_LINK;
    window.location.href = url;
  }, [user?.id]);

  const bySlug = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.slug, a);
    return m;
  }, [agents]);

  const hero = bySlug.get("claw-bot") ?? null;

  const strikeTeam = useMemo(() => {
    const picked = STRIKE_TEAM_SLUGS.map((s) => bySlug.get(s)).filter(
      (a): a is Agent => !!a && a.slug !== "claw-bot",
    );
    if (picked.length >= 4) return picked;
    // Fall back to featured non-core agents to fill the bench.
    const extra = agents.filter(
      (a) => a.featured && a.category !== "core" && !picked.includes(a),
    );
    return [...picked, ...extra].slice(0, 6);
  }, [agents, bySlug]);

  const divisions = useMemo(() => {
    const byCat = new Map<string, Agent[]>();
    for (const a of agents) {
      const list = byCat.get(a.category) ?? [];
      list.push(a);
      byCat.set(a.category, list);
    }
    const ordered: { category: string; list: Agent[] }[] = [];
    const seen = new Set<string>();
    for (const cat of DIVISION_ORDER) {
      const list = byCat.get(cat);
      if (list && list.length) {
        ordered.push({ category: cat, list: sortAgents(list) });
        seen.add(cat);
      }
    }
    for (const [cat, list] of byCat) {
      if (!seen.has(cat)) ordered.push({ category: cat, list: sortAgents(list) });
    }
    return ordered;
  }, [agents]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03060c] text-zinc-100">
      <div aria-hidden className="fixed inset-0 z-0 opacity-50 pointer-events-none">
        <PabloNebula3D
          status="idle"
          size={typeof window !== "undefined" ? Math.max(window.innerWidth, window.innerHeight) : 1200}
        />
      </div>
      <div
        aria-hidden
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(3,6,12,.35) 0%, rgba(3,6,12,.88) 80%)" }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/pledge")}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Pledge Store
          </button>
          <button
            onClick={() => navigate("/vending")}
            className="flex items-center gap-1.5 text-xs text-violet-300/80 hover:text-violet-200 transition-colors"
          >
            <Cpu className="w-3.5 h-3.5" /> Open the Factory
          </button>
        </div>

        {/* Hero */}
        <HeroBlock hero={hero} loading={loading} onPrime={goPrime} onOpen={() => hero && setSelected(hero)} />

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-3 my-8">
          <StatChip value={`${agents.length || 78}`} label="Agents" />
          <StatChip value={`${divisions.length || 15}`} label="Divisions" />
          <StatChip value="1" label="Subscription" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-zinc-400 mb-4">The agent roster couldn't be reached right now.</p>
            <button
              onClick={() => void loadRoster()}
              className="px-5 py-2 rounded-lg border border-white/15 hover:border-white/30 text-zinc-200 font-semibold text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Strike team */}
            {strikeTeam.length > 0 && (
              <section className="mb-12">
                <SectionHeading
                  icon={<Zap className="w-4 h-4 text-amber-300" />}
                  title="The Heavy Hitters"
                  sub="Our most capable, most complex specialists — the ones that do the real work."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {strikeTeam.map((a, i) => (
                    <HeavyHitterCard key={a.id} agent={a} index={i} onOpen={() => setSelected(a)} />
                  ))}
                </div>
              </section>
            )}

            {/* Divisions */}
            {divisions.map(({ category, list }) => {
              const d = divisionFor(category);
              return (
                <section key={category} className="mb-11">
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-mono uppercase tracking-widest"
                      style={{ borderColor: `${d.accent}55`, color: d.accent, background: `${d.accent}12` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.accent }} />
                      {d.label}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-600">{list.length} agents</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {list.map((a, i) => (
                      <AgentCard key={a.id} agent={a} index={i} onOpen={() => setSelected(a)} />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Closing CTA */}
            <div className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] to-violet-500/[0.08] p-8 text-center overflow-hidden">
              <Crown className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
                The whole workforce. One subscription.
              </h2>
              <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
                Jean Claw and all {agents.length || 78} pixel agents — sales, trading, creative, finance,
                support, and more — deployed from your Command Deck. $149/mo, cancel anytime.
              </p>
              <button
                onClick={goPrime}
                className="px-7 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors inline-flex items-center gap-2"
              >
                Go Prime — $149/mo <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        <p className="text-center text-[10px] text-zinc-600 mt-8 font-mono">
          Pixel Agents deploy from the Bot Factory. PRIME unlocks the full roster.
        </p>
      </div>

      <AnimatePresence>
        {selected && (
          <AgentModal
            agent={selected}
            onClose={() => setSelected(null)}
            onPrime={goPrime}
            onFactory={() => navigate("/vending")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function sortAgents(list: Agent[]): Agent[] {
  return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
}

function tierLabel(priceMonthly: number): string {
  return priceMonthly > 0 ? `$${priceMonthly}/mo` : "Included with Prime";
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroBlock({
  hero,
  loading,
  onPrime,
  onOpen,
}: {
  hero: Agent | null;
  loading: boolean;
  onPrime: () => void;
  onOpen: () => void;
}) {
  const theme: PixelFaceTheme = divisionFor("core").theme;
  return (
    <div className="relative rounded-3xl border border-emerald-500/25 bg-white/[0.02] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(120% 90% at 18% 0%, rgba(52,211,153,0.14), transparent 60%)" }} />
      <div className="relative grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 p-6 sm:p-8 items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="mx-auto md:mx-0 w-40 h-40 sm:w-48 sm:h-48 rounded-2xl border border-emerald-400/30 bg-black/40 overflow-hidden shadow-[0_0_60px_rgba(52,211,153,0.18)]"
        >
          <PixelAgentFace seed="claw-bot" theme={theme} className="w-full h-full" />
        </motion.div>
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-[10px] font-mono uppercase tracking-widest mb-3">
            <Sparkles className="w-3 h-3" /> Meet the Pixel Agents
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">
            {hero?.name ?? "JEAN CLAW"}
          </h1>
          <p className="text-emerald-300/90 text-sm font-medium mb-3">
            {hero?.tagline ?? "The Boss. 78 bots. One subscription."}
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mb-5">
            {loading
              ? "Booting the workforce…"
              : "Jean Claw runs the Bot Factory. He doesn't do the grunt work — he commands a roster of specialist agents and deploys the right one for every job: closing sales, trading markets, scoring music, writing copy, balancing the books. Meet the team."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onPrime}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors inline-flex items-center gap-2"
            >
              <Crown className="w-4 h-4" /> Unlock all — Go Prime
            </button>
            {hero && (
              <button
                onClick={onOpen}
                className="px-6 py-2.5 rounded-xl border border-white/15 hover:border-white/30 text-zinc-200 font-semibold text-sm transition-colors"
              >
                Meet the Boss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
      <div className="font-mono text-2xl text-zinc-50 tabular-nums leading-none">{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function SectionHeading({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{sub}</p>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────
function HeavyHitterCard({ agent, index, onOpen }: { agent: Agent; index: number; onOpen: () => void }) {
  const d = divisionFor(agent.category);
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      onClick={onOpen}
      className="group text-left rounded-2xl border bg-white/[0.03] p-4 flex gap-4 hover:bg-white/[0.05] transition-colors"
      style={{ borderColor: `${d.accent}33` }}
    >
      <div
        className="shrink-0 w-20 h-20 rounded-xl border bg-black/40 overflow-hidden"
        style={{ borderColor: `${d.accent}44` }}
      >
        <PixelAgentFace seed={agent.slug} theme={d.theme} className="w-full h-full" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-sm truncate">{agent.name}</h3>
        <p className="text-[11px] font-mono uppercase tracking-wide mb-1.5" style={{ color: d.accent }}>
          {d.label}
        </p>
        <p className="text-xs text-zinc-400 leading-snug line-clamp-2 mb-2">{agent.tagline}</p>
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 2).map((c) => (
            <span key={c} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-zinc-300 truncate max-w-[140px]">
              {c}
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

function AgentCard({ agent, index, onOpen }: { agent: Agent; index: number; onOpen: () => void }) {
  const d = divisionFor(agent.category);
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.25) }}
      onClick={onOpen}
      className="group text-left rounded-xl border border-white/10 bg-white/[0.025] p-3 flex flex-col hover:bg-white/[0.05] hover:border-white/20 transition-colors"
    >
      <div
        className="w-full aspect-square rounded-lg border bg-black/40 overflow-hidden mb-2.5"
        style={{ borderColor: `${d.accent}33` }}
      >
        <PixelAgentFace seed={agent.slug} theme={d.theme} className="w-full h-full" />
      </div>
      <h3 className="font-semibold text-[13px] leading-tight truncate">{agent.name}</h3>
      <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2 mt-0.5">{agent.tagline}</p>
    </motion.button>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function AgentModal({
  agent,
  onClose,
  onPrime,
  onFactory,
}: {
  agent: Agent;
  onClose: () => void;
  onPrime: () => void;
  onFactory: () => void;
}) {
  const d = divisionFor(agent.category);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} — ${divisionFor(agent.category).label}`}
        tabIndex={-1}
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-[#070b12] outline-none"
        style={{ borderColor: `${d.accent}44`, boxShadow: `0 0 80px ${d.accent}22` }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-100 hover:border-white/25 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex gap-4 items-center mb-5">
            <div
              className="shrink-0 w-24 h-24 rounded-xl border bg-black/40 overflow-hidden"
              style={{ borderColor: `${d.accent}55`, boxShadow: `0 0 40px ${d.accent}33` }}
            >
              <PixelAgentFace seed={agent.slug} theme={d.theme} className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <span
                className="inline-block px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest mb-1.5"
                style={{ borderColor: `${d.accent}55`, color: d.accent, background: `${d.accent}12` }}
              >
                {d.label}
              </span>
              <h2 className="text-2xl font-bold tracking-tight leading-tight">{agent.name}</h2>
              <p className="text-sm font-medium mt-0.5" style={{ color: d.accent }}>{agent.tagline}</p>
            </div>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed mb-5 whitespace-pre-line">{agent.description}</p>

          {agent.capabilities.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">What it does</h3>
              <div className="space-y-1.5">
                {agent.capabilities.map((c) => (
                  <div key={c} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: d.accent }} /> {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
            <span className="text-xs font-mono text-zinc-400">{tierLabel(agent.priceMonthly)}</span>
            <div className="flex gap-2">
              <button
                onClick={onFactory}
                className="px-4 py-2 rounded-lg border border-white/15 hover:border-white/30 text-zinc-200 font-semibold text-xs transition-colors"
              >
                Open in Factory
              </button>
              <button
                onClick={onPrime}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" /> Deploy via Prime
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
