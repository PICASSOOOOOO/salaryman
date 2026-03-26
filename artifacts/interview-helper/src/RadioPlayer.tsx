import { useRef, useEffect, useCallback, useState } from 'react';

export interface RadioStation {
  id: string;
  name: string;
  freq: string;
  genre: string;
  tracks?: string[];
}

const BASE = import.meta.env.BASE_URL;

const CALL_HOME_TRACKS: string[] = Array.from({ length: 31 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return `${BASE}callhome/track-${n}.mp3`;
});

export const RADIO_STATIONS: RadioStation[] = [
  { id: 'ttc_fm', name: 'TTC FM', freq: '107.3', genre: 'OFFICIAL OST', tracks: CALL_HOME_TRACKS },
];

interface RadioPlayerProps {
  playing: boolean;
  mounted: boolean;
  muted?: boolean;
  stationId?: string;
  volume?: number;
}

export function RadioPlayer({ playing, mounted, muted, stationId, volume = 1 }: RadioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackIdxRef = useRef(0);
  const activeRef = useRef(false);

  const station = RADIO_STATIONS.find(s => s.id === stationId) ?? RADIO_STATIONS[0];
  const tracks = station.tracks ?? [];

  const loadTrack = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    trackIdxRef.current = idx % tracks.length;
    audio.src = tracks[trackIdxRef.current];
    audio.load();
    if (activeRef.current) {
      audio.play().catch(() => {});
    }
  }, [tracks]);

  useEffect(() => {
    if (!mounted) return;

    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    const onEnded = () => {
      loadTrack(trackIdxRef.current + 1);
    };

    audio.addEventListener('ended', onEnded);
    loadTrack(0);

    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    if (!audioRef.current || tracks.length === 0) return;
    loadTrack(0);
  }, [stationId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const active = playing && !muted;
    activeRef.current = active;
    if (active) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playing, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !!muted;
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return null;
}

interface RadioHudProps {
  visible: boolean;
  on: boolean;
  fading: boolean;
  topOffset: string;
  onToggle: () => void;
  stationId: string;
  onNextStation: () => void;
  onPrevStation: () => void;
  musicMuted: boolean;
  onToggleMusicMute: () => void;
}

export function RadioHud({ visible, on, fading, topOffset, onToggle, stationId, onNextStation, onPrevStation, musicMuted, onToggleMusicMute }: RadioHudProps) {
  if (!visible) return null;
  const station = RADIO_STATIONS.find(s => s.id === stationId) ?? RADIO_STATIONS[0];
  return (
    <div style={{
      position: 'absolute', top: topOffset, right: '.8rem', zIndex: 210,
      fontFamily: "'VT323',monospace", background: 'rgba(0,6,2,.92)',
      border: `1px solid ${on ? 'rgba(56,189,248,.55)' : 'rgba(56,189,248,.2)'}`,
      padding: '.4rem .7rem', minWidth: 200,
      boxShadow: on ? '0 0 12px rgba(56,189,248,.15)' : 'none',
      transition: 'border-color .3s, box-shadow .3s, opacity .5s',
      opacity: fading ? 0 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', cursor: 'pointer' }} onClick={onToggle}>
        <div>
          <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.45)', letterSpacing: '.15em', marginBottom: '2px' }}>RADIO {station.freq}</div>
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
      {on && (
        <div style={{ marginTop: '4px', display: 'flex', gap: '.3rem', alignItems: 'center' }}>
          <button onClick={e => { e.stopPropagation(); onPrevStation(); }} style={{ background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.5)', cursor: 'pointer', padding: '1px 6px', fontSize: '.7rem', fontFamily: "'VT323',monospace" }}>◀</button>
          <div style={{ flex: 1, fontSize: '.4rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.08em', textAlign: 'center' }}>STATION {RADIO_STATIONS.findIndex(s => s.id === stationId) + 1}/{RADIO_STATIONS.length}</div>
          <button onClick={e => { e.stopPropagation(); onNextStation(); }} style={{ background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.5)', cursor: 'pointer', padding: '1px 6px', fontSize: '.7rem', fontFamily: "'VT323',monospace" }}>▶</button>
        </div>
      )}
      <div style={{ marginTop: '4px', display: 'flex', gap: '.3rem' }}>
        <button onClick={e => { e.stopPropagation(); onToggleMusicMute(); }} style={{ flex: 1, background: musicMuted ? 'rgba(255,68,68,.08)' : 'transparent', border: `1px solid ${musicMuted ? 'rgba(255,68,68,.3)' : 'rgba(56,189,248,.12)'}`, color: musicMuted ? 'rgba(255,68,68,.5)' : 'rgba(56,189,248,.3)', cursor: 'pointer', padding: '2px 4px', fontSize: '.38rem', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.06em' }}>
          {musicMuted ? '🔇 MUTE' : '🔊 MUTE'}
        </button>
      </div>
      <div style={{ fontSize: '.38rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em', marginTop: '3px' }}>[R] TOGGLE · [&lt;/&gt;] STATION · {on ? 'ON AIR' : 'OFF'}</div>
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
      fontFamily: "'VT323',monospace", background: 'rgba(0,6,2,.92)',
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
        <button onClick={e => { e.stopPropagation(); onToggleScoreMute(); }} style={{ flex: 1, background: scoreMuted ? 'rgba(255,68,68,.08)' : 'transparent', border: `1px solid ${scoreMuted ? 'rgba(255,68,68,.3)' : 'rgba(0,200,255,.1)'}`, color: scoreMuted ? 'rgba(255,68,68,.5)' : 'rgba(0,200,255,.28)', cursor: 'pointer', padding: '2px 4px', fontSize: '.38rem', fontFamily: "'Share Tech Mono',monospace", letterSpacing: '.06em' }}>
          {scoreMuted ? '🔇 MUTE' : '🔊 MUTE'}
        </button>
      </div>
      <div style={{ fontSize: '.38rem', color: 'rgba(0,200,255,.18)', letterSpacing: '.08em', marginTop: '3px' }}>AMBIENT SOUNDTRACK · {scoreOn ? 'PLAYING' : 'STOPPED'}</div>
    </div>
  );
}

export function useRadio() {
  const [radioOn, setRadioOn] = useState(false);
  const [radioVisible, setRadioVisible] = useState(false);
  const [radioFading, setRadioFading] = useState(false);
  const [stationId, setStationId] = useState(RADIO_STATIONS[0].id);
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

  const nextStation = useCallback(() => {
    setStationId(prev => {
      const idx = RADIO_STATIONS.findIndex(s => s.id === prev);
      return RADIO_STATIONS[(idx + 1) % RADIO_STATIONS.length].id;
    });
  }, []);

  const prevStation = useCallback(() => {
    setStationId(prev => {
      const idx = RADIO_STATIONS.findIndex(s => s.id === prev);
      return RADIO_STATIONS[(idx - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length].id;
    });
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
    playerEverMounted, stationId,
    play, pause, toggle, show, hide, nextStation, prevStation,
  };
}
