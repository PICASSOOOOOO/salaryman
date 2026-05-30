import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS, type TTSHandle } from "@/lib/tts";
import { PabloNebula3D, type NebulaStatus } from "@/components/PabloNebula3D";
import {
  Bot as BotIcon, Plus, Volume2, Square, Loader2, Building2,
  Sparkles, Activity, ChevronLeft, Trash2, Radio,
} from "lucide-react";

interface DeckBot {
  id: number;
  name: string;
  personality: string;
  status: string;
}

interface ProjectLog {
  id: number;
  kind: string;
  message: string;
  createdAt: string;
}

interface AgentProject {
  id: number;
  name: string;
  goal: string;
  status: string;
  progressPct: number;
  assignedBotId: number | null;
  officeLabel: string;
  lastBriefing: string;
  updatedAt: string;
  logs: ProjectLog[];
}

const STATUSES = ["planning", "building", "review", "live", "paused"] as const;

const STATUS_STYLE: Record<string, string> = {
  planning: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  building: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  review: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  live: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  paused: "text-zinc-400 border-zinc-500/40 bg-zinc-500/10",
};

export default function PabloDeck() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [bots, setBots] = useState<DeckBot[]>([]);
  const [projects, setProjects] = useState<AgentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [nebulaStatus, setNebulaStatus] = useState<NebulaStatus>("idle");
  const [briefing, setBriefing] = useState<string>("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const ttsRef = useRef<TTSHandle | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [fName, setFName] = useState("");
  const [fGoal, setFGoal] = useState("");
  const [fOffice, setFOffice] = useState("");
  const [fBot, setFBot] = useState<number | "">("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bRes, pRes] = await Promise.all([
        apiFetch("/api/bots"),
        apiFetch("/api/agent-projects"),
      ]);
      if (bRes.ok) {
        const data = await bRes.json();
        setBots((data.bots ?? []).map((b: any) => ({ id: b.id, name: b.name, personality: b.personality, status: b.status })));
      }
      if (pRes.ok) {
        const data = await pRes.json();
        setProjects(data.projects ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => { ttsRef.current?.cancel?.(); }, []);

  const createProject = async () => {
    if (!fName.trim() || !fOffice.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/agent-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName.trim(),
          goal: fGoal.trim(),
          officeLabel: fOffice.trim(),
          assignedBotId: fBot === "" ? null : fBot,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects((prev) => [data.project, ...prev]);
        setFName(""); setFGoal(""); setFOffice(""); setFBot("");
        setShowForm(false);
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  const patchProject = async (id: number, updates: Partial<AgentProject>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    try {
      const res = await apiFetch(`/api/agent-projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) load();
    } catch { load(); }
  };

  const deleteProject = async (id: number) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await apiFetch(`/api/agent-projects/${id}`, { method: "DELETE" });
      if (!res.ok) load();
    } catch { load(); }
  };

  const stopSpeaking = () => {
    ttsRef.current?.cancel?.();
    ttsRef.current = null;
    setSpeaking(false);
    setNebulaStatus("idle");
  };

  const hearBriefing = async () => {
    if (speaking) { stopSpeaking(); return; }
    setBriefingLoading(true);
    setNebulaStatus("thinking");
    try {
      const res = await apiFetch("/api/agent-projects/briefing", { method: "POST" });
      const data = res.ok ? await res.json() : null;
      const text: string = data?.briefing ?? "I've got nothing to report yet, boss.";
      setBriefing(text);
      setBriefingLoading(false);
      setSpeaking(true);
      setNebulaStatus("speaking");
      ttsRef.current = speakWithTTS(
        text,
        () => { setSpeaking(false); setNebulaStatus("idle"); ttsRef.current = null; },
        () => { setSpeaking(false); setNebulaStatus("idle"); ttsRef.current = null; },
        { character: "PABLO" },
      );
    } catch {
      setBriefingLoading(false);
      setNebulaStatus("idle");
    }
  };

  const botName = (id: number | null) => (id == null ? null : bots.find((b) => b.id === id)?.name ?? null);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-zinc-200 flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-mono text-lg mb-4">PABLO COMMAND DECK</p>
          <p className="text-zinc-400 mb-6">Sign in to deploy your agents.</p>
          <button onClick={() => navigate("/pablo")} className="px-5 py-2 rounded-md bg-violet-600 hover:bg-violet-500 font-mono text-sm">ENTER →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black text-zinc-100 overflow-x-hidden">
      {/* Living nebula backdrop */}
      <div className="fixed inset-0 z-0 opacity-60 pointer-events-none">
        <PabloNebula3D status={nebulaStatus} size={typeof window !== "undefined" ? Math.max(window.innerWidth, window.innerHeight) : 1200} />
      </div>
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85 pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/world")} className="p-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10" aria-label="Back">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-mono text-xl sm:text-2xl tracking-wider flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-300" /> PABLO COMMAND DECK
            </h1>
            <p className="text-xs text-zinc-400 font-mono">Deploy your agents. Build your empire. Hear the report.</p>
          </div>
        </div>

        {/* Briefing bar */}
        <div className="mb-6 rounded-xl border border-violet-500/30 bg-black/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={hearBriefing}
              disabled={briefingLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 font-mono text-sm transition"
            >
              {briefingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : speaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {briefingLoading ? "PABLO IS THINKING…" : speaking ? "STOP" : "HEAR PABLO'S BRIEFING"}
            </button>
            <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
              <Radio className={`w-3.5 h-3.5 ${speaking ? "text-fuchsia-400 animate-pulse" : "text-zinc-600"}`} />
              {speaking ? "ON AIR" : "standby"}
            </span>
          </div>
          <AnimatePresence>
            {briefing && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 text-sm text-zinc-200 leading-relaxed italic border-l-2 border-fuchsia-500/50 pl-3"
              >
                “{briefing}”
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Agent roster */}
        <div className="mb-6">
          <h2 className="font-mono text-xs text-zinc-400 mb-2 flex items-center gap-1"><BotIcon className="w-3.5 h-3.5" /> YOUR AGENTS ({bots.length})</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {bots.length === 0 && (
              <button onClick={() => navigate("/bots")} className="text-xs font-mono text-violet-300 hover:text-violet-200 px-3 py-2 rounded-md border border-dashed border-violet-500/40">
                + Hire your first agent
              </button>
            )}
            {bots.map((b) => (
              <div key={b.id} className="flex-shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 min-w-[120px]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${b.status === "active" ? "bg-emerald-400" : b.status === "error" ? "bg-red-400" : "bg-zinc-500"}`} />
                  <span className="font-mono text-sm truncate">{b.name}</span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate">{b.personality}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-xs text-zinc-400 flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> VENTURES ({projects.length})</h2>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 font-mono text-xs">
            <Plus className="w-3.5 h-3.5" /> NEW VENTURE
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-xl border border-emerald-500/30 bg-black/60 backdrop-blur-sm p-4 space-y-3 overflow-hidden"
            >
              <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Venture name (e.g. CashFlow App)" className="w-full bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-violet-500/60 outline-none" />
              <textarea value={fGoal} onChange={(e) => setFGoal(e.target.value)} placeholder="What should the agents build? (the goal)" rows={2} className="w-full bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-violet-500/60 outline-none resize-none" />
              <div>
                <label className="text-[11px] text-amber-300 font-mono flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" /> OFFICE / PROPERTY (required — every venture pays rent)</label>
                <input value={fOffice} onChange={(e) => setFOffice(e.target.value)} placeholder="e.g. Suite 4B, Minx Tower" className="w-full bg-black/50 border border-amber-500/30 rounded-md px-3 py-2 text-sm font-mono focus:border-amber-500/60 outline-none" />
              </div>
              <select value={fBot} onChange={(e) => setFBot(e.target.value === "" ? "" : Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm font-mono outline-none">
                <option value="">Assign an agent (optional)</option>
                {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={createProject} disabled={creating || !fName.trim() || !fOffice.trim()} className="flex-1 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-mono text-sm">
                  {creating ? "FOUNDING…" : "FOUND VENTURE"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 font-mono text-sm">CANCEL</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-sm"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : projects.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 font-mono text-sm border border-dashed border-white/10 rounded-xl">
            No ventures yet. Found one and put an agent to work.
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <motion.div key={p.id} layout className="rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-mono text-base truncate">{p.name}</h3>
                    {p.goal && <p className="text-xs text-zinc-400 mt-0.5">{p.goal}</p>}
                    <p className="text-[11px] text-amber-300/80 font-mono mt-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> {p.officeLabel}</p>
                  </div>
                  <button onClick={() => deleteProject(p.id)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-white/5" aria-label="Delete venture"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <select
                    value={p.status}
                    onChange={(e) => patchProject(p.id, { status: e.target.value })}
                    className={`text-xs font-mono rounded-md px-2 py-1 border outline-none ${STATUS_STYLE[p.status] ?? STATUS_STYLE.planning}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s} className="bg-zinc-900">{s.toUpperCase()}</option>)}
                  </select>
                  <select
                    value={p.assignedBotId ?? ""}
                    onChange={(e) => patchProject(p.id, { assignedBotId: e.target.value === "" ? null : Number(e.target.value) })}
                    className="text-xs font-mono rounded-md px-2 py-1 border border-white/10 bg-white/5 outline-none"
                  >
                    <option value="" className="bg-zinc-900">no agent</option>
                    {bots.map((b) => <option key={b.id} value={b.id} className="bg-zinc-900">{b.name}</option>)}
                  </select>
                  {p.assignedBotId == null && <span className="text-[10px] text-red-400/80 font-mono">⚠ unstaffed</span>}
                </div>

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1">
                    <span>PROGRESS</span><span>{p.progressPct}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={p.progressPct}
                    onChange={(e) => patchProject(p.id, { progressPct: Number(e.target.value) })}
                    className="w-full accent-violet-500"
                  />
                </div>

                {/* Logs */}
                {p.logs && p.logs.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-28 overflow-y-auto">
                    {p.logs.map((l) => (
                      <p key={l.id} className={`text-[11px] leading-snug ${l.kind === "pablo" ? "text-fuchsia-300 italic" : l.kind === "milestone" ? "text-emerald-300" : "text-zinc-500"}`}>
                        <span className="opacity-50">›</span> {l.message}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
