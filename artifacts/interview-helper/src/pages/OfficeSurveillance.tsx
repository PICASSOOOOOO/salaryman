import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, ScanEye, Wifi, AlertTriangle, BatteryCharging, Coffee,
  User as UserIcon, Building2, Loader2, Zap, Pause, Activity,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@workspace/replit-auth-web";
import { usePlan } from "@/hooks/use-plan";
import { PixelOffice } from "@/components/PixelOffice";
import { PixelBotAvatar, tintForBotStatus } from "@/components/PixelBotAvatar";

const tintForStatus = (k: "active" | "paused" | "error") => tintForBotStatus(k);

interface BotData {
  id: number;
  name: string;
  personality?: string;
  status: "active" | "paused" | "error" | string;
  collaborationRole?: string | null;
  createdAt?: string;
}

const STATUS_COLOR: Record<string, { dot: string; text: string; bg: string; border: string; glow: string }> = {
  active: {
    dot: "bg-lime-400",
    text: "text-lime-300",
    bg: "bg-lime-500/8",
    border: "border-lime-400/40",
    glow: "shadow-[0_0_18px_rgba(163,230,53,0.45)]",
  },
  paused: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/8",
    border: "border-amber-400/40",
    glow: "shadow-[0_0_14px_rgba(251,191,36,0.35)]",
  },
  error: {
    dot: "bg-red-500",
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-400/50",
    glow: "shadow-[0_0_18px_rgba(248,113,113,0.5)]",
  },
};

function statusKey(s: string): "active" | "paused" | "error" {
  if (s === "active" || s === "paused" || s === "error") return s;
  return "paused";
}

const STATUS_LABEL: Record<string, string> = {
  active: "ON SHIFT",
  paused: "STANDBY",
  error: "FAULT",
};

