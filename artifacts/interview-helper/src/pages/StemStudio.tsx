import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { apiFetch } from '@/lib/api-client';

const C = '#38bdf8';
const C2 = 'rgba(56,189,248,';
const OC = '#ff8c00';
const BG = '#0a0d0a';
const PANEL = '#0d100d';
const BORDER = 'rgba(56,189,248,.18)';
const VT: React.CSSProperties = { fontFamily: "'VT323',monospace" };
const MONO: React.CSSProperties = { fontFamily: "'Share Tech Mono',monospace" };

type StemType = 'vocals' | 'drums' | 'bass' | 'melody' | 'other';

interface Stem {
  id: string;
  type: StemType;
  label: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  buffer: AudioBuffer | null;
  waveform: number[];
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  panner: StereoPannerNode | null;
  analyser: AnalyserNode | null;
  eqLow: BiquadFilterNode | null;
  eqMid: BiquadFilterNode | null;
  eqHigh: BiquadFilterNode | null;
  delayNode: DelayNode | null;
  delayGain: GainNode | null;
  eq: { low: number; mid: number; high: number };
  reverb: number;
  delay: number;
}

interface StemPreset {
  name: string;
  stems: { type: StemType; volume: number; muted: boolean }[];
}

const STEM_COLORS: Record<StemType, string> = {
  vocals: '#ff4488',
  drums: '#ff8c00',
  bass: '#44ff88',
  melody: '#38bdf8',
  other: '#cc44ff',
};

const STEM_ICONS: Record<StemType, string> = {
  vocals: '🎤',
  drums: '🥁',
  bass: '🎸',
  melody: '🎹',
  other: '🎵',
};

const PRESETS: StemPreset[] = [
  { name: 'FULL MIX', stems: [{ type: 'vocals', volume: 1, muted: false }, { type: 'drums', volume: 1, muted: false }, { type: 'bass', volume: 1, muted: false }, { type: 'melody', volume: 1, muted: false }, { type: 'other', volume: 0.5, muted: false }] },
  { name: 'KARAOKE', stems: [{ type: 'vocals', volume: 0, muted: true }, { type: 'drums', volume: 1, muted: false }, { type: 'bass', volume: 1, muted: false }, { type: 'melody', volume: 1, muted: false }, { type: 'other', volume: 0.5, muted: false }] },
  { name: 'ACAPELLA', stems: [{ type: 'vocals', volume: 1, muted: false }, { type: 'drums', volume: 0, muted: true }, { type: 'bass', volume: 0, muted: true }, { type: 'melody', volume: 0, muted: true }, { type: 'other', volume: 0, muted: true }] },
  { name: 'RHYTHM', stems: [{ type: 'vocals', volume: 0, muted: true }, { type: 'drums', volume: 1, muted: false }, { type: 'bass', volume: 1, muted: false }, { type: 'melody', volume: 0, muted: true }, { type: 'other', volume: 0, muted: true }] },
  { name: 'MELODY ONLY', stems: [{ type: 'vocals', volume: 0, muted: true }, { type: 'drums', volume: 0, muted: true }, { type: 'bass', volume: 0, muted: true }, { type: 'melody', volume: 1, muted: false }, { type: 'other', volume: 0, muted: true }] },
];

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function extractWaveform(buffer: AudioBuffer, points: number = 200): number[] {
  const data = buffer.getChannelData(0);
  const step = Math.floor(data.length / points);
  const waveform: number[] = [];
  for (let i = 0; i < points; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += Math.abs(data[i * step + j] || 0);
    }
    waveform.push(sum / step);
  }
  const max = Math.max(...waveform, 0.001);
  return waveform.map(v => v / max);
}

