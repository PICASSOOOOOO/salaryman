/**
 * OfficeMonitor — the bot-floor dashboard rendered on /office (monitor mode).
 *
 * Lets an owner watch their whole crew at a glance WHILE they work the live
 * office floor above it (the "split window"):
 *   - Every bot is shown in a SLEEP CAPSULE until it has been ACTIVATED.
 *     Activated bots (status === "active") wake up and render as "AT WORK".
 *   - Bots are grouped by TEAM (department) with their shared SKILLS surfaced,
 *     and within a team similar skills sit together.
 *   - A layout toggle switches between BY TEAM (everyone, grouped) and SPLIT
 *     (a working column beside a sleeping-capsule column).
 *
 * All ordering / grouping / activation logic lives in lib/office-monitor.ts so
 * it can be unit-tested independently.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity, AlertTriangle, Loader2, Moon, ScanEye, Zap, Columns2, LayoutGrid,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useArtAsset } from "@/lib/art";
import { useAuth } from "@workspace/replit-auth-web";
import {
  groupByTeam, partitionByActivation, podState, botSkills,
  type MonitorBot, type TeamGroup,
} from "@/lib/office-monitor";

type Layout = "team" | "split";

/** Tiny CCTV mugshot — the same Nano Banana salaryman portrait the office uses,
 *  green-tinted, dimmed when the bot is asleep. */
function BotFace({ size, awake }: { size: number; awake: boolean }) {
  const url = useArtAsset("char_salaryman");
  return (
    <div
      className="rounded-md overflow-hidden bg-[#06070b] border border-emerald-900/50 shrink-0"
      style={{ width: size, height: size }}
    >
      {url && (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
          style={{ filter: `saturate(0.4) hue-rotate(75deg)${awake ? "" : " brightness(0.45)"}` }}
        />
      )}
    </div>
  );
}

function SkillChips({ skills, max = 4 }: { skills: string[]; max?: number }) {
  if (skills.length === 0) return null;
  const shown = skills.slice(0, max);
  const extra = skills.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {shown.map((s) => (
        <span
          key={s}
          className="text-[8px] tracking-widest px-1.5 py-0.5 rounded-sm border border-zinc-700/60 text-zinc-400"
        >
          {s.toUpperCase()}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[8px] tracking-widest px-1 py-0.5 text-zinc-600">+{extra}</span>
      )}
    </div>
  );
}

/**
 * One bot cell — a desk when AWAKE (activated), otherwise a SLEEP CAPSULE.
 * A faulted bot is STILL a capsule (it isn't activated); it just gets a small
 * red fault badge so the owner can see it errored, without pretending it's awake.
 */
