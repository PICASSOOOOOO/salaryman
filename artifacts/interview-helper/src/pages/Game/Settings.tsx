import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, Monitor, Volume2, VolumeX, Gamepad2, Building2,
  ChevronRight, TerminalSquare, Database, Camera, User, FlaskConical,
  Globe, Coins,
} from "lucide-react";
import { LanguageSelector } from "../../components/LanguageSelector";
import { CurrencySelector } from "../../components/CurrencySelector";
import { useAudioSettings } from "../../hooks/use-audio-settings";
import { AUDIO_DEFAULTS } from "../../lib/audio-settings";
import { CITY_NAME } from "../../lib/city-config";
import { applyCrt } from "../../lib/display-prefs";
import { useLowGfx } from "../../lib/lowGfx";

const STORE_KEY = "sm_game_settings_v1";

// NOTE: audio volumes (master/music/sfx/voice/soundtrack/mute) are owned by the
// central audio settings store (lib/audio-settings.ts) — NOT by this page's state.
// Both persist to STORE_KEY, so this page MERGES on save instead of overwriting,
// or it would clobber the volume keys the store writes.
type GameSettings = {
  // Display
  resolution: "auto" | "720p" | "1080p" | "1440p";
  uiScale: number;        // 0.8 – 1.4
  fpsCap: 30 | 60 | 120 | 0;
  cameraZoom: number;     // 1.6 – 4.0 — start zoom; read by WorldPlay's computeDefaultZoom
  weatherEffects: "full" | "reduced" | "off"; // gates rain/snow particles, puddle ripples & wet-street neon (lib/weather-quality.ts)
  reducedMotion: boolean;
  bloom: boolean;
  cinematic: boolean;
  // Terminal
  terminalBoot: boolean;  // boot-up flourish before a terminal opens
  crtEffect: boolean;     // scanlines + grain grade over scene art (applied app-wide)
  // Game
  invertY: boolean;
  controlScheme: "wasd" | "arrows" | "touch";
};

const DEFAULTS: GameSettings = {
  resolution: "auto",
  uiScale: 1.0,
  fpsCap: 120,
  cameraZoom: 3.2,
  weatherEffects: "full",
  reducedMotion: false,
  bloom: true,
  cinematic: true,
  terminalBoot: true,
  crtEffect: true,
  invertY: false,
  controlScheme: "wasd",
};

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Whitelist ONLY the game keys. The same localStorage blob also holds the
    // audio store's keys (master/music/sfx/voice/soundtrack/muted); if we let
    // those into `s`, the persist effect below would write stale copies back
    // and clobber values the audio store owns. Strip them here so audio stays
    // canonical in audio-settings.ts.
    const next = { ...DEFAULTS } as GameSettings;
    for (const k of Object.keys(DEFAULTS) as (keyof GameSettings)[]) {
      if (k in parsed) (next as Record<string, unknown>)[k] = parsed[k];
    }
    return next;
  } catch { return DEFAULTS; }
}

type TabId = "game" | "display" | "sound" | "terminal" | "data";
const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "game",     label: "GAME",     icon: Gamepad2 },
  { id: "display",  label: "DISPLAY",  icon: Monitor },
  { id: "sound",    label: "SOUND",    icon: Volume2 },
  { id: "terminal", label: "TERMINAL", icon: TerminalSquare },
  { id: "data",     label: "DATA",     icon: Database },
];

function zoomLabel(z: number): string {
  if (z >= 3.6) return "Very close";
  if (z >= 3.1) return "Close";
  if (z >= 2.5) return "Normal";
  if (z >= 2.0) return "Wide";
  return "Cinematic";
}

