import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Volume2, VolumeX, X, SlidersHorizontal } from "lucide-react";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Global audio control ─────────────────────────────────────────────────────
// An always-available, obvious way to STOP or TURN DOWN the audio from anywhere
// in the app (the full mixer lives on the settings page). A small speaker
// button parks in the bottom-right corner; clicking it opens a compact panel
// with a master mute, two on/off toggles, and the sliders people reach for.
//   • SHADOW RADIO = the live Call Home station. Opt-in, app-wide.
//   • AMBIANCE = the low ambient bed. On by default, toggleable off.
// Reads/writes the central audio-settings store, so it stays in lockstep with
// the settings page, the office radio and every other audio consumer.

// `soundtrack` is the MUSIC level; `music` is the AMBIANCE level.
const SLIDERS: ReadonlyArray<{ key: "master" | "soundtrack" | "music"; label: string }> = [
  { key: "master", label: "Master" },
  { key: "soundtrack", label: "Shadow Radio" },
  { key: "music", label: "Ambiance" },
];

export function AudioControl({
  chatFabPresent = false,
  inGame = false,
}: {
  chatFabPresent?: boolean;
  // On in-game routes (/game, /office) the bottom-right corner is occupied by
  // the weapons wheel + mobile action cluster, so the speaker button lifts to
  // the TOP-RIGHT (beside the HUD eye) where the corner is clear on desktop
  // and mobile. Its panel then opens DOWNWARD so it never clips off-screen.
  inGame?: boolean;
}) {
  const { settings, set, toggleMuted } = useAudioSettings();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape so the panel never gets in the way.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const muted = settings.muted;

  return (
    <div
      ref={rootRef}
      className="fixed z-[60] font-mono"
      style={
        inGame
          ? {
              // In-game: park in the TOP-RIGHT, just LEFT of the HUD eye
              // (top:8 right:8, 28px wide) so we clear the bottom-right
              // weapons wheel + mobile action cluster entirely.
              top: isMobile ? "calc(env(safe-area-inset-top, 0px) + 8px)" : 8,
              right: isMobile ? "calc(env(safe-area-inset-right, 0px) + 44px)" : 44,
            }
          : {
              // When the global chat FAB is showing (bottom-right), sit to its
              // LEFT so the two floating buttons never overlap. On pages WITHOUT
              // the FAB (the /pablo front door), drop back into the plain corner
              // so we don't float over centred captions or input rows. Honour
              // the iOS safe-area insets like the chat FAB does.
              bottom: chatFabPresent
                ? (isMobile ? "calc(var(--app-safe-bottom) + 36px + var(--fab-bottom-offset, 0px))" : "calc(19px + var(--fab-bottom-offset, 0px))")
                : (isMobile ? "calc(var(--app-safe-bottom) + 16px + var(--fab-bottom-offset, 0px))" : "calc(12px + var(--fab-bottom-offset, 0px))"),
              right: chatFabPresent
                ? (isMobile ? "calc(env(safe-area-inset-right, 0px) + 104px)" : 68)
                : (isMobile ? "calc(env(safe-area-inset-right, 0px) + 16px)" : 12),
            }
      }
      data-testid="audio-control"
    >
      {open && (
        <div
          className={`absolute right-0 w-60 rounded-lg p-3 ${inGame ? "top-12" : "bottom-12"}`}
          style={{
            background: "rgba(8,11,14,0.96)",
            border: "1px solid rgba(56,189,248,0.4)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(56,189,248,0.12)",
            backdropFilter: "blur(8px)",
            // Clamp the popup to the space available left of the button so it
            // can never clip off the screen edge on very narrow phones (the
            // button shifts left when the chat FAB is present). w-60 stays the
            // preferred width; this only shrinks it when there isn't room.
            maxWidth: `calc(100vw - ${chatFabPresent ? 104 : 28}px)`,
          }}
          data-testid="audio-control-panel"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-[0.3em] text-cyan-400/80">AUDIO</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close audio panel"
              className="text-zinc-500 hover:text-cyan-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => toggleMuted()}
            data-testid="audio-control-mute"
            className={`w-full flex items-center justify-center gap-2 rounded border px-2 py-1.5 text-[10px] tracking-[0.2em] mb-3 transition-colors ${
              muted
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "bg-cyan-500/10 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/20"
            }`}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {muted ? "MUTED — TAP TO UNMUTE" : "SOUND ON — TAP TO MUTE"}
          </button>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => set({ musicEnabled: !settings.musicEnabled })}
              disabled={muted}
              data-testid="audio-control-music-toggle"
              className={`rounded border px-2 py-1.5 text-[9px] tracking-[0.15em] transition-colors disabled:opacity-40 ${
                settings.musicEnabled
                  ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-200"
                  : "bg-transparent border-zinc-700 text-zinc-500 hover:text-cyan-300"
              }`}
            >
              SHADOW RADIO · {settings.musicEnabled ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => set({ ambianceEnabled: !settings.ambianceEnabled })}
              disabled={muted}
              data-testid="audio-control-ambiance-toggle"
              className={`rounded border px-2 py-1.5 text-[9px] tracking-[0.15em] transition-colors disabled:opacity-40 ${
                settings.ambianceEnabled
                  ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-200"
                  : "bg-transparent border-zinc-700 text-zinc-500 hover:text-cyan-300"
              }`}
            >
              AMBIANCE · {settings.ambianceEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="text-[8px] tracking-[0.15em] text-zinc-600 mb-3 leading-relaxed">
            SHADOW RADIO PLAYS EVERYWHERE EXCEPT THE PHONE. AMBIANCE IS A LOW BACKGROUND BED.
          </div>

          <div className="space-y-2.5">
            {SLIDERS.map(({ key, label }) => (
              <label key={key} className="block">
                <div className="flex items-center justify-between text-[9px] tracking-[0.2em] text-zinc-400 mb-1">
                  <span>{label.toUpperCase()}</span>
                  <span className={muted ? "text-zinc-600" : "text-cyan-300/80"}>
                    {Math.round(settings[key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings[key]}
                  disabled={muted}
                  onChange={(e) => set({ [key]: Number(e.target.value) })}
                  className="w-full accent-cyan-400 disabled:opacity-40"
                  data-testid={`audio-control-slider-${key}`}
                />
              </label>
            ))}
          </div>

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center gap-1.5 text-[9px] tracking-[0.2em] text-zinc-500 hover:text-cyan-300"
          >
            <SlidersHorizontal className="w-3 h-3" />
            SOUND SETTINGS
          </Link>
        </div>
      )}

      {/* Subtle, low-weight corner affordance. At rest it sits dim with a
          neutral hairline border and no glow, so it blends into the corner
          instead of competing with page content / the in-game HUD. On
          hover/tap (and while open) it lifts to full opacity with a coloured
          edge so it's still easy to find and use. Muted state stays a touch
          more visible (and goes rose) so it reads at a glance. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close audio controls" : "Open audio controls"}
        title="Music & sound"
        data-testid="audio-control-toggle"
        className={`app-action app-control mobile-tap-target group w-8 h-8 rounded-lg backdrop-blur-sm hover:opacity-100 hover:scale-105 focus-visible:opacity-100 active:opacity-100 ${
          open ? "opacity-100" : muted ? "opacity-75" : "opacity-40"
        } ${
          open
            ? "bg-[rgba(8,11,14,0.92)]"
            : "bg-[rgba(8,11,14,0.5)] hover:bg-[rgba(8,11,14,0.92)]"
        } ${
          muted
            ? "border-rose-500/40 hover:border-rose-500/60"
            : "border-slate-400/25 hover:border-cyan-400/50"
        }`}
      >
        {muted ? (
          <VolumeX className="app-control-icon text-rose-300/90" />
        ) : (
          <Volume2 className="app-control-icon text-zinc-400 group-hover:text-cyan-300 transition-colors" />
        )}
      </button>
    </div>
  );
}

export default AudioControl;
