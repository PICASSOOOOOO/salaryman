import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS, type TTSHandle } from "@/lib/tts";
import { PabloNebula3D, type NebulaStatus } from "@/components/PabloNebula3D";
import {
  Bot as BotIcon, Plus, Volume2, Square, Loader2, Building2,
  Sparkles, Activity, ChevronLeft, Trash2, Radio, ShoppingBag, Crown,
  Briefcase, Wifi, TrendingUp,
  Cpu, Brain, Command as CommandIcon, Zap, ChevronDown,
} from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { PabloControlsMenu } from "@/components/PabloControlsMenu";
import { canGoBackInApp, getAppBackPath } from "@/lib/app-navigation";

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

interface StateOverview {
  users: number;
  bots: number;
  ventures: number;
  liveVentures: number;
  pledges: number;
  pledgeRevenueCents: number;
  donationRevenueCents: number;
  totalRevenueCents: number;
  byCategory: { category: string; count: number; cents: number }[];
}

const STATUSES = ["planning", "building", "review", "live", "paused"] as const;

const STATUS_STYLE: Record<string, string> = {
  planning: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  building: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  review: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  live: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  paused: "text-zinc-400 border-zinc-500/40 bg-zinc-500/10",
};

// THE ROLODEX — a CRM deal pipeline (twenty) that lives on the deck as Pablo's
// relations desk, cached locally so it works off-grid (project-nomad).
interface Deal {
  id: number;
  title: string;
  stage: string;
  value: number | null;
  contactName: string | null;
  notes: string;
  updatedAt?: string;
}

// PABLO AUTOPILOT — the deck command registry (cursor/plugins + ECC) and the
// autonomous agent loop (claude-code), both backed server-side.
interface DeckCommand {
  id: number;
  label: string;
  description: string;
  kind: string; // agent | navigate | prompt
  payload: string;
  icon: string;
  enabled: boolean;
}
interface AgentStep {
  n: number;
  tool: string;
  args: Record<string, unknown>;
  result: string;
}
interface AgentRun {
  id: number;
  goal: string;
  status: string;
  summary: string;
  steps: AgentStep[];
  createdAt?: string;
}
interface PabloMemory {
  id: number;
  kind: string;
  content: string;
  source: string;
  weight: number;
  createdAt?: string;
}
// PABLO ORCHESTRATOR — the JARVIS / HuggingGPT idea (microsoft/JARVIS): a goal is
// decomposed into staged subtasks, each routed to the best-fit agent (the "expert").
interface OrchTask {
  title: string;
  detail: string;
  agentId: number | null;
  expertise: string;
  rationale: string;
}
const CMD_ICONS: Record<string, typeof CommandIcon> = {
  TrendingUp, Briefcase, Brain, Command: CommandIcon, Zap, Cpu,
};

const DEAL_STAGES = ["Lead", "Pitched", "Negotiation", "Won", "Lost"] as const;
const DEAL_STAGE_STYLE: Record<string, string> = {
  Lead: "text-zinc-300 border-zinc-500/40 bg-zinc-500/10",
  Pitched: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
  Negotiation: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  Won: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  Lost: "text-red-300 border-red-500/40 bg-red-500/10",
};
const DEAL_CACHE_KEY = "salaryman.nomad.deals.v1";
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;

