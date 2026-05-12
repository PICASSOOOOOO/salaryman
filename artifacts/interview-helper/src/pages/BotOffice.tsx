import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import {
  Loader2, ArrowLeft, Settings, Power, MessageSquare, Activity, Sparkles,
  Users, Send, Coins, ClipboardList, Plug, BarChart3,
} from "lucide-react";
import AssistantPool, { loadAssistantCount, saveAssistantCount } from "@/components/AssistantPool";
import { PixelBotAvatar, tintForBotStatus } from "@/components/PixelBotAvatar";

const DORMANT_KEY = (id: number) => `bot:${id}:activated`;
function isDormant(id: number): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DORMANT_KEY(id)) !== "1";
}
function setActivated(id: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DORMANT_KEY(id), "1");
}

/**
 * Per-bot private office. Every bot in the user's roster gets its own copy of
 * the standard one-person office room — same layout (desk, terminal, three
 * cryo-tubes, dead plant, filing cabinet) but personalised: bot name on the
 * door sign, bot status on the desk monitor, accent colour driven by the bot's
 * id, and quick-action panel for the owner to manage that bot.
 *
 * Route: /bots/:id/office
 */

interface BotData {
  id: number;
  name: string;
  personality: string;
  status: "active" | "paused" | "error";
  marketplaceItemId: number | null;
  collaborationRole?: string | null;
  createdAt: string;
}

const ACCENTS: { ring: string; glow: string; text: string; chip: string }[] = [
  { ring: "border-pink-400/70",   glow: "shadow-[0_0_28px_rgba(236,72,153,0.55)]", text: "text-pink-200",   chip: "bg-pink-500/15 border-pink-400/40" },
  { ring: "border-cyan-300/70",   glow: "shadow-[0_0_28px_rgba(34,211,238,0.55)]", text: "text-cyan-200",   chip: "bg-cyan-500/15 border-cyan-400/40" },
  { ring: "border-violet-400/70", glow: "shadow-[0_0_28px_rgba(167,139,250,0.55)]", text: "text-violet-200", chip: "bg-violet-500/15 border-violet-400/40" },
  { ring: "border-amber-400/70",  glow: "shadow-[0_0_28px_rgba(251,191,36,0.55)]", text: "text-amber-200",  chip: "bg-amber-500/15 border-amber-400/40" },
  { ring: "border-lime-400/70",   glow: "shadow-[0_0_28px_rgba(163,230,53,0.55)]", text: "text-lime-200",   chip: "bg-lime-500/15 border-lime-400/40" },
  { ring: "border-fuchsia-400/70",glow: "shadow-[0_0_28px_rgba(217,70,239,0.55)]", text: "text-fuchsia-200",chip: "bg-fuchsia-500/15 border-fuchsia-400/40" },
];

function pickAccent(id: number | undefined) {
  return ACCENTS[((id ?? 0) % ACCENTS.length + ACCENTS.length) % ACCENTS.length];
}

const STATUS_LABEL: Record<BotData["status"], string> = {
  active: "ACTIVE — ON SHIFT",
  paused: "PAUSED — STANDBY",
  error: "ERROR — NEEDS ATTENTION",
};

const STATUS_DOT: Record<BotData["status"], string> = {
  active: "bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.85)] animate-pulse",
  paused: "bg-amber-400",
  error: "bg-red-500 animate-pulse",
};

