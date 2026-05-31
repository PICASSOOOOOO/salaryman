import { Volume2, VolumeX, Radio, Music, Mic, Sparkles, Sliders } from "lucide-react";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { playClick } from "@/lib/ui-sound";
import type { AudioSettings } from "@/lib/audio-settings";

// The Hummingbird audio hub panel — the canonical place to control every
// channel of SALARYMAN audio. Reads/writes the central store, so it stays in
// sync with the game settings page and the terminal quick-controls.
type VolumeKey = "master" | "music" | "sfx" | "voice" | "soundtrack";
const CHANNELS: { key: VolumeKey; label: string; hint: string; icon: typeof Volume2; accent: string }[] = [
  { key: "master",     label: "MASTER",     hint: "Everything",            icon: Sliders, accent: "#c084fc" },
  { key: "music",      label: "AMBIANCE",   hint: "Low ambient bed",       icon: Music,   accent: "#a78bfa" },
  { key: "sfx",        label: "SFX",        hint: "Interface & game",      icon: Sparkles,accent: "#f472b6" },
  { key: "voice",      label: "VOICE",      hint: "Pablo & advisors",      icon: Mic,     accent: "#60a5fa" },
  { key: "soundtrack", label: "MUSIC",      hint: "Office radio songs",    icon: Radio,   accent: "#fbbf24" },
];

export function AudioSettingsPanel() {
  const { settings, set, toggleMuted } = useAudioSettings();
  return (
    <section className="rounded-xl border border-purple-500/20 bg-black/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-purple-300/80">
          <Sliders className="w-3.5 h-3.5" /> AUDIO HUB
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

      <div className="space-y-3">
        {CHANNELS.map(({ key, label, hint, icon: Icon, accent }) => (
          <div key={key} className="flex items-center gap-2.5">
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
            <div className="w-[88px] shrink-0">
              <div className="text-[10px] font-mono tracking-wider text-zinc-300">{label}</div>
              <div className="text-[8px] font-mono text-zinc-600 leading-tight">{hint}</div>
            </div>
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
          MUSIC · {settings.musicEnabled ? "ON" : "OFF"}
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

      <p className="mt-3 text-[9px] font-mono text-zinc-600 leading-relaxed">
        These control all of SALARYMAN — the game, the terminal, and this player.
        MUSIC (the office radio songs) is off by default and plays only in-game when
        switched on. AMBIANCE is a low background bed that plays during the game.
      </p>
    </section>
  );
}
