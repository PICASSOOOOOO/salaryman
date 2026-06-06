import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Volume2, VolumeX, X, SlidersHorizontal } from "lucide-react";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Global audio control ─────────────────────────────────────────────────────
// An always-available, obvious way to STOP or TURN DOWN the audio from anywhere
// in the app (the full mixer still lives on /game/settings). A small speaker
// button parks in the bottom-right corner; clicking it opens a compact panel
// with a master mute, two on/off toggles, and the sliders people reach for.
//   • MUSIC  = the office radio songs. Opt-in (default OFF), in-game only.
//   • AMBIANCE = the low ambient bed. Plays during the game, toggleable off.
// Reads/writes the central audio-settings store, so it stays in lockstep with
// the settings page, the office radio and every other audio consumer.

// `soundtrack` is the MUSIC level; `music` is the AMBIANCE level.
const SLIDERS: ReadonlyArray<{ key: "master" | "soundtrack" | "music"; label: string }> = [
  { key: "master", label: "Master" },
  { key: "soundtrack", label: "Music" },
  { key: "music", label: "Ambiance" },
];

export function AudioControl({ chatFabPresent = false }: { chatFabPresent?: boolean }) {
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
      style={{
        // When the global chat FAB is showing (bottom-right), sit to its LEFT
        // so the two floating buttons never overlap. On pages WITHOUT the FAB
        // (the /pablo front door, in-game), drop back into the plain corner so
        // we don't float over centred captions or input rows. Honour the iOS
        // safe-area insets like the chat FAB does.
        bottom: chatFabPresent
          ? (isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 36px)" : 19)
          : (isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 16px)" : 12),
        right: chatFabPresent
          ? (isMobile ? "calc(env(safe-area-inset-right, 0px) + 92px)" : 68)
          : (isMobile ? "calc(env(safe-area-inset-right, 0px) + 16px)" : 12),
      }}
      data-testid="audio-control"
    >
      {open && (
        <div
          className="absolute bottom-12 right-0 w-60 rounded-lg p-3"
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
              MUSIC · {settings.musicEnabled ? "ON" : "OFF"}
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
            MUSIC PLAYS IN-GAME ONLY WHEN ON. AMBIANCE IS A LOW BACKGROUND BED.
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
            href="/game/settings"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center gap-1.5 text-[9px] tracking-[0.2em] text-zinc-500 hover:text-cyan-300"
          >
            <SlidersHorizontal className="w-3 h-3" />
            ALL SOUND SETTINGS
          </Link>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close audio controls" : "Open audio controls"}
        title="Music & sound"
        data-testid="audio-control-toggle"
        className="w-9 h-9 flex items-center justify-center rounded-full transition-colors"
        style={{
          background: "rgba(8,11,14,0.92)",
          border: `1px solid ${muted ? "rgba(244,63,94,0.5)" : "rgba(56,189,248,0.5)"}`,
          boxShadow: muted
            ? "0 0 12px rgba(244,63,94,0.3)"
            : "0 0 12px rgba(56,189,248,0.3)",
          backdropFilter: "blur(6px)",
        }}
      >
        {muted ? (
          <VolumeX className="w-4 h-4 text-red-300" />
        ) : (
          <Volume2 className="w-4 h-4 text-cyan-300" />
        )}
      </button>
    </div>
  );
}

export default AudioControl;