export default function BotOffice() {
  const [, params] = useRoute<{ id: string }>("/bots/:id/office");
  const [, navigate] = useLocation();
  const botId = params?.id ? Number(params.id) : null;

  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local-only "dormancy" gate — the player has to wake the bot up the first
  // time they enter its office (keeps a Rick-and-Morty-style "you bought a
  // sentient appliance" tone). Persisted per-bot to localStorage.
  const [dormant, setDormant] = useState(false);
  // Assistant pool size + persistence
  const [assistants, setAssistants] = useState(0);
  // Inline task composer
  const [taskDraft, setTaskDraft] = useState("");
  const [taskCron, setTaskCron] = useState("@hourly");
  const [submitting, setSubmitting] = useState(false);
  const [taskFlash, setTaskFlash] = useState<string | null>(null);

  const officeUrl = useArtAsset("scene_office");

  useEffect(() => {
    if (!botId || Number.isNaN(botId)) {
      setError("No bot id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/bots/${botId}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Bot not found." : `Could not load bot (${res.status}).`);
          setLoading(false);
          return;
        }
        const data = await res.json();
        setBot(data.bot ?? data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [botId]);

  const accent = useMemo(() => pickAccent(bot?.id), [bot?.id]);
  const slug = useMemo(() => bot?.name?.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 18) || "UNIT-???", [bot?.name]);

  // Sync dormancy + assistant pool from localStorage whenever bot id resolves
  useEffect(() => {
    if (!bot?.id) return;
    setDormant(isDormant(bot.id));
    setAssistants(loadAssistantCount(bot.id));
  }, [bot?.id]);

  function activate() {
    if (!bot) return;
    setActivated(bot.id);
    setDormant(false);
  }

  function changeAssistants(next: number) {
    if (!bot) return;
    const clamped = Math.max(0, Math.min(5, next));
    saveAssistantCount(bot.id, clamped);
    setAssistants(clamped);
  }

  async function submitTask() {
    if (!bot || !taskDraft.trim()) return;
    setSubmitting(true);
    setTaskFlash(null);
    try {
      const res = await apiFetch(`/api/bots/${bot.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskDescription: taskDraft.trim(),
          cronExpression: taskCron || "@hourly",
          enabled: true,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`(${res.status}) ${t.slice(0, 80)}`);
      }
      setTaskFlash(`▾ ASSIGNED — ${slug} on it`);
      setTaskDraft("");
      setTimeout(() => setTaskFlash(null), 2400);
    } catch (e: any) {
      setTaskFlash(`✗ ${e?.message ?? "Failed to assign"}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-200 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-200 flex flex-col items-center justify-center gap-3" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
        <div className="text-pink-400 tracking-widest text-sm">OFFICE UNAVAILABLE</div>
        <div className="text-pink-200/70 text-sm">{error || "Bot not found."}</div>
        <button
          onClick={() => navigate("/bots")}
          className="mt-4 px-4 py-2 rounded border border-pink-400/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-xs tracking-widest"
          data-testid="bot-office-back"
        >
          ◂ BACK TO BOTS
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-[#06070b] text-pink-100 overflow-hidden select-none" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      {/* Pro-baked office background */}
      {officeUrl && (
        <motion.img
          src={officeUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.92 }}
          transition={{ duration: 0.6 }}
        />
      )}

      {/* Accent wash matching the bot's colour */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at 18% 55%, rgba(34,211,238,0.12), transparent 55%), radial-gradient(ellipse at 82% 60%, rgba(236,72,153,0.14), transparent 55%)",
      }} />

      {/* CSS fallback if Pro art hasn't loaded yet */}
      {!officeUrl && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/5" style={{
            background: "repeating-linear-gradient(0deg, #14171f 0 32px, #11141b 32px 64px)",
          }} />
          <div className="absolute inset-x-0 top-0 h-3/5" style={{
            background: "linear-gradient(180deg, #1a1f2c 0%, #11141b 100%)",
          }} />
        </>
      )}

      {/* Door sign with bot's name — top-centre, big neon plate */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className={`px-5 py-2 rounded-md border-2 ${accent.ring} ${accent.glow} bg-black/70 backdrop-blur flex items-center gap-3`}>
          <PixelBotAvatar size={28} tint={tintForBotStatus(bot.status)} />
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[bot.status]}`} />
          <div className="flex flex-col leading-tight">
            <span className={`text-xs tracking-[0.3em] ${accent.text}`}>{slug}</span>
            <span className="text-[9px] tracking-[0.25em] text-pink-300/70">{bot.collaborationRole?.toUpperCase() || "SOLO SALARYMAN"}</span>
          </div>
        </div>
      </div>

      {/* Top-left back button */}
      <button
        onClick={() => navigate("/bots")}
        className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded border border-pink-400/30 bg-black/60 hover:bg-pink-500/20 text-pink-200 text-[11px] tracking-widest flex items-center gap-1.5"
        data-testid="bot-office-back-top"
      >
        <ArrowLeft className="w-3 h-3" /> BACK
      </button>

      {/* Three cryo-tube "shelf" — a hover panel for each tube on the left wall.
          For solo bots, only tube #0 is theirs; the others are empty/disabled. */}
      {([0, 1, 2] as const).map((i) => {
        const occupied = i === 0;
        const left = `${5 + i * 9}%`;
        return (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{ left, top: "28%", width: "8%", height: "44%" }}
          >
            <div className={`w-full h-full rounded-t-[40%] rounded-b-md border-2 ${
              occupied ? `${accent.ring} ${accent.glow}` : "border-zinc-700/50"
            } bg-transparent relative`}>
              <div className={`absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded border text-[9px] tracking-widest whitespace-nowrap ${
                occupied ? `${accent.chip} ${accent.text}` : "border-zinc-700/50 bg-black/40 text-zinc-500"
              }`}>
                {occupied ? slug : "EMPTY"}
              </div>
            </div>
          </div>
        );
      })}

      {/* Animated assistant pool — chibi pixel-art workers scurrying on the
          office floor. Hidden while dormant. */}
      {!dormant && (
        <AssistantPool botId={bot.id} status={bot.status} count={assistants} />
      )}

      {/* Right-side command center — supervisor controls + assistant staffing
          + inline task composer. Replaces the legacy dossier panel. */}
      <aside className="absolute right-4 top-20 bottom-4 w-[340px] z-10 rounded-md border border-pink-400/30 bg-black/80 backdrop-blur p-4 flex flex-col gap-3 overflow-y-auto">
        <header className="flex items-center justify-between">
          <h2 className={`text-sm tracking-[0.25em] ${accent.text}`}>COMMAND CENTER</h2>
          <span className={`text-[9px] tracking-widest px-2 py-0.5 rounded border ${accent.chip} ${accent.text}`}>
            #{bot.id}
          </span>
        </header>

        {/* Vital strip: name + status dot */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] tracking-widest text-pink-300/60 mb-0.5">DESIGNATION</div>
            <div className="text-pink-100 text-base truncate">{bot.name}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] tracking-widest text-pink-300/60 mb-0.5">STATUS</div>
            <div className="text-pink-100 text-[11px] flex items-center justify-end gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[bot.status]}`} />
              {STATUS_LABEL[bot.status]}
            </div>
          </div>
        </div>

        {/* Assistant staffing slider — directly drives the floor sprites */}
        <div className="rounded border border-cyan-400/30 bg-cyan-500/[0.04] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-cyan-200 text-[10px] tracking-[0.3em]">
              <Users className="w-3 h-3" /> ASSISTANT POOL
            </div>
            <div className="text-cyan-100 text-sm font-bold tabular-nums">{assistants}/5</div>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            value={assistants}
            onChange={(e) => changeAssistants(Number(e.target.value))}
            data-testid="bot-office-assistants"
            className="w-full accent-cyan-400"
          />
          <div className="text-[9px] text-cyan-200/60 mt-1 leading-tight">
            {assistants === 0
              ? "No staff. The bot works solo."
              : assistants === 5
                ? "Full crew on the floor — interns, PAs, engineers."
                : `${assistants} ${assistants === 1 ? "assistant" : "assistants"} on the floor; ${slug} supervises.`}
          </div>
        </div>

        {/* Inline task composer */}
        <div className="rounded border border-pink-400/30 bg-pink-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-pink-200 text-[10px] tracking-[0.3em] mb-2">
            <ClipboardList className="w-3 h-3" /> GIVE A TASK
          </div>
          <textarea
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            placeholder={`What should ${slug} have the team do?`}
            data-testid="bot-office-task-draft"
            rows={2}
            className="w-full bg-black/60 border border-pink-400/30 rounded px-2 py-1.5 text-pink-100 text-xs placeholder:text-pink-300/30 focus:border-pink-300 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <select
              value={taskCron}
              onChange={(e) => setTaskCron(e.target.value)}
              className="bg-black/70 border border-pink-400/30 rounded px-2 py-1 text-pink-100 text-[10px] tracking-widest focus:outline-none"
              data-testid="bot-office-task-cron"
            >
              <option value="@hourly">EVERY HOUR</option>
              <option value="0 * * * *">EVERY HOUR (TOP)</option>
              <option value="@daily">DAILY</option>
              <option value="0 9 * * 1-5">WEEKDAYS 9AM</option>
              <option value="*/15 * * * *">EVERY 15 MIN</option>
            </select>
            <button
              type="button"
              onClick={submitTask}
              disabled={submitting || !taskDraft.trim()}
              data-testid="bot-office-task-submit"
              className="ml-auto px-3 py-1.5 rounded border border-pink-400/50 bg-pink-500/15 hover:bg-pink-500/30 text-pink-100 text-[10px] tracking-[0.3em] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              ASSIGN
            </button>
          </div>
          {taskFlash && (
            <div className={`mt-2 text-[10px] tracking-widest ${taskFlash.startsWith("✗") ? "text-red-300" : "text-cyan-300"}`}>
              {taskFlash}
            </div>
          )}
        </div>

        {/* Personality blurb — kept compact */}
        <div>
          <div className="text-[9px] tracking-widest text-pink-300/60 mb-1">PERSONALITY</div>
          <div className="text-pink-100/80 text-[11px] leading-snug max-h-20 overflow-y-auto">
            {bot.personality || "No personality set."}
          </div>
        </div>

        {/* Action grid — full command surface */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate(`/bots/${bot.id}`)}
            className="px-2 py-2 rounded border border-pink-400/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-[10px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-configure"
          >
            <Settings className="w-3 h-3" /> CONFIG
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/command`)}
            className="px-2 py-2 rounded border border-cyan-400/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[10px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-command"
          >
            <MessageSquare className="w-3 h-3" /> CHAT
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/logs`)}
            className="px-2 py-2 rounded border border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-100 text-[10px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-logs"
          >
            <Activity className="w-3 h-3" /> LOGS
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/connect`)}
            className="px-2 py-2 rounded border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-[10px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-connect"
          >
            <Plug className="w-3 h-3" /> CONNECT
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/analytics`)}
            className="px-2 py-2 rounded border border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100 text-[10px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-analytics"
          >
            <BarChart3 className="w-3 h-3" /> METRICS
          </button>
          <button
            disabled
            className="px-2 py-2 rounded border border-zinc-600/30 bg-zinc-800/40 text-zinc-500 text-[10px] tracking-widest flex items-center justify-center gap-1 cursor-not-allowed"
            title="Pause/resume coming soon"
          >
            <Power className="w-3 h-3" /> {bot.status === "active" ? "PAUSE" : "RESUME"}
          </button>
          <button
            onClick={() => navigate(`/cutscene/bot:${bot.id}`)}
            className="col-span-2 px-3 py-2 rounded border border-fuchsia-400/50 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-100 text-[10px] tracking-widest flex items-center justify-center gap-2"
            data-testid="bot-office-talk"
            title="Walk in and start a face-to-face"
          >
            <Sparkles className="w-3 h-3" /> TALK TO {bot.name.toUpperCase()}
          </button>
        </div>
      </aside>

      {/* DORMANT GATE — full overlay until the player wakes the bot */}
      <AnimatePresence>
        {dormant && (
          <motion.div
            key="dormant"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center"
          >
            <div className={`max-w-md w-[90%] mx-auto rounded-lg border-2 ${accent.ring} ${accent.glow} bg-black/95 p-6 text-center`}>
              <div className={`text-xs tracking-[0.5em] mb-3 ${accent.text}`}>▌ DORMANT UNIT ▌</div>
              <div className="text-pink-100 text-2xl tracking-[0.2em] mb-1" style={{ fontFamily: "'VT323', monospace" }}>
                {slug}
              </div>
              <div className="text-pink-200/70 text-sm leading-snug mb-5">
                The capsule's still sealed. {slug} won't lift a finger until you crack it open.
                <span className="block mt-1 text-pink-300/60 text-xs italic">"It's literally a paperweight 'til you wake it up." — Pablo</span>
              </div>
              <button
                type="button"
                onClick={activate}
                data-testid="bot-office-activate"
                className={`w-full px-4 py-3 rounded border-2 ${accent.ring} ${accent.text} ${accent.chip} hover:brightness-125 text-sm tracking-[0.4em] flex items-center justify-center gap-2`}
              >
                <Coins className="w-4 h-4" /> ACTIVATE — 10F
              </button>
              <button
                type="button"
                onClick={() => navigate("/store/bots/vending")}
                className="mt-3 w-full text-[10px] tracking-[0.3em] text-cyan-300/80 hover:text-cyan-100"
              >
                ◂ BUY ANOTHER FROM THE VENDING MACHINE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle Pablo subtitle so the room doesn't feel empty */}
      <AnimatePresence>
        <motion.div
          key="subtitle"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-md w-[90%] text-center"
        >
          <div className="inline-block px-4 py-2 rounded-md border border-pink-400/40 bg-black/70 backdrop-blur text-pink-100 text-xs leading-snug">
            <span className="text-pink-300 mr-2">PABLO:</span>
            {bot.status === "active"
              ? `${bot.name} is on the grind. Try not to interrupt.`
              : bot.status === "paused"
                ? `${bot.name} is on standby. Wake them up when you need them.`
                : `${bot.name} hit a snag. Check the logs.`}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
