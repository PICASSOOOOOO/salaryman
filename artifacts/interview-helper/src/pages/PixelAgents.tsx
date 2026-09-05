import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import {
  PixelAgentFace,
  divisionFor,
  DIVISION_ORDER,
  DIVISIONS,
  type PixelFaceTheme,
} from "@/components/PixelAgentFace";
import {
  ChevronLeft, Loader2, Sparkles, Zap, X, Check, Cpu, Lock,
} from "lucide-react";

// Divisions with a baked team banner in the art kit (key: `team_<category>`).
const TEAM_ART = new Set(Object.keys(DIVISIONS));

// The most capable specialists — shown first in the roster.
// Filtered against the live roster, so a missing slug is simply skipped.
const STRIKE_TEAM_SLUGS = [
  "claw-bot",
  "finance-tracker",
  "music-bot",
  "research-bot",
  "movie-bot",
  "social-media-bot",
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

export default function PixelAgents({ embedded = false }: { embedded?: boolean } = {}) {
  const [, navigate] = useLocation();
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
    <div className={embedded ? "relative w-full text-zinc-100" : "relative min-h-screen w-full overflow-x-hidden bg-[#03060c] text-zinc-100"}>
      <FlashStyles />
      {!embedded && (
        <>
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
        </>
      )}

      <div className={embedded ? "relative z-10" : "relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6"}>
        {!embedded && (
          /* Top bar */
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate("/pledge")}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Pledge Store
            </button>
            <button
              onClick={() => navigate("/bots")}
              className="flex items-center gap-1.5 text-xs text-violet-300/80 hover:text-violet-200 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" /> Open Command Center
            </button>
          </div>
        )}

        {/* Hero */}
        <HeroBlock hero={hero} loading={loading} onOpen={() => hero && setSelected(hero)} />

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-3 my-8">
          <StatChip value={`${agents.length || 9}`} label="Agents" />
          <StatChip value={`${divisions.length || 4}`} label="Divisions" />
          <StatChip value="Internal" label="Access" />
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

            {/* Divisions — each team gets its own artwork banner */}
            {divisions.map(({ category, list }) => (
              <TeamSection
                key={category}
                category={category}
                list={list}
                onOpen={setSelected}
              />
            ))}

            {/* Closing CTA — internal access */}
            <div className="relative rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.08] to-sky-500/[0.05] p-8 text-center overflow-hidden">
              <div aria-hidden className="absolute -inset-px rounded-3xl opacity-60 pa-sheen" />
              <Lock className="w-8 h-8 text-violet-300 mx-auto mb-3 relative" />
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 relative">
                Internal access only.
              </h2>
              <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-6 leading-relaxed relative">
                Jean Claw and the full Pixel Agent roster are reserved for Picasso staff and internal testers.
                Deploy your assigned agents from the Command Deck.
              </p>
              <button
                onClick={() => navigate("/bots")}
                className="relative px-7 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors inline-flex items-center gap-2"
              >
                <Cpu className="w-4 h-4" /> Open Command Deck
              </button>
            </div>
          </>
        )}

        <p className="text-center text-[10px] text-zinc-600 mt-8 font-mono">
          Pixel Agents deploy from your Command Deck. Internal access — Picasso staff &amp; testers only.
        </p>
      </div>

      <AnimatePresence>
        {selected && (
          <AgentModal
            agent={selected}
            onClose={() => setSelected(null)}
            onFactory={() => navigate("/bots")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function sortAgents(list: Agent[]): Agent[] {
  return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
}

function InternalBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-100 whitespace-nowrap ${className}`}
      style={{
        background: "linear-gradient(135deg,#7c3aed,#6d28d9 45%,#4f46e5)",
        boxShadow: "0 0 10px rgba(109,40,217,0.4)",
      }}
    >
      <Lock className="w-2.5 h-2.5" /> Internal
    </span>
  );
}

// What each division does, and why deploying the squad together is stronger.
const TEAM_BLURB: Record<string, string> = {
  core: "Command and coordination — these agents run the operation and route every job to the right specialist.",
  automation: "Growth on autopilot — they build funnels, chase leads, and scale outreach around the clock.",
  business: "Dealmakers — they prospect, pitch, negotiate, and close new business.",
  finance: "The money desk — they track cash, trade markets, and keep the books balanced.",
  creative: "The studio — they write, design, score music, and produce content on demand.",
  professional: "Legal & professional services — contracts, compliance, and expert paperwork, handled.",
  ecommerce: "The storefront crew — listings, pricing, orders, and fulfilment.",
  trades: "Field & service ops — quotes, scheduling, and on-the-ground jobs.",
  publishing: "The newsroom — long-form writing, editing, and publishing at scale.",
  education: "The academy — they teach, tutor, and build curriculum.",
  productivity: "Ops & admin — they organize, schedule, and keep everything moving.",
  healthcare: "The health bay — intake, triage, and patient-facing support.",
  personal: "Lifestyle concierge — they plan, book, and handle the personal stuff.",
  insurance: "Risk & coverage — quotes, claims, and policy guidance.",
  gaming: "The game crew — they build, balance, and run interactive worlds.",
};

// Page-scoped keyframes for the "flash" effects (sheen sweep, slow drift glow).
function FlashStyles() {
  return (
    <style>{`
      @keyframes pa-sweep { 0% { transform: translateX(-130%) skewX(-12deg); } 100% { transform: translateX(230%) skewX(-12deg); } }
      @keyframes pa-drift { 0%,100% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.12); } }
      @keyframes pa-pulse { 0%,100% { opacity: .35; } 50% { opacity: .85; } }
      .pa-sheen { background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.10) 50%, transparent 70%); background-size: 220% 100%; animation: pa-sweep 5.5s linear infinite; }
      @media (prefers-reduced-motion: reduce) { .pa-sheen { animation: none; } }
    `}</style>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroBlock({
  hero,
  loading,
  onOpen,
}: {
  hero: Agent | null;
  loading: boolean;
  onOpen: () => void;
}) {
  const theme: PixelFaceTheme = divisionFor("core").theme;
  return (
    <div className="relative rounded-3xl border border-emerald-500/25 bg-white/[0.02] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(120% 90% at 18% 0%, rgba(52,211,153,0.14), transparent 60%)" }} />
      <div aria-hidden className="absolute inset-0 pointer-events-none pa-sheen opacity-50" />
      <div className="relative grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 p-6 sm:p-8 items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="relative mx-auto md:mx-0 w-40 h-40 sm:w-48 sm:h-48"
        >
          {/* Rotating conic glow halo behind the boss */}
          <div
            aria-hidden
            className="absolute -inset-4 rounded-full blur-2xl"
            style={{
              background: "conic-gradient(from 0deg, rgba(52,211,153,0.45), rgba(167,139,250,0.35), rgba(52,211,153,0.45))",
              animation: "pa-drift 14s linear infinite",
            }}
          />
          <div className="relative w-full h-full rounded-2xl border border-emerald-400/30 bg-black/40 overflow-hidden shadow-[0_0_60px_rgba(52,211,153,0.18)]">
            <PixelAgentFace seed="claw-bot" theme={theme} className="w-full h-full" />
          </div>
        </motion.div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-[10px] font-mono uppercase tracking-widest">
              <Sparkles className="w-3 h-3" /> Meet the Pixel Agents
            </span>
            <InternalBadge />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">
            {hero?.name ?? "JEAN CLAW"}
          </h1>
          <p className="text-emerald-300/90 text-sm font-medium mb-3">
            {hero?.tagline ?? "The Boss. A curated team of pixel agents. Internal only."}
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mb-5">
            {loading
              ? "Booting the workforce…"
              : "Jean Claw runs Pixel Agents. He doesn't do the grunt work — he commands a handpicked team of specialist agents and deploys the right one for every job: scoring music, writing copy, researching markets, balancing the books. The roster is reserved for Picasso staff and internal testers."}
          </p>
          <div className="flex flex-wrap gap-3">
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center overflow-hidden"
    >
      <div aria-hidden className="absolute inset-0 pa-sheen opacity-40" />
      <div className="relative font-mono text-2xl text-zinc-50 tabular-nums leading-none">{value}</div>
      <div className="relative text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-1">{label}</div>
    </motion.div>
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

// ─── Team section (banner artwork + roster grid) ───────────────────────────────
function TeamSection({
  category,
  list,
  onOpen,
}: {
  category: string;
  list: Agent[];
  onOpen: (a: Agent) => void;
}) {
  const d = divisionFor(category);
  return (
    <section className="mb-12">
      <TeamBanner category={category} label={d.label} accent={d.accent} count={list.length} sample={list} />
      <p className="text-xs text-zinc-400 leading-relaxed mt-3 mb-1 max-w-3xl">
        {TEAM_BLURB[category] ?? "A specialist squad of Prime agents."}{" "}
        <span className="text-zinc-500">Deploy the whole team — they share context and hand off work to each other, so the squad hits far harder than any single bot.</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {list.map((a, i) => (
          <AgentCard key={a.id} agent={a} index={i} onOpen={() => onOpen(a)} />
        ))}
      </div>
    </section>
  );
}

function TeamBanner(props: {
  category: string;
  label: string;
  accent: string;
  count: number;
  sample: Agent[];
}) {
  // Only divisions with a baked banner poll for art; others render placeholder-only.
  return TEAM_ART.has(props.category) ? (
    <TeamBannerArt {...props} />
  ) : (
    <TeamBannerBody {...props} art={null} />
  );
}

function TeamBannerArt(props: {
  category: string;
  label: string;
  accent: string;
  count: number;
  sample: Agent[];
}) {
  const art = useArtAsset(`team_${props.category}`, 4000, { retryOnFail: true });
  return <TeamBannerBody {...props} art={art} />;
}

function TeamBannerBody({
  category,
  label,
  accent,
  count,
  sample,
  art,
}: {
  category: string;
  label: string;
  accent: string;
  count: number;
  sample: Agent[];
  art: string | null;
}) {
  const faces = sample.slice(0, 4);
  const theme = divisionFor(category).theme;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ type: "spring", damping: 24, stiffness: 180 }}
      className="relative h-32 sm:h-40 rounded-2xl overflow-hidden border"
      style={{ borderColor: `${accent}55`, boxShadow: `0 0 50px ${accent}1f` }}
    >
      {/* Art or animated themed placeholder */}
      <AnimatePresence>
        {art ? (
          <motion.img
            key="art"
            src={art}
            alt={`${label} division`}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            key="ph"
            aria-hidden
            className="absolute inset-0"
            style={{ background: `radial-gradient(120% 140% at 15% 0%, ${accent}40, transparent 55%), linear-gradient(120deg, ${accent}22, #05080f 70%)` }}
          >
            <div className="absolute inset-0" style={{ animation: "pa-pulse 3.2s ease-in-out infinite", background: `radial-gradient(80% 120% at 85% 100%, ${accent}33, transparent 60%)` }} />
          </div>
        )}
      </AnimatePresence>

      {/* Readability + accent wash */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgba(3,6,12,0.92) 0%, rgba(3,6,12,0.55) 45%, rgba(3,6,12,0.15) 100%)` }} />
      <div className="absolute inset-0" style={{ background: `linear-gradient(0deg, rgba(3,6,12,0.85), transparent 60%)` }} />
      <div aria-hidden className="absolute inset-0 pa-sheen opacity-60" />
      <div aria-hidden className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <InternalBadge className="absolute top-3 right-3 z-10" />

      {/* Content */}
      <div className="relative h-full flex items-center justify-between gap-3 px-5 sm:px-6">
        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-[0.25em] mb-2"
            style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
            Division
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            {label}
          </h2>
          <p className="text-[11px] font-mono mt-1.5" style={{ color: accent }}>
            {count} {count === 1 ? "agent" : "agents"} on the team
          </p>
        </div>

        {/* Team face roster preview */}
        <div className="hidden sm:flex items-center -space-x-2 shrink-0">
          {faces.map((a, i) => (
            <div
              key={a.id}
              className="w-12 h-12 rounded-lg border bg-black/50 overflow-hidden shadow-lg"
              style={{ borderColor: `${accent}66`, zIndex: faces.length - i }}
            >
              <PixelAgentFace seed={a.slug} theme={theme} className="w-full h-full" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
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
      whileHover={{ y: -3 }}
      onClick={onOpen}
      className="group relative text-left rounded-2xl border bg-white/[0.03] p-4 flex gap-4 hover:bg-white/[0.06] transition-colors overflow-hidden"
      style={{ borderColor: `${d.accent}33` }}
    >
      <div aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `inset 0 0 30px ${d.accent}22`, borderRadius: "1rem" }} />
      <InternalBadge className="absolute top-3 right-3 z-10" />
      <div
        className="relative shrink-0 w-20 h-20 rounded-xl border bg-black/40 overflow-hidden transition-transform group-hover:scale-105"
        style={{ borderColor: `${d.accent}44`, boxShadow: `0 0 20px ${d.accent}22` }}
      >
        <PixelAgentFace seed={agent.slug} theme={d.theme} className="w-full h-full" />
      </div>
      <div className="relative min-w-0 flex-1">
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
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: Math.min(index * 0.025, 0.25) }}
      whileHover={{ y: -3, scale: 1.02 }}
      onClick={onOpen}
      className="group relative text-left rounded-xl border border-white/10 bg-white/[0.025] p-3 flex flex-col hover:bg-white/[0.06] transition-colors overflow-hidden"
      style={{ outline: "1px solid transparent" }}
    >
      <div
        className="relative w-full aspect-square rounded-lg border bg-black/40 overflow-hidden mb-2.5 transition-shadow group-hover:shadow-[0_0_22px_var(--pa-glow)]"
        style={{ borderColor: `${d.accent}33`, ["--pa-glow" as string]: `${d.accent}55` }}
      >
        <PixelAgentFace seed={agent.slug} theme={d.theme} className="w-full h-full" />
        <InternalBadge className="absolute top-1.5 right-1.5" />
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
  onFactory,
}: {
  agent: Agent;
  onClose: () => void;
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
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400">
              <InternalBadge /> access
            </span>
            <div className="flex gap-2">
              <button
                onClick={onFactory}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <Cpu className="w-3.5 h-3.5" /> Deploy in Command Deck
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