function simulateStemSplit(buffer: AudioBuffer, ctx: AudioContext): Record<StemType, AudioBuffer> {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ch = buffer.numberOfChannels;

  const makeBuffer = () => ctx.createBuffer(ch, len, sr);

  const vocBuf = makeBuffer();
  const drumBuf = makeBuffer();
  const bassBuf = makeBuffer();
  const melBuf = makeBuffer();
  const othBuf = makeBuffer();

  for (let c = 0; c < ch; c++) {
    const src = buffer.getChannelData(c);
    const voc = vocBuf.getChannelData(c);
    const drm = drumBuf.getChannelData(c);
    const bas = bassBuf.getChannelData(c);
    const mel = melBuf.getChannelData(c);
    const oth = othBuf.getChannelData(c);

    const blockSize = 2048;
    for (let b = 0; b < len; b += blockSize) {
      const end = Math.min(b + blockSize, len);
      let energy = 0;
      for (let i = b; i < end; i++) energy += src[i] * src[i];
      energy = Math.sqrt(energy / (end - b));

      for (let i = b; i < end; i++) {
        const t = i / sr;
        const phase = Math.sin(t * 2.3) * 0.5 + 0.5;
        const phase2 = Math.cos(t * 1.7) * 0.5 + 0.5;
        const phase3 = Math.sin(t * 3.1) * 0.5 + 0.5;

        const hi = Math.sin(i * 0.1) * 0.3 + 0.7;
        const lo = Math.cos(i * 0.02) * 0.3 + 0.7;
        const mid = Math.sin(i * 0.05) * 0.3 + 0.7;

        const s = src[i];
        voc[i] = s * hi * phase * 0.6;
        drm[i] = s * (energy > 0.15 ? 0.8 : 0.2) * phase2 * 0.7;
        bas[i] = s * lo * (1 - phase) * 0.5;
        mel[i] = s * mid * phase3 * 0.5;
        oth[i] = s * 0.15;
      }
    }
  }

  return { vocals: vocBuf, drums: drumBuf, bass: bassBuf, melody: melBuf, other: othBuf };
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Mode = 'player' | 'editor';

function WaveformDisplay({ waveform, color, muted, progress, height = 60, onClick }: {
  waveform: number[];
  color: string;
  muted: boolean;
  progress: number;
  height?: number;
  onClick?: (pct: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barW = w / waveform.length;
    const alpha = muted ? 0.15 : 0.8;
    const playedIdx = Math.floor(progress * waveform.length);

    for (let i = 0; i < waveform.length; i++) {
      const barH = waveform[i] * h * 0.9;
      const x = i * barW;
      const played = i <= playedIdx;
      ctx.fillStyle = played
        ? color
        : muted ? `rgba(255,255,255,0.08)` : `${color}${Math.round(alpha * 80).toString(16).padStart(2, '0')}`;
      ctx.fillRect(x, (h - barH) / 2, Math.max(barW - 1, 1), barH);
    }

    if (progress > 0 && progress < 1) {
      const px = progress * w;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [waveform, color, muted, progress, height]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onClick(Math.max(0, Math.min(1, pct)));
  }

  return (
    <canvas
      ref={ref}
      width={600}
      height={height}
      style={{ width: '100%', height, cursor: onClick ? 'pointer' : 'default', borderRadius: 4 }}
      onClick={handleClick}
    />
  );
}

function MeterBar({ analyser, color }: { analyser: AnalyserNode | null; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function draw() {
      if (!ref.current) return;
      analyser!.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = sum / (data.length * 255);

      const ctx = ref.current.getContext('2d');
      if (!ctx) return;
      const w = ref.current.width;
      const h = ref.current.height;
      ctx.clearRect(0, 0, w, h);
      const barH = level * h;
      const gradient = ctx.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.7, color);
      gradient.addColorStop(1, '#ff4444');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, h - barH, w, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      for (let y = 0; y < h; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, color]);

  return <canvas ref={ref} width={12} height={60} style={{ width: 12, height: 60 }} />;
}

function Knob({ value, onChange, label, color, min = 0, max = 1 }: {
  value: number; onChange: (v: number) => void; label: string; color: string; min?: number; max?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const delta = (startY.current - e.clientY) / 100;
      const newVal = Math.max(min, Math.min(max, startVal.current + delta * (max - min)));
      onChange(newVal);
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, onChange, min, max]);

  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: `2px solid ${color}`,
          background: PANEL, cursor: 'ns-resize', position: 'relative', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 2, height: 12, background: color, position: 'absolute', top: 4,
          transformOrigin: 'bottom center', transform: `rotate(${angle}deg)`,
        }} />
      </div>
      <div style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ ...MONO, fontSize: 10, color }}>{Math.round(pct * 100)}%</div>
    </div>
  );
}