export default function GameSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [s, setS] = useState<GameSettings>(load);
  const [tab, setTab] = useState<TabId>("game");
  const { settings: audio, set: setAudio, toggleMuted } = useAudioSettings();
  const [lowGfx, setLowGfx] = useLowGfx();

  useEffect(() => {
    try {
      // Merge so we never clobber the audio keys written by the audio store.
      const raw = localStorage.getItem(STORE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...existing, ...s }));
    } catch {}
    // Apply UI scale immediately to the document so the user sees it
    document.documentElement.style.setProperty("--game-ui-scale", String(s.uiScale));
    // CRT grade is global (used outside this page too) so apply it app-wide now.
    applyCrt(s.crtEffect);
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
    <div className={embedded ? "w-full" : "min-h-screen w-full"} style={embedded ? undefined : {
      background: "#070809",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <div className={embedded ? "w-full" : "max-w-3xl mx-auto px-4 sm:px-6"}>
        {!embedded && (
          <Link href="/game" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mb-4">
            <ChevronLeft className="w-4 h-4" /> GAME
          </Link>
        )}
        <h1 className="text-2xl font-mono tracking-[0.2em] text-zinc-100 mb-1">SETTINGS</h1>
        <p className="text-[11px] font-mono text-zinc-600 tracking-wider uppercase mb-5">
          Stored on this device. Reset anytime.
        </p>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono tracking-widest rounded border transition-colors ${
                tab === id
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === "game" && (
            <>
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

              <Sec icon={Globe} title="LOCALIZATION">
                <Row label="Language" hint="Interface & translator language.">
                  <LanguageSelector />
                </Row>
                <Row label="Currency" hint="Real-world money is shown in this currency.">
                  <CurrencySelector />
                </Row>
                <p className="text-[10px] text-zinc-600 leading-relaxed flex items-start gap-1.5">
                  <Coins className="w-3 h-3 mt-0.5 shrink-0 text-zinc-500" />
                  Display only — changing currency never affects real charges or
                  in-game ƒ / Gold. Defaults to your region; converted at live
                  market rates.
                </p>
              </Sec>

              <Sec icon={Building2} title="WORLD">
                <Link
                  href="/game/directory"
                  className="grid grid-cols-[1fr_auto] gap-3 items-center group"
                >
                  <div>
                    <div className="text-xs font-mono text-zinc-300 tracking-wider group-hover:text-zinc-100">
                      City Directory
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      Every district, landmark & interior in {CITY_NAME}.
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" />
                </Link>
              </Sec>

              <Sec icon={User} title="ACCOUNT">
                <Link
                  href="/profile"
                  className="grid grid-cols-[1fr_auto] gap-3 items-center group"
                >
                  <div>
                    <div className="text-xs font-mono text-zinc-300 tracking-wider group-hover:text-zinc-100">
                      Profile &amp; Account
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      Call sign, memory, billing &amp; data.
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" />
                </Link>
                <Link
                  href="/alpha"
                  className="grid grid-cols-[1fr_auto] gap-3 items-center group"
                >
                  <div>
                    <div className="text-xs font-mono text-fuchsia-300 tracking-wider group-hover:text-fuchsia-200 flex items-center gap-1.5">
                      <FlaskConical className="w-3.5 h-3.5" /> Tester Program
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      Apply for alpha access &amp; early builds.
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300" />
                </Link>
              </Sec>
            </>
          )}

          {tab === "display" && (
            <>
              <Sec icon={Camera} title="CAMERA">
                <Row
                  label="Camera zoom"
                  hint={`${zoomLabel(s.cameraZoom)} · ${s.cameraZoom.toFixed(1)}× — applies when you enter the city`}
                >
                  <input
                    type="range" min={1.6} max={4.0} step={0.1}
                    value={s.cameraZoom}
                    onChange={(e) => setS({ ...s, cameraZoom: Number(e.target.value) })}
                    className="w-40 accent-cyan-400"
                  />
                </Row>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Higher = closer on your character. You can still pinch or scroll
                  to zoom live in the world.
                </p>
              </Sec>

              <Sec icon={Monitor} title="SCREEN">
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

              <Sec icon={Monitor} title="VISUAL">
                <Row label="Weather effects" hint="Rain / snow particles, puddle ripples & wet-street neon. Lower for slow devices.">
                  <select
                    value={s.weatherEffects}
                    onChange={(e) => setS({ ...s, weatherEffects: e.target.value as any })}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                  >
                    <option value="full">FULL</option>
                    <option value="reduced">REDUCED</option>
                    <option value="off">OFF</option>
                  </select>
                </Row>
                <Row label="Reduced motion" hint="Stops all looping camera drift / parallax.">
                  <Toggle on={s.reducedMotion} onChange={(v) => setS({ ...s, reducedMotion: v })} />
                </Row>
                <Row label="Bloom / glow">
                  <Toggle on={s.bloom} onChange={(v) => setS({ ...s, bloom: v })} />
                </Row>
                <Row label="Cinematic letterbox" hint="Black bars during cutscenes.">
                  <Toggle on={s.cinematic} onChange={(v) => setS({ ...s, cinematic: v })} />
                </Row>
                <Row label="Low graphics mode" hint="Strips blur / shadows for slow devices.">
                  <Toggle on={lowGfx} onChange={(v) => setLowGfx(v)} />
                </Row>
              </Sec>
            </>
          )}

          {tab === "sound" && (
            <Sec icon={Volume2} title="SOUND">
              <Row label="Mute all" hint="Silence every sound.">
                <button
                  onClick={() => toggleMuted()}
                  className={`px-3 py-1 text-[10px] font-mono tracking-widest rounded border transition-colors inline-flex items-center gap-1.5 ${
                    audio.muted ? "bg-red-500/20 border-red-500/40 text-red-300"
                                : "bg-zinc-900 border-zinc-700 text-zinc-400"
                  }`}
                >
                  {audio.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  {audio.muted ? "MUTED" : "ON"}
                </button>
              </Row>
              {([
                ["Master",     "master"],
                ["Music",      "music"],
                ["SFX",        "sfx"],
                ["Voice",      "voice"],
                ["Soundtrack", "soundtrack"],
              ] as const).map(([label, key]) => (
                <Row
                  key={key}
                  label={label}
                  hint={label === "Soundtrack"
                    ? `${Math.round(audio[key] * 100)}% · distant office radio`
                    : `${Math.round(audio[key] * 100)}%`}
                >
                  <input type="range" min={0} max={1} step={0.05} value={audio[key]}
                    disabled={audio.muted}
                    onChange={(e) => setAudio({ [key]: Number(e.target.value) })}
                    className="w-40 accent-fuchsia-400 disabled:opacity-40" />
                </Row>
              ))}
              <p className="text-[10px] text-zinc-600 leading-relaxed mt-2">
                These apply everywhere — the game, the terminal, and Hummingbird.
                Phone always plays at master volume — calls override game audio.
              </p>
            </Sec>
          )}

          {tab === "terminal" && (
            <Sec icon={TerminalSquare} title="TERMINAL">
              <Row label="Boot animation" hint="The brief power-on flourish when a terminal opens.">
                <Toggle on={s.terminalBoot} onChange={(v) => setS({ ...s, terminalBoot: v })} />
              </Row>
              <Row label="CRT / scanlines" hint="Scanline + grain grade over scene artwork.">
                <Toggle on={s.crtEffect} onChange={(v) => setS({ ...s, crtEffect: v })} />
              </Row>
              <p className="text-[10px] text-zinc-600 leading-relaxed mt-2">
                Turn the boot animation off to jump straight into PABLO. The CRT
                grade applies across the whole world, not just terminals.
              </p>
            </Sec>
          )}

          {tab === "data" && (
            <Sec icon={Database} title="DATA">
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Your settings live in this browser on this device. Character
                progress is saved separately and synced to the cloud while
                you're signed in.
              </p>
              <button
                onClick={() => { setS(DEFAULTS); setAudio(AUDIO_DEFAULTS); }}
                className="w-full py-2 text-xs font-mono tracking-widest text-red-300 border border-red-900/40 hover:bg-red-500/10 rounded"
              >
                RESET SETTINGS TO DEFAULTS
              </button>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Resets display, sound, terminal &amp; control preferences. Your
                character and progress are not affected.
              </p>
            </Sec>
          )}
        </div>
      </div>
    </div>
  );
}
