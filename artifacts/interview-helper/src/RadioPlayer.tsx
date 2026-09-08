import { useRef, useEffect, useCallback, useState } from 'react';
import { getMusicEnabled, setAudioSettings, subscribeAudioSettings } from './lib/audio-settings';

export interface RadioStation {
  id: string;
  name: string;
  freq: string;
  genre: string;
  tracks?: string[];
}

export const RADIO_STATIONS: RadioStation[] = [
  { id: 'shadow_radio', name: 'SHADOW RADIO', freq: '107.3', genre: 'CALL HOME BROADCAST' },
];

interface RadioHudProps {
  visible: boolean;
  on: boolean;
  fading: boolean;
  topOffset: string;
  onToggle: () => void;
}

export function RadioHud({ visible, on, fading, topOffset, onToggle }: RadioHudProps) {
  if (!visible) return null;
  const station = RADIO_STATIONS[0];
  return (
    <div style={{
      position: 'absolute', top: topOffset, right: '.8rem', zIndex: 210,
      fontFamily: "var(--font-sans)", background: 'rgba(0,6,2,.92)',
      border: `1px solid ${on ? 'rgba(56,189,248,.55)' : 'rgba(56,189,248,.2)'}`,
      padding: '.4rem .7rem', minWidth: 200,
      boxShadow: on ? '0 0 12px rgba(56,189,248,.15)' : 'none',
      transition: 'border-color .3s, box-shadow .3s, opacity .5s',
      opacity: fading ? 0 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.15em', marginBottom: '2px' }}>SHADOW RADIO {station.freq}</div>
          <div style={{ fontSize: '1rem', color: on ? '#38bdf8' : 'rgba(56,189,248,.35)', letterSpacing: '.12em', lineHeight: 1 }}>{station.name}</div>
          <div style={{ fontSize: '.4rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginTop: '2px' }}>{station.genre}</div>
        </div>
        <div style={{
          width: 28, height: 14, borderRadius: 7,
          background: on ? 'rgba(56,189,248,.25)' : 'rgba(56,189,248,.08)',
          border: `1px solid ${on ? 'rgba(56,189,248,.5)' : 'rgba(56,189,248,.15)'}`,
          position: 'relative', transition: 'all .2s',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: on ? '#38bdf8' : 'rgba(56,189,248,.2)',
            position: 'absolute', top: 1, left: on ? 15 : 2,
            transition: 'all .2s',
            boxShadow: on ? '0 0 6px rgba(56,189,248,.6)' : 'none',
          }} />
        </div>
      </div>
      <div style={{ fontSize: '.38rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em', marginTop: '5px' }}>[R] SHADOW RADIO · {on ? 'ON AIR' : 'OFF'}</div>
    </div>
  );
}

interface ScoreHudProps {
  visible: boolean;
  topOffset: string;
  scoreOn: boolean;
  scoreMuted: boolean;
  onToggleScore: () => void;
  onToggleScoreMute: () => void;
}

export function ScoreHud({ visible, topOffset, scoreOn, scoreMuted, onToggleScore, onToggleScoreMute }: ScoreHudProps) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', top: topOffset, right: '.8rem', zIndex: 209,
      fontFamily: "var(--font-sans)", background: 'rgba(0,6,2,.92)',
      border: `1px solid ${scoreOn ? 'rgba(0,200,255,.45)' : 'rgba(0,200,255,.15)'}`,
      padding: '.4rem .7rem', minWidth: 200,
      boxShadow: scoreOn ? '0 0 10px rgba(0,200,255,.1)' : 'none',
      transition: 'border-color .3s, box-shadow .3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', cursor: 'pointer' }} onClick={onToggleScore}>
        <div>
          <div style={{ fontSize: '.55rem', color: 'rgba(0,200,255,.4)', letterSpacing: '.15em', marginBottom: '2px' }}>AMBIENT SCORE</div>
          <div style={{ fontSize: '1rem', color: scoreOn ? '#00c8ff' : 'rgba(0,200,255,.28)', letterSpacing: '.12em', lineHeight: 1 }}>SYNTHWAVE</div>
          <div style={{ fontSize: '.4rem', color: 'rgba(0,200,255,.22)', letterSpacing: '.1em', marginTop: '2px' }}>PROCEDURAL</div>
        </div>
        <div style={{
          width: 28, height: 14, borderRadius: 7,
          background: scoreOn ? 'rgba(0,200,255,.2)' : 'rgba(0,200,255,.06)',
          border: `1px solid ${scoreOn ? 'rgba(0,200,255,.45)' : 'rgba(0,200,255,.12)'}`,
          position: 'relative', transition: 'all .2s',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: scoreOn ? '#00c8ff' : 'rgba(0,200,255,.18)',
            position: 'absolute', top: 1, left: scoreOn ? 15 : 2,
            transition: 'all .2s',
            boxShadow: scoreOn ? '0 0 6px rgba(0,200,255,.5)' : 'none',
          }} />
        </div>
      </div>
      <div style={{ marginTop: '4px', display: 'flex', gap: '.3rem' }}>
        <button onClick={e => { e.stopPropagation(); onToggleScoreMute(); }} style={{ flex: 1, background: scoreMuted ? 'rgba(255,68,68,.08)' : 'transparent', border: `1px solid ${scoreMuted ? 'rgba(255,68,68,.3)' : 'rgba(0,200,255,.1)'}`, color: scoreMuted ? 'rgba(255,68,68,.5)' : 'rgba(0,200,255,.28)', cursor: 'pointer', padding: '2px 4px', fontSize: '.38rem', fontFamily: "var(--font-sans)", letterSpacing: '.06em' }}>
          {scoreMuted ? '🔇 MUTE' : '🔊 MUTE'}
        </button>
      </div>
      <div style={{ fontSize: '.38rem', color: 'rgba(0,200,255,.18)', letterSpacing: '.08em', marginTop: '3px' }}>AMBIENT SOUNDTRACK · {scoreOn ? 'PLAYING' : 'STOPPED'}</div>
    </div>
  );
}

export function useRadio() {
  // A saved audio preference is permission, not an instruction to start a
  // physical stereo. The player must turn the radio on deliberately in-world.
  const [radioOn, setRadioOn] = useState(false);
  const radioOnRef = useRef(false);
  const [radioVisible, setRadioVisible] = useState(false);
  const [radioFading, setRadioFading] = useState(false);
  const radioVisibleRef = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeAudioSettings((settings) => {
    if (!settings.musicEnabled && radioOnRef.current) {
      radioOnRef.current = false;
      setRadioOn(false);
    }
  }), []);

  const toggle = useCallback((): { on: boolean } => {
    const newState = !radioOnRef.current;
    radioOnRef.current = newState;
    setRadioOn(newState);
    setAudioSettings({ musicEnabled: newState });
    return { on: newState };
  }, []);

  const show = useCallback(() => {
    if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
    setRadioFading(false);
    setRadioVisible(true);
    radioVisibleRef.current = true;
  }, []);

  const hide = useCallback(() => {
    setRadioFading(true);
    radioVisibleRef.current = false;
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
    stationId: RADIO_STATIONS[0].id,
    toggle, show, hide,
  };
}