function BotPod({ bot, accent }: { bot: MonitorBot; accent: string }) {
  const [, navigate] = useLocation();
  const state = podState(bot);
  const awake = state === "working";
  const fault = state === "fault";
  const skills = botSkills(bot);

  return (
    <button
      onClick={() => navigate(`/bots/${bot.id}/command`)}
      data-testid={`monitor-bot-${bot.id}`}
      data-podstate={state}
      className={`group relative text-left rounded-md border px-2.5 py-2 transition-transform hover:scale-[1.02] ${
        awake
          ? "border-lime-400/40 bg-lime-500/8 shadow-[0_0_14px_rgba(163,230,53,0.25)]"
          : "border-zinc-700/50 bg-zinc-900/40"
      }`}
      style={awake ? { borderColor: `${accent}66` } : undefined}
    >
      {/* capsule glass sheen for sleeping pods (incl. faulted ones) */}
      {!awake && (
        <div
          className="pointer-events-none absolute inset-0 rounded-md opacity-40"
          style={{ background: "linear-gradient(135deg, rgba(148,163,184,.16), transparent 55%)" }}
        />
      )}
      {/* fault badge — secondary metadata only, capsule state is unchanged */}
      {fault && (
        <span
          className="absolute top-1 right-1 flex items-center gap-0.5 text-[7px] tracking-widest text-red-300/90 bg-red-500/15 border border-red-400/40 rounded-sm px-1 py-0.5"
          title="This bot errored out — still asleep until reactivated"
        >
          <AlertTriangle className="w-2 h-2" /> FAULT
        </span>
      )}
      <div className="relative flex items-center gap-2">
        <BotFace size={26} awake={awake} />
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] tracking-widest truncate ${awake ? "text-lime-200" : "text-zinc-400"}`}>
            {bot.name.toUpperCase()}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {awake ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                <span className="text-[8px] tracking-widest text-lime-300/80">▸ AT WORK</span>
              </>
            ) : (
              <>
                <Moon className="w-2.5 h-2.5 text-zinc-500" />
                <span className="text-[8px] tracking-widest text-zinc-500">SLEEP CAPSULE</span>
              </>
            )}
          </div>
        </div>
      </div>
      <SkillChips skills={skills} />
    </button>
  );
}

function TeamHeader({ group }: { group: TeamGroup }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2 h-2 rounded-sm" style={{ background: group.accent }} />
      <span className="text-[11px] tracking-[0.25em]" style={{ color: group.accent }}>
        {group.label.toUpperCase()}
      </span>
      <span className="text-[9px] tracking-widest text-zinc-600">
        {group.workingCount} WORKING · {group.asleepCount} ASLEEP
      </span>
      {group.skills.length > 0 && (
        <span className="ml-auto hidden sm:block text-[8px] tracking-widest text-zinc-600 truncate max-w-[40%]">
          {group.skills.slice(0, 4).join(" · ").toUpperCase()}
        </span>
      )}
    </div>
  );
}

export default function OfficeMonitor() {
  const { isAuthenticated } = useAuth();
  const [bots, setBots] = useState<MonitorBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("team");

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch("/api/bots", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) { setError(`Roster unavailable (${res.status})`); setLoading(false); return; }
        const data = await res.json();
        const list: MonitorBot[] = Array.isArray(data) ? data : Array.isArray(data?.bots) ? data.bots : [];
        setBots(list);
        setError(null);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Monitor feed offline");
        setLoading(false);
      }
    };
    load();
    // Keep the floor fresh so activations from the terminal show up here.
    const iv = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAuthenticated]);

  const groups = useMemo(() => groupByTeam(bots), [bots]);
  const { working, asleep } = useMemo(() => partitionByActivation(bots), [bots]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 font-mono text-xs tracking-widest text-emerald-300/70 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> SCANNING BOT FLOOR…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-10 font-mono text-xs tracking-widest text-zinc-500">
        SIGN IN TO MONITOR YOUR BOT FLOOR
      </div>
    );
  }

  return (
    <div className="font-mono text-zinc-200" data-testid="office-monitor">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5 text-emerald-300">
          <ScanEye className="w-3.5 h-3.5" />
          <span className="text-[11px] tracking-[0.25em]">BOT MONITOR</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] tracking-widest">
          <span className="flex items-center gap-1 text-lime-300">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" /> {working.length} WORKING
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Moon className="w-2.5 h-2.5" /> {asleep.length} ASLEEP
          </span>
        </div>
        <div className="ml-auto inline-flex rounded-md border border-zinc-700/60 overflow-hidden">
          <button
            onClick={() => setLayout("team")}
            data-testid="monitor-layout-team"
            className={`px-2 py-1 flex items-center gap-1 text-[9px] tracking-widest ${layout === "team" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <LayoutGrid className="w-3 h-3" /> TEAMS
          </button>
          <button
            onClick={() => setLayout("split")}
            data-testid="monitor-layout-split"
            className={`px-2 py-1 flex items-center gap-1 text-[9px] tracking-widest ${layout === "split" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <Columns2 className="w-3 h-3" /> SPLIT
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-red-500/8 border border-red-500/30 text-[11px] text-red-300 tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      {bots.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 text-xs tracking-widest border border-dashed border-zinc-800 rounded-md">
          NO BOTS HIRED YET — THE FLOOR IS EMPTY
        </div>
      ) : layout === "team" ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} data-testid={`monitor-team-${g.key}`}>
              <TeamHeader group={g} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {g.bots.map((b) => (
                  <BotPod key={b.id} bot={b} accent={g.accent} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WORKING column */}
          <div data-testid="monitor-col-working">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] tracking-[0.25em] text-lime-300/80">
              <Activity className="w-3 h-3" /> ON SHIFT · {working.length}
            </div>
            {working.length === 0 ? (
              <div className="text-center py-6 text-zinc-600 text-[11px] tracking-widest border border-dashed border-zinc-800 rounded-md">
                NOBODY ON SHIFT — ACTIVATE A BOT FROM THE TERMINAL
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {working.map((b) => (
                  <BotPod key={b.id} bot={b} accent="#a3e635" />
                ))}
              </div>
            )}
          </div>
          {/* SLEEP CAPSULE column */}
          <div data-testid="monitor-col-asleep">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] tracking-[0.25em] text-zinc-400">
              <Moon className="w-3 h-3" /> SLEEP CAPSULES · {asleep.length}
            </div>
            {asleep.length === 0 ? (
              <div className="text-center py-6 text-zinc-600 text-[11px] tracking-widest border border-dashed border-zinc-800 rounded-md">
                EVERY BOT IS AWAKE AND WORKING
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {asleep.map((b) => (
                  <BotPod key={b.id} bot={b} accent="#94a3b8" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-[8px] tracking-[0.25em] text-zinc-600">
        <Zap className="w-2.5 h-2.5" /> ACTIVATE A BOT IN THE TERMINAL TO WAKE IT FROM ITS CAPSULE
      </div>
    </div>
  );
}