function readDealCache(): Deal[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DEAL_CACHE_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeDealCache(ds: Deal[]) {
  try {
    localStorage.setItem(DEAL_CACHE_KEY, JSON.stringify(ds));
  } catch {
    /* ignore */
  }
}

function buildPipelineRap(ds: Deal[]): string {
  if (ds.length === 0)
    return "The Rolodex is empty, boss. No deals on the board. Go shake some hands and bring me names.";
  const open = ds.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  const won = ds.filter((d) => d.stage === "Won");
  const openVal = open.reduce((s, d) => s + (d.value || 0), 0);
  const wonVal = won.reduce((s, d) => s + (d.value || 0), 0);
  const negotiating = open.filter((d) => d.stage === "Negotiation").length;
  const hot = [...open].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  let s = `Pipeline report. You've got ${open.length} live ${open.length === 1 ? "deal" : "deals"} on the board worth ${fmtMoney(openVal)}. `;
  if (negotiating > 0) s += `${negotiating} in negotiation — close them. `;
  if (hot) s += `Your biggest play is ${hot.title}${hot.contactName ? ` with ${hot.contactName}` : ""}, ${fmtMoney(hot.value || 0)}. Don't let it cool. `;
  if (won.length > 0) s += `You've already banked ${won.length} ${won.length === 1 ? "win" : "wins"} for ${fmtMoney(wonVal)}. `;
  s += "Now get back out there.";
  return s;
}

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
  const [overview, setOverview] = useState<StateOverview | null>(null);
  const [stateBriefing, setStateBriefing] = useState<string>("");
  const [stateLoading, setStateLoading] = useState(false);
  const [stateSpeaking, setStateSpeaking] = useState(false);
  const stateTtsRef = useRef<TTSHandle | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [fName, setFName] = useState("");
  const [fGoal, setFGoal] = useState("");
  const [fOffice, setFOffice] = useState("");
  const [fBot, setFBot] = useState<number | "">("");
  const [creating, setCreating] = useState(false);

  // THE ROLODEX (deal pipeline) — hydrate instantly from the offline NOMAD cache
  const [deals, setDeals] = useState<Deal[]>(() => readDealCache());
  const [online, setOnline] = useState(true);
  const [showDealForm, setShowDealForm] = useState(false);
  const [dTitle, setDTitle] = useState("");
  const [dValue, setDValue] = useState("");
  const [dStage, setDStage] = useState<string>("Lead");
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [pipeSpeaking, setPipeSpeaking] = useState(false);
  const pipeTtsRef = useRef<TTSHandle | null>(null);

  // PABLO AUTOPILOT (agent loop) + deck command registry
  const [commands, setCommands] = useState<DeckCommand[]>([]);
  const [agentGoal, setAgentGoal] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [lastRun, setLastRun] = useState<AgentRun | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const autopilotTtsRef = useRef<TTSHandle | null>(null);
  const [memories, setMemories] = useState<PabloMemory[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [managing, setManaging] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cmdDraft, setCmdDraft] = useState({ label: "", payload: "", kind: "agent", icon: "Command" });
  const [memDraft, setMemDraft] = useState({ content: "", kind: "lesson" });
  const [registryBusy, setRegistryBusy] = useState(false);

  // PABLO ORCHESTRATOR (JARVIS) — plan a big goal into a crew of assigned subtasks
  const [orchGoal, setOrchGoal] = useState("");
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchPlan, setOrchPlan] = useState<OrchTask[]>([]);
  const [orchSynthesis, setOrchSynthesis] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [dispatchNote, setDispatchNote] = useState("");
  const orchTtsRef = useRef<TTSHandle | null>(null);

  const load = useCallback(async () => {
    // allSettled so a failure in bots/projects can never flip the Rolodex's
    // NOMAD sync badge — only the deals request drives `online`.
    const [bRes, pRes, dRes, cRes, mRes, rRes] = await Promise.allSettled([
      apiFetch("/api/bots"),
      apiFetch("/api/agent-projects"),
      apiFetch("/api/tools/deals"),
      apiFetch("/api/pablo/commands"),
      apiFetch("/api/pablo/memory"),
      apiFetch("/api/pablo/agent/runs"),
    ]);
    if (bRes.status === "fulfilled" && bRes.value.ok) {
      try {
        const data = await bRes.value.json();
        setBots((data.bots ?? []).map((b: any) => ({ id: b.id, name: b.name, personality: b.personality, status: b.status })));
      } catch { /* ignore */ }
    }
    if (pRes.status === "fulfilled" && pRes.value.ok) {
      try {
        const data = await pRes.value.json();
        setProjects(data.projects ?? []);
      } catch { /* ignore */ }
    }
    if (cRes.status === "fulfilled" && cRes.value.ok) {
      try {
        const data = await cRes.value.json();
        setCommands(data.commands ?? []);
      } catch { /* ignore */ }
    }
    if (mRes.status === "fulfilled" && mRes.value.ok) {
      try {
        const data = await mRes.value.json();
        setMemories(data.memories ?? []);
      } catch { /* ignore */ }
    }
    if (rRes.status === "fulfilled" && rRes.value.ok) {
      try {
        const data = await rRes.value.json();
        setRuns(data.runs ?? []);
      } catch { /* ignore */ }
    }
    if (dRes.status === "fulfilled" && dRes.value.ok) {
      try {
        const data = await dRes.value.json();
        const list: Deal[] = data.deals ?? [];
        setDeals(list);
        writeDealCache(list);
        setOnline(true);
      } catch { setOnline(false); }
    } else {
      setOnline(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const reloadCommands = useCallback(async () => {
    try { const r = await apiFetch("/api/pablo/commands"); if (r.ok) { const d = await r.json(); setCommands(d.commands ?? []); } } catch { /* ignore */ }
  }, []);
  const reloadMemory = useCallback(async () => {
    try { const r = await apiFetch("/api/pablo/memory"); if (r.ok) { const d = await r.json(); setMemories(d.memories ?? []); } } catch { /* ignore */ }
  }, []);
  const reloadRuns = useCallback(async () => {
    try { const r = await apiFetch("/api/pablo/agent/runs"); if (r.ok) { const d = await r.json(); setRuns(d.runs ?? []); } } catch { /* ignore */ }
  }, []);

  const chipCls = (on: boolean) =>
    `flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[10px] uppercase tracking-wider transition ${on ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100" : "border-white/10 bg-black/30 text-zinc-400 hover:text-zinc-200"}`;

  const addCommand = async () => {
    if (!cmdDraft.label.trim() || registryBusy) return;
    setRegistryBusy(true);
    try {
      const r = await apiFetch("/api/pablo/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cmdDraft) });
      if (r.ok) { setCmdDraft({ label: "", payload: "", kind: "agent", icon: "Command" }); await reloadCommands(); }
    } finally { setRegistryBusy(false); }
  };
  const toggleCommand = async (c: DeckCommand) => {
    try { await apiFetch(`/api/pablo/commands/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !c.enabled }) }); } catch { /* ignore */ }
    reloadCommands();
  };
  const deleteCommand = async (id: number) => {
    try { await apiFetch(`/api/pablo/commands/${id}`, { method: "DELETE" }); } catch { /* ignore */ }
    reloadCommands();
  };
  const addMemory = async () => {
    if (!memDraft.content.trim() || registryBusy) return;
    setRegistryBusy(true);
    try {
      const r = await apiFetch("/api/pablo/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(memDraft) });
      if (r.ok) { setMemDraft({ content: "", kind: "lesson" }); await reloadMemory(); }
    } finally { setRegistryBusy(false); }
  };
  const deleteMemory = async (id: number) => {
    try { await apiFetch(`/api/pablo/memory/${id}`, { method: "DELETE" }); } catch { /* ignore */ }
    reloadMemory();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/pledge/admin/overview");
        if (res.ok && !cancelled) setOverview(await res.json());
      } catch { /* not owner / ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { ttsRef.current?.cancel?.(); stateTtsRef.current?.cancel?.(); pipeTtsRef.current?.cancel?.(); autopilotTtsRef.current?.cancel?.(); orchTtsRef.current?.cancel?.(); }, []);

  const stopState = () => {
    stateTtsRef.current?.cancel?.();
    stateTtsRef.current = null;
    setStateSpeaking(false);
    setNebulaStatus("idle");
  };

  const hearStateOfSalaryman = async () => {
    if (stateSpeaking) { stopState(); return; }
    setStateLoading(true);
    setNebulaStatus("thinking");
    try {
      const res = await apiFetch("/api/pledge/admin/briefing", { method: "POST" });
      const data = res.ok ? await res.json() : null;
      const text: string = data?.briefing ?? "Nothing to report on the platform yet, boss.";
      if (data?.overview) setOverview(data.overview);
      setStateBriefing(text);
      setStateLoading(false);
      setStateSpeaking(true);
      setNebulaStatus("speaking");
      stateTtsRef.current = speakWithTTS(
        text,
        () => { setStateSpeaking(false); setNebulaStatus("idle"); stateTtsRef.current = null; },
        () => { setStateSpeaking(false); setNebulaStatus("idle"); stateTtsRef.current = null; },
        { character: "PABLO" },
      );
    } catch {
      setStateLoading(false);
      setNebulaStatus("idle");
    }
  };

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

  const createDeal = async () => {
    if (!dTitle.trim()) return;
    setCreatingDeal(true);
    try {
      const res = await apiFetch("/api/tools/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: dTitle.trim(),
          stage: dStage,
          value: dValue.trim() === "" ? null : Math.max(0, Math.round(Number(dValue))),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeals((prev) => { const next = [data.deal, ...prev]; writeDealCache(next); return next; });
        setDTitle(""); setDValue(""); setDStage("Lead"); setShowDealForm(false);
        setOnline(true);
      }
    } catch { setOnline(false); }
    setCreatingDeal(false);
  };

  const patchDeal = async (id: number, updates: Partial<Deal>) => {
    setDeals((prev) => { const next = prev.map((d) => (d.id === id ? { ...d, ...updates } : d)); writeDealCache(next); return next; });
    try {
      const res = await apiFetch(`/api/tools/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) setOnline(true);
      else load();
    } catch { setOnline(false); load(); }
  };

  const deleteDeal = async (id: number) => {
    setDeals((prev) => { const next = prev.filter((d) => d.id !== id); writeDealCache(next); return next; });
    try {
      const res = await apiFetch(`/api/tools/deals/${id}`, { method: "DELETE" });
      if (res.ok) setOnline(true);
      else load();
    } catch { setOnline(false); load(); }
  };

  const stopPipe = () => {
    pipeTtsRef.current?.cancel?.();
    pipeTtsRef.current = null;
    setPipeSpeaking(false);
    setNebulaStatus("idle");
  };

  const hearPipeline = () => {
    if (pipeSpeaking) { stopPipe(); return; }
    const text = buildPipelineRap(deals);
    setPipeSpeaking(true);
    setNebulaStatus("speaking");
    pipeTtsRef.current = speakWithTTS(
      text,
      () => { setPipeSpeaking(false); setNebulaStatus("idle"); pipeTtsRef.current = null; },
      () => { setPipeSpeaking(false); setNebulaStatus("idle"); pipeTtsRef.current = null; },
      { character: "PABLO" },
    );
  };

  const stopAutopilot = () => {
    autopilotTtsRef.current?.cancel?.();
    autopilotTtsRef.current = null;
    setNebulaStatus("idle");
  };

  // Fire Pablo's autonomous agent loop on a goal: he plans, executes real
  // pipeline/memory actions server-side, then speaks the summary. Reload deals
  // afterward since the run may have changed the pipeline.
  const runAgent = async (goal: string) => {
    const g = goal.trim();
    if (!g || agentRunning) return;
    stopAutopilot();
    setAgentRunning(true);
    setLastRun(null);
    setShowSteps(false);
    setNebulaStatus("thinking");
    try {
      const res = await apiFetch("/api/pablo/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: g }),
      });
      if (!res.ok) throw new Error("agent failed");
      const data = await res.json();
      const run: AgentRun | null = data.run ?? null;
      setLastRun(run);
      setOnline(true);
      load();
      reloadMemory();
      reloadRuns();
      if (run?.summary) {
        setNebulaStatus("speaking");
        autopilotTtsRef.current = speakWithTTS(
          run.summary,
          () => { setNebulaStatus("idle"); autopilotTtsRef.current = null; },
          () => { setNebulaStatus("idle"); autopilotTtsRef.current = null; },
          { character: "PABLO" },
        );
      } else {
        setNebulaStatus("idle");
      }
    } catch {
      setOnline(false);
      setNebulaStatus("idle");
      setLastRun({ id: 0, goal: g, status: "failed", summary: "I couldn't reach the floor to run that — try again.", steps: [] });
    } finally {
      setAgentRunning(false);
    }
  };

  // JARVIS: ask Pablo to decompose a goal into a staged plan and route each task to
  // the best-fit agent. He speaks the battle plan; the deck can then dispatch it.
  const runOrchestrate = async () => {
    const g = orchGoal.trim();
    if (!g || orchestrating) return;
    orchTtsRef.current?.cancel?.();
    setOrchestrating(true);
    setOrchPlan([]);
    setOrchSynthesis("");
    setDispatched(false);
    setDispatchNote("");
    setNebulaStatus("thinking");
    try {
      const res = await apiFetch("/api/pablo/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: g, agents: bots.map((b) => ({ id: b.id, name: b.name, personality: b.personality })) }),
      });
      const data = res.ok ? await res.json() : null;
      const plan: OrchTask[] = data?.plan ?? [];
      const synth: string = data?.synthesis ?? "I couldn't draw up the plan — try again.";
      setOrchPlan(plan);
      setOrchSynthesis(synth);
      if (synth) {
        setNebulaStatus("speaking");
        orchTtsRef.current = speakWithTTS(
          synth,
          () => { setNebulaStatus("idle"); orchTtsRef.current = null; },
          () => { setNebulaStatus("idle"); orchTtsRef.current = null; },
          { character: "PABLO" },
        );
      } else {
        setNebulaStatus("idle");
      }
    } catch {
      setOrchSynthesis("I couldn't reach the floor to plan that — try again.");
      setNebulaStatus("idle");
    } finally {
      setOrchestrating(false);
    }
  };

  // Turn the plan into real ventures — one per subtask, assigned to its agent.
  // Only the tasks that actually fail stay in the plan, so a retry never
  // double-creates the ones that already landed, and we only call it "done"
  // when nothing failed.
  const dispatchPlan = async () => {
    if (dispatching || dispatched || orchPlan.length === 0) return;
    setDispatching(true);
    try {
      const created: AgentProject[] = [];
      const failedTasks: OrchTask[] = [];
      for (const t of orchPlan) {
        try {
          const res = await apiFetch("/api/agent-projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: t.title,
              goal: t.detail,
              officeLabel: t.expertise || "Orchestrated",
              assignedBotId: t.agentId,
            }),
          });
          const data = res.ok ? await res.json().catch(() => null) : null;
          if (data?.project) created.push(data.project);
          else failedTasks.push(t);
        } catch { failedTasks.push(t); }
      }
      if (created.length) setProjects((prev) => [...created, ...prev]);
      setOrchPlan(failedTasks);
      if (failedTasks.length === 0) {
        setDispatched(true);
        setDispatchNote(`${created.length} ${created.length === 1 ? "venture" : "ventures"} created below.`);
      } else {
        setDispatchNote(`${created.length} created, ${failedTasks.length} failed — dispatch again to retry.`);
      }
    } finally {
      setDispatching(false);
    }
  };

  const runCommand = (cmd: DeckCommand) => {
    if (cmd.kind === "navigate") {
      navigate(cmd.payload.startsWith("/") ? cmd.payload : `/${cmd.payload}`);
      return;
    }
    runAgent(cmd.payload || cmd.label);
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
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
          <button
            onClick={() => canGoBackInApp() ? window.history.back() : navigate(getAppBackPath(true), { replace: true })}
            className="app-action app-control h-8 w-8 p-0"
            aria-label="Back"
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/office")}
            className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
            aria-label="Back to office floor"
            title="Office floor"
          >
            <PicassoLogo size={20} gap={2} glow />
            <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors">
              SALARYMAN
            </span>
          </button>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <h1 className="font-mono text-xl sm:text-2xl tracking-wider flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-300" /> PABLO COMMAND DECK
            </h1>
            <p className="text-xs text-zinc-400 font-mono">Deploy your agents. Build your empire. Hear the report.</p>
          </div>
          <PabloControlsMenu showHummingbird />
          <button
            onClick={() => navigate("/pledge")}
            className="app-action app-control border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
            aria-label="Open Pledge Store"
            title="Pledge Store"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden min-[420px]:inline">PLEDGE STORE</span>
          </button>
        </div>

        {/* State of SALARYMAN — owner only */}
        {overview && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] to-black/50 backdrop-blur-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-amber-400" />
              <h2 className="font-mono text-sm tracking-wider text-amber-200">STATE OF SALARYMAN</h2>
              <span className="ml-auto text-[10px] font-mono text-amber-500/60 uppercase tracking-widest">Owner</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
              {[
                { label: "Users", value: overview.users },
                { label: "Agents", value: overview.bots },
                { label: "Ventures", value: overview.ventures },
                { label: "Live", value: overview.liveVentures },
                { label: "Pledges", value: overview.pledges },
                { label: "Revenue", value: `$${(overview.totalRevenueCents / 100).toFixed(0)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2">
                  <div className="text-lg font-mono text-zinc-100">{s.value}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={hearStateOfSalaryman}
                disabled={stateLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-mono text-sm transition"
              >
                {stateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : stateSpeaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {stateLoading ? "PABLO IS THINKING…" : stateSpeaking ? "STOP" : "HEAR STATE OF THE PLATFORM"}
              </button>
              <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
                <Radio className={`w-3.5 h-3.5 ${stateSpeaking ? "text-amber-400 animate-pulse" : "text-zinc-600"}`} />
                {stateSpeaking ? "ON AIR" : "standby"}
              </span>
            </div>
            <AnimatePresence>
              {stateBriefing && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 text-sm text-zinc-200 leading-relaxed italic border-l-2 border-amber-500/50 pl-3"
                >
                  “{stateBriefing}”
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}

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

        {/* PABLO AUTOPILOT — agent loop (claude-code) + extensible command registry (cursor/plugins + ECC) */}
        <div className="mb-6 rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/[0.06] to-black/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Cpu className="w-4 h-4 text-fuchsia-300" />
            <h2 className="font-mono text-sm tracking-wider text-fuchsia-200">PABLO AUTOPILOT · AGENT LOOP</h2>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setManaging((s) => !s)} className={chipCls(managing)}><CommandIcon className="w-3 h-3" /> COMMANDS</button>
              <button onClick={() => setShowMemory((s) => !s)} className={chipCls(showMemory)}><Brain className="w-3 h-3" /> MEMORY</button>
              <button onClick={() => setShowHistory((s) => !s)} className={chipCls(showHistory)}><Activity className="w-3 h-3" /> HISTORY</button>
            </div>
          </div>

          {commands.some((c) => c.enabled) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {commands.filter((c) => c.enabled).map((c) => {
                const Icon = CMD_ICONS[c.icon] ?? CommandIcon;
                return (
                  <button
                    key={c.id}
                    onClick={() => runCommand(c)}
                    disabled={agentRunning}
                    title={c.description}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/[0.08] hover:bg-fuchsia-500/20 disabled:opacity-50 font-mono text-xs text-fuchsia-100 transition"
                  >
                    <Icon className="w-3.5 h-3.5" /> {c.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={agentGoal}
              onChange={(e) => setAgentGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !agentRunning) { runAgent(agentGoal); setAgentGoal(""); } }}
              placeholder="Give Pablo a goal — e.g. 'add a $20k lead for Acme and push Globex to negotiation'"
              className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-fuchsia-500/60 outline-none"
            />
            <button
              onClick={() => { if (agentRunning) { stopAutopilot(); } else { runAgent(agentGoal); setAgentGoal(""); } }}
              disabled={agentRunning ? false : !agentGoal.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 font-mono text-sm transition shrink-0"
            >
              {agentRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {agentRunning ? "WORKING…" : "RUN"}
            </button>
          </div>

          <AnimatePresence>
            {lastRun && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 overflow-hidden"
              >
                <p className={`text-sm leading-relaxed italic border-l-2 pl-3 ${lastRun.status === "failed" ? "text-amber-200 border-amber-500/50" : "text-zinc-200 border-fuchsia-500/50"}`}>
                  “{lastRun.summary}”
                </p>
                {lastRun.steps.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowSteps((s) => !s)}
                      className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSteps ? "rotate-180" : ""}`} />
                      {lastRun.steps.length} {lastRun.steps.length === 1 ? "ACTION" : "ACTIONS"} TAKEN
                    </button>
                    <AnimatePresence>
                      {showSteps && (
                        <motion.ol
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 space-y-1 overflow-hidden"
                        >
                          {lastRun.steps.map((st) => (
                            <li key={st.n} className="text-[11px] font-mono text-zinc-400 flex gap-2 rounded-md bg-black/40 border border-white/5 px-2 py-1.5">
                              <span className="text-fuchsia-400/80 shrink-0">{st.tool}</span>
                              <span className="text-zinc-300 min-w-0 break-words">{st.result}</span>
                            </li>
                          ))}
                        </motion.ol>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {managing && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Command Registry</p>
                  <div className="space-y-1.5 mb-3">
                    {commands.length === 0 && <p className="text-xs font-mono text-zinc-600">No commands yet.</p>}
                    {commands.map((c) => {
                      const Icon = CMD_ICONS[c.icon] ?? CommandIcon;
                      return (
                        <div key={c.id} className="flex items-center gap-2 rounded-md bg-black/40 border border-white/5 px-2 py-1.5">
                          <Icon className="w-3.5 h-3.5 text-fuchsia-300/80 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono text-zinc-200 truncate">{c.label}</div>
                            <div className="text-[10px] font-mono text-zinc-500 truncate">{c.kind} · {c.payload || "—"}</div>
                          </div>
                          <button onClick={() => toggleCommand(c)} title={c.enabled ? "Disable" : "Enable"} className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase ${c.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700/40 text-zinc-500"}`}>{c.enabled ? "ON" : "OFF"}</button>
                          <button onClick={() => deleteCommand(c.id)} title="Delete" className="text-zinc-500 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input value={cmdDraft.label} onChange={(e) => setCmdDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Label" className="flex-1 min-w-[120px] bg-black/50 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono outline-none focus:border-fuchsia-500/60" />
                    <input value={cmdDraft.payload} onChange={(e) => setCmdDraft((d) => ({ ...d, payload: e.target.value }))} placeholder={cmdDraft.kind === "navigate" ? "/path" : "Goal Pablo runs"} className="flex-[2] min-w-[160px] bg-black/50 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono outline-none focus:border-fuchsia-500/60" />
                    <select value={cmdDraft.kind} onChange={(e) => setCmdDraft((d) => ({ ...d, kind: e.target.value }))} className="bg-black/50 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono outline-none">
                      <option value="agent">agent</option>
                      <option value="navigate">navigate</option>
                      <option value="prompt">prompt</option>
                    </select>
                    <button onClick={addCommand} disabled={registryBusy || !cmdDraft.label.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 font-mono text-xs"><Plus className="w-3.5 h-3.5" /> ADD</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showMemory && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">What Pablo Remembers</p>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <input value={memDraft.content} onChange={(e) => setMemDraft((d) => ({ ...d, content: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") addMemory(); }} placeholder="Teach Pablo something to remember…" className="flex-1 min-w-[160px] bg-black/50 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono outline-none focus:border-fuchsia-500/60" />
                    <select value={memDraft.kind} onChange={(e) => setMemDraft((d) => ({ ...d, kind: e.target.value }))} className="bg-black/50 border border-white/10 rounded-md px-2 py-1.5 text-xs font-mono outline-none">
                      <option value="lesson">lesson</option>
                      <option value="preference">preference</option>
                      <option value="fact">fact</option>
                      <option value="decision">decision</option>
                    </select>
                    <button onClick={addMemory} disabled={registryBusy || !memDraft.content.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 font-mono text-xs"><Plus className="w-3.5 h-3.5" /> SAVE</button>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {memories.length === 0 && <p className="text-xs font-mono text-zinc-600">Nothing remembered yet.</p>}
                    {memories.map((m) => (
                      <div key={m.id} className="flex items-start gap-2 rounded-md bg-black/40 border border-white/5 px-2 py-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 font-mono text-[9px] uppercase shrink-0 mt-0.5">{m.kind}</span>
                        <span className="text-xs text-zinc-300 min-w-0 flex-1 break-words">{m.content}</span>
                        <button onClick={() => deleteMemory(m.id)} title="Forget" className="text-zinc-500 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHistory && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Run History</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {runs.length === 0 && <p className="text-xs font-mono text-zinc-600">No autopilot runs yet.</p>}
                    {runs.map((r) => (
                      <div key={r.id} className="rounded-md bg-black/40 border border-white/5 px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] uppercase shrink-0 ${r.status === "failed" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{r.status}</span>
                          <span className="text-xs font-mono text-zinc-300 truncate flex-1">{r.goal}</span>
                          <span className="text-[10px] font-mono text-zinc-600 shrink-0">{r.steps?.length ?? 0} acts</span>
                        </div>
                        {r.summary && <p className="text-[11px] text-zinc-500 italic mt-1 break-words">“{r.summary}”</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* PABLO ORCHESTRATOR — the JARVIS / HuggingGPT pattern (microsoft/JARVIS):
            Pablo plans a big goal into staged subtasks, routes each to the best-fit
            agent, then dispatches the whole crew as live ventures. */}
        <div className="mb-6 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.07] to-black/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Brain className="w-4 h-4 text-indigo-300" />
            <h2 className="font-mono text-sm tracking-wider text-indigo-200">PABLO ORCHESTRATOR · JARVIS</h2>
            <span className="ml-auto text-[10px] font-mono text-indigo-400/60 uppercase tracking-widest">{bots.length} {bots.length === 1 ? "EXPERT" : "EXPERTS"}</span>
          </div>
          <p className="text-[11px] font-mono text-zinc-500 mb-3">One big mission → a staged plan, each task routed to your best agent. Then dispatch the crew.</p>

          <div className="flex items-center gap-2">
            <input
              value={orchGoal}
              onChange={(e) => setOrchGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !orchestrating) runOrchestrate(); }}
              placeholder="Give Pablo a mission — e.g. 'land 3 enterprise clients this quarter'"
              className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono focus:border-indigo-500/60 outline-none"
            />
            <button
              onClick={runOrchestrate}
              disabled={orchestrating || !orchGoal.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-mono text-sm transition shrink-0"
            >
              {orchestrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {orchestrating ? "PLANNING…" : "PLAN"}
            </button>
          </div>

          <AnimatePresence>
            {(orchSynthesis || orchPlan.length > 0) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 overflow-hidden"
              >
                {orchSynthesis && (
                  <p className="text-sm text-zinc-200 leading-relaxed italic border-l-2 border-indigo-500/50 pl-3 mb-3">“{orchSynthesis}”</p>
                )}
                {orchPlan.length > 0 && (
                  <>
                    <ol className="space-y-2">
                      {orchPlan.map((t, i) => {
                        const agent = t.agentId == null ? null : bots.find((b) => b.id === t.agentId);
                        return (
                          <li key={i} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                            <div className="flex items-start gap-2">
                              <span className="font-mono text-[11px] text-indigo-300/80 mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-sm text-zinc-100">{t.title}</div>
                                {t.detail && <div className="text-[11px] text-zinc-400 mt-0.5 break-words">{t.detail}</div>}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {t.expertise && <span className="px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-mono text-[9px] uppercase tracking-wider">{t.expertise}</span>}
                                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider ${agent ? "bg-indigo-500/15 text-indigo-200" : "bg-zinc-700/40 text-zinc-500"}`}>
                                    <BotIcon className="w-3 h-3" /> {agent ? agent.name : "UNASSIGNED"}
                                  </span>
                                  {t.rationale && <span className="text-[10px] font-mono text-zinc-600 truncate">{t.rationale}</span>}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        onClick={dispatchPlan}
                        disabled={dispatching || dispatched}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-mono text-xs transition"
                      >
                        {dispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        {dispatched ? "DISPATCHED ✓" : dispatching ? "DISPATCHING…" : `DISPATCH CREW (${orchPlan.length})`}
                      </button>
                      {dispatchNote && <span className={`text-[11px] font-mono ${dispatched ? "text-emerald-300/80" : "text-amber-300/80"}`}>{dispatchNote}</span>}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* THE ROLODEX — CRM deal pipeline (twenty), offline-resilient NOMAD cache (project-nomad) */}
        <div className="mb-6 rounded-xl border border-sky-500/30 bg-black/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Briefcase className="w-4 h-4 text-sky-300" />
            <h2 className="font-mono text-sm tracking-wider text-sky-200">THE ROLODEX · DEAL PIPELINE</h2>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest" title="Cached locally — survives refresh and works off-grid">
              <Wifi className={`w-3 h-3 ${online ? "text-emerald-400" : "text-amber-400"}`} />
              <span className={online ? "text-emerald-400/80" : "text-amber-400/80"}>{online ? "NOMAD CACHE · SYNCED" : "NOMAD CACHE · OFFLINE"}</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {(() => {
              const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
              const won = deals.filter((d) => d.stage === "Won");
              const openVal = open.reduce((s, d) => s + (d.value || 0), 0);
              const wonVal = won.reduce((s, d) => s + (d.value || 0), 0);
              return [
                { label: "Open", value: String(open.length) },
                { label: "Open Value", value: fmtMoney(openVal) },
                { label: "Won", value: fmtMoney(wonVal) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-black/40 border border-white/10 px-3 py-2">
                  <div className="text-base font-mono text-zinc-100">{s.value}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{s.label}</div>
                </div>
              ));
            })()}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={hearPipeline} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 font-mono text-xs transition">
              {pipeSpeaking ? <Square className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
              {pipeSpeaking ? "STOP" : "PABLO SIZES UP THE PIPELINE"}
            </button>
            <button onClick={() => setShowDealForm((s) => !s)} className="flex items-center gap-1 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 font-mono text-xs">
              <Plus className="w-3.5 h-3.5" /> NEW DEAL
            </button>
          </div>

          <AnimatePresence>
            {showDealForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 rounded-lg border border-emerald-500/30 bg-black/60 p-3 space-y-2 overflow-hidden"
              >
                <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="Deal (e.g. Acme — annual license)" className="w-full bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sky-500/60 outline-none" />
                <div className="flex gap-2">
                  <input value={dValue} onChange={(e) => setDValue(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Value $" className="flex-1 bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sky-500/60 outline-none" />
                  <select value={dStage} onChange={(e) => setDStage(e.target.value)} className="bg-black/50 border border-white/10 rounded-md px-3 py-2 text-sm font-mono outline-none">
                    {DEAL_STAGES.map((s) => <option key={s} value={s} className="bg-zinc-900">{s}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={createDeal} disabled={creatingDeal || !dTitle.trim()} className="flex-1 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-mono text-sm">
                    {creatingDeal ? "ADDING…" : "ADD DEAL"}
                  </button>
                  <button onClick={() => setShowDealForm(false)} className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 font-mono text-sm">CANCEL</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {deals.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 font-mono text-xs border border-dashed border-white/10 rounded-lg">
              No deals yet. Add one — Pablo tracks every handshake.
            </div>
          ) : (
            <div className="space-y-2">
              {deals.map((d) => (
                <motion.div key={d.id} layout className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm truncate">{d.title}</div>
                    <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-2">
                      {d.value != null && <span className="text-sky-300/80">{fmtMoney(d.value)}</span>}
                      {d.contactName && <span className="truncate">· {d.contactName}</span>}
                    </div>
                  </div>
                  <select
                    value={(DEAL_STAGES as readonly string[]).includes(d.stage) ? d.stage : "Lead"}
                    onChange={(e) => patchDeal(d.id, { stage: e.target.value })}
                    className={`text-xs font-mono rounded-md px-2 py-1 border outline-none ${DEAL_STAGE_STYLE[d.stage] ?? DEAL_STAGE_STYLE.Lead}`}
                  >
                    {DEAL_STAGES.map((s) => <option key={s} value={s} className="bg-zinc-900">{s}</option>)}
                  </select>
                  <button onClick={() => deleteDeal(d.id)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-white/5" aria-label="Delete deal"><Trash2 className="w-3.5 h-3.5" /></button>
                </motion.div>
              ))}
            </div>
          )}
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
