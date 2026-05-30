import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Volume2, VolumeX, X, SlidersHorizontal } from "lucide-react";
import { useAudioSettings } from "@/hooks/use-audio-settings";

// ── Global audio control ─────────────────────────────────────────────────────
// An always-available, obvious way to STOP or TURN DOWN the music from anywhere
// in the app (the full mixer still lives on /game/settings). A small speaker
// button parks in the bottom-right corner; clicking it opens a compact panel
// with a master mute and the three sliders people actually reach for:
// Master, Music (ambient score) and Soundtrack (the distant office radio).
// Reads/writes the central audio-settings store, so it stays in lockstep with
// the settings page, the office radio and every other audio consumer.

const SLIDERS: ReadonlyArray<{ key: "master" | "music" | "soundtrack"; label: string }> = [
  { key: "master", label: "Master" },
  { key: "music", label: "Music" },
  { key: "soundtrack", label: "Soundtrack" },
];

export function AudioControl() {
  const { settings, set, toggleMuted } = useAudioSettings();
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
      className="fixed z-[60] bottom-3 right-3 font-mono"
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
