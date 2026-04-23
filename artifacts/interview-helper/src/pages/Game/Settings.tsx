import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Monitor, Volume2, Eye, Gamepad2 } from "lucide-react";

const STORE_KEY = "sm_game_settings_v1";

type GameSettings = {
  resolution: "auto" | "720p" | "1080p" | "1440p";
  uiScale: number;        // 0.8 – 1.4
  fpsCap: 30 | 60 | 120 | 0;
  reducedMotion: boolean;
  bloom: boolean;
  cinematic: boolean;
  masterVolume: number;   // 0–1
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  invertY: boolean;
  controlScheme: "wasd" | "arrows" | "touch";
};

const DEFAULTS: GameSettings = {
  resolution: "auto",
  uiScale: 1.0,
  fpsCap: 60,
  reducedMotion: false,
  bloom: true,
  cinematic: true,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  voiceVolume: 1.0,
  invertY: false,
  controlScheme: "wasd",
};

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch { return DEFAULTS; }
}

export default function GameSettings() {
  const [s, setS] = useState<GameSettings>(load);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
    // Apply UI scale immediately to the document so the user sees it
    document.documentElement.style.setProperty("--game-ui-scale", String(s.uiScale));
  }, [s]);

  const Sec = ({ icon: Icon, title, children }: any) => (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] text-zinc-300 mb-3">
        <Icon className="w-3.5 h-3.5 text-zinc-500" /> {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );

  const Row = ({ label, hint, children }: any) => (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
      <div>
        <div className="text-xs font-mono text-zinc-300 tracking-wider">{label}</div>
        {hint && <div className="text-[10px] text-zinc-600 mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );

  const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!on)}
      className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded border transition-colors ${
        on ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
           : "bg-zinc-900 border-zinc-700 text-zinc-500"
      }`}
    >
      {on ? "ON" : "OFF"}
    </button>
  );

  return (
    <div className="min-h-screen w-full" style={{
      background: "#070809",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Link href="/game" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
          <ChevronLeft className="w-4 h-4" /> GAME
        </Link>
        <h1 className="text-2xl font-mono tracking-[0.2em] text-zinc-100 mb-1">SETTINGS</h1>
        <p className="text-[11px] font-mono text-zinc-600 tracking-wider uppercase mb-6">
          Stored on this device. Reset anytime.
        </p>

        <div className="space-y-4">
          <Sec icon={Monitor} title="DISPLAY">
            <Row label="Resolution" hint="Auto matches your viewport.">
              <select
                value={s.resolution}
                onChange={(e) => setS({ ...s, resolution: e.target.value as any })}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
              >
                <option value="auto">AUTO</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="1440p">1440p</option>
              </select>
            </Row>
            <Row label="UI scale" hint={`${Math.round(s.uiScale * 100)}%`}>
              <input
                type="range" min={0.8} max={1.4} step={0.05}
                value={s.uiScale}
                onChange={(e) => setS({ ...s, uiScale: Number(e.target.value) })}
                className="w-40 accent-cyan-400"
              />
            </Row>
            <Row label="FPS cap">
              <select
                value={s.fpsCap}
                onChange={(e) => setS({ ...s, fpsCap: Number(e.target.value) as any })}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
              >
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={120}>120</option>
                <option value={0}>UNCAPPED</option>
              </select>
            </Row>
          </Sec>

          <Sec icon={Eye} title="VISUAL">
            <Row label="Reduced motion" hint="Stops all looping camera drift / parallax.">
              <Toggle on={s.reducedMotion} onChange={(v) => setS({ ...s, reducedMotion: v })} />
            </Row>
            <Row label="Bloom / glow">
              <Toggle on={s.bloom} onChange={(v) => setS({ ...s, bloom: v })} />
            </Row>
            <Row label="Cinematic letterbox" hint="Black bars during cutscenes.">
              <Toggle on={s.cinematic} onChange={(v) => setS({ ...s, cinematic: v })} />
            </Row>
          </Sec>

          <Sec icon={Volume2} title="AUDIO">
            {([
              ["Master", "masterVolume"],
              ["Music",  "musicVolume"],
              ["SFX",    "sfxVolume"],
              ["Voice",  "voiceVolume"],
            ] as const).map(([label, key]) => (
              <Row key={key} label={label} hint={`${Math.round((s as any)[key] * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={(s as any)[key]}
                  onChange={(e) => setS({ ...s, [key]: Number(e.target.value) } as any)}
                  className="w-40 accent-fuchsia-400" />
              </Row>
            ))}
            <p className="text-[10px] text-zinc-600 leading-relaxed mt-2">
              Phone always plays at master volume — calls override game audio.
            </p>
          </Sec>

          <Sec icon={Gamepad2} title="CONTROLS">
            <Row label="Scheme">
              <select
                value={s.controlScheme}
                onChange={(e) => setS({ ...s, controlScheme: e.target.value as any })}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
              >
                <option value="wasd">WASD</option>
                <option value="arrows">ARROWS</option>
                <option value="touch">TOUCH</option>
              </select>
            </Row>
            <Row label="Invert vertical">
              <Toggle on={s.invertY} onChange={(v) => setS({ ...s, invertY: v })} />
            </Row>
          </Sec>

          <button
            onClick={() => setS(DEFAULTS)}
            className="w-full py-2 text-xs font-mono tracking-widest text-red-300 border border-red-900/40 hover:bg-red-500/10 rounded"
          >
            RESET TO DEFAULTS
          </button>
        </div>
      </div>
    </div>
  );
}