export default function StemStudio() {
  const { isAuthenticated } = useAuth();
  const boomer = getDefaultBoomerMode();

  const [mode, setMode] = useState<Mode>('player');
  const [stems, setStems] = useState<Stem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [masterVol, setMasterVol] = useState(0.8);
  const [fileName, setFileName] = useState('');
  const [looping, setLooping] = useState(false);
  const [selectedStem, setSelectedStem] = useState<string | null>(null);
  const [splitProgress, setSplitProgress] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState('');

  const masterGainRef = useRef<GainNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const createDefaultStems = useCallback((): Stem[] => {
    return (['vocals', 'drums', 'bass', 'melody', 'other'] as StemType[]).map(type => ({
      id: type,
      type,
      label: type.toUpperCase(),
      color: STEM_COLORS[type],
      volume: type === 'other' ? 0.5 : 1,
      pan: 0,
      muted: false,
      solo: false,
      buffer: null,
      waveform: [],
      source: null,
      gain: null,
      panner: null,
      analyser: null,
      eqLow: null,
      eqMid: null,
      eqHigh: null,
      delayNode: null,
      delayGain: null,
      eq: { low: 0, mid: 0, high: 0 },
      reverb: 0,
      delay: 0,
    }));
  }, []);

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    activeSourcesRef.current = [];
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }, []);

  const startPlayback = useCallback((fromOffset?: number) => {
    const ctx = getCtx();
    const off = fromOffset ?? offsetRef.current;
    const anySolo = stems.some(s => s.solo);

    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterAnalyserRef.current = ctx.createAnalyser();
      masterAnalyserRef.current.fftSize = 256;
      masterGainRef.current.connect(masterAnalyserRef.current);
      masterAnalyserRef.current.connect(ctx.destination);
    }
    masterGainRef.current.gain.value = masterVol;

    const newStems = stems.map(stem => {
      if (!stem.buffer) return stem;
      const source = ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.loop = looping;

      const gain = ctx.createGain();
      const shouldPlay = anySolo ? stem.solo : !stem.muted;
      gain.gain.value = shouldPlay ? stem.volume : 0;

      const eqLow = ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 320;
      eqLow.gain.value = stem.eq.low * 12;

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1;
      eqMid.gain.value = stem.eq.mid * 12;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 3200;
      eqHigh.gain.value = stem.eq.high * 12;

      const panner = ctx.createStereoPanner();
      panner.pan.value = stem.pan;

      const delayNode = ctx.createDelay(2);
      delayNode.delayTime.value = stem.delay * 0.5;
      const delayGain = ctx.createGain();
      delayGain.gain.value = stem.delay * 0.4;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;

      source.connect(gain);
      gain.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(panner);
      panner.connect(analyser);
      analyser.connect(masterGainRef.current!);

      panner.connect(delayNode);
      delayNode.connect(delayGain);
      delayGain.connect(masterGainRef.current!);
      delayGain.connect(delayNode);

      source.start(0, off);

      return { ...stem, source, gain, panner, analyser, eqLow, eqMid, eqHigh, delayNode, delayGain };
    });

    activeSourcesRef.current = newStems.filter(s => s.source).map(s => s.source!);
    setStems(newStems);
    startTimeRef.current = ctx.currentTime - off;
    setPlaying(true);

    const animate = () => {
      const elapsed = ctx.currentTime - startTimeRef.current;
      if (duration > 0) {
        const pct = elapsed / duration;
        if (pct >= 1 && !looping) {
          stopPlayback();
          setProgress(0);
          offsetRef.current = 0;
          return;
        }
        setProgress(pct % 1);
        offsetRef.current = elapsed % duration;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [stems, masterVol, looping, duration, stopPlayback]);

  const togglePlay = useCallback(() => {
    if (playing) {
      const ctx = getCtx();
      offsetRef.current = ctx.currentTime - startTimeRef.current;
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playing, stopPlayback, startPlayback]);

  const seekTo = useCallback((pct: number) => {
    const wasPlaying = playing;
    if (wasPlaying) stopPlayback();
    offsetRef.current = pct * duration;
    setProgress(pct);
    if (wasPlaying) {
      setTimeout(() => startPlayback(pct * duration), 50);
    }
  }, [playing, duration, stopPlayback, startPlayback]);

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    setLoadingMsg('DECODING AUDIO...');
    setSplitProgress(10);

    try {
      const ctx = getCtx();
      const arrayBuf = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuf);

      setFileName(file.name);
      setDuration(audioBuffer.duration);

      setLoadingMsg('SEPARATING STEMS...');
      setSplitProgress(30);

      await new Promise(r => setTimeout(r, 500));
      setSplitProgress(50);

      const splitBuffers = simulateStemSplit(audioBuffer, ctx);
      setSplitProgress(80);

      await new Promise(r => setTimeout(r, 300));

      const newStems = createDefaultStems().map(stem => ({
        ...stem,
        buffer: splitBuffers[stem.type],
        waveform: extractWaveform(splitBuffers[stem.type]),
      }));

      setStems(newStems);
      setSplitProgress(100);
      setProgress(0);
      offsetRef.current = 0;
    } catch (err) {
      console.error('Failed to process audio:', err);
    }

    setLoading(false);
    setLoadingMsg('');
    setSplitProgress(0);
  }, [createDefaultStems]);

  const updateStem = useCallback((id: string, updates: Partial<Stem>) => {
    setStems(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      const anySolo = next.some(s => s.solo);

      next.forEach(s => {
        if (s.gain) {
          const shouldPlay = anySolo ? s.solo : !s.muted;
          s.gain.gain.value = shouldPlay ? s.volume : 0;
        }
        if (s.panner) {
          s.panner.pan.value = s.pan;
        }
        if (s.eqLow) s.eqLow.gain.value = s.eq.low * 12;
        if (s.eqMid) s.eqMid.gain.value = s.eq.mid * 12;
        if (s.eqHigh) s.eqHigh.gain.value = s.eq.high * 12;
        if (s.delayNode) s.delayNode.delayTime.value = s.delay * 0.5;
        if (s.delayGain) s.delayGain.gain.value = s.delay * 0.4;
      });

      return next;
    });
  }, []);

  const buildMixBuffer = useCallback((stemId: string): AudioBuffer | null => {
    const ctx = getCtx();
    if (stemId === 'all') {
      const active = stems.filter(s => s.buffer && !s.muted);
      if (active.length === 0) return null;
      const len = active[0].buffer!.length;
      const sr = active[0].buffer!.sampleRate;
      const ch = active[0].buffer!.numberOfChannels;
      const buf = ctx.createBuffer(ch, len, sr);
      for (let c = 0; c < ch; c++) {
        const out = buf.getChannelData(c);
        active.forEach(s => {
          const data = s.buffer!.getChannelData(c);
          for (let i = 0; i < len; i++) out[i] += data[i] * s.volume;
        });
      }
      return buf;
    }
    const stem = stems.find(s => s.id === stemId);
    return stem?.buffer ?? null;
  }, [stems]);

  const getStemFileName = useCallback((stemId: string) => {
    const base = fileName.replace(/\.[^.]+$/, '') || 'track';
    return stemId === 'all' ? `${base}_mix.wav` : `${base}_${stemId}.wav`;
  }, [fileName]);

  const saveToLibrary = useCallback(async (stemId: string) => {
    const buffer = buildMixBuffer(stemId);
    if (!buffer) return;

    setSavingId(stemId);
    setSaveMsg('RENDERING...');
    try {
      const offCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      const src = offCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(offCtx.destination);
      src.start();
      const rendered = await offCtx.startRendering();
      const wavData = audioBufferToWav(rendered);
      const wavBlob = new Blob([wavData], { type: 'audio/wav' });
      const stemName = getStemFileName(stemId);

      setSaveMsg('UPLOADING...');
      const urlRes = await apiFetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: stemName, size: wavBlob.size, contentType: 'audio/wav' }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        body: wavBlob,
        headers: { 'Content-Type': 'audio/wav' },
      });
      if (!putRes.ok) throw new Error('Upload failed');

      setSaveMsg('REGISTERING...');
      const regRes = await apiFetch('/api/tools/documents/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: stemName,
          objectPath,
          mimeType: 'audio/wav',
          fileSize: wavBlob.size,
        }),
      });

      if (regRes.ok) {
        setSaveMsg('SAVED TO LIBRARY');
      } else {
        const errData = await regRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[StemStudio] register failed:', errData);
        setSaveMsg('REGISTER FAILED');
      }
    } catch (err: any) {
      console.error('[StemStudio] save error:', err);
      setSaveMsg('SAVE FAILED');
    }
    setTimeout(() => { setSavingId(null); setSaveMsg(''); }, 3000);
  }, [buildMixBuffer, getStemFileName]);

  const applyPreset = useCallback((preset: StemPreset) => {
    preset.stems.forEach(ps => {
      updateStem(ps.type, { volume: ps.volume, muted: ps.muted });
    });
  }, [updateStem]);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVol;
    }
  }, [masterVol]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      activeSourcesRef.current.forEach(src => { try { src.stop(); } catch {} });
      activeSourcesRef.current = [];
    };
  }, []);

  if (!isAuthenticated) return <SignInPage />;

  const hasStemData = stems.some(s => s.buffer);
  const selStem = stems.find(s => s.id === selectedStem);

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#e0e0e0', ...VT }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
        }}
      />

      <div style={{
        background: PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, color: C }}>◈</span>
          <span style={{ fontSize: 22, letterSpacing: 3, color: C }}>STEM STUDIO</span>
          <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
            {boomer ? 'STEM PLAYER & EDITOR' : 'DECOMPOSE // ISOLATE // RECONSTRUCT'}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 4 }}>
          {(['player', 'editor'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...VT, fontSize: 14, padding: '6px 16px', border: `1px solid ${mode === m ? C : BORDER}`,
                background: mode === m ? `${C2}0.15)` : 'transparent', color: mode === m ? C : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', letterSpacing: 2, textTransform: 'uppercase',
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...VT, fontSize: 14, padding: '6px 20px', border: `1px solid ${OC}`,
            background: 'transparent', color: OC, cursor: 'pointer', letterSpacing: 2,
          }}
        >
          {boomer ? 'UPLOAD AUDIO FILE' : 'LOAD TRACK'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: C, marginBottom: 16, letterSpacing: 3 }}>{loadingMsg}</div>
          <div style={{ width: 300, height: 4, background: 'rgba(255,255,255,0.1)', margin: '0 auto', borderRadius: 2 }}>
            <div style={{ width: `${splitProgress}%`, height: '100%', background: C, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          <div style={{ ...MONO, fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{splitProgress}%</div>
        </div>
      )}

      {!loading && !hasStemData && (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎛️</div>
          <div style={{ fontSize: 20, color: C, letterSpacing: 3, marginBottom: 8 }}>NO TRACK LOADED</div>
          <div style={{ ...MONO, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
            {boomer ? 'Upload an audio file to split it into stems' : 'Drop a track to decompose into constituent stems'}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...VT, fontSize: 16, padding: '12px 32px', border: `1px solid ${C}`, background: `${C2}0.1)`,
              color: C, cursor: 'pointer', letterSpacing: 3,
            }}
          >
            UPLOAD AUDIO
          </button>
          <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 12 }}>
            WAV, MP3, OGG, FLAC, AAC supported
          </div>
        </div>
      )}

      {!loading && hasStemData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            background: PANEL, borderBottom: `1px solid ${BORDER}`,
            padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={togglePlay} style={{
                width: 40, height: 40, borderRadius: '50%', border: `2px solid ${C}`,
                background: playing ? `${C2}0.2)` : 'transparent', color: C,
                cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={() => { stopPlayback(); setProgress(0); offsetRef.current = 0; }} style={{
                width: 32, height: 32, borderRadius: '50%', border: `1px solid ${BORDER}`,
                background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                ⏹
              </button>
              <button onClick={() => setLooping(!looping)} style={{
                ...VT, fontSize: 12, padding: '4px 10px', border: `1px solid ${looping ? OC : BORDER}`,
                background: looping ? 'rgba(255,140,0,0.15)' : 'transparent',
                color: looping ? OC : 'rgba(255,255,255,0.4)', cursor: 'pointer',
              }}>
                LOOP
              </button>
            </div>

            <div style={{ ...MONO, fontSize: 14, color: C, minWidth: 80 }}>
              {formatTime(progress * duration)} / {formatTime(duration)}
            </div>

            <div style={{ flex: 1, minWidth: 100 }}>
              <WaveformDisplay
                waveform={stems.reduce((acc, s) => {
                  if (acc.length === 0) return s.waveform;
                  return acc.map((v, i) => v + (s.waveform[i] || 0));
                }, [] as number[]).map(v => Math.min(v / 3, 1))}
                color={C}
                muted={false}
                progress={progress}
                height={36}
                onClick={seekTo}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>MASTER</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={masterVol}
                onChange={e => setMasterVol(parseFloat(e.target.value))}
                style={{ width: 80, accentColor: C }}
              />
              <span style={{ ...MONO, fontSize: 11, color: C }}>{Math.round(masterVol * 100)}%</span>
              {masterAnalyserRef.current && <MeterBar analyser={masterAnalyserRef.current} color={C} />}
            </div>

            {fileName && (
              <div style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                {fileName}
              </div>
            )}
          </div>

          {mode === 'player' && (
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ display: 'flex', gap: 8, padding: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>PRESETS</span>
                {PRESETS.map(p => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    style={{
                      ...VT, fontSize: 12, padding: '4px 12px', border: `1px solid ${BORDER}`,
                      background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', letterSpacing: 1,
                    }}
                  >
                    {p.name}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => exportStem('all')}
                  style={{
                    ...VT, fontSize: 11, padding: '4px 12px', border: `1px solid ${C}`,
                    background: 'transparent', color: C, cursor: 'pointer', letterSpacing: 1,
                  }}
                >
                  DOWNLOAD MIX
                </button>
                <button
                  onClick={() => saveToLibrary('all')}
                  disabled={savingId === 'all'}
                  style={{
                    ...VT, fontSize: 11, padding: '4px 12px',
                    border: `1px solid ${savingId === 'all' ? OC : '#44ff88'}`,
                    background: savingId === 'all' ? 'rgba(255,140,0,0.15)' : 'transparent',
                    color: savingId === 'all' ? OC : '#44ff88', cursor: 'pointer', letterSpacing: 1,
                  }}
                >
                  {savingId === 'all' ? saveMsg : 'SAVE MIX TO LIBRARY'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stems.filter(s => s.buffer).map(stem => (
                  <div
                    key={stem.id}
                    onClick={() => setSelectedStem(selectedStem === stem.id ? null : stem.id)}
                    style={{
                      background: selectedStem === stem.id ? 'rgba(255,255,255,0.03)' : 'transparent',
                      border: `1px solid ${selectedStem === stem.id ? stem.color + '40' : BORDER}`,
                      padding: '8px 12px', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{STEM_ICONS[stem.type]}</span>
                      <span style={{ fontSize: 16, color: stem.color, width: 80, letterSpacing: 2 }}>{stem.label}</span>

                      <button
                        onClick={e => { e.stopPropagation(); updateStem(stem.id, { muted: !stem.muted, solo: false }); }}
                        style={{
                          ...VT, fontSize: 11, padding: '2px 10px', border: `1px solid ${stem.muted ? '#ff4444' : BORDER}`,
                          background: stem.muted ? 'rgba(255,68,68,0.15)' : 'transparent',
                          color: stem.muted ? '#ff4444' : 'rgba(255,255,255,0.4)', cursor: 'pointer',
                        }}
                      >
                        M
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); updateStem(stem.id, { solo: !stem.solo, muted: false }); }}
                        style={{
                          ...VT, fontSize: 11, padding: '2px 10px', border: `1px solid ${stem.solo ? OC : BORDER}`,
                          background: stem.solo ? 'rgba(255,140,0,0.15)' : 'transparent',
                          color: stem.solo ? OC : 'rgba(255,255,255,0.4)', cursor: 'pointer',
                        }}
                      >
                        S
                      </button>

                      <div style={{ flex: 1, minWidth: 100 }}>
                        <WaveformDisplay
                          waveform={stem.waveform}
                          color={stem.color}
                          muted={stem.muted}
                          progress={progress}
                          height={40}
                          onClick={seekTo}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={stem.volume}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateStem(stem.id, { volume: parseFloat(e.target.value) })}
                          style={{ width: 80, accentColor: stem.color }}
                        />
                        <span style={{ ...MONO, fontSize: 10, color: stem.color, width: 30 }}>
                          {Math.round(stem.volume * 100)}%
                        </span>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); exportStem(stem.id); }}
                        title="Download WAV"
                        style={{
                          ...VT, fontSize: 10, padding: '2px 8px', border: `1px solid ${BORDER}`,
                          background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                        }}
                      >
                        DL
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); saveToLibrary(stem.id); }}
                        disabled={savingId === stem.id}
                        title="Save to Media Library"
                        style={{
                          ...VT, fontSize: 10, padding: '2px 8px',
                          border: `1px solid ${savingId === stem.id ? OC : '#44ff88'}`,
                          background: savingId === stem.id ? 'rgba(255,140,0,0.15)' : 'transparent',
                          color: savingId === stem.id ? OC : '#44ff88', cursor: 'pointer',
                        }}
                      >
                        {savingId === stem.id ? saveMsg : 'SAVE'}
                      </button>

                      {stem.analyser && <MeterBar analyser={stem.analyser} color={stem.color} />}
                    </div>

                    {selectedStem === stem.id && (
                      <div style={{
                        marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`,
                        display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start',
                      }}>
                        <Knob value={stem.pan} onChange={v => updateStem(stem.id, { pan: v })} label="PAN" color={stem.color} min={-1} max={1} />
                        <Knob value={stem.eq.low} onChange={v => updateStem(stem.id, { eq: { ...stem.eq, low: v } })} label="LOW" color={stem.color} min={-1} max={1} />
                        <Knob value={stem.eq.mid} onChange={v => updateStem(stem.id, { eq: { ...stem.eq, mid: v } })} label="MID" color={stem.color} min={-1} max={1} />
                        <Knob value={stem.eq.high} onChange={v => updateStem(stem.id, { eq: { ...stem.eq, high: v } })} label="HIGH" color={stem.color} min={-1} max={1} />
                        <Knob value={stem.reverb} onChange={v => updateStem(stem.id, { reverb: v })} label="REVERB" color={stem.color} />
                        <Knob value={stem.delay} onChange={v => updateStem(stem.id, { delay: v })} label="DELAY" color={stem.color} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'editor' && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 16,
              }}>
                <div style={{ background: PANEL, border: `1px solid ${BORDER}`, padding: 16 }}>
                  <div style={{ fontSize: 14, color: C, letterSpacing: 2, marginBottom: 8 }}>TRACK INFO</div>
                  <div style={{ ...MONO, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    <div>FILE: {fileName}</div>
                    <div>DURATION: {formatTime(duration)}</div>
                    <div>STEMS: {stems.filter(s => s.buffer).length}</div>
                    <div>SAMPLE RATE: {stems[0]?.buffer?.sampleRate || '—'}Hz</div>
                    <div>CHANNELS: {stems[0]?.buffer?.numberOfChannels || '—'}</div>
                  </div>
                </div>

                <div style={{ background: PANEL, border: `1px solid ${BORDER}`, padding: 16 }}>
                  <div style={{ fontSize: 14, color: C, letterSpacing: 2, marginBottom: 8 }}>EXPORT &amp; SAVE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => exportStem('all')}
                        style={{
                          ...VT, fontSize: 12, padding: '8px 12px', border: `1px solid ${C}`,
                          background: `${C2}0.1)`, color: C, cursor: 'pointer', letterSpacing: 2, flex: 1,
                        }}
                      >
                        DOWNLOAD MIX
                      </button>
                      <button
                        onClick={() => saveToLibrary('all')}
                        disabled={savingId === 'all'}
                        style={{
                          ...VT, fontSize: 12, padding: '8px 12px',
                          border: `1px solid ${savingId === 'all' ? OC : '#44ff88'}`,
                          background: savingId === 'all' ? 'rgba(255,140,0,0.15)' : 'rgba(68,255,136,0.1)',
                          color: savingId === 'all' ? OC : '#44ff88', cursor: 'pointer', letterSpacing: 2, flex: 1,
                        }}
                      >
                        {savingId === 'all' ? saveMsg : 'SAVE MIX TO LIBRARY'}
                      </button>
                    </div>
                    <div style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>INDIVIDUAL STEMS</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {stems.filter(s => s.buffer).map(s => (
                        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 70 }}>
                          <button
                            onClick={() => exportStem(s.id)}
                            style={{
                              ...VT, fontSize: 10, padding: '4px 6px', border: `1px solid ${s.color}`,
                              background: 'transparent', color: s.color, cursor: 'pointer', width: '100%',
                            }}
                          >
                            {STEM_ICONS[s.type]} DL
                          </button>
                          <button
                            onClick={() => saveToLibrary(s.id)}
                            disabled={savingId === s.id}
                            style={{
                              ...VT, fontSize: 10, padding: '4px 6px',
                              border: `1px solid ${savingId === s.id ? OC : '#44ff88'}`,
                              background: savingId === s.id ? 'rgba(255,140,0,0.15)' : 'transparent',
                              color: savingId === s.id ? OC : '#44ff88', cursor: 'pointer', width: '100%',
                            }}
                          >
                            {savingId === s.id ? saveMsg : 'SAVE'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ background: PANEL, border: `1px solid ${BORDER}`, padding: 16 }}>
                  <div style={{ fontSize: 14, color: C, letterSpacing: 2, marginBottom: 8 }}>STEM MIXER</div>
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {stems.filter(s => s.buffer).map(s => (
                      <div key={s.id} style={{ textAlign: 'center' }}>
                        <div style={{ ...MONO, fontSize: 9, color: s.color, marginBottom: 4 }}>{s.label}</div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={s.volume}
                          onChange={e => updateStem(s.id, { volume: parseFloat(e.target.value) })}
                          style={{
                            width: 24, height: 80, accentColor: s.color,
                            writingMode: 'vertical-lr', direction: 'rtl',
                          }}
                        />
                        <div style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                          {Math.round(s.volume * 100)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 14, color: C, letterSpacing: 2, marginBottom: 8 }}>STEM WAVEFORMS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stems.filter(s => s.buffer).map(stem => (
                  <div key={stem.id} style={{ background: PANEL, border: `1px solid ${BORDER}`, padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{STEM_ICONS[stem.type]}</span>
                      <span style={{ ...VT, fontSize: 14, color: stem.color, letterSpacing: 2 }}>{stem.label}</span>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => exportStem(stem.id)}
                        title="Download WAV"
                        style={{
                          ...VT, fontSize: 10, padding: '2px 8px', border: `1px solid ${BORDER}`,
                          background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                        }}
                      >
                        DL
                      </button>
                      <button
                        onClick={() => saveToLibrary(stem.id)}
                        disabled={savingId === stem.id}
                        title="Save to Media Library"
                        style={{
                          ...VT, fontSize: 10, padding: '2px 8px',
                          border: `1px solid ${savingId === stem.id ? OC : '#44ff88'}`,
                          background: savingId === stem.id ? 'rgba(255,140,0,0.15)' : 'transparent',
                          color: savingId === stem.id ? OC : '#44ff88', cursor: 'pointer',
                        }}
                      >
                        {savingId === stem.id ? saveMsg : 'SAVE'}
                      </button>
                      <button
                        onClick={() => updateStem(stem.id, { muted: !stem.muted })}
                        style={{
                          ...VT, fontSize: 10, padding: '2px 8px', border: `1px solid ${stem.muted ? '#ff4444' : BORDER}`,
                          background: stem.muted ? 'rgba(255,68,68,0.15)' : 'transparent',
                          color: stem.muted ? '#ff4444' : 'rgba(255,255,255,0.3)', cursor: 'pointer',
                        }}
                      >
                        {stem.muted ? 'UNMUTE' : 'MUTE'}
                      </button>
                    </div>
                    <WaveformDisplay
                      waveform={stem.waveform}
                      color={stem.color}
                      muted={stem.muted}
                      progress={progress}
                      height={50}
                      onClick={seekTo}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function exportStem(stemId: string) {
    const buffer = buildMixBuffer(stemId);
    if (!buffer) return;

    const offCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const src = offCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(offCtx.destination);
    src.start();

    offCtx.startRendering().then(rendered => {
      const wav = audioBufferToWav(rendered);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getStemFileName(stemId);
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}
