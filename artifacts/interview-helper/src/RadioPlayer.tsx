import { useRef, useEffect, useCallback, useState } from 'react';

const SPOTIFY_ALBUM_URL = 'https://open.spotify.com/embed/album/4RaCWf5BhI9OctBZgKXWXV?utm_source=generator&theme=0';

interface RadioPlayerProps {
  playing: boolean;
  mounted: boolean;
}

export function RadioPlayer({ playing, mounted }: RadioPlayerProps) {
  if (!mounted) return null;
  return (
    <iframe
      src={playing ? SPOTIFY_ALBUM_URL : 'about:blank'}
      width="300"
      height="80"
      style={{ position: 'fixed', left: -9999, top: -9999, border: 'none', opacity: 0, pointerEvents: 'none' }}
      allow="autoplay; encrypted-media"
      loading="lazy"
      title="MINX CITY FM"
    />
  );
}

interface RadioHudProps {
  visible: boolean;
  on: boolean;
  fading: boolean;
  topOffset: string;
  onToggle: () => void;
}

export function RadioHud({ visible, on, fading, topOffset, onToggle }: RadioHudProps) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: topOffset, right: '.8rem', zIndex: 210,
      fontFamily: "'VT323',monospace", background: 'rgba(0,6,2,.92)',
      border: `1px solid ${on ? 'rgba(0,255,65,.55)' : 'rgba(0,255,65,.2)'}`,
      padding: '.4rem .7rem', minWidth: 180, cursor: 'pointer',
      boxShadow: on ? '0 0 12px rgba(0,255,65,.15)' : 'none',
      transition: 'border-color .3s, box-shadow .3s, opacity .5s',
      opacity: fading ? 0 : 1,
    }} onClick={onToggle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
        <div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,255,65,.45)', letterSpacing: '.15em', marginBottom: '2px' }}>RADIO 107.3</div>
          <div style={{ fontSize: '1rem', color: on ? '#00ff41' : 'rgba(0,255,65,.35)', letterSpacing: '.12em', lineHeight: 1 }}>MINX CITY FM</div>
        </div>
        <div style={{
          width: 28, height: 14, borderRadius: 7,
          background: on ? 'rgba(0,255,65,.25)' : 'rgba(0,255,65,.08)',
          border: `1px solid ${on ? 'rgba(0,255,65,.5)' : 'rgba(0,255,65,.15)'}`,
          position: 'relative', transition: 'all .2s',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: on ? '#00ff41' : 'rgba(0,255,65,.2)',
            position: 'absolute', top: 1, left: on ? 15 : 2,
            transition: 'all .2s',
            boxShadow: on ? '0 0 6px rgba(0,255,65,.6)' : 'none',
          }} />
        </div>
      </div>
      <div style={{ fontSize: '.45rem', color: 'rgba(0,255,65,.3)', letterSpacing: '.1em', marginTop: '3px' }}>[R] TOGGLE · {on ? 'ON AIR' : 'OFF'}</div>
      {on && <div style={{ fontSize: '.38rem', color: 'rgba(0,255,65,.2)', letterSpacing: '.08em', marginTop: '2px' }}>VOL: SYSTEM AUDIO</div>}
    </div>
  );
}

export function useRadio() {
  const [radioOn, setRadioOn] = useState(false);
  const [radioVisible, setRadioVisible] = useState(false);
  const [radioFading, setRadioFading] = useState(false);
  const radioVisibleRef = useRef(false);
  const radioSessionPref = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playerEverMounted, setPlayerEverMounted] = useState(false);

  const play = useCallback(() => { setRadioOn(true); setPlayerEverMounted(true); }, []);
  const pause = useCallback(() => { setRadioOn(false); }, []);

  const toggle = useCallback((): { on: boolean } => {
    const newState = !radioSessionPref.current;
    radioSessionPref.current = newState;
    setRadioOn(newState);
    if (newState) setPlayerEverMounted(true);
    return { on: newState };
  }, []);

  const show = useCallback(() => {
    if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
    setRadioFading(false);
    setRadioVisible(true);
    radioVisibleRef.current = true;
    if (radioSessionPref.current) {
      setRadioOn(true);
      setPlayerEverMounted(true);
    }
  }, []);

  const hide = useCallback(() => {
    setRadioFading(true);
    radioVisibleRef.current = false;
    setRadioOn(false);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setRadioVisible(false);
      setRadioFading(false);
      fadeTimer.current = null;
    }, 500);
  }, []);

  useEffect(() => {
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  }, []);

  return {
    radioOn, radioVisible, radioFading, radioVisibleRef,
    playerEverMounted,
    play, pause, toggle, show, hide,
  };
}
