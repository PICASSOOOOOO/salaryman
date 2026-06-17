import { useEffect, useRef, useState, useCallback } from 'react';
import { speakWithTTS, unlockAudio, type TTSHandle } from '@/lib/tts';
import { useArtAsset } from '@/lib/art';

// ---------------------------------------------------------------------------
// IntroTour — vertical (9:16) Pablo-narrated arrival tour.
// ---------------------------------------------------------------------------
// Plays at the very START of onboarding (before the registry intake). Shows
// BAKED, silent gameplay footage of the OFFICE and the CITY — both starring a
// PABLO CORP maintenance Deckard — while Pablo narrates LIVE in his established
// TTS voice. Tour-style minimal interaction: tap a hotspot to move between the
// office and the city, SKIP at any time, or REPORT FOR INTAKE to continue.
//
// The footage is served from /api/intro-tour/clip/:scene. If it hasn't been
// baked yet (or fails to load) we fall back to the painted establishing scene
// (useArtAsset) so the tour ALWAYS renders and narrates — the live Pablo voice
// is the experience, the footage is the backdrop.

type Scene = 'office' | 'city';

// Root-relative — matches the established onboarding API convention in this app
// (Immigration.tsx, world/home-city, onboard-housing all fetch `/api/...`).
function clipUrl(scene: Scene): string {
  return `/api/intro-tour/clip/${scene}`;
}

// Pablo, cold and curt — recruiter's pitch, not a warm welcome.
const NARRATION: Record<Scene, string> = {
  office:
    "This is your office. A few square feet of borrowed air, billed to you monthly. The desk is where you earn. The capsule is where you sleep. PABLO CORP thanks you for your tenancy.",
  city:
    "And this is the city. Every window a debt. Every street a ledger. Out there a Deckard works the maintenance line, so the rest of us don't have to. Report for intake. We'll find something for you to do.",
};

const SCENE_META: Record<Scene, { label: string; fallbackArt: string; sub: string }> = {
  office: { label: 'THE OFFICE', fallbackArt: 'scene_office', sub: 'YOUR DESK · YOUR CAPSULE' },
  city: { label: 'THE CITY', fallbackArt: 'scene_lobby', sub: 'MINX CITY · SEALED ATMOSPHERE' },
};

const SCENES: Scene[] = ['office', 'city'];

export interface IntroTourProps {
  /** Fired when the user skips or chooses REPORT FOR INTAKE. */
  onDone: () => void;
}