export default function OfficeSurveillance() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro } = usePlan();
  const [bots, setBots] = useState<BotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Live tick for ambient camera HUD (timestamp + sweep)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/bots", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          setError(`Bot roster unavailable (${res.status})`);
          setLoading(false);
          return;
        }
        const data = await res.json();
        const list: BotData[] = Array.isArray(data) ? data : Array.isArray(data?.bots) ? data.bots : [];
        setBots(list);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError("Surveillance feed offline");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const onShift = useMemo(() => bots.filter(b => statusKey(b.status) === "active"), [bots]);
  const charging = useMemo(() => bots.filter(b => statusKey(b.status) === "paused"), [bots]);
  const faulted = useMemo(() => bots.filter(b => statusKey(b.status) === "error"), [bots]);

  // Make sure we always render at least 4 charging slots so empty docks
  // are visible — that's the visual cue that there's headroom for new bots.
  const chargingSlots = useMemo(() => {
    const min = 4;
    const padded = [...charging];
    while (padded.length < min) padded.push({ id: -(padded.length + 1), name: "EMPTY DOCK", status: "empty" } as any);
    return padded;
  }, [charging]);

  const userDisplayName = user?.firstName || user?.email?.split("@")[0] || "OPERATOR";
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#05060a] text-zinc-300 flex items-center justify-center">
        <div className="flex items-center gap-3 font-mono text-sm tracking-widest text-emerald-300/70">
          <Loader2 className="w-4 h-4 animate-spin" />
          INITIALIZING SURVEILLANCE FEED...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#05060a] text-zinc-300 flex items-center justify-center px-6">
        <div className="max-w-md text-center font-mono space-y-4">
          <ScanEye className="w-10 h-10 text-emerald-400/70 mx-auto" />
          <h1 className="text-lg tracking-widest text-emerald-300">OFFICE CAM · ACCESS DENIED</h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Surveillance is owner-only. Sign in to see your floor plan, bot status, and dock occupancy.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 border border-zinc-700/60 rounded-md text-xs tracking-widest hover:border-emerald-400/40 hover:text-emerald-300 transition-colors"
          >
            ← BACK TO TERMINAL
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#05060a] text-zinc-200 font-mono"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px))" }}
    >
      {/* CCTV header */}
      <header className="px-4 sm:px-6 py-3 border-b border-emerald-900/40 bg-emerald-950/10 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/bots/office")}
            className="flex items-center gap-1.5 text-xs tracking-widest text-zinc-500 hover:text-emerald-300 transition-colors"
            data-testid="link-back-to-office"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">MY OFFICE</span>
          </button>
          <div className="flex items-center gap-2 text-emerald-300">
            <ScanEye className="w-4 h-4" />
            <span className="text-xs sm:text-sm tracking-widest">OFFICE CAM · LIVE</span>
            <motion.span
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-red-500"
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-zinc-500 tracking-widest">
            <Wifi className="w-3 h-3 text-emerald-400/70" />
            <span className="hidden sm:inline">{timestamp}</span>
            <span className="sm:hidden">{now.toLocaleTimeString().slice(0, 5)}</span>
          </div>
        </div>
        {/* Status counter strip */}
        <div className="flex items-center gap-3 mt-2 text-[10px] tracking-widest">
          <span className="flex items-center gap-1 text-lime-300">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
            {onShift.length} ON SHIFT
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {charging.length} CHARGING
          </span>
          {faulted.length > 0 && (
            <span className="flex items-center gap-1 text-red-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {faulted.length} FAULT
            </span>
          )}
          <span className="ml-auto text-zinc-600">FLR 14 · MINX TOWER</span>
        </div>
      </header>

      {error && (
        <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-red-500/8 border border-red-500/30 text-xs text-red-300 tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      <main className="px-4 sm:px-6 py-5 max-w-6xl mx-auto space-y-6">
        {/* ── FLOOR PLAN ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] tracking-[0.3em] text-emerald-400/70 mb-3 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5" /> FLOOR PLAN — PUBLIC WORK AREA
          </h2>

          {/* Pixel-art office diorama — same Pixel Agents sprites used by */}
          {/* PabloOffice's LiveOffice canvas, so the surveillance feed and */}
          {/* the rest of the game share one consistent visual cast. Paid */}
          {/* (isPro) users get the bullpen-room extension populated only */}
          {/* with their *active* bots — inactive bots leave their desks */}
          {/* empty (per-user direction). */}
          <div className="relative mb-4 rounded-lg border border-emerald-900/40 bg-[#03050a] p-3 sm:p-4 overflow-hidden">
            <div className="text-[9px] tracking-[0.3em] text-emerald-400/60 mb-2 flex items-center justify-between">
              <span>
                ▼ LIVE FEED — INT. PABLO'S OFFICE
                {isPro && <span className="text-emerald-300/70"> + BOT BULLPEN</span>}
              </span>
              <span className="text-zinc-600">CAM 01 · 28×32 PX</span>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="min-w-fit mx-auto">
                <PixelOffice
                  scale={2}
                  mode="wander"
                  bullpen={isPro}
                  activeBots={isPro ? onShift.map(b => ({ id: b.id, name: b.name, status: "active" })) : []}
                  idleBots={isPro ? charging.map(b => ({ id: b.id, name: b.name, status: "paused" })) : []}
                />
              </div>
            </div>
            {isPro && onShift.length === 0 && (
              <div className="mt-2 text-[9px] tracking-[0.3em] text-zinc-600 text-center">
                BULLPEN QUIET — NO BOTS ON SHIFT · ACTIVATE A BOT TO STAFF A DESK
              </div>
            )}
          </div>

          <div
            className="relative rounded-lg border border-emerald-900/40 bg-gradient-to-b from-[#0a0e10] to-[#070809] p-4 sm:p-6 overflow-hidden"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(16,185,129,0.04) 0 1px, transparent 1px 28px)," +
                "repeating-linear-gradient(90deg, rgba(16,185,129,0.04) 0 1px, transparent 1px 28px)",
            }}
          >
            {/* Sweeping scan line */}
            <motion.div
              className="absolute inset-x-0 h-12 pointer-events-none"
              style={{
                background: "linear-gradient(180deg, transparent, rgba(16,185,129,0.10), transparent)",
              }}
              animate={{ top: ["-10%", "100%"] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />

            {/* PRIVATE DESK — owner */}
            <div className="relative mb-6">
              <div className="text-[9px] tracking-[0.3em] text-emerald-400/60 mb-2">
                ▼ PRIVATE — OWNER WORKSTATION
              </div>
              <div className="flex justify-center">
                <div
                  className="relative w-full sm:w-80 rounded-md border-2 border-emerald-400/60 bg-emerald-950/20 px-4 py-4 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
                  data-testid="card-owner-desk"
                >
                  <div className="absolute -top-2 left-3 px-2 bg-[#070809] text-[9px] tracking-[0.3em] text-emerald-300">
                    DESK · 01
                  </div>
                  <div className="flex items-center gap-3">
                    {user?.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt={userDisplayName}
                        className="w-10 h-10 rounded-md border border-emerald-400/40 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md flex items-center justify-center bg-emerald-500/15 border border-emerald-400/40">
                        <UserIcon className="w-5 h-5 text-emerald-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm tracking-widest text-emerald-200 truncate">
                        {userDisplayName.toUpperCase()}
                      </div>
                      <div className="text-[10px] tracking-widest text-emerald-400/70 flex items-center gap-1">
                        <Activity className="w-2.5 h-2.5" /> YOU · ON DECK
                      </div>
                    </div>
                    <Coffee className="w-4 h-4 text-amber-400/70 ml-auto" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-[9px] text-zinc-500 tracking-widest">
                    <div className="border border-emerald-900/40 rounded px-1.5 py-1 text-center">TERM</div>
                    <div className="border border-emerald-900/40 rounded px-1.5 py-1 text-center">CRT</div>
                    <div className="border border-emerald-900/40 rounded px-1.5 py-1 text-center">CAP</div>
                  </div>
                </div>
              </div>
            </div>

            {/* PUBLIC WORK AREA — bot desks */}
            <div className="text-[9px] tracking-[0.3em] text-zinc-500 mb-2">
              ▼ PUBLIC FLOOR — BOT DESKS · {onShift.length + faulted.length} OCCUPIED
            </div>
            {onShift.length + faulted.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-xs tracking-widest border border-dashed border-zinc-800 rounded-md">
                NO BOTS ON SHIFT — WORK FLOOR IS QUIET
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[...onShift, ...faulted].map((b, i) => {
                  const k = statusKey(b.status);
                  const c = STATUS_COLOR[k];
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/bots/${b.id}/office`)}
                      className={`group relative rounded-md border ${c.border} ${c.bg} px-3 py-3 cursor-pointer hover:scale-[1.02] transition-transform ${c.glow}`}
                      data-testid={`card-bot-desk-${b.id}`}
                    >
                      <div className="absolute -top-2 left-2 px-1.5 bg-[#070809] text-[9px] tracking-[0.3em] text-zinc-500">
                        DESK · {String(i + 2).padStart(2, "0")}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${c.bg} border ${c.border}`}>
                          <PixelBotAvatar size={22} tint={tintForStatus(k)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-xs tracking-widest ${c.text} truncate`}>
                            {b.name.toUpperCase()}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${k === "active" ? "animate-pulse" : ""}`} />
                            <span className="text-[9px] tracking-widest text-zinc-500">
                              {STATUS_LABEL[k]}
                            </span>
                          </div>
                        </div>
                      </div>
                      {b.collaborationRole && (
                        <div className="mt-2 text-[9px] text-zinc-600 tracking-widest truncate">
                          ROLE · {b.collaborationRole.toUpperCase()}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* CHARGING WALL */}
            <div className="mt-6">
              <div className="text-[9px] tracking-[0.3em] text-amber-400/60 mb-2 flex items-center gap-1.5">
                <BatteryCharging className="w-3 h-3" /> CHARGING WALL — DOCK STATUS
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {chargingSlots.map((b, i) => {
                  const empty = (b as any).status === "empty";
                  return (
                    <div
                      key={b.id}
                      onClick={() => !empty && navigate(`/bots/${b.id}/office`)}
                      className={`relative rounded-sm border px-2 py-2 text-center transition-colors ${
                        empty
                          ? "border-zinc-800 bg-zinc-900/40 text-zinc-700"
                          : "border-amber-500/40 bg-amber-500/8 text-amber-300 cursor-pointer hover:bg-amber-500/15"
                      }`}
                      title={empty ? "Empty dock" : b.name}
                      data-testid={empty ? `dock-empty-${i}` : `dock-bot-${b.id}`}
                    >
                      <div className="flex items-center justify-center mb-1">
                        {empty ? (
                          <Zap className="w-3 h-3" />
                        ) : (
                          <BatteryCharging className="w-3 h-3 animate-pulse" />
                        )}
                      </div>
                      <div className="text-[8px] tracking-widest truncate">
                        {empty ? `D${String(i + 1).padStart(2, "0")}` : b.name.slice(0, 6).toUpperCase()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── ROSTER TABLE ──────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] tracking-[0.3em] text-emerald-400/70 mb-3">
            ROSTER · {bots.length} TOTAL
          </h2>
          {bots.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-xs tracking-widest border border-dashed border-zinc-800 rounded-md">
              NO BOTS HIRED YET ·
              <button
                onClick={() => navigate("/bots")}
                className="ml-2 text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                HIRE ONE
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-zinc-900/40 text-[10px] tracking-widest text-zinc-500 border-b border-zinc-800">
                <div className="col-span-5 sm:col-span-4">NAME</div>
                <div className="col-span-3 sm:col-span-2">STATUS</div>
                <div className="hidden sm:block sm:col-span-3">ROLE</div>
                <div className="col-span-4 sm:col-span-3 text-right">ACTION</div>
              </div>
              {bots.map(b => {
                const k = statusKey(b.status);
                const c = STATUS_COLOR[k];
                return (
                  <div
                    key={b.id}
                    className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/30 transition-colors"
                    data-testid={`row-bot-${b.id}`}
                  >
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-2 min-w-0">
                      <PixelBotAvatar size={20} tint={tintForStatus(k)} />
                      <span className="text-xs tracking-widest text-zinc-200 truncate">{b.name.toUpperCase()}</span>
                    </div>
                    <div className="col-span-3 sm:col-span-2 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${k === "active" ? "animate-pulse" : ""}`} />
                      <span className={`text-[10px] tracking-widest ${c.text}`}>{STATUS_LABEL[k]}</span>
                    </div>
                    <div className="hidden sm:block sm:col-span-3 text-[10px] tracking-widest text-zinc-500 truncate">
                      {b.collaborationRole?.toUpperCase() || (k === "active" ? "AT DESK" : k === "paused" ? "ON DOCK" : "MAINTENANCE")}
                    </div>
                    <div className="col-span-4 sm:col-span-3 flex justify-end gap-1.5">
                      <button
                        onClick={() => navigate(`/bots/${b.id}/office`)}
                        className="px-2 py-1 rounded text-[9px] tracking-widest border border-zinc-700 hover:border-emerald-400/50 hover:text-emerald-300 transition-colors"
                      >
                        VIEW
                      </button>
                      {k === "paused" ? (
                        <span className="px-2 py-1 rounded text-[9px] tracking-widest border border-amber-700/40 text-amber-400/70 flex items-center gap-1">
                          <Pause className="w-2.5 h-2.5" /> DOCK
                        </span>
                      ) : k === "error" ? (
                        <span className="px-2 py-1 rounded text-[9px] tracking-widest border border-red-700/40 text-red-300 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> FIX
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-[9px] tracking-widest border border-lime-700/40 text-lime-300 flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5" /> LIVE
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="text-center text-[9px] tracking-[0.3em] text-zinc-700 pb-6">
          PICASSO.AI · INTERNAL CCTV · {now.getFullYear()} · TICK {tick}
        </div>
      </main>
    </div>
  );
}
