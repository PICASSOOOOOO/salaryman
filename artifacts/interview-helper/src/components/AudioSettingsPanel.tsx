import { Volume2, VolumeX, Radio, Music, Mic, Sparkles, Sliders } from "lucide-react";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { playClick } from "@/lib/ui-sound";
import type { AudioSettings } from "@/lib/audio-settings";

// The Hummingbird audio hub panel — the canonical place to control every
// channel of SALARYMAN audio. Reads/writes the central store, so it stays in
// sync with the game settings page and the terminal quick-controls.
type VolumeKey = "master" | "music" | "sfx" | "voice" | "soundtrack";
const CHANNELS: { key: VolumeKey; label: string; icon: typeof Volume2; accent: string }[] = [
  { key: "master",     label: "MASTER",  icon: Sliders,  accent: "#c084fc" },
  { key: "music",      label: "AMBIANCE", icon: Music,   accent: "#a78bfa" },
  { key: "sfx",        label: "SFX",     icon: Sparkles, accent: "#f472b6" },
  { key: "voice",      label: "VOICE",   icon: Mic,     accent: "#60a5fa" },
  { key: "soundtrack", label: "RADIO",   icon: Radio,   accent: "#fbbf24" },
];

export function AudioSettingsPanel() {
  const { settings, set, toggleMuted } = useAudioSettings();
  return (
    <section className="rounded-xl border border-purple-500/20 bg-black/40 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="flex items-center gap-2 text-[10px] font-mono tracking-[0.22em] text-purple-300/80">
          <Sliders className="w-3.5 h-3.5" /> AUDIO
        </h2>
        <button
          onClick={() => { playClick(); toggleMuted(); }}
          className={`px-2.5 py-1 text-[10px] font-mono tracking-widest rounded border inline-flex items-center gap-1.5 transition-colors ${
            settings.muted
              ? "bg-red-500/20 border-red-500/40 text-red-300"
              : "bg-purple-500/10 border-purple-500/30 text-purple-200"
          }`}
        >
          {settings.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          {settings.muted ? "MUTED" : "ON"}
        </button>
      </div>

      <div className="space-y-2">
        {CHANNELS.map(({ key, label, icon: Icon, accent }) => (
          <div key={key} className="flex items-center gap-2.5">
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
            <div className="w-[68px] shrink-0 text-[10px] font-mono tracking-wider text-zinc-300">{label}</div>
            <input
              type="range" min={0} max={1} step={0.05} value={settings[key]}
              disabled={settings.muted}
              onChange={(e) => set({ [key]: Number(e.target.value) })}
              className="flex-1 disabled:opacity-40"
              style={{ accentColor: accent }}
            />
            <span className="w-8 text-right text-[9px] font-mono text-zinc-500 tabular-nums">
              {Math.round(settings[key] * 100)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => { playClick(); set({ musicEnabled: !settings.musicEnabled }); }}
          disabled={settings.muted}
          className={`px-2 py-1.5 text-[9px] font-mono tracking-widest rounded border transition-colors disabled:opacity-40 ${
            settings.musicEnabled
              ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
              : "bg-transparent border-zinc-700 text-zinc-500"
          }`}
        >
          SHADOW RADIO · {settings.musicEnabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => { playClick(); set({ ambianceEnabled: !settings.ambianceEnabled }); }}
          disabled={settings.muted}
          className={`px-2 py-1.5 text-[9px] font-mono tracking-widest rounded border transition-colors disabled:opacity-40 ${
            settings.ambianceEnabled
              ? "bg-purple-500/15 border-purple-500/40 text-purple-200"
              : "bg-transparent border-zinc-700 text-zinc-500"
          }`}
        >
          AMBIANCE · {settings.ambianceEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <p className="mt-2 text-[9px] font-mono text-zinc-600">Radio is off until enabled; ambiance starts on.</p>
    </section>
  );
}