export function IntroTour({ onDone }: IntroTourProps) {
  const [started, setStarted] = useState(false);
  const [scene, setScene] = useState<Scene>('office');
  const [videoFailed, setVideoFailed] = useState<Record<Scene, boolean>>({ office: false, city: false });
  const [speaking, setSpeaking] = useState(false);
  const ttsRef = useRef<TTSHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const doneRef = useRef(false);

  const officeArt = useArtAsset(SCENE_META.office.fallbackArt);
  const cityArt = useArtAsset(SCENE_META.city.fallbackArt);
  const fallbackArt = scene === 'office' ? officeArt : cityArt;

  const cancelTTS = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.cancel();
      ttsRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // Narrate the active scene. Re-runs whenever the scene changes after start.
  const narrate = useCallback((s: Scene) => {
    cancelTTS();
    setSpeaking(true);
    ttsRef.current = speakWithTTS(
      NARRATION[s],
      () => setSpeaking(false),
      () => setSpeaking(false),
      { character: 'PABLO' },
    );
  }, [cancelTTS]);

  // Begin: unlock audio from the user gesture, then play + narrate the office.
  const handleBegin = useCallback(() => {
    if (started) return;
    setStarted(true);
    void unlockAudio().finally(() => narrate('office'));
  }, [started, narrate]);

  const goToScene = useCallback((s: Scene) => {
    if (s === scene) return;
    setScene(s);
    if (started) narrate(s);
  }, [scene, started, narrate]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelTTS();
    onDone();
  }, [cancelTTS, onDone]);

  // Restart playback when the active scene's video element swaps in.
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => { /* autoplay blocked — poster/fallback shows */ });
    }
  }, [scene, started]);

  // Cancel any in-flight narration on unmount.
  useEffect(() => () => cancelTTS(), [cancelTTS]);

  const showVideo = started && !videoFailed[scene];
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
  const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

  return (
    <div
      data-testid="intro-tour"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: '#03060c',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 9:16 cinematic column — full-bleed on phones, letterboxed on desktop. */}
      <div
        style={{
          position: 'relative',
          height: '100%',
          width: 'min(100vw, calc(100vh * 9 / 16))',
          maxWidth: '100vw',
          background: '#04060a',
          overflow: 'hidden',
        }}
      >
        {/* Footage / painted-scene backdrop */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          {showVideo ? (
            <video
              ref={videoRef}
              key={scene}
              src={clipUrl(scene)}
              muted
              autoPlay
              loop
              playsInline
              onError={() => setVideoFailed((p) => ({ ...p, [scene]: true }))}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <img
              src={fallbackArt ?? undefined}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                opacity: fallbackArt ? 0.85 : 0,
                transition: 'opacity .4s',
              }}
            />
          )}
          {/* Neon-noir grade + vignette so footage and painted art read alike. */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at 50% 38%, rgba(3,6,12,0) 30%, rgba(3,6,12,.78) 100%), linear-gradient(180deg, rgba(20,12,30,.35), rgba(3,6,12,.55))',
          }} />
        </div>

        {/* Top bar: label + SKIP */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          padding: '.7rem .9rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          background: 'linear-gradient(180deg, rgba(3,6,12,.85), transparent)',
        }}>
          <div>
            <div style={{ ...VT, fontSize: '1.35rem', color: '#7dd3fc', letterSpacing: '.16em', textShadow: '0 0 12px rgba(56,189,248,.5)' }}>
              {SCENE_META[scene].label}
            </div>
            <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(125,211,252,.55)', letterSpacing: '.14em', marginTop: 2 }}>
              {SCENE_META[scene].sub}
            </div>
          </div>
          <button
            type="button"
            onClick={finish}
            data-testid="intro-tour-skip"
            style={{
              ...ST, fontSize: '.6rem', letterSpacing: '.18em',
              padding: '.4rem .7rem',
              color: 'rgba(125,211,252,.7)',
              background: 'rgba(3,6,12,.5)',
              border: '1px solid rgba(56,189,248,.3)',
              cursor: 'pointer',
            }}
          >
            SKIP ▸
          </button>
        </div>

        {/* Pablo narration indicator */}
        {started && (
          <div aria-hidden style={{
            position: 'absolute', top: '4.4rem', left: '.95rem', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: '.45rem',
            ...ST, fontSize: '.55rem', letterSpacing: '.16em',
            color: speaking ? 'rgba(125,211,252,.85)' : 'rgba(125,211,252,.4)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: speaking ? '#38bdf8' : 'rgba(56,189,248,.35)',
              boxShadow: speaking ? '0 0 10px rgba(56,189,248,.8)' : 'none',
              animation: speaking ? 'tour-pulse 1.1s ease-in-out infinite' : 'none',
            }} />
            PABLO {speaking ? 'SPEAKING' : 'STANDING BY'}
          </div>
        )}

        {/* Tap-to-begin gate (audio unlock requires a user gesture) */}
        {!started && (
          <button
            type="button"
            onClick={handleBegin}
            data-testid="intro-tour-begin"
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '1rem', background: 'rgba(3,6,12,.35)', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{
              ...VT, fontSize: '2.3rem', color: '#7dd3fc', letterSpacing: '.1em',
              textShadow: '0 0 24px rgba(56,189,248,.6)', textAlign: 'center', padding: '0 1.5rem',
            }}>
              WELCOME TO<br />PABLO CORP
            </div>
            <div style={{
              ...ST, fontSize: '.7rem', letterSpacing: '.22em', color: 'rgba(125,211,252,.85)',
              border: '1px solid rgba(56,189,248,.5)', padding: '.7rem 1.4rem',
              background: 'rgba(56,189,248,.1)', borderRadius: 2,
              animation: 'tour-pulse 1.6s ease-in-out infinite',
            }}>
              ▶ TAP TO BEGIN THE TOUR
            </div>
            <div style={{ ...ST, fontSize: '.5rem', letterSpacing: '.14em', color: 'rgba(125,211,252,.4)' }}>
              SOUND ON · PABLO WILL SHOW YOU AROUND
            </div>
          </button>
        )}

        {/* Bottom controls: scene hotspots + REPORT FOR INTAKE */}
        {started && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
            padding: '1rem .9rem 1.3rem',
            background: 'linear-gradient(0deg, rgba(3,6,12,.92), transparent)',
            display: 'flex', flexDirection: 'column', gap: '.8rem',
          }}>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              {SCENES.map((s) => {
                const active = s === scene;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => goToScene(s)}
                    data-testid={`intro-tour-hotspot-${s}`}
                    style={{
                      flex: 1,
                      ...ST, fontSize: '.62rem', letterSpacing: '.16em',
                      padding: '.6rem .4rem',
                      color: active ? '#7dd3fc' : 'rgba(125,211,252,.55)',
                      background: active ? 'rgba(56,189,248,.16)' : 'rgba(3,6,12,.4)',
                      border: `1px solid ${active ? 'rgba(56,189,248,.65)' : 'rgba(56,189,248,.25)'}`,
                      cursor: 'pointer',
                      transition: 'background .2s, color .2s, border-color .2s',
                    }}
                  >
                    {SCENE_META[s].label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={finish}
              data-testid="intro-tour-intake"
              style={{
                ...VT, fontSize: '1.25rem', letterSpacing: '.18em',
                padding: '.7rem 1rem',
                color: '#03060c', background: '#7dd3fc',
                border: '1px solid #7dd3fc', cursor: 'pointer',
                boxShadow: '0 0 22px rgba(56,189,248,.45)',
              }}
            >
              REPORT FOR INTAKE ▸
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes tour-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }`}</style>
    </div>
  );
}

export default IntroTour;
