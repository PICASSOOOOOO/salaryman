import { useEffect, useRef, useState, useCallback } from 'react';
import { speakWithTTS, unlockAudio, type TTSHandle } from '@/lib/tts';
import { useArtAsset } from '@/lib/art';

// ---------------------------------------------------------------------------
// IntroTour — silent auto-advancing cinematic. Pablo narrates both scenes in
// sequence; the player watches and optionally skips. No scene-picker UI.
// ---------------------------------------------------------------------------

type Scene = 'office' | 'city';

function clipUrl(scene: Scene): string {
  return `/api/intro-tour/clip/${scene}`;
}

// World-building lines — general, not addressed to the player's property.
const NARRATION: Record<Scene, string> = {
  office:
    "The towers of Pablo Corp stretch forty-three floors above the grid. Inside, every floor is a workspace, every workspace a revenue stream. This is where the company runs — one desk, one shift, one transaction at a time.",
  city:
    "Beyond the glass, Minx City breathes under a sealed atmosphere. The streets are a ledger, the buildings a balance sheet. Out there, the world keeps moving whether you're ready for it or not.",
};

const SCENE_FALLBACK: Record<Scene, string> = {
  office: 'scene_office',
  city: 'scene_lobby',
};


export interface IntroTourProps {
  onDone: () => void;
}

export function IntroTour({ onDone }: IntroTourProps) {
  const [started, setStarted] = useState(false);
  const [scene, setScene] = useState<Scene>('office');
  const [sceneVisible, setSceneVisible] = useState(true);
  const [videoFailed, setVideoFailed] = useState<Record<Scene, boolean>>({ office: false, city: false });
  const [speaking, setSpeaking] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const ttsRef = useRef<TTSHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const doneRef = useRef(false);
  const sequenceRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const officeArt = useArtAsset(SCENE_FALLBACK.office);
  const cityArt = useArtAsset(SCENE_FALLBACK.city);
  const fallbackArt = scene === 'office' ? officeArt : cityArt;

  const cancelTTS = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.cancel();
      ttsRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // Narrate a scene, then call onEnd when done (fires on both end + error).
  const narrate = useCallback((s: Scene, onEnd?: () => void) => {
    cancelTTS();
    setSpeaking(true);
    const handleDone = () => {
      setSpeaking(false);
      onEnd?.();
    };
    ttsRef.current = speakWithTTS(
      NARRATION[s],
      handleDone,
      handleDone,
      { character: 'PABLO' },
    );
  }, [cancelTTS]);

  // Cross-fade to city scene, then narrate it, then show CTA.
  const advanceToCity = useCallback(() => {
    if (sequenceRef.current) return;
    sequenceRef.current = true;
    setSceneVisible(false);
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      if (doneRef.current) return;
      setScene('city');
      setSceneVisible(true);
      narrate('city', () => {
        if (!doneRef.current) setShowCta(true);
      });
    }, 350);
  }, [narrate]);

  // Begin: unlock audio, then narrate office → auto-advance to city.
  const handleBegin = useCallback(() => {
    if (started) return;
    setStarted(true);
    void unlockAudio().finally(() => narrate('office', advanceToCity));
  }, [started, narrate, advanceToCity]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    cancelTTS();
    onDone();
  }, [cancelTTS, onDone]);

  // Restart video playback when scene changes.
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  }, [scene, started]);

  // Cancel TTS and any pending transition timer on unmount.
  useEffect(() => () => {
    cancelTTS();
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, [cancelTTS]);

  const showVideo = started && !videoFailed[scene];
  const ST: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };
  const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };

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
      {/* 9:16 cinematic column */}
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
        {/* Scene backdrop */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 0,
            opacity: sceneVisible ? 1 : 0,
            transition: 'opacity 0.35s ease',
          }}
        >
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
          {/* Neon-noir vignette */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at 50% 38%, rgba(3,6,12,0) 30%, rgba(3,6,12,.78) 100%), linear-gradient(180deg, rgba(20,12,30,.35), rgba(3,6,12,.55))',
          }} />
        </div>

        {/* Ghost SKIP button — top-right, very faint, no border */}
        <div style={{
          position: 'absolute', top: 0, right: 0, zIndex: 20,
          padding: '.75rem .9rem',
        }}>
          <button
            type="button"
            onClick={finish}
            data-testid="intro-tour-skip"
            style={{
              ...ST, fontSize: '.6rem', letterSpacing: '.18em',
              color: 'rgba(125,211,252,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '.3rem .5rem',
            }}
          >
            SKIP
          </button>
        </div>

        {/* Narration dot only — no label text */}
        {started && (
          <div aria-hidden style={{
            position: 'absolute', top: '.85rem', left: '.95rem', zIndex: 20,
          }}>
            <span style={{
              display: 'inline-block',
              width: 7, height: 7, borderRadius: '50%',
              background: speaking ? '#38bdf8' : 'rgba(56,189,248,.25)',
              boxShadow: speaking ? '0 0 10px rgba(56,189,248,.8)' : 'none',
              animation: speaking ? 'tour-pulse 1.1s ease-in-out infinite' : 'none',
            }} />
          </div>
        )}

        {/* Tap-to-begin: near-black overlay with only a pulsing glow dot */}
        {!started && (
          <button
            type="button"
            onClick={handleBegin}
            data-testid="intro-tour-begin"
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(3,6,12,.72)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(56,189,248,.55)',
                boxShadow: '0 0 28px 6px rgba(56,189,248,.35)',
                animation: 'tour-glow 2s ease-in-out infinite',
              }}
            />
          </button>
        )}

        {/* CTA — fades in after both scenes narrated */}
        {showCta && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
            padding: '2.5rem .9rem 1.8rem',
            background: 'linear-gradient(0deg, rgba(3,6,12,.95) 60%, transparent)',
            display: 'flex', justifyContent: 'center',
            animation: 'tour-fadein .6s ease forwards',
          }}>
            <button
              type="button"
              onClick={finish}
              data-testid="intro-tour-intake"
              style={{
                ...VT, fontSize: '1.1rem', letterSpacing: '.2em',
                padding: '.45rem 1.2rem',
                color: 'rgba(125,211,252,.9)',
                background: 'rgba(56,189,248,.08)',
                border: '1px solid rgba(56,189,248,.35)',
                cursor: 'pointer',
              }}
            >
              ENTER ▸
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes tour-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes tour-glow  { 0%,100% { opacity: .7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.18); } }
        @keyframes tour-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

export default IntroTour;
