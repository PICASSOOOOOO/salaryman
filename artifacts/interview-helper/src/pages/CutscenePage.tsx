/**
 * /cutscene/:id — load a cutscene from the library and run it.
 *
 * Special id formats:
 *   - "bot:<botId>"  → fetches the user's bot and mints an inline conversation
 *   - any library id (e.g. "lobby-receptionist") → loads from CUTSCENE_LIBRARY
 *
 * Falls back to a friendly index of all available scenes.
 */

import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import CutsceneRunner from "@/components/CutsceneRunner";
import { type Cutscene, getCutscene, listCutscenes } from "@/lib/cutscenes";
import { clearMilaHandoffFlag } from "@/lib/story-scene1";
import { apiFetch } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

const BOT_ACCENTS = ["#ec4899", "#22d3ee", "#a78bfa", "#fbbf24", "#a3e635", "#d946ef"];

interface BotData {
  id: number;
  name: string;
  personality: string;
  status: "active" | "paused" | "error";
  collaborationRole?: string | null;
}

function buildBotCutscene(bot: BotData): Cutscene {
  const accent = BOT_ACCENTS[bot.id % BOT_ACCENTS.length];
  const role = bot.collaborationRole?.trim() || "Office Bot · Your Roster";
  // Pick a Pro-baked portrait that fits the bot. Jean Claw and PABLO have
  // dedicated kit portraits; every other bot gets a unique per-bot portrait
  // minted on first TALK by POST /api/bots/:id/portrait. The useArtAsset
  // hook in CutsceneRunner polls this key until the image is ready and
  // shows a placeholder in the meantime.
  const slug = bot.name.toLowerCase();
  const artKey =
    slug.includes("jean") ? "cutscene_jean_claw"
    : slug === "pablo"     ? "cutscene_pablo"
    : `bot_portrait_${bot.id}`;

  const statusLine =
    bot.status === "active"
      ? "I'm on the clock. What do you need?"
      : bot.status === "paused"
        ? "I was on standby. Glad you came by — what's up?"
        : "Something broke earlier. Read the logs first, then we talk.";

  return {
    id: `bot:${bot.id}`,
    title: `${bot.name} — Private Office`,
    partner: { artKey, name: bot.name.toUpperCase(), role, accent },
    lines: [
      { speaker: "partner", text: statusLine },
      { speaker: "player",  text: "I want to get something done. What's the fastest channel?" },
      { speaker: "partner", text: "Depends. Voice if it's urgent, video if you need my screen, mail if it's paperwork. Or kick it to the terminal and I'll handle it from there." },
    ],
    actions: [
      { kind: "video",    label: "VIDEO HUDDLE" },
      { kind: "phone",    label: "VOICE CALL" },
      { kind: "text",     label: "QUICK TEXT" },
      { kind: "email",    label: "SEND EMAIL" },
      { kind: "terminal", label: "OPEN TERMINAL" },
    ],
  };
}

export default function CutscenePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";

  const [botScene, setBotScene] = useState<Cutscene | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBotId = id.startsWith("bot:");
  const libScene = !isBotId ? getCutscene(id) : null;

  // The Mila handoff is delivered "at least once": WorldPlay marks it pending at
  // the MX-75 claim and replays it on reload until shown. Reaching this page IS
  // the delivery, so clear the pending flag here to stop any further replays.
  useEffect(() => {
    clearMilaHandoffFlag(id, typeof localStorage !== "undefined" ? localStorage : null);
  }, [id]);

  useEffect(() => {
    if (!isBotId) return;
    const botId = id.slice("bot:".length);
    if (!botId) { setError("Missing bot id."); return; }
    setLoading(true);
    setError(null);
    apiFetch(`/api/bots/${encodeURIComponent(botId)}`)
      .then(async r => {
        if (!r.ok) throw new Error(`Could not load bot (${r.status}).`);
        const body = await r.json();
        const bot: BotData = body?.bot ?? body;
        if (!bot?.id) throw new Error("Bot not found.");
        setBotScene(buildBotCutscene(bot));
      })
      .catch(e => setError(e?.message ?? "Failed to load bot."))
      .finally(() => setLoading(false));
  }, [id, isBotId]);

  if (isBotId && loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-pink-300">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (isBotId && error) {
    return (
      <div className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center px-6">
        <div className="text-pink-400 tracking-[0.4em] mb-3" style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem" }}>
          ▌ NO ANSWER
        </div>
        <div className="text-zinc-500 text-sm mb-6">{error}</div>
        <button
          type="button"
          onClick={() => setLocation("/bots")}
          className="px-4 py-2 rounded border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 text-xs tracking-widest"
        >
          ◂ BACK TO BOTS
        </button>
      </div>
    );
  }

  const scene = libScene ?? botScene;

  if (!scene) {
    return (
      <div className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-pink-400 tracking-[0.4em] mb-3" style={{ fontFamily: "var(--font-sans)", fontSize: "1.2rem" }}>
          ▌ {id ? `SCENE NOT FOUND` : `CUTSCENE LIBRARY`}
        </div>
        {id && <div className="text-zinc-500 text-sm mb-6">No cutscene registered for "{id}".</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
          {listCutscenes().map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setLocation(`/cutscene/${s.id}`)}
              className="px-4 py-3 rounded border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-left text-sm tracking-widest text-pink-100"
              data-testid={`cutscene-link-${s.id}`}
            >
              ▸ {s.title.toUpperCase()}
              <div className="text-[10px] text-zinc-500 mt-0.5">{s.partner.name} — {s.partner.role}</div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLocation("/office")}
          className="mt-6 text-xs tracking-[0.3em] text-zinc-500 hover:text-zinc-200"
        >
          ◂ BACK TO OFFICE
        </button>
      </div>
    );
  }

  return (
    <CutsceneRunner
      cutscene={scene}
      onClose={() => setLocation(isBotId ? `/bots/${id.slice(4)}/office` : "/office")}
    />
  );
}
