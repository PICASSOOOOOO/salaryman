import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import { Loader2, ArrowLeft, Settings, Power, MessageSquare, Activity } from "lucide-react";

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
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[bot.status]}`} />
          <div className="flex flex-col leading-tight">
            <span className={`text-xs tracking-[0.3em] ${accent.text}`}>{slug}</span>
            <span className="text-[9px] tracking-[0.25em] text-pink-300/70">{bot.collaborationRole?.toUpperCase() || "SOLO OPERATIVE"}</span>
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

      {/* Right-side dossier panel */}
      <aside className="absolute right-4 top-20 bottom-24 w-[300px] z-10 rounded-md border border-pink-400/30 bg-black/70 backdrop-blur p-4 flex flex-col gap-3 overflow-y-auto">
        <header className="flex items-center justify-between">
          <h2 className={`text-sm tracking-[0.25em] ${accent.text}`}>DOSSIER</h2>
          <span className={`text-[9px] tracking-widest px-2 py-0.5 rounded border ${accent.chip} ${accent.text}`}>
            #{bot.id}
          </span>
        </header>

        <div>
          <div className="text-[9px] tracking-widest text-pink-300/60 mb-1">DESIGNATION</div>
          <div className="text-pink-100 text-base">{bot.name}</div>
        </div>

        <div>
          <div className="text-[9px] tracking-widest text-pink-300/60 mb-1">STATUS</div>
          <div className="text-pink-100 text-xs flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[bot.status]}`} />
            {STATUS_LABEL[bot.status]}
          </div>
        </div>

        <div>
          <div className="text-[9px] tracking-widest text-pink-300/60 mb-1">PERSONALITY</div>
          <div className="text-pink-100/80 text-xs leading-snug max-h-32 overflow-y-auto">
            {bot.personality || "No personality set."}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate(`/bots/${bot.id}`)}
            className="px-3 py-2 rounded border border-pink-400/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-[11px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-configure"
          >
            <Settings className="w-3 h-3" /> CONFIG
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/command`)}
            className="px-3 py-2 rounded border border-cyan-400/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100 text-[11px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-command"
          >
            <MessageSquare className="w-3 h-3" /> COMMAND
          </button>
          <button
            onClick={() => navigate(`/bots/${bot.id}/logs`)}
            className="px-3 py-2 rounded border border-violet-400/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-100 text-[11px] tracking-widest flex items-center justify-center gap-1"
            data-testid="bot-office-logs"
          >
            <Activity className="w-3 h-3" /> LOGS
          </button>
          <button
            disabled
            className="px-3 py-2 rounded border border-zinc-600/30 bg-zinc-800/40 text-zinc-500 text-[11px] tracking-widest flex items-center justify-center gap-1 cursor-not-allowed"
            title="Pause/resume coming soon"
          >
            <Power className="w-3 h-3" /> {bot.status === "active" ? "PAUSE" : "RESUME"}
          </button>
        </div>
      </aside>

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
