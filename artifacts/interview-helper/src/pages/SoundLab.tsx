import { useState, useRef, useEffect, useCallback } from 'react';
import { ProGate } from '@/components/ProGate';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useTrackPicker } from '@/components/TrackPicker';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';
import TerrenceAssistDrawer from '@/components/TerrenceAssistDrawer';
import { apiFetch } from '@/lib/api-client';
import { groupedSamples, findSample, type Sample } from '@/lib/salaryman-samples';

const C = '#38bdf8';
const C2 = 'rgba(56,189,248,';
const OC = '#ff8c00';
const OC2 = 'rgba(255,140,0,';
const BG = '#0a0d0a';
const CHASSIS = '#0d100d';
const PANEL_BG = '#080b08';
const BORDER = 'rgba(56,189,248,.18)';
const VT: React.CSSProperties = { fontFamily: "var(--font-sans)" };
const MONO: React.CSSProperties = { fontFamily: "var(--font-sans)" };

let _actx: AudioContext | null = null;
function actx(): AudioContext {
  if (!_actx) _actx = new AudioContext();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}

function mkImpulseResponse(ctx: AudioContext, duration = 2.5, decay = 2.5): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface EffectParams {
  enabled: boolean;
  wetDry: number;
  reverbDecay?: number;
  delayTime?: number;
  delayFeedback?: number;
  distDrive?: number;
  compThreshold?: number;
  compRatio?: number;
  eqLow?: number;
  eqMid?: number;
  eqHigh?: number;
  chorusDepth?: number;
  chorusRate?: number;
  flangerDepth?: number;
  flangerRate?: number;
  phaserDepth?: number;
  phaserRate?: number;
  tremoloRate?: number;
  tremoloDepth?: number;
  bitDepth?: number;
}

interface TrackDef {
  id: string;
  name: string;
  vol: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  color: string;
  effects: EffectParams[];
}

interface SequencerPattern {
  rows: boolean[][];
  steps: 16 | 32 | 64;
}

interface AudioBus {
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
}

interface EffectChainResult {
  input: GainNode;
  output: GainNode;
  oscillators: OscillatorNode[];
}

interface AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  masterAnalyser: AnalyserNode;
  trackBuses: AudioBus[];
  activeEffects: EffectChainResult[];
  masterInsertIn: GainNode;
  masterInsertOut: GainNode;
  drumFilter: BiquadFilterNode;
  drumDrive: WaveShaperNode;
}

interface SynthVoice {
  osc1Type: WaveType;
  osc2Type: WaveType;
  osc1Detune: number;
  osc2Detune: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterType: BiquadFilterType;
  filterCutoff: number;
  filterRes: number;
}

type DAWSection = 'machine' | 'synth' | 'arpeggiator' | 'sampler' | 'timeline' | 'mixer' | 'effects';

const TRACK_COLORS = ['#38bdf8', '#ff4444', '#4488ff', '#ffaa00', '#cc44ff', '#44ffff', '#ff44cc', '#7dd3fc'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES: Record<string, number[]> = {
  'Major': [0,2,4,5,7,9,11],
  'Minor': [0,2,3,5,7,8,10],
  'Pentatonic': [0,2,4,7,9],
  'Blues': [0,3,5,6,7,10],
  'Dorian': [0,2,3,5,7,9,10],
  'Phrygian': [0,1,3,5,7,8,10],
  'Lydian': [0,2,4,6,7,9,11],
  'Mixolydian': [0,2,4,5,7,9,10],
  'Chromatic': [0,1,2,3,4,5,6,7,8,9,10,11],
};
const ARP_PATTERNS = ['Up', 'Down', 'Up-Down', 'Random', 'As-Played'];
const ARP_RATES = ['1/4', '1/8', '1/16', '1/32'];

const DRUM_NAMES = [
  'KICK', 'SNARE', 'HI-HAT', 'OPEN HAT', 'CLAP', 'TOM LO', 'TOM HI', 'PERC',
  'RIM SHOT', 'COWBELL', 'SHAKER', 'TAMB', 'CRASH', 'RIDE', 'CONGA', 'WOODBLK',
];
const DRUM_COLORS = [
  '#ff4444','#ffaa00','#38bdf8','#4488ff','#ff44cc','#cc44ff','#44ffff','#7dd3fc',
  '#ff8844','#ffdd00','#44ffbb','#ff6688','#aaaaff','#55ffaa','#ff9933','#ccff55',
];

const DEFAULT_SYNTH: SynthVoice = {
  osc1Type: 'sawtooth', osc2Type: 'square', osc1Detune: 0, osc2Detune: 7,
  attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3,
  filterType: 'lowpass', filterCutoff: 2000, filterRes: 1,
};

interface SynthPreset { name: string; voice: SynthVoice; }
const SYNTH_PRESETS: SynthPreset[] = [
  { name: 'FAT BASS', voice: { osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc1Detune: -7, osc2Detune: 7, attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.15, filterType: 'lowpass', filterCutoff: 400, filterRes: 6 } },
  { name: 'ACID LEAD', voice: { osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc1Detune: 0, osc2Detune: 12, attack: 0.003, decay: 0.08, sustain: 0.5, release: 0.1, filterType: 'lowpass', filterCutoff: 1200, filterRes: 18 } },
  { name: 'WARM PAD', voice: { osc1Type: 'sine', osc2Type: 'triangle', osc1Detune: -5, osc2Detune: 5, attack: 0.6, decay: 0.4, sustain: 0.9, release: 1.2, filterType: 'lowpass', filterCutoff: 800, filterRes: 1 } },
  { name: 'PLUCK', voice: { osc1Type: 'sawtooth', osc2Type: 'square', osc1Detune: 0, osc2Detune: 0, attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.3, filterType: 'lowpass', filterCutoff: 3000, filterRes: 3 } },
  { name: 'BRASS STAB', voice: { osc1Type: 'square', osc2Type: 'sawtooth', osc1Detune: -3, osc2Detune: 3, attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.08, filterType: 'lowpass', filterCutoff: 3500, filterRes: 4 } },
  { name: 'DETUNED SAW', voice: { osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc1Detune: -25, osc2Detune: 25, attack: 0.05, decay: 0.3, sustain: 0.7, release: 0.4, filterType: 'lowpass', filterCutoff: 5000, filterRes: 2 } },
  { name: 'SUB BASS', voice: { osc1Type: 'sine', osc2Type: 'sine', osc1Detune: 0, osc2Detune: -12, attack: 0.02, decay: 0.4, sustain: 0.9, release: 0.3, filterType: 'lowpass', filterCutoff: 200, filterRes: 1 } },
  { name: 'GLASS BELL', voice: { osc1Type: 'sine', osc2Type: 'sine', osc1Detune: 0, osc2Detune: 1200, attack: 0.001, decay: 0.8, sustain: 0.0, release: 1.5, filterType: 'bandpass', filterCutoff: 4000, filterRes: 5 } },
  { name: 'REESE BASS', voice: { osc1Type: 'sawtooth', osc2Type: 'sawtooth', osc1Detune: -14, osc2Detune: 14, attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.2, filterType: 'lowpass', filterCutoff: 300, filterRes: 8 } },
  { name: 'STRING ENS', voice: { osc1Type: 'sawtooth', osc2Type: 'triangle', osc1Detune: -10, osc2Detune: 10, attack: 0.4, decay: 0.2, sustain: 0.85, release: 0.8, filterType: 'lowpass', filterCutoff: 2500, filterRes: 1 } },
];

const EFFECT_NAMES = ['Reverb', 'Delay', 'Distortion', 'Compressor', 'EQ', 'Chorus', 'Flanger', 'Phaser', 'Tremolo', 'BitCrusher'];
const DEFAULT_EFFECT: EffectParams = {
  enabled: false, wetDry: 0.3,
  reverbDecay: 2.5, delayTime: 0.3, delayFeedback: 0.4,
  distDrive: 20, compThreshold: -24, compRatio: 4,
  eqLow: 0, eqMid: 0, eqHigh: 0,
  chorusDepth: 0.003, chorusRate: 1.5,
  flangerDepth: 0.003, flangerRate: 0.5,
  phaserDepth: 400, phaserRate: 0.8,
  tremoloRate: 4, tremoloDepth: 0.5,
  bitDepth: 8,
};

function makeTrack(id: string, name: string, colorIdx: number): TrackDef {
  return {
    id, name, vol: 0.8, pan: 0, mute: false, solo: false,
    color: TRACK_COLORS[colorIdx % TRACK_COLORS.length],
    effects: EFFECT_NAMES.map(() => ({ ...DEFAULT_EFFECT })),
  };
}

function noteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function playDrum(ctx: AudioContext, drumIdx: number, masterGain: GainNode) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.7;
  out.connect(masterGain);
  switch (drumIdx) {
    case 0: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5); break;
    }
    case 1: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const d = nBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nBuf;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 3000;
      src.connect(flt); flt.connect(ng); ng.connect(out);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 200;
      const og = ctx.createGain(); og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o2.connect(og); og.connect(out);
      src.start(t); src.stop(t + 0.15); o2.start(t); o2.stop(t + 0.08); break;
    }
    case 2: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = nBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nBuf;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.3, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 8000;
      src.connect(flt); flt.connect(ng); ng.connect(out); src.start(t); src.stop(t + 0.05); break;
    }
    case 3: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = nBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nBuf;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.35, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 7000;
      src.connect(flt); flt.connect(ng); ng.connect(out); src.start(t); src.stop(t + 0.4); break;
    }
    case 4: {
      for (let i = 0; i < 3; i++) {
        const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
        const d = nBuf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = nBuf;
        const ng = ctx.createGain(); const st = t + i * 0.012;
        ng.gain.setValueAtTime(0.4, st); ng.gain.exponentialRampToValueAtTime(0.001, st + 0.03);
        const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 2500;
        src.connect(flt); flt.connect(ng); ng.connect(out); src.start(st); src.stop(st + 0.03);
      }
      break;
    }
    case 5: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); break;
    }
    case 6: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(130, t + 0.18);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25); break;
    }
    case 7: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const d = nBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ctx.createBufferSource(); src.buffer = nBuf;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1200; flt.Q.value = 2;
      src.connect(flt); flt.connect(ng); ng.connect(out); src.start(t); src.stop(t + 0.08); break;
    }
    case 8: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 400;
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
      const d2 = nBuf.getChannelData(0);
      for (let i = 0; i < d2.length; i++) d2[i] = Math.random() * 2 - 1;
      const src2 = ctx.createBufferSource(); src2.buffer = nBuf;
      const ng2 = ctx.createGain(); ng2.gain.setValueAtTime(0.4, t); ng2.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      const flt2 = ctx.createBiquadFilter(); flt2.type = 'bandpass'; flt2.frequency.value = 1800; flt2.Q.value = 3;
      o.connect(g); g.connect(out);
      src2.connect(flt2); flt2.connect(ng2); ng2.connect(out);
      o.start(t); o.stop(t + 0.07); src2.start(t); src2.stop(t + 0.02); break;
    }
    case 9: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 562;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 845;
      const mix = ctx.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix); mix.connect(g); g.connect(out);
      o1.start(t); o1.stop(t + 0.6); o2.start(t); o2.stop(t + 0.6); break;
    }
    case 10: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const d3 = nBuf.getChannelData(0);
      for (let i = 0; i < d3.length; i++) d3[i] = (Math.random() * 2 - 1) * (i % 3 === 0 ? 1 : 0.1);
      const src3 = ctx.createBufferSource(); src3.buffer = nBuf;
      const ng3 = ctx.createGain(); ng3.gain.setValueAtTime(0.4, t); ng3.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const flt3 = ctx.createBiquadFilter(); flt3.type = 'highpass'; flt3.frequency.value = 5000;
      src3.connect(flt3); flt3.connect(ng3); ng3.connect(out); src3.start(t); src3.stop(t + 0.12); break;
    }
    case 11: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d4 = nBuf.getChannelData(0);
      for (let i = 0; i < d4.length; i++) d4[i] = (Math.random() * 2 - 1) * (i % 2 === 0 ? 0.8 : 0.2);
      const src4 = ctx.createBufferSource(); src4.buffer = nBuf;
      const ng4 = ctx.createGain(); ng4.gain.setValueAtTime(0.35, t); ng4.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      const flt4 = ctx.createBiquadFilter(); flt4.type = 'bandpass'; flt4.frequency.value = 4000; flt4.Q.value = 1;
      src4.connect(flt4); flt4.connect(ng4); ng4.connect(out); src4.start(t); src4.stop(t + 0.25); break;
    }
    case 12: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d5 = nBuf.getChannelData(0);
      for (let i = 0; i < d5.length; i++) d5[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d5.length, 0.4);
      const src5 = ctx.createBufferSource(); src5.buffer = nBuf;
      const ng5 = ctx.createGain(); ng5.gain.setValueAtTime(0.5, t); ng5.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      const flt5 = ctx.createBiquadFilter(); flt5.type = 'highpass'; flt5.frequency.value = 4000;
      src5.connect(flt5); flt5.connect(ng5); ng5.connect(out); src5.start(t); src5.stop(t + 1.2); break;
    }
    case 13: {
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 2.5, ctx.sampleRate);
      const d6 = nBuf.getChannelData(0);
      for (let i = 0; i < d6.length; i++) d6[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d6.length, 0.6);
      const src6 = ctx.createBufferSource(); src6.buffer = nBuf;
      const ng6 = ctx.createGain(); ng6.gain.setValueAtTime(0.3, t); ng6.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      const flt6a = ctx.createBiquadFilter(); flt6a.type = 'highpass'; flt6a.frequency.value = 5000;
      const flt6b = ctx.createBiquadFilter(); flt6b.type = 'peaking'; flt6b.frequency.value = 8000; flt6b.gain.value = 4;
      src6.connect(flt6a); flt6a.connect(flt6b); flt6b.connect(ng6); ng6.connect(out); src6.start(t); src6.stop(t + 2.5); break;
    }
    case 14: {
      const freqs = [180, 293];
      for (const freq of freqs) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.25);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
      }
      break;
    }
    case 15: {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 800;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1200;
      const mix2 = ctx.createGain(); mix2.gain.value = 0.5;
      o1.connect(mix2); o2.connect(mix2); mix2.connect(g); g.connect(out);
      o1.start(t); o1.stop(t + 0.12); o2.start(t); o2.stop(t + 0.12); break;
    }
  }
}

function playSynthNote(ctx: AudioContext, noteNum: number, synth: SynthVoice, masterGain: GainNode, dur = 0.5) {
  const t = ctx.currentTime;
  const freq = noteToFreq(noteNum);
  const { attack: a, decay: d, sustain: s, release: r } = synth;
  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, t);
  envGain.gain.linearRampToValueAtTime(0.7, t + a);
  envGain.gain.linearRampToValueAtTime(0.7 * s, t + a + d);
  envGain.gain.setValueAtTime(0.7 * s, t + dur);
  envGain.gain.linearRampToValueAtTime(0, t + dur + r);
  const filter = ctx.createBiquadFilter();
  filter.type = synth.filterType;
  filter.frequency.value = synth.filterCutoff;
  filter.Q.value = synth.filterRes;
  const o1 = ctx.createOscillator();
  o1.type = synth.osc1Type; o1.frequency.value = freq; o1.detune.value = synth.osc1Detune;
  const o2 = ctx.createOscillator();
  o2.type = synth.osc2Type; o2.frequency.value = freq; o2.detune.value = synth.osc2Detune;
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  o1.connect(mix); o2.connect(mix);
  mix.connect(filter); filter.connect(envGain); envGain.connect(masterGain);
  o1.start(t); o1.stop(t + dur + r + 0.01);
  o2.start(t); o2.stop(t + dur + r + 0.01);
}

interface MidiVoiceHandle { o1: OscillatorNode; o2: OscillatorNode; envGain: GainNode; release: number; }

function startSynthVoice(ctx: AudioContext, noteNum: number, synth: SynthVoice, masterGain: GainNode): MidiVoiceHandle {
  const t = ctx.currentTime;
  const freq = noteToFreq(noteNum);
  const { attack: a, decay: d, sustain: s, release: r } = synth;
  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, t);
  envGain.gain.linearRampToValueAtTime(0.7, t + a);
  envGain.gain.linearRampToValueAtTime(0.7 * s, t + a + d);
  const filter = ctx.createBiquadFilter();
  filter.type = synth.filterType;
  filter.frequency.value = synth.filterCutoff;
  filter.Q.value = synth.filterRes;
  const o1 = ctx.createOscillator();
  o1.type = synth.osc1Type; o1.frequency.value = freq; o1.detune.value = synth.osc1Detune;
  const o2 = ctx.createOscillator();
  o2.type = synth.osc2Type; o2.frequency.value = freq; o2.detune.value = synth.osc2Detune;
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  o1.connect(mix); o2.connect(mix);
  mix.connect(filter); filter.connect(envGain); envGain.connect(masterGain);
  o1.start(t); o2.start(t);
  return { o1, o2, envGain, release: r };
}

function stopSynthVoice(ctx: AudioContext, handle: MidiVoiceHandle) {
  const t = ctx.currentTime;
  handle.envGain.gain.cancelScheduledValues(t);
  handle.envGain.gain.setValueAtTime(handle.envGain.gain.value, t);
  handle.envGain.gain.linearRampToValueAtTime(0, t + handle.release);
  handle.o1.stop(t + handle.release + 0.01);
  handle.o2.stop(t + handle.release + 0.01);
}

const hwPanel: React.CSSProperties = {
  background: PANEL_BG,
  border: `2px solid ${BORDER}`,
  borderRadius: 6,
  padding: '10px',
  boxShadow: 'inset 0 1px 4px rgba(0,0,0,.6), 0 1px 0 rgba(56,189,248,.05)',
};

const hwLabel: React.CSSProperties = {
  ...MONO,
  fontSize: '.42rem',
  color: C2 + '.45)',
  letterSpacing: '.14em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
};

function Screw() {
  return (
    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'linear-gradient(135deg, #1a1f1a 0%, #2a302a 50%, #1a1f1a 100%)', border: '1px solid rgba(56,189,248,.12)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.5)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '50%', left: '15%', right: '15%', height: 1, background: 'rgba(56,189,248,.15)', transform: 'translateY(-50%) rotate(45deg)' }} />
    </div>
  );
}

function HwKnob({ label, val, min, max, step = 0.01, onChange, color = C, size = 44 }: { label: string; val: number; min: number; max: number; step?: number; onChange: (v: number) => void; color?: string; size?: number }) {
  const angle = ((val - min) / (max - min)) * 270 - 135;
  const ticks = 11;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'ns-resize', userSelect: 'none' }}
      onMouseDown={e => {
        const startY = e.clientY, startVal = val;
        const onMove = (me: MouseEvent) => {
          const delta = (startY - me.clientY) * (max - min) / 150;
          onChange(Math.max(min, Math.min(max, Number((startVal + delta).toFixed(3)))));
        };
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
      }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #2a302a, #151a15 70%)', border: `2px solid rgba(56,189,248,.2)`, position: 'relative', boxShadow: `0 2px 8px rgba(0,0,0,.5), inset 0 1px 2px rgba(255,255,255,.03), 0 0 ${val > (max - min) * 0.7 + min ? '8' : '0'}px ${color}33` }}>
        {Array.from({ length: ticks }, (_, i) => {
          const a = (i / (ticks - 1)) * 270 - 135;
          const rad = (a * Math.PI) / 180;
          const r = size / 2 + 4;
          const cx = size / 2 + Math.sin(rad) * r;
          const cy = size / 2 - Math.cos(rad) * r;
          return <div key={i} style={{ position: 'absolute', width: 2, height: 2, borderRadius: '50%', background: C2 + '.2)', left: cx - 1, top: cy - 1 }} />;
        })}
        <div style={{ width: 2, height: size / 2 - 4, background: color, borderRadius: 1, position: 'absolute', bottom: '50%', left: 'calc(50% - 1px)', transformOrigin: 'bottom center', transform: `rotate(${angle}deg)`, boxShadow: `0 0 4px ${color}88` }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 6, height: 6, borderRadius: '50%', background: '#0a0d0a', border: '1px solid rgba(56,189,248,.1)' }} />
      </div>
      <span style={{ ...MONO, fontSize: '.38rem', color: C2 + '.5)', letterSpacing: '.08em' }}>{label}</span>
      <span style={{ ...MONO, fontSize: '.34rem', color: color + '66' }}>{typeof val === 'number' && val % 1 !== 0 ? val.toFixed(2) : val}</span>
    </div>
  );
}

function HwSlider({ label, val, min, max, onChange, vertical = false }: { label: string; val: number; min: number; max: number; onChange: (v: number) => void; vertical?: boolean }) {
  const pct = ((val - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column-reverse' : 'column', alignItems: 'center', gap: 3 }}>
      {vertical ? (
        <div style={{ width: 20, height: 80, background: '#0a0d0a', border: `2px solid ${BORDER}`, borderRadius: 4, position: 'relative', cursor: 'ns-resize', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6)' }}
          onMouseDown={e => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const onMove = (me: MouseEvent) => {
              const p = 1 - Math.max(0, Math.min(1, (me.clientY - rect.top) / rect.height));
              onChange(min + p * (max - min));
            };
            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
          }}>
          <div style={{ position: 'absolute', bottom: 0, left: 2, right: 2, height: `${pct}%`, background: `linear-gradient(to top, ${C}44, ${C}22)`, borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '50%', bottom: `${pct}%`, transform: 'translate(-50%, 50%)', width: 16, height: 8, background: 'linear-gradient(to bottom, #3a3f3a, #1a1f1a)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,.5)' }} />
        </div>
      ) : (
        <input type="range" min={min} max={max} step={(max - min) / 200} value={val}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', accentColor: C }} />
      )}
      <span style={{ ...MONO, fontSize: '.36rem', color: C2 + '.4)', letterSpacing: '.06em' }}>{label}</span>
    </div>
  );
}

function HwButton({ label, onClick, active = false, color = C, small = false }: { label: string; onClick: () => void; active?: boolean; color?: string; small?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? '3px 6px' : '5px 10px',
      background: active ? `linear-gradient(to bottom, ${color}22, ${color}11)` : 'linear-gradient(to bottom, #1a1f1a, #101310)',
      border: `2px solid ${active ? color + '88' : 'rgba(56,189,248,.15)'}`,
      color: active ? color : C2 + '.4)',
      cursor: 'pointer', ...VT,
      fontSize: small ? '.6rem' : '.7rem',
      letterSpacing: '.08em',
      borderRadius: 4,
      boxShadow: active ? `0 0 8px ${color}33, inset 0 1px 2px rgba(0,0,0,.3)` : 'inset 0 1px 2px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.02)',
      transition: 'all .1s',
    }}>
      {label}
    </button>
  );
}

function LED({ on, color = C }: { on: boolean; color?: string }) {
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: on ? color : '#1a1f1a', boxShadow: on ? `0 0 6px ${color}` : 'none', border: '1px solid rgba(56,189,248,.15)', transition: 'all .05s' }} />;
}

function LevelMeter({ analyser }: { analyser: AnalyserNode | null }) {
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!analyser || !canRef.current) return;
    const can = canRef.current;
    const ctx2 = can.getContext('2d');
    if (!ctx2) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const level = avg / 256;
      ctx2.clearRect(0, 0, can.width, can.height);
      const segments = 12;
      const segH = can.height / segments;
      for (let i = 0; i < segments; i++) {
        const threshold = (segments - i) / segments;
        if (level >= threshold - 1 / segments) {
          const ratio = i / segments;
          ctx2.fillStyle = ratio < 0.15 ? '#ff4444' : ratio < 0.3 ? '#ffaa00' : '#38bdf8';
          ctx2.fillRect(1, i * segH + 1, can.width - 2, segH - 2);
        } else {
          ctx2.fillStyle = 'rgba(56,189,248,.06)';
          ctx2.fillRect(1, i * segH + 1, can.width - 2, segH - 2);
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return <canvas ref={canRef} width={10} height={60} style={{ borderRadius: 2, border: `1px solid ${BORDER}`, background: '#050805' }} />;
}

function Oscilloscope({ analyser, color = OC }: { analyser: AnalyserNode | null; color?: string }) {
  const canRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canRef.current) return;
    const can = canRef.current;
    const ctx2 = can.getContext('2d');
    if (!ctx2) return;
    if (!analyser) {
      ctx2.fillStyle = '#050805';
      ctx2.fillRect(0, 0, can.width, can.height);
      ctx2.strokeStyle = color + '33';
      ctx2.lineWidth = 1;
      ctx2.beginPath();
      ctx2.moveTo(0, can.height / 2);
      ctx2.lineTo(can.width, can.height / 2);
      ctx2.stroke();
      for (let x = 0; x < can.width; x += 20) {
        ctx2.strokeStyle = color + '0a';
        ctx2.beginPath(); ctx2.moveTo(x, 0); ctx2.lineTo(x, can.height); ctx2.stroke();
      }
      for (let y = 0; y < can.height; y += 20) {
        ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(can.width, y); ctx2.stroke();
      }
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      ctx2.fillStyle = 'rgba(5,8,5,.3)';
      ctx2.fillRect(0, 0, can.width, can.height);
      for (let x = 0; x < can.width; x += 20) {
        ctx2.strokeStyle = color + '08';
        ctx2.lineWidth = 1;
        ctx2.beginPath(); ctx2.moveTo(x, 0); ctx2.lineTo(x, can.height); ctx2.stroke();
      }
      for (let y = 0; y < can.height; y += 20) {
        ctx2.strokeStyle = color + '08';
        ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(can.width, y); ctx2.stroke();
      }
      ctx2.strokeStyle = color + '15';
      ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(0, can.height / 2); ctx2.lineTo(can.width, can.height / 2); ctx2.stroke();
      ctx2.strokeStyle = color;
      ctx2.lineWidth = 2;
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 6;
      ctx2.beginPath();
      const sliceW = can.width / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * can.height) / 2;
        if (i === 0) ctx2.moveTo(0, y); else ctx2.lineTo(i * sliceW, y);
      }
      ctx2.stroke();
      ctx2.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, color]);
  return (
    <div style={{ ...hwPanel, padding: 4 }}>
      <div style={hwLabel}>OSCILLOSCOPE</div>
      <canvas ref={canRef} width={280} height={80} style={{ width: '100%', height: 80, borderRadius: 4, border: `1px solid ${OC}22`, background: '#050805', display: 'block' }} />
    </div>
  );
}

const PIANO_START = 48;
const PIANO_NOTES = 24;
const WHITE_KEYS = [0,2,4,5,7,9,11];

function PianoKeyboard({ synth, masterGain, octave = 0 }: { synth: SynthVoice; masterGain: GainNode | null; octave?: number }) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const off = octave * 12;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', height: 50, overflow: 'hidden', border: `2px solid ${BORDER}`, borderRadius: 4, background: '#0a0d0a' }}>
      {Array.from({ length: PIANO_NOTES }, (_, i) => {
        const note = PIANO_START + off + i;
        const mod = i % 12;
        const isWhite = WHITE_KEYS.includes(mod);
        return (
          <div key={note} onMouseDown={() => {
            if (!masterGain) return;
            const c = actx();
            setPressed(p => new Set([...p, note]));
            playSynthNote(c, note, synth, masterGain, 0.3);
          }} onMouseUp={() => setPressed(p => { const n = new Set(p); n.delete(note); return n; })}
            style={{
              width: isWhite ? 14 : 9, height: isWhite ? 48 : 30,
              background: isWhite ? (pressed.has(note) ? C + '55' : 'linear-gradient(to bottom, #252a25, #181d18)') : (pressed.has(note) ? C + '88' : 'linear-gradient(to bottom, #0a0d0a, #050805)'),
              border: isWhite ? `1px solid ${BORDER}` : `1px solid ${C}55`,
              borderRadius: '0 0 3px 3px', cursor: 'pointer', zIndex: isWhite ? 1 : 2,
              position: 'relative', marginLeft: isWhite ? 0 : -5, marginRight: isWhite ? 0 : -4,
              alignSelf: 'flex-start',
              boxShadow: pressed.has(note) ? `0 0 8px ${C}44` : 'inset 0 -2px 3px rgba(0,0,0,.3)',
            }} />
        );
      })}
    </div>
  );
}

function DrumPads({ busGain, activePads }: { busGain: GainNode | null; activePads: Set<number> }) {
  const [hitPad, setHitPad] = useState<number | null>(null);

  const triggerPad = (idx: number) => {
    const c = actx();
    const out = busGain ?? (() => { const g = c.createGain(); g.gain.value = 0.6; g.connect(c.destination); return g; })();
    playDrum(c, idx, out);
    setHitPad(idx);
    setTimeout(() => setHitPad(p => p === idx ? null : p), 120);
  };

  return (
    <div style={{ ...hwPanel }}>
      <div style={hwLabel}>DRUM PADS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {DRUM_NAMES.map((name, i) => {
          const isActive = hitPad === i || activePads.has(i);
          return (
            <div key={i} onMouseDown={() => triggerPad(i)} style={{
              width: '100%', aspectRatio: '1', minWidth: 40,
              background: isActive
                ? `radial-gradient(circle at 45% 40%, ${DRUM_COLORS[i]}55, ${DRUM_COLORS[i]}22)`
                : 'radial-gradient(circle at 45% 40%, #1e231e, #111411)',
              border: `2px solid ${isActive ? DRUM_COLORS[i] + '88' : 'rgba(56,189,248,.12)'}`,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              boxShadow: isActive
                ? `0 0 12px ${DRUM_COLORS[i]}44, inset 0 1px 3px rgba(0,0,0,.3)`
                : 'inset 0 2px 4px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.02)',
              transition: 'all .05s',
              userSelect: 'none',
            }}>
              <LED on={isActive} color={DRUM_COLORS[i]} />
              <span style={{ ...MONO, fontSize: '.35rem', color: isActive ? DRUM_COLORS[i] : C2 + '.35)', letterSpacing: '.06em' }}>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepSequencer({ busGain, bpm, swing, onActivePads, globalPlaying, globalStep, muted }: {
  busGain: GainNode | null;
  bpm: number;
  swing: number;
  onActivePads: (pads: Set<number>) => void;
  globalPlaying: boolean;
  globalStep: number;
  muted: boolean;
}) {
  const [steps, setSteps] = useState<16 | 32>(16);
  const [pattern, setPattern] = useState<SequencerPattern>(() => ({
    steps: 16,
    rows: Array.from({ length: 16 }, () => Array(16).fill(false)),
  }));
  const [currentStep, setCurrentStep] = useState(-1);

  const toggleCell = (row: number, col: number) => {
    setPattern(p => {
      const newRows = p.rows.map((r, ri) => ri === row ? r.map((v, ci) => ci === col ? !v : v) : r);
      return { ...p, rows: newRows };
    });
  };

  const clearPattern = () => setPattern({ steps: pattern.steps, rows: Array.from({ length: 16 }, () => Array(pattern.steps).fill(false)) });

  useEffect(() => {
    if (!globalPlaying) {
      setCurrentStep(-1);
      onActivePads(new Set());
      return;
    }
    const s = globalStep % pattern.steps;
    setCurrentStep(s);
    if (!muted) {
      const c = actx();
      const out = busGain ?? (() => { const g = c.createGain(); g.gain.value = 0.6; g.connect(c.destination); return g; })();
      const activeDrums = new Set<number>();
      pattern.rows.forEach((row, ri) => { if (row[s]) { playDrum(c, ri, out); activeDrums.add(ri); } });
      onActivePads(activeDrums);
    } else {
      onActivePads(new Set());
    }
  }, [globalPlaying, globalStep, pattern, muted, busGain, onActivePads]);

  const changeSteps = (n: 16 | 32) => {
    setSteps(n);
    setPattern(p => ({ steps: n, rows: p.rows.map(r => Array(n).fill(false).map((_, i) => r[i] ?? false)) }));
  };

  const cellSize = steps <= 16 ? 24 : 14;

  return (
    <div style={{ ...hwPanel, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={hwLabel}>STEP SEQUENCER</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <LED on={globalPlaying && !muted} color="#ff4444" />
          <HwButton label="CLR" onClick={clearPattern} small />
          <HwButton label="16" onClick={() => changeSteps(16)} active={steps === 16} small />
          <HwButton label="32" onClick={() => changeSteps(32)} active={steps === 32} small />
        </div>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        {DRUM_NAMES.map((name, ri) => (
          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <span style={{ ...MONO, fontSize: '.38rem', color: DRUM_COLORS[ri], width: 44, letterSpacing: '.04em', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>{name}</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {pattern.rows[ri]?.map((on, ci) => {
                const isCurrent = ci === currentStep;
                const isBar = ci % 4 === 0;
                return (
                  <div key={ci} onClick={() => toggleCell(ri, ci)} style={{
                    width: cellSize, height: 18,
                    background: on
                      ? (isCurrent ? DRUM_COLORS[ri] + 'cc' : DRUM_COLORS[ri] + '55')
                      : (isCurrent ? 'rgba(56,189,248,.15)' : isBar ? 'rgba(56,189,248,.06)' : 'rgba(56,189,248,.03)'),
                    border: isCurrent
                      ? `1px solid ${DRUM_COLORS[ri]}cc`
                      : on ? `1px solid ${DRUM_COLORS[ri]}55` : `1px solid rgba(56,189,248,.08)`,
                    cursor: 'pointer', borderRadius: 2,
                    boxShadow: on && isCurrent ? `0 0 6px ${DRUM_COLORS[ri]}88` : 'none',
                    transition: 'background .05s',
                  }} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransportBar({ bpm, onBpmChange, swing, onSwingChange, masterVol, onMasterVolChange, playing, onPlayToggle, engineReady, instrumentMutes, onMuteToggle, instrumentVols, onVolChange }: {
  bpm: number; onBpmChange: (v: number) => void;
  swing: number; onSwingChange: (v: number) => void;
  masterVol: number; onMasterVolChange: (v: number) => void;
  playing: boolean;
  onPlayToggle: () => void;
  engineReady: boolean;
  instrumentMutes: Record<string, boolean>;
  onMuteToggle: (id: string) => void;
  instrumentVols: Record<string, number>;
  onVolChange: (id: string, v: number) => void;
}) {
  const instruments = [
    { id: 'drums', label: 'DRUMS', color: '#ff4444' },
    { id: 'synth', label: 'SYNTH', color: C },
    { id: 'arp', label: 'ARP', color: '#4488ff' },
    { id: 'sampler', label: 'SMPL', color: '#ffaa00' },
  ];
  return (
    <div style={{ ...hwPanel, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px' }}>
      <button onClick={onPlayToggle} style={{
        padding: '5px 14px',
        background: playing ? 'linear-gradient(to bottom, rgba(255,68,68,.2), rgba(255,68,68,.08))' : 'linear-gradient(to bottom, rgba(56,189,248,.12), rgba(56,189,248,.04))',
        border: `2px solid ${playing ? '#ff444488' : C + '55'}`,
        color: playing ? '#ff4444' : C,
        cursor: 'pointer', ...VT, fontSize: '.85rem', letterSpacing: '.12em', borderRadius: 4,
        boxShadow: playing ? '0 0 10px #ff444433' : '0 0 8px rgba(56,189,248,.15)',
        transition: 'all .1s',
      }}>
        {playing ? '■ STOP' : '▶ PLAY'}
      </button>
      <LED on={playing} color="#ff4444" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ ...MONO, fontSize: '.4rem', color: C2 + '.5)', letterSpacing: '.1em' }}>BPM</span>
        <input type="number" value={bpm} onChange={e => onBpmChange(Number(e.target.value))} min={40} max={240}
          style={{ width: 50, background: '#050805', border: `2px solid ${BORDER}`, color: C, ...MONO, fontSize: '.6rem', padding: '3px 6px', borderRadius: 3, textAlign: 'center' }} />
      </div>
      <HwKnob label="SWING" val={swing} min={0} max={0.5} onChange={onSwingChange} size={32} />
      <div style={{ width: 1, height: 28, background: BORDER }} />
      <HwKnob label="MASTER" val={masterVol} min={0} max={1} onChange={onMasterVolChange} size={32} color={OC} />
      <div style={{ width: 1, height: 28, background: BORDER }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {instruments.map(inst => (
          <div key={inst.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <HwKnob label="" val={instrumentVols[inst.id] ?? 0.8} min={0} max={1} onChange={v => onVolChange(inst.id, v)} size={24} color={inst.color} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <LED on={playing && !instrumentMutes[inst.id]} color={inst.color} />
              <button onClick={() => onMuteToggle(inst.id)} style={{
                padding: '2px 5px',
                background: instrumentMutes[inst.id] ? 'rgba(255,68,68,.12)' : 'transparent',
                border: `1px solid ${instrumentMutes[inst.id] ? '#ff444455' : BORDER}`,
                color: instrumentMutes[inst.id] ? '#ff4444' : inst.color + '88',
                cursor: 'pointer', ...MONO, fontSize: '.28rem', borderRadius: 2, letterSpacing: '.05em',
              }}>
                {instrumentMutes[inst.id] ? 'M' : inst.label}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <LED on={engineReady} />
        <span style={{ ...MONO, fontSize: '.35rem', color: engineReady ? C2 + '.4)' : C2 + '.15)' }}>AUDIO {engineReady ? 'ACTIVE' : 'INIT'}</span>
      </div>
    </div>
  );
}

function SynthPanel({ busGain, synth, onSynthChange }: { busGain: GainNode | null; synth: SynthVoice; onSynthChange: (v: SynthVoice) => void }) {
  const [octave, setOctave] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const fallbackRef = useRef<GainNode | null>(null);
  const getOutput = useCallback(() => {
    if (busGain) return busGain;
    const c = actx();
    if (!fallbackRef.current) { fallbackRef.current = c.createGain(); fallbackRef.current.gain.value = 0.5; fallbackRef.current.connect(c.destination); }
    return fallbackRef.current;
  }, [busGain]);
  const up = (key: keyof SynthVoice, val: SynthVoice[keyof SynthVoice]) => { onSynthChange({ ...synth, [key]: val }); setSelectedPreset(null); };
  const WAVE_TYPES: WaveType[] = ['sine', 'square', 'sawtooth', 'triangle'];
  const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
  const loadPreset = (idx: number) => { setSelectedPreset(idx); onSynthChange({ ...SYNTH_PRESETS[idx].voice }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={hwPanel}>
        <div style={hwLabel}>PRESETS</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SYNTH_PRESETS.map((p, i) => (
            <HwButton key={i} label={p.name} onClick={() => loadPreset(i)} active={selectedPreset === i} small />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={hwPanel}>
          <div style={hwLabel}>OSC 1</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {WAVE_TYPES.map(w => <HwButton key={w} label={w.toUpperCase().slice(0,3)} onClick={() => up('osc1Type', w)} active={synth.osc1Type === w} small />)}
          </div>
          <HwKnob label="DETUNE" val={synth.osc1Detune} min={-100} max={100} step={1} onChange={v => up('osc1Detune', v)} color={OC} />
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>OSC 2</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {WAVE_TYPES.map(w => <HwButton key={w} label={w.toUpperCase().slice(0,3)} onClick={() => up('osc2Type', w)} active={synth.osc2Type === w} small />)}
          </div>
          <HwKnob label="DETUNE" val={synth.osc2Detune} min={-100} max={100} step={1} onChange={v => up('osc2Detune', v)} color={OC} />
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>ENVELOPE</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <HwKnob label="ATK" val={synth.attack} min={0.001} max={2} onChange={v => up('attack', v)} size={36} />
            <HwKnob label="DEC" val={synth.decay} min={0.001} max={2} onChange={v => up('decay', v)} size={36} />
            <HwKnob label="SUS" val={synth.sustain} min={0} max={1} onChange={v => up('sustain', v)} size={36} />
            <HwKnob label="REL" val={synth.release} min={0.001} max={4} onChange={v => up('release', v)} size={36} />
          </div>
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>FILTER</div>
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {FILTER_TYPES.map(ft => <HwButton key={ft} label={ft.toUpperCase().slice(0,2)} onClick={() => up('filterType', ft)} active={synth.filterType === ft} small />)}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <HwKnob label="CUTOFF" val={synth.filterCutoff} min={50} max={20000} step={10} onChange={v => up('filterCutoff', v)} color={OC} />
            <HwKnob label="RES" val={synth.filterRes} min={0.01} max={30} onChange={v => up('filterRes', v)} color={OC} />
          </div>
        </div>
      </div>
      <div style={hwPanel}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={hwLabel}>OCTAVE</span>
          <HwButton label="-" onClick={() => setOctave(o => Math.max(-2, o - 1))} small />
          <span style={{ ...VT, fontSize: '.9rem', color: C }}>{octave > 0 ? '+' : ''}{octave}</span>
          <HwButton label="+" onClick={() => setOctave(o => Math.min(3, o + 1))} small />
        </div>
        <PianoKeyboard synth={synth} masterGain={getOutput()} octave={octave} />
      </div>
    </div>
  );
}

function Arpeggiator({ busGain, bpm, globalPlaying, globalStep, muted, synth, arpActive, onToggleArp }: {
  busGain: GainNode | null; bpm: number; globalPlaying: boolean; globalStep: number; muted: boolean;
  synth: SynthVoice; arpActive: boolean; onToggleArp: () => void;
}) {
  const [rootNote, setRootNote] = useState(0);
  const [scale, setScale] = useState('Minor');
  const [pattern, setPattern] = useState('Up');
  const [rate, setRate] = useState('1/8');
  const [octaveRange, setOctaveRange] = useState(2);
  const [gateLen, setGateLen] = useState(0.5);
  const [currentNote, setCurrentNote] = useState(-1);
  const posRef = useRef(0);

  const stepsPerNoteMap: Record<string, number> = { '1/4': 4, '1/8': 2, '1/16': 1, '1/32': 1 };
  const noteDurMap: Record<string, number> = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 };
  const stepsPerNote = stepsPerNoteMap[rate] ?? 2;

  const scaleNotes = useCallback(() => {
    const intervals = SCALES[scale] ?? SCALES.Minor;
    const notes: number[] = [];
    for (let oct = 0; oct < octaveRange; oct++) {
      for (const interval of intervals) notes.push(60 + rootNote + oct * 12 + interval);
    }
    return notes;
  }, [scale, rootNote, octaveRange]);

  const getNextNote = useCallback((notes: number[]) => {
    if (notes.length === 0) return -1;
    let idx = posRef.current;
    switch (pattern) {
      case 'Up': idx = posRef.current % notes.length; posRef.current++; break;
      case 'Down': idx = notes.length - 1 - (posRef.current % notes.length); posRef.current++; break;
      case 'Up-Down': {
        const total = notes.length * 2 - 2;
        const p = posRef.current % (total || 1);
        idx = p < notes.length ? p : total - p;
        posRef.current++; break;
      }
      case 'Random': idx = Math.floor(Math.random() * notes.length); posRef.current++; break;
      default: idx = posRef.current % notes.length; posRef.current++;
    }
    return notes[Math.max(0, Math.min(notes.length - 1, idx))];
  }, [pattern]);

  useEffect(() => {
    if (!arpActive || !globalPlaying) { setCurrentNote(-1); posRef.current = 0; return; }
    if (muted) return;
    if (globalStep % stepsPerNote !== 0) return;
    const c = actx();
    const out = busGain ?? (() => { const g = c.createGain(); g.gain.value = 0.4; g.connect(c.destination); return g; })();
    const notes = scaleNotes();
    const note = getNextNote(notes);
    if (note >= 0) {
      playSynthNote(c, note, synth, out, (60 / bpm) * (noteDurMap[rate] ?? 0.5) * gateLen);
      setCurrentNote(note);
    }
  }, [arpActive, globalPlaying, globalStep, muted, stepsPerNote, scaleNotes, getNextNote, synth, gateLen, bpm, rate, busGain]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <HwButton
          label={arpActive ? '■ STOP ARP' : '▶ START ARP'}
          onClick={onToggleArp}
          active={arpActive}
          color={arpActive ? '#ff4444' : '#4488ff'}
        />
        <LED on={arpActive && globalPlaying && !muted} color="#4488ff" />
        <span style={{ ...MONO, fontSize: '.38rem', color: C2 + '.35)' }}>
          {!globalPlaying ? 'PRESS GLOBAL PLAY FIRST' : arpActive ? 'ARP RUNNING' : 'ARP OFF'}
        </span>
        <span style={{ ...MONO, fontSize: '.4rem', color: C2 + '.5)' }}>BPM</span>
        <span style={{ ...VT, fontSize: '.8rem', color: C }}>{bpm}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={hwPanel}>
          <div style={hwLabel}>ROOT</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 180 }}>
            {NOTE_NAMES.map((n, i) => <HwButton key={i} label={n} onClick={() => setRootNote(i)} active={rootNote === i} small />)}
          </div>
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>SCALE</div>
          <select value={scale} onChange={e => setScale(e.target.value)} style={{ background: '#050805', border: `2px solid ${BORDER}`, color: C, ...MONO, fontSize: '.5rem', padding: '4px 8px', borderRadius: 3 }}>
            {Object.keys(SCALES).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>PATTERN</div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {ARP_PATTERNS.map(p => <HwButton key={p} label={p.toUpperCase()} onClick={() => setPattern(p)} active={pattern === p} small />)}
          </div>
        </div>
        <div style={hwPanel}>
          <div style={hwLabel}>RATE</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {ARP_RATES.map(r => <HwButton key={r} label={r} onClick={() => setRate(r)} active={rate === r} small />)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <HwKnob label="OCTAVES" val={octaveRange} min={1} max={4} step={1} onChange={setOctaveRange} size={36} />
        <HwKnob label="GATE" val={gateLen} min={0.05} max={1} onChange={setGateLen} size={36} />
      </div>
      <div style={{ ...MONO, fontSize: '.38rem', color: C2 + '.35)' }}>
        CURRENT: {currentNote >= 0 ? `${NOTE_NAMES[currentNote % 12]}${Math.floor(currentNote / 12) - 1}` : '—'}
      </div>
      <div style={{ ...hwPanel, padding: 8 }}>
        <div style={hwLabel}>USING SYNTH VOICE</div>
        <div style={{ ...MONO, fontSize: '.35rem', color: C2 + '.3)' }}>
          OSC: {synth.osc1Type.toUpperCase()} · FILTER: {synth.filterCutoff}Hz · ATK: {synth.attack.toFixed(3)} · REL: {synth.release.toFixed(2)}
        </div>
        <div style={{ ...MONO, fontSize: '.32rem', color: OC2 + '.4)', marginTop: 4 }}>
          EDIT SYNTH VOICE IN THE SYNTH TAB — ARP USES THE SAME ENGINE
        </div>
      </div>
    </div>
  );
}

function Sampler({ busGain }: { busGain: GainNode | null }) {
  // A pad can hold either a decoded AudioBuffer (uploaded / soundtrack / Hummingbird
  // file) OR a procedural `trigger` (a SALARYMAN sfx function with no audio file).
  const [pads, setPads] = useState<Array<{ name: string; buffer: AudioBuffer | null; trigger: (() => void) | null; color: string; pitch: number; vol: number }>>(() =>
    Array.from({ length: 16 }, (_, i) => ({ name: `PAD ${i + 1}`, buffer: null, trigger: null, color: TRACK_COLORS[i % 8], pitch: 0, vol: 0.8 }))
  );
  const [activePad, setActivePad] = useState<number | null>(null);
  const [loadingPad, setLoadingPad] = useState<number | null>(null);
  const mp = useMusicPlayer();
  const fallbackRef = useRef<GainNode | null>(null);
  const getOutput = useCallback(() => {
    if (busGain) return busGain;
    const c = actx();
    if (!fallbackRef.current) { fallbackRef.current = c.createGain(); fallbackRef.current.gain.value = 0.7; fallbackRef.current.connect(c.destination); }
    return fallbackRef.current;
  }, [busGain]);

  const playPad = useCallback((idx: number) => {
    const pad = pads[idx];
    if (!pad) return;
    if (pad.trigger) { pad.trigger(); setActivePad(idx); setTimeout(() => setActivePad(a => a === idx ? null : a), 200); return; }
    if (!pad.buffer) return;
    const c = actx();
    const src = c.createBufferSource();
    src.buffer = pad.buffer;
    src.playbackRate.value = Math.pow(2, pad.pitch / 12);
    const g = c.createGain(); g.gain.value = pad.vol;
    src.connect(g); g.connect(getOutput());
    src.start();
    setActivePad(idx);
    setTimeout(() => setActivePad(a => a === idx ? null : a), 200);
  }, [pads, getOutput]);

  const loadFile = async (idx: number, file: File) => {
    const c = actx();
    const ab = await file.arrayBuffer();
    const buffer = await c.decodeAudioData(ab);
    setPads(ps => ps.map((p, i) => i === idx ? { ...p, buffer, trigger: null, name: file.name.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 10) } : p));
  };

  // Hummingbird library tracks, surfaced as draggable samples (kind "url" so a
  // pad fetches + decodes them on drop, same path as the office-radio tracks).
  const hummingbirdSamples: Sample[] = (mp.tracks || []).map((t) => ({
    id: `hb:${t.id}`,
    name: (t.title || `TRK ${t.id}`).toUpperCase().slice(0, 10),
    group: "HUMMINGBIRD",
    kind: "url" as const,
    url: `/api/music/stream/${t.id}`,
    play: () => mp.previewTrack?.(t.id),
  }));
  const sections = groupedSamples(hummingbirdSamples);

  // Load any catalog sample onto a pad. sfx → store its trigger fn; url → fetch
  // (via apiFetch so Hummingbird auth/proxy works) + decode into a buffer.
  const loadSampleToPad = async (idx: number, sample: Sample) => {
    if (sample.kind === "sfx") {
      setPads(ps => ps.map((p, i) => i === idx ? { ...p, buffer: null, trigger: sample.play, name: sample.name } : p));
      return;
    }
    if (!sample.url) return;
    try {
      setLoadingPad(idx);
      const c = actx();
      const r = await apiFetch(sample.url);
      if (!r.ok) throw new Error(`sample fetch ${r.status}`);
      const ab = await r.arrayBuffer();
      const buffer = await c.decodeAudioData(ab);
      setPads(ps => ps.map((p, i) => i === idx ? { ...p, buffer, trigger: null, name: sample.name } : p));
    } catch { /* ignore decode/network errors */ }
    finally { setLoadingPad(p => p === idx ? null : p); }
  };

  // Drop handler shared by every pad: a SALARYMAN sample (custom mime) wins;
  // otherwise fall back to an OS audio file (original behaviour).
  const onPadDrop = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    const sid = e.dataTransfer.getData('application/x-sample-id');
    if (sid) { const s = findSample(sid, hummingbirdSamples); if (s) loadSampleToPad(idx, s); return; }
    const f = e.dataTransfer.files[0]; if (f) loadFile(idx, f);
  };

  const clearPad = (idx: number) =>
    setPads(ps => ps.map((p, i) => i === idx ? { ...p, buffer: null, trigger: null, name: `PAD ${i + 1}` } : p));

  const KEYBOARD_MAP = ['q','w','e','r','t','y','u','i','a','s','d','f','g','h','j','k'];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = KEYBOARD_MAP.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < pads.length) playPad(idx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pads, playPad]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...MONO, fontSize: '.38rem', color: C2 + '.35)' }}>DRAG SAMPLES ONTO PADS — OR DROP YOUR OWN AUDIO FILES — KEYBOARD: Q W E R T Y U I / A S D F G H J K</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', gap: 10, alignItems: 'start' }}>
        {/* SAMPLES library — every sound in SALARYMAN, drag onto a pad. */}
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: 'rgba(0,0,0,.35)', padding: 8, maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ ...MONO, fontSize: '.4rem', color: C, letterSpacing: '.18em', marginBottom: 6 }}>◆ SAMPLES</div>
          <div style={{ ...MONO, fontSize: '.32rem', color: C2 + '.3)', marginBottom: 8 }}>DRAG → PAD · CLICK = PREVIEW</div>
          {sections.map(sec => (
            <div key={sec.group} style={{ marginBottom: 8 }}>
              <div style={{ ...MONO, fontSize: '.32rem', color: C2 + '.45)', letterSpacing: '.16em', marginBottom: 4 }}>{sec.group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sec.items.map(s => (
                  <div key={s.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('application/x-sample-id', s.id); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => s.play()}
                    title={`${s.name} — drag onto a pad, or click to preview`}
                    style={{
                      ...MONO, fontSize: '.34rem', color: s.kind === 'sfx' ? C : OC,
                      padding: '3px 6px', borderRadius: 4, cursor: 'grab',
                      border: `1px solid ${(s.kind === 'sfx' ? C : OC)}44`,
                      background: `${(s.kind === 'sfx' ? C2 + '.08)' : 'rgba(255,140,0,.08)')}`,
                      letterSpacing: '.06em', userSelect: 'none', whiteSpace: 'nowrap',
                    }}>
                    {s.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* PADS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {pads.map((pad, i) => {
            const filled = !!pad.buffer || !!pad.trigger;
            return (
            <div key={i}
              onClick={() => playPad(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => onPadDrop(i, e)}
              style={{
                padding: 8, minHeight: 60,
                background: activePad === i
                  ? `radial-gradient(circle at 45% 40%, ${pad.color}33, ${pad.color}11)`
                  : 'radial-gradient(circle at 45% 40%, #1e231e, #111411)',
                border: `2px solid ${filled ? pad.color + '55' : BORDER}`,
                borderRadius: 6, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                boxShadow: activePad === i ? `0 0 12px ${pad.color}44` : 'inset 0 2px 4px rgba(0,0,0,.4)',
                userSelect: 'none', position: 'relative',
              }}>
              <LED on={activePad === i || filled} color={pad.color} />
              <div style={{ ...MONO, fontSize: '.35rem', color: filled ? pad.color : C2 + '.25)', letterSpacing: '.06em', textAlign: 'center' }}>{loadingPad === i ? '…' : pad.name}</div>
              <div style={{ ...MONO, fontSize: '.28rem', color: C2 + '.2)' }}>{KEYBOARD_MAP[i]?.toUpperCase()}</div>
              {filled && (
                <button onClick={e => { e.stopPropagation(); clearPad(i); }}
                  title="clear pad"
                  style={{ position: 'absolute', top: 2, right: 4, ...MONO, fontSize: '.4rem', color: C2 + '.4)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
              )}
              {!filled && (
                <label style={{ position: 'absolute', inset: 0, cursor: 'pointer', opacity: 0 }}>
                  <input type="file" accept="audio/*" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(i, f); }} style={{ display: 'none' }} />
                </label>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AudioRecorder() {
  const mp = useMusicPlayer();
  const [recording, setRecording] = useState(false);
  const [recordings, setRecordings] = useState<Array<{ name: string; url: string; date: string; blob?: Blob }>>([]);
  const [level, setLevel] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const c = actx();
    const src = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser(); analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = e => chunksRef.current.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setRecordings(r => [...r, { name: `REC-${new Date().toLocaleTimeString().replace(/:/g, '')}`, url, date: new Date().toLocaleTimeString(), blob }]);
      stream.getTracks().forEach(t => t.stop());
    };
    mr.start(); mediaRef.current = mr; setRecording(true);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => { rafRef.current = requestAnimationFrame(tick); analyser.getByteFrequencyData(data); setLevel(data.reduce((a, b) => a + b, 0) / data.length / 256); };
    tick();
  };

  const stopRecording = () => { mediaRef.current?.stop(); setRecording(false); cancelAnimationFrame(rafRef.current); setLevel(0); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {recording ? (
          <HwButton label="■ STOP REC" onClick={stopRecording} active color="#ff4444" />
        ) : (
          <HwButton label="● RECORD" onClick={startRecording} color="#ff4444" />
        )}
        {recording && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} style={{ width: 3, background: '#ff4444', borderRadius: 1, height: `${Math.max(2, level * 20 * (Math.sin(i * 0.5 + Date.now() * 0.01) * 0.3 + 0.7))}px` }} />
            ))}
            <LED on color="#ff4444" />
          </div>
        )}
      </div>
      {recordings.length === 0 && <div style={{ ...MONO, fontSize: '.38rem', color: C2 + '.2)' }}>No recordings yet.</div>}
      {recordings.map((r, i) => (
        <div key={i} style={{ ...hwPanel, display: 'flex', gap: 6, alignItems: 'center', padding: 6 }}>
          <span style={{ ...VT, fontSize: '.7rem', color: C, flex: 1 }}>{r.name}</span>
          <span style={{ ...MONO, fontSize: '.35rem', color: C2 + '.3)' }}>{r.date}</span>
          <audio src={r.url} controls style={{ height: 22, filter: 'invert(1) hue-rotate(90deg)' }} />
          <HwButton label="DL" onClick={() => { const a = document.createElement('a'); a.href = r.url; a.download = `${r.name}.webm`; a.click(); }} small />
          <HwButton label="→ HB" onClick={async () => {
            if (!r.blob) return;
            const file = new File([r.blob], `${r.name}.webm`, { type: 'audio/webm' });
            try { await mp.uploadFiles([file]); await mp.refresh(); alert('Sent to Humming Bird'); }
            catch (err: any) { alert('Send failed: ' + (err?.message || 'unknown')); }
          }} small color="#a855f7" />
        </div>
      ))}
    </div>
  );
}

function LooperOverlay({ bpm, globalPlaying, muted, onToggleMute, masterVol, onMasterVolChange }: {
  bpm: number; globalPlaying: boolean; muted: boolean; onToggleMute: () => void;
  masterVol: number; onMasterVolChange: (v: number) => void;
}) {
  const mp = useMusicPlayer();
  const [loopLength, setLoopLength] = useState(4);
  const [layers, setLayers] = useState<Array<{ url: string; label: string; blob: Blob }>>([]);
  const [recording, setRecording] = useState(false);
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posRef = useRef(0);
  const audioRefs = useRef<HTMLAudioElement[]>([]);
  const loopDurationMs = (60 / bpm) * 4 * loopLength * 1000;

  const startRecord = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = e => chunksRef.current.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setLayers(l => [...l, { url: URL.createObjectURL(blob), label: `L${l.length + 1}`, blob }]);
      stream.getTracks().forEach(t => t.stop());
    };
    setTimeout(() => { mr.stop(); setRecording(false); }, loopDurationMs);
    mr.start(); mediaRef.current = mr; setRecording(true);
  };

  useEffect(() => {
    if (!globalPlaying || muted) {
      if (timerRef.current) clearInterval(timerRef.current);
      audioRefs.current.forEach(a => a.pause());
      return;
    }
    audioRefs.current.forEach(a => { a.currentTime = 0; a.loop = true; a.play().catch(() => {}); });
    timerRef.current = setInterval(() => { posRef.current = (posRef.current + 50 / loopDurationMs) % 1; setPosition(posRef.current); }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [globalPlaying, muted, layers, loopDurationMs]);

  const exportLoopToHummingbird = async () => {
    if (layers.length === 0) return;
    const blob = layers[layers.length - 1].blob;
    const file = new File([blob], `loop_${Date.now()}.webm`, { type: 'audio/webm' });
    try { await mp.uploadFiles([file]); await mp.refresh(); alert('LOOP → HUMMING BIRD\nSaved to player + Data Vault.'); }
    catch (err: any) { alert('Send failed: ' + (err?.message || 'unknown')); }
  };
  const exportLoop = () => {
    if (layers.length === 0) return;
    const blob = layers[layers.length - 1].blob;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `loop_${Date.now()}.webm`;
    a.click();
  };

  const barMarkers = Array.from({ length: loopLength }, (_, i) => i);

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
      background: 'linear-gradient(to top, #0a0d0a, #0d100dee)',
      borderTop: `2px solid ${recording ? '#ff444488' : '#ffaa0044'}`,
      backdropFilter: 'blur(8px)',
      transition: 'border-color .3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <LED on={recording} color="#ff4444" />
          <span style={{ ...VT, fontSize: '.7rem', color: '#ffaa00', letterSpacing: '.1em', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setExpanded(e => !e)}>
            LOOP {expanded ? '▾' : '▸'}
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />

        <HwButton
          label={recording ? '■ STOP' : '● REC'}
          onClick={recording ? () => { mediaRef.current?.stop(); setRecording(false); } : startRecord}
          active={recording}
          color="#ff4444"
          small
        />
        <HwButton label={muted ? 'UNMUTE' : 'MUTE'} onClick={onToggleMute} active={muted} small />
        <HwButton label="CLR" onClick={() => { setLayers([]); audioRefs.current = []; setPosition(0); }} small />

        <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />

        <span style={{ ...MONO, fontSize: '.35rem', color: C2 + '.4)' }}>BARS</span>
        {[1,2,4,8].map(n => <HwButton key={n} label={String(n)} onClick={() => setLoopLength(n)} active={loopLength === n} small />)}

        <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {layers.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: (globalPlaying && !muted) ? C : C2 + '.25)',
              border: `1px solid ${C2 + '.4)'}`,
              transition: 'background .2s',
            }} />
          ))}
          {layers.length === 0 && <span style={{ ...MONO, fontSize: '.32rem', color: C2 + '.2)' }}>NO LAYERS</span>}
        </div>

        {layers.length > 0 && (
          <>
            <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />
            <HwButton label="EXPORT" onClick={exportLoop} small />
            <HwButton label="↑ HUMMING BIRD" onClick={exportLoopToHummingbird} small color="#a855f7" />
          </>
        )}

        <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />
        <HwKnob label="MST" val={masterVol} min={0} max={1} onChange={onMasterVolChange} size={22} color={OC} />

        <span style={{ ...MONO, fontSize: '.32rem', color: C2 + '.25)', marginLeft: 'auto' }}>
          {(loopDurationMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div style={{ height: 4, background: '#050805', margin: '0 10px', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${position * 100}%`, background: recording ? '#ff444466' : '#ffaa0044', transition: 'width 50ms linear' }} />
        {barMarkers.map((_, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, left: `${(i / loopLength) * 100}%`, width: 1, height: '100%', background: C2 + '.15)' }} />
        ))}
      </div>

      {expanded && layers.length > 0 && (
        <div style={{ padding: '4px 10px 2px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {layers.map((layer, i) => (
            <div key={i} style={{
              display: 'flex', gap: 4, alignItems: 'center', padding: '2px 6px',
              background: '#080b08', border: `1px solid ${BORDER}`, borderRadius: 3,
            }}>
              <span style={{ ...VT, fontSize: '.6rem', color: '#ffaa00' }}>{layer.label}</span>
              <audio ref={el => { if (el) audioRefs.current[i] = el; }} src={layer.url} />
              <HwButton label="✕" onClick={() => { setLayers(l => l.filter((_, li) => li !== i)); audioRefs.current.splice(i, 1); }} small />
            </div>
          ))}
        </div>
      )}
      {!expanded && layers.map((layer, i) => (
        <audio key={i} ref={el => { if (el) audioRefs.current[i] = el; }} src={layer.url} style={{ display: 'none' }} />
      ))}

      <div style={{ height: 3 }} />
    </div>
  );
}

function buildEffectChain(ctx: AudioContext, effectIdx: number, effect: EffectParams): EffectChainResult {
  const dry = ctx.createGain(); dry.gain.value = 1 - effect.wetDry;
  const wet = ctx.createGain(); wet.gain.value = effect.wetDry;
  const merger = ctx.createGain(); dry.connect(merger); wet.connect(merger);
  const oscillators: OscillatorNode[] = [];
  const mkInput = () => ctx.createGain();
  switch (effectIdx) {
    case 0: {
      const conv = ctx.createConvolver();
      conv.buffer = mkImpulseResponse(ctx, effect.reverbDecay ?? 2.5, effect.reverbDecay ?? 2.5);
      const s = mkInput(); s.connect(dry); s.connect(conv); conv.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 1: {
      const delay = ctx.createDelay(5);
      delay.delayTime.value = effect.delayTime ?? 0.3;
      const fb = ctx.createGain(); fb.gain.value = effect.delayFeedback ?? 0.4;
      delay.connect(fb); fb.connect(delay);
      const s = mkInput(); s.connect(dry); s.connect(delay); delay.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 2: {
      const ws = ctx.createWaveShaper();
      ws.curve = makeDriveCurve(effect.distDrive ?? 20); ws.oversample = '4x';
      const s = mkInput(); s.connect(dry); s.connect(ws); ws.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 3: {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = effect.compThreshold ?? -24;
      comp.ratio.value = effect.compRatio ?? 4;
      comp.knee.value = 10; comp.attack.value = 0.003; comp.release.value = 0.25;
      const s = mkInput(); s.connect(dry); s.connect(comp); comp.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 4: {
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 320; low.gain.value = effect.eqLow ?? 0;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5; mid.gain.value = effect.eqMid ?? 0;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3200; high.gain.value = effect.eqHigh ?? 0;
      low.connect(mid); mid.connect(high);
      const s = mkInput(); s.connect(dry); s.connect(low); high.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 5: {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = effect.chorusDepth ?? 0.003;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = effect.chorusRate ?? 1.5;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = effect.chorusDepth ?? 0.003;
      lfo.connect(lfoGain); lfoGain.connect(delay.delayTime); lfo.start();
      oscillators.push(lfo);
      const s = mkInput(); s.connect(dry); s.connect(delay); delay.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 6: {
      const delay = ctx.createDelay(0.02);
      delay.delayTime.value = effect.flangerDepth ?? 0.003;
      const fb = ctx.createGain(); fb.gain.value = 0.5;
      delay.connect(fb); fb.connect(delay);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = effect.flangerRate ?? 0.5;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = effect.flangerDepth ?? 0.003;
      lfo.connect(lfoGain); lfoGain.connect(delay.delayTime); lfo.start();
      oscillators.push(lfo);
      const s = mkInput(); s.connect(dry); s.connect(delay); delay.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 7: {
      const filters: BiquadFilterNode[] = [];
      for (let i = 0; i < 4; i++) {
        const ap = ctx.createBiquadFilter(); ap.type = 'allpass';
        ap.frequency.value = 200 + i * (effect.phaserDepth ?? 400); ap.Q.value = 0.7; filters.push(ap);
      }
      for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = effect.phaserRate ?? 0.8;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = effect.phaserDepth ?? 400;
      lfo.connect(lfoGain); filters.forEach(f => lfoGain.connect(f.frequency)); lfo.start();
      oscillators.push(lfo);
      const s = mkInput(); s.connect(dry); s.connect(filters[0]); filters[filters.length - 1].connect(wet);
      return { input: s, output: merger, oscillators };
    }
    case 8: {
      const tremGain = ctx.createGain();
      tremGain.gain.value = 1 - (effect.tremoloDepth ?? 0.5) / 2;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = effect.tremoloRate ?? 4;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = (effect.tremoloDepth ?? 0.5) / 2;
      lfo.connect(lfoGain); lfoGain.connect(tremGain.gain); lfo.start();
      oscillators.push(lfo);
      const s = mkInput(); s.connect(tremGain); tremGain.connect(merger);
      return { input: s, output: merger, oscillators };
    }
    case 9: {
      const ws = ctx.createWaveShaper();
      const bits = effect.bitDepth ?? 8;
      const levels = Math.pow(2, bits);
      const samples = 44100;
      const curve = new Float32Array(new ArrayBuffer(samples * 4));
      for (let i = 0; i < samples; i++) { const x = (i * 2) / samples - 1; curve[i] = Math.round(x * levels) / levels; }
      ws.curve = curve;
      const s = mkInput(); s.connect(dry); s.connect(ws); ws.connect(wet);
      return { input: s, output: merger, oscillators };
    }
    default: {
      const s = mkInput(); s.connect(dry); s.connect(wet);
      return { input: s, output: merger, oscillators };
    }
  }
}

function EffectsRack({ effects, onEffectsChange, engine }: {
  effects: EffectParams[];
  onEffectsChange: (effects: EffectParams[]) => void;
  engine: AudioEngine | null;
}) {
  const [selected, setSelected] = useState(0);
  const upEff = (idx: number, key: keyof EffectParams, val: EffectParams[keyof EffectParams]) => {
    const next = effects.map((e, i) => i === idx ? { ...e, [key]: val } : e);
    onEffectsChange(next);
  };

  useEffect(() => {
    if (!engine) return;
    applyMasterEffects(engine, effects);
  }, [effects, engine]);

  const eff = effects[selected];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ ...hwPanel, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 110 }}>
        {EFFECT_NAMES.map((name, i) => (
          <button key={i} onClick={() => setSelected(i)} style={{
            padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6,
            background: selected === i ? 'rgba(56,189,248,.08)' : 'transparent',
            border: selected === i ? `1px solid ${C}44` : '1px solid transparent',
            color: effects[i].enabled ? C : C2 + '.3)', cursor: 'pointer', ...MONO, fontSize: '.4rem', textAlign: 'left', borderRadius: 3,
          }}>
            <LED on={effects[i].enabled} />
            {name.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ ...hwPanel, flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ ...VT, fontSize: '1rem', color: C, letterSpacing: '.1em' }}>{EFFECT_NAMES[selected].toUpperCase()}</span>
          <HwButton label={eff.enabled ? 'ON' : 'OFF'} onClick={() => upEff(selected, 'enabled', !eff.enabled)} active={eff.enabled} small />
          <HwKnob label="WET/DRY" val={eff.wetDry} min={0} max={1} onChange={v => upEff(selected, 'wetDry', v)} size={32} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {selected === 0 && <HwKnob label="DECAY" val={eff.reverbDecay!} min={0.1} max={10} onChange={v => upEff(selected, 'reverbDecay', v)} />}
          {selected === 1 && <>
            <HwKnob label="TIME" val={eff.delayTime!} min={0.01} max={2} onChange={v => upEff(selected, 'delayTime', v)} />
            <HwKnob label="FEEDBACK" val={eff.delayFeedback!} min={0} max={0.95} onChange={v => upEff(selected, 'delayFeedback', v)} />
          </>}
          {selected === 2 && <HwKnob label="DRIVE" val={eff.distDrive!} min={1} max={100} step={1} onChange={v => upEff(selected, 'distDrive', v)} color={OC} />}
          {selected === 3 && <>
            <HwKnob label="THRESHOLD" val={eff.compThreshold!} min={-60} max={0} step={1} onChange={v => upEff(selected, 'compThreshold', v)} />
            <HwKnob label="RATIO" val={eff.compRatio!} min={1} max={20} step={0.5} onChange={v => upEff(selected, 'compRatio', v)} />
          </>}
          {selected === 4 && <>
            <HwKnob label="LOW" val={eff.eqLow!} min={-12} max={12} step={0.5} onChange={v => upEff(selected, 'eqLow', v)} />
            <HwKnob label="MID" val={eff.eqMid!} min={-12} max={12} step={0.5} onChange={v => upEff(selected, 'eqMid', v)} />
            <HwKnob label="HIGH" val={eff.eqHigh!} min={-12} max={12} step={0.5} onChange={v => upEff(selected, 'eqHigh', v)} />
          </>}
          {selected === 5 && <>
            <HwKnob label="RATE" val={eff.chorusRate!} min={0.1} max={8} onChange={v => upEff(selected, 'chorusRate', v)} />
            <HwKnob label="DEPTH" val={eff.chorusDepth!} min={0} max={0.02} onChange={v => upEff(selected, 'chorusDepth', v)} />
          </>}
          {selected === 6 && <>
            <HwKnob label="RATE" val={eff.flangerRate!} min={0.1} max={5} onChange={v => upEff(selected, 'flangerRate', v)} />
            <HwKnob label="DEPTH" val={eff.flangerDepth!} min={0} max={0.01} onChange={v => upEff(selected, 'flangerDepth', v)} />
          </>}
          {selected === 7 && <>
            <HwKnob label="RATE" val={eff.phaserRate!} min={0.1} max={5} onChange={v => upEff(selected, 'phaserRate', v)} />
            <HwKnob label="DEPTH" val={eff.phaserDepth!} min={50} max={2000} step={10} onChange={v => upEff(selected, 'phaserDepth', v)} />
          </>}
          {selected === 8 && <>
            <HwKnob label="RATE" val={eff.tremoloRate!} min={0.5} max={20} onChange={v => upEff(selected, 'tremoloRate', v)} />
            <HwKnob label="DEPTH" val={eff.tremoloDepth!} min={0} max={1} onChange={v => upEff(selected, 'tremoloDepth', v)} />
          </>}
          {selected === 9 && <HwKnob label="BITS" val={eff.bitDepth!} min={1} max={16} step={1} onChange={v => upEff(selected, 'bitDepth', v)} color={OC} />}
        </div>
        <div style={{ marginTop: 10, ...MONO, fontSize: '.35rem', color: C2 + '.2)', lineHeight: 1.5 }}>
          {selected === 0 && 'REVERB — ConvolverNode impulse response. Room simulation.'}
          {selected === 1 && 'DELAY — Feedback delay. Echo and slapback.'}
          {selected === 2 && 'DISTORTION — WaveShaperNode with drive curve.'}
          {selected === 3 && 'COMPRESSOR — DynamicsCompressor. Dynamics control.'}
          {selected === 4 && '3-BAND EQ — Low/Mid/High frequency shaping.'}
          {selected === 5 && 'CHORUS — LFO-modulated delay for thickening.'}
          {selected === 6 && 'FLANGER — Swept short delay with feedback.'}
          {selected === 7 && 'PHASER — All-pass filter chain with LFO.'}
          {selected === 8 && 'TREMOLO — LFO amplitude modulation.'}
          {selected === 9 && 'BITCRUSHER — Lo-fi bit depth reduction.'}
        </div>
      </div>
    </div>
  );
}

function Mixer({ tracks, onTracksChange, engine }: { tracks: TrackDef[]; onTracksChange: (t: TrackDef[]) => void; engine: AudioEngine | null }) {
  const [masterVol, setMasterVol] = useState(0.8);
  const upTrack = (idx: number, key: keyof TrackDef, val: TrackDef[keyof TrackDef]) => {
    const updated = tracks.map((t, i) => i === idx ? { ...t, [key]: val } as TrackDef : t);
    onTracksChange(updated);
    if (engine && engine.trackBuses[idx]) {
      if (key === 'vol') engine.trackBuses[idx].gain.gain.value = val as number;
      if (key === 'pan') engine.trackBuses[idx].panner.pan.value = val as number;
      if (key === 'mute') engine.trackBuses[idx].gain.gain.value = (val as boolean) ? 0 : tracks[idx].vol;
    }
  };
  useEffect(() => { if (engine) engine.masterGain.gain.value = masterVol; }, [masterVol, engine]);
  const hasSolo = tracks.some(t => t.solo);
  useEffect(() => {
    if (!engine) return;
    tracks.forEach((t, i) => {
      if (!engine.trackBuses[i]) return;
      const shouldPlay = hasSolo ? t.solo : !t.mute;
      engine.trackBuses[i].gain.gain.value = shouldPlay ? t.vol : 0;
      engine.trackBuses[i].panner.pan.value = t.pan;
    });
  }, [tracks, engine, hasSolo]);

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {tracks.map((track, i) => (
        <div key={track.id} style={{ ...hwPanel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 58, padding: '8px 6px' }}>
          <div style={{ ...MONO, fontSize: '.35rem', color: track.color, letterSpacing: '.04em', textAlign: 'center', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</div>
          <LevelMeter analyser={engine?.trackBuses[i]?.analyser ?? null} />
          <HwSlider label="VOL" val={track.vol} min={0} max={1} onChange={v => upTrack(i, 'vol', v)} vertical />
          <HwKnob label="PAN" val={track.pan} min={-1} max={1} onChange={v => upTrack(i, 'pan', v)} size={28} />
          <HwButton label="M" onClick={() => upTrack(i, 'mute', !track.mute)} active={track.mute} color="#ff4444" small />
          <HwButton label="S" onClick={() => upTrack(i, 'solo', !track.solo)} active={track.solo} color="#ffaa00" small />
        </div>
      ))}
      <div style={{ ...hwPanel, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 58, padding: '8px 6px', borderColor: C + '33' }}>
        <div style={{ ...MONO, fontSize: '.35rem', color: C, letterSpacing: '.04em' }}>MASTER</div>
        <LevelMeter analyser={engine?.masterAnalyser ?? null} />
        <HwSlider label="OUT" val={masterVol} min={0} max={1} onChange={setMasterVol} vertical />
      </div>
    </div>
  );
}

function Timeline({ tracks, bpm }: { tracks: TrackDef[]; bpm: number }) {
  const BARS = 32;
  const BAR_W = 40;
  const ROW_H = 28;
  const [clips, setClips] = useState<Array<{ trackIdx: number; start: number; len: number; label: string; color: string }>>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragClip, setDragClip] = useState<{ idx: number; offsetX: number; startX: number } | null>(null);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setPlayhead(p => { const next = p + 1 / (60 / bpm * 4 * 20); return next >= BARS ? 0 : next; });
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, bpm]);

  useEffect(() => {
    if (!dragClip) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragClip.startX;
      const barDelta = Math.round(dx / BAR_W);
      setClips(cs => cs.map((c, i) => {
        if (i !== dragClip.idx) return c;
        const newStart = Math.max(0, Math.min(BARS - c.len, (dragClip.offsetX) + barDelta));
        return { ...c, start: newStart };
      }));
    };
    const onUp = () => setDragClip(null);
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragClip]);

  const addClip = (trackIdx: number, bar: number) => {
    setClips(cs => [...cs, { trackIdx, start: bar, len: 2, label: `CLIP ${cs.length + 1}`, color: tracks[trackIdx]?.color ?? C }]);
  };

  const containerWidth = BARS * BAR_W;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <HwButton label={playing ? '■' : '▶'} onClick={() => setPlaying(p => !p)} active={playing} small />
        <HwButton label="⏮" onClick={() => setPlayhead(0)} small />
        <span style={{ ...MONO, fontSize: '.4rem', color: C2 + '.5)' }}>BAR: {Math.floor(playhead) + 1}</span>
        <span style={{ ...MONO, fontSize: '.35rem', color: C2 + '.25)' }}>CLICK ROWS TO ADD CLIPS</span>
      </div>
      <div style={{ overflowX: 'auto', position: 'relative', border: `2px solid ${BORDER}`, background: '#050805', borderRadius: 4 }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, height: 16, minWidth: containerWidth + 80 }}>
          <div style={{ width: 80, flexShrink: 0 }} />
          {Array.from({ length: BARS }, (_, i) => (
            <div key={i} style={{ width: BAR_W, borderLeft: `1px solid rgba(56,189,248,.08)`, flexShrink: 0, ...MONO, fontSize: '.3rem', color: C2 + '.25)', lineHeight: '16px', paddingLeft: 2 }}>{i + 1}</div>
          ))}
        </div>
        {tracks.map((track, ti) => (
          <div key={track.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid rgba(56,189,248,.04)', position: 'relative' }}>
            <div style={{ width: 80, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', paddingLeft: 6, background: '#0a0d0a' }}>
              <span style={{ ...MONO, fontSize: '.33rem', color: track.color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 70 }}>{track.name}</span>
            </div>
            <div style={{ flex: 1, position: 'relative', minWidth: containerWidth }}
              onClick={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); addClip(ti, Math.floor((e.clientX - rect.left) / BAR_W)); }}>
              {Array.from({ length: BARS }, (_, bi) => (
                <div key={bi} style={{ position: 'absolute', top: 0, left: bi * BAR_W, width: BAR_W, height: ROW_H, borderLeft: bi % 4 === 0 ? `1px solid rgba(56,189,248,.1)` : '1px solid rgba(56,189,248,.03)' }} />
              ))}
              {clips.filter(c => c.trackIdx === ti).map((clip, ci) => {
                const globalIdx = clips.findIndex(c2 => c2 === clip);
                return (
                  <div key={ci} style={{
                    position: 'absolute', top: 2, left: clip.start * BAR_W, width: clip.len * BAR_W - 2, height: ROW_H - 4,
                    background: clip.color + '22', border: `1px solid ${clip.color}66`, borderRadius: 2, cursor: 'move',
                    display: 'flex', alignItems: 'center', paddingLeft: 4, userSelect: 'none',
                  }}
                    onMouseDown={e => { e.stopPropagation(); setDragClip({ idx: globalIdx, offsetX: clip.start, startX: e.clientX }); }}
                    onContextMenu={e => { e.preventDefault(); setClips(cs => cs.filter((_, ii) => ii !== globalIdx)); }}>
                    <span style={{ ...MONO, fontSize: '.3rem', color: clip.color, letterSpacing: '.04em', overflow: 'hidden', whiteSpace: 'nowrap' }}>{clip.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 80 + playhead * BAR_W, width: 2, background: '#ff4444', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function makeDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 44100;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  if (drive <= 1) {
    for (let i = 0; i < samples; i++) curve[i] = (i * 2) / samples - 1;
  } else {
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + drive) * x * 20 * (Math.PI / 180)) / (Math.PI + drive * Math.abs(x));
    }
  }
  return curve;
}

function applyMasterEffects(engine: AudioEngine, effects: EffectParams[]) {
  const ctx = engine.ctx;
  engine.masterInsertIn.disconnect();
  for (const chain of engine.activeEffects) {
    for (const osc of chain.oscillators) { try { osc.stop(); } catch {} }
    try { chain.input.disconnect(); } catch {}
    try { chain.output.disconnect(); } catch {}
  }
  engine.activeEffects = [];

  const enabled = effects.map((e, i) => ({ idx: i, params: e })).filter(e => e.params.enabled);
  if (enabled.length === 0) {
    engine.masterInsertIn.connect(engine.masterInsertOut);
    return;
  }
  let prevOutput: AudioNode = engine.masterInsertIn;
  for (const { idx, params } of enabled) {
    const chain = buildEffectChain(ctx, idx, params);
    prevOutput.connect(chain.input);
    prevOutput = chain.output;
    engine.activeEffects.push(chain);
  }
  prevOutput.connect(engine.masterInsertOut);
}

function createAudioEngine(trackCount: number): AudioEngine {
  const ctx = actx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.8;
  const masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 256;

  const masterInsertIn = ctx.createGain();
  const masterInsertOut = ctx.createGain();
  masterInsertIn.connect(masterInsertOut);
  masterInsertOut.connect(masterGain);
  masterGain.connect(masterAnalyser);
  masterAnalyser.connect(ctx.destination);

  const drumFilter = ctx.createBiquadFilter();
  drumFilter.type = 'lowpass';
  drumFilter.frequency.value = 20000;
  drumFilter.Q.value = 0.7;

  const drumDrive = ctx.createWaveShaper();
  drumDrive.oversample = '4x';
  drumDrive.curve = makeDriveCurve(1);

  const trackBuses: AudioBus[] = [];
  for (let i = 0; i < trackCount; i++) {
    const gain = ctx.createGain(); gain.gain.value = 0.8;
    const panner = new StereoPannerNode(ctx);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    if (i === 0) {
      gain.connect(drumFilter);
      drumFilter.connect(drumDrive);
      drumDrive.connect(panner);
    } else {
      gain.connect(panner);
    }
    panner.connect(analyser);
    analyser.connect(masterInsertIn);
    trackBuses.push({ gain, panner, analyser });
  }
  return { ctx, masterGain, masterAnalyser, trackBuses, activeEffects: [], masterInsertIn, masterInsertOut, drumFilter, drumDrive };
}

interface MidiState {
  supported: boolean;
  connected: boolean;
  deviceName: string | null;
  devices: Array<{ id: string; name: string }>;
  selectedDeviceId: string | null;
  midiChannel: number;
}

const MIDI_DRUM_MAP: Record<number, number> = {
  36: 0, 38: 1, 42: 2, 46: 3, 39: 4, 45: 5, 50: 6, 56: 7,
  37: 8, 76: 9, 70: 10, 54: 11, 49: 12, 51: 13, 63: 14, 75: 15,
};

function useMidi(
  onNoteOn: (note: number, velocity: number, channel: number) => void,
  onNoteOff: (note: number, channel: number) => void,
) {
  const [midi, setMidi] = useState<MidiState>({
    supported: !!navigator.requestMIDIAccess,
    connected: false,
    deviceName: null,
    devices: [],
    selectedDeviceId: null,
    midiChannel: 0,
  });
  const accessRef = useRef<MIDIAccess | null>(null);
  const noteOnRef = useRef(onNoteOn);
  const noteOffRef = useRef(onNoteOff);
  noteOnRef.current = onNoteOn;
  noteOffRef.current = onNoteOff;

  const midiChannelRef = useRef(0);
  useEffect(() => { midiChannelRef.current = midi.midiChannel; }, [midi.midiChannel]);

  const handleMidiMessage = useCallback((e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const note = data[1];
    const velocity = data[2];
    const filterCh = midiChannelRef.current;
    if (filterCh !== 0 && channel !== filterCh - 1) return;
    if (status === 0x90 && velocity > 0) {
      noteOnRef.current(note, velocity / 127, channel);
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      noteOffRef.current(note, channel);
    }
  }, []);

  const refreshDevices = useCallback((access: MIDIAccess) => {
    const devs: Array<{ id: string; name: string }> = [];
    access.inputs.forEach((input) => {
      devs.push({ id: input.id, name: input.name || `MIDI ${input.id}` });
    });
    setMidi(m => {
      const connected = devs.length > 0;
      const selId = m.selectedDeviceId && devs.find(d => d.id === m.selectedDeviceId) ? m.selectedDeviceId : (devs[0]?.id ?? null);
      const deviceName = devs.find(d => d.id === selId)?.name ?? null;
      return { ...m, devices: devs, connected, selectedDeviceId: selId, deviceName };
    });
  }, []);

  const bindInput = useCallback((access: MIDIAccess, deviceId: string | null) => {
    access.inputs.forEach(input => { input.onmidimessage = null; });
    if (deviceId) {
      const input = access.inputs.get(deviceId);
      if (input) input.onmidimessage = handleMidiMessage;
    }
  }, [handleMidiMessage]);

  const selectDevice = useCallback((id: string) => {
    setMidi(m => {
      const dev = m.devices.find(d => d.id === id);
      return { ...m, selectedDeviceId: id, deviceName: dev?.name ?? null };
    });
    if (accessRef.current) bindInput(accessRef.current, id);
  }, [bindInput]);

  const setChannel = useCallback((ch: number) => {
    setMidi(m => ({ ...m, midiChannel: ch }));
  }, []);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess({ sysex: false }).then(access => {
      accessRef.current = access;
      refreshDevices(access);
      access.onstatechange = () => refreshDevices(access);
    }).catch(() => {});
    return () => {
      if (accessRef.current) {
        accessRef.current.inputs.forEach(input => { input.onmidimessage = null; });
        accessRef.current.onstatechange = null;
      }
    };
  }, [refreshDevices]);

  useEffect(() => {
    if (accessRef.current && midi.selectedDeviceId) {
      bindInput(accessRef.current, midi.selectedDeviceId);
    }
  }, [midi.selectedDeviceId, bindInput]);

  return { midi, selectDevice, setChannel };
}

function MidiIndicator({ midi, onSelectDevice, onSetChannel }: {
  midi: MidiState;
  onSelectDevice: (id: string) => void;
  onSetChannel: (ch: number) => void;
}) {
  if (!midi.supported) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <LED on={midi.connected} color={midi.connected ? '#44ffbb' : '#ff4444'} />
      <span style={{ ...MONO, fontSize: '.35rem', color: midi.connected ? '#44ffbb' : C2 + '.3)', letterSpacing: '.06em' }}>
        MIDI {midi.connected ? midi.deviceName ?? 'ON' : 'OFF'}
      </span>
      {midi.devices.length > 1 && (
        <select
          value={midi.selectedDeviceId ?? ''}
          onChange={e => onSelectDevice(e.target.value)}
          style={{ background: '#050805', border: `1px solid ${BORDER}`, color: C, ...MONO, fontSize: '.35rem', padding: '2px 4px', borderRadius: 2, maxWidth: 100 }}
        >
          {midi.devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      <select
        value={midi.midiChannel}
        onChange={e => onSetChannel(Number(e.target.value))}
        style={{ background: '#050805', border: `1px solid ${BORDER}`, color: C, ...MONO, fontSize: '.35rem', padding: '2px 4px', borderRadius: 2, width: 42 }}
      >
        <option value={0}>ALL</option>
        {Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>CH{i + 1}</option>)}
      </select>
    </div>
  );
}

function SoundLabInner({ onClose }: { onClose?: () => void }) {
  const musicPlayer = useMusicPlayer();
  const [backingTrack, setBackingTrack] = useState<ReturnType<typeof useMusicPlayer>['current'] | null>(null);
  const { pick: pickJukeboxTrack, picker: jukeboxPicker } = useTrackPicker('LOAD A BACKING TRACK');
  const openJukebox = useCallback(() => {
    pickJukeboxTrack((t) => {
      setBackingTrack(t);
      musicPlayer.previewTrack(t.id);
    });
  }, [pickJukeboxTrack, musicPlayer]);
  const [section, setSection] = useState<DAWSection>('machine');
  const [bpm, setBpm] = useState(120);
  const [swing, setSwing] = useState(0);
  const [masterVol, setMasterVol] = useState(0.8);
  const [tracks, setTracks] = useState<TrackDef[]>([
    makeTrack('t1', 'BEAT', 0), makeTrack('t2', 'SYNTH', 1), makeTrack('t3', 'BASS', 2), makeTrack('t4', 'SAMPLE', 3), makeTrack('t5', 'ARP', 4),
  ]);
  const [projectName, setProjectName] = useState('UNTITLED PROJECT');
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [masterEffects, setMasterEffects] = useState<EffectParams[]>(EFFECT_NAMES.map(() => ({ ...DEFAULT_EFFECT })));
  const [drumFilterCutoff, setDrumFilterCutoff] = useState(20000);
  const [drumDriveAmount, setDrumDriveAmount] = useState(1);
  const engineRef = useRef<AudioEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [synthVoice, setSynthVoice] = useState<SynthVoice>(DEFAULT_SYNTH);
  const synthVoiceRef = useRef<SynthVoice>(DEFAULT_SYNTH);
  const midiVoicesRef = useRef<Map<number, MidiVoiceHandle>>(new Map());

  useEffect(() => { synthVoiceRef.current = synthVoice; }, [synthVoice]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.drumFilter.frequency.value = drumFilterCutoff;
  }, [drumFilterCutoff]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.drumDrive.curve = makeDriveCurve(drumDriveAmount);
  }, [drumDriveAmount]);

  const [globalPlaying, setGlobalPlaying] = useState(false);
  const [globalStep, setGlobalStep] = useState(0);
  const globalStepRef = useRef(0);
  const transportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [instrumentMutes, setInstrumentMutes] = useState<Record<string, boolean>>({ drums: false, arp: false, looper: false });
  const [instrumentVols, setInstrumentVols] = useState<Record<string, number>>({ drums: 0.8, synth: 0.8, arp: 0.7, sampler: 0.8 });
  const [arpPlaying, setArpPlaying] = useState(false);

  const toggleMute = useCallback((id: string) => {
    setInstrumentMutes(m => ({ ...m, [id]: !m[id] }));
  }, []);

  const setInstrumentVol = useCallback((id: string, val: number) => {
    setInstrumentVols(v => ({ ...v, [id]: val }));
  }, []);

  const masterEffectsRef = useRef(masterEffects);
  useEffect(() => { masterEffectsRef.current = masterEffects; }, [masterEffects]);
  const drumFilterRef = useRef(drumFilterCutoff);
  useEffect(() => { drumFilterRef.current = drumFilterCutoff; }, [drumFilterCutoff]);
  const drumDriveRef = useRef(drumDriveAmount);
  useEffect(() => { drumDriveRef.current = drumDriveAmount; }, [drumDriveAmount]);

  const initEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine(5);
      engineRef.current.drumFilter.frequency.value = drumFilterRef.current;
      engineRef.current.drumDrive.curve = makeDriveCurve(drumDriveRef.current);
      applyMasterEffects(engineRef.current, masterEffectsRef.current);
      setEngineReady(true);
    }
    return engineRef.current;
  }, []);

  const handleMidiNoteOn = useCallback((note: number, _velocity: number, channel: number) => {
    const e = initEngine();
    const c = actx();
    if (channel === 9) {
      const drumIdx = MIDI_DRUM_MAP[note];
      if (drumIdx !== undefined) {
        playDrum(c, drumIdx, e.trackBuses[0]?.gain ?? e.masterGain);
        setActivePads(p => new Set([...p, drumIdx]));
        setTimeout(() => setActivePads(p => { const n = new Set(p); n.delete(drumIdx); return n; }), 120);
      }
    } else {
      const existing = midiVoicesRef.current.get(note);
      if (existing) { stopSynthVoice(c, existing); midiVoicesRef.current.delete(note); }
      const handle = startSynthVoice(c, note, synthVoiceRef.current, e.trackBuses[1]?.gain ?? e.masterGain);
      midiVoicesRef.current.set(note, handle);
    }
  }, [initEngine]);

  const handleMidiNoteOff = useCallback((note: number, channel: number) => {
    if (channel === 9) return;
    const c = actx();
    const handle = midiVoicesRef.current.get(note);
    if (handle) {
      stopSynthVoice(c, handle);
      midiVoicesRef.current.delete(note);
    }
  }, []);

  const midiPanic = useCallback(() => {
    const c = actx();
    midiVoicesRef.current.forEach((handle) => { try { stopSynthVoice(c, handle); } catch {} });
    midiVoicesRef.current.clear();
  }, []);

  const { midi, selectDevice: rawSelectDevice, setChannel: rawSetChannel } = useMidi(handleMidiNoteOn, handleMidiNoteOff);

  const selectDevice = useCallback((id: string) => { midiPanic(); rawSelectDevice(id); }, [midiPanic, rawSelectDevice]);
  const setChannel = useCallback((ch: number) => { midiPanic(); rawSetChannel(ch); }, [midiPanic, rawSetChannel]);

  useEffect(() => { return () => { midiPanic(); }; }, [midiPanic]);

  useEffect(() => {
    const onClick = () => { initEngine(); window.removeEventListener('click', onClick); };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [initEngine]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.masterGain.gain.value = masterVol;
  }, [masterVol]);

  useEffect(() => {
    if (!engineRef.current) return;
    const busMap: Record<string, number> = { drums: 0, synth: 1, sampler: 3, arp: 4 };
    for (const [id, busIdx] of Object.entries(busMap)) {
      const bus = engineRef.current.trackBuses[busIdx];
      if (bus) bus.gain.gain.value = instrumentVols[id] ?? 0.8;
    }
  }, [instrumentVols]);

  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { swingRef.current = swing; }, [swing]);

  useEffect(() => {
    if (!globalPlaying) {
      if (transportTimerRef.current) clearTimeout(transportTimerRef.current);
      globalStepRef.current = 0;
      setGlobalStep(0);
      setActivePads(new Set());
      return;
    }
    initEngine();
    globalStepRef.current = 0;
    const tick = () => {
      const step = globalStepRef.current;
      globalStepRef.current = step + 1;
      setGlobalStep(step);
      const baseMs = (60 / bpmRef.current / 4) * 1000;
      const isOdd = step % 2 === 1;
      const swingMs = isOdd ? baseMs * (1 + swingRef.current) : baseMs * (1 - swingRef.current);
      transportTimerRef.current = setTimeout(tick, swingMs);
    };
    tick();
    return () => { if (transportTimerRef.current) clearTimeout(transportTimerRef.current); };
  }, [globalPlaying, initEngine]);

  const toggleGlobalPlay = useCallback(() => {
    if (!engineReady) initEngine();
    setGlobalPlaying(p => !p);
  }, [engineReady, initEngine]);

  const SECTIONS: { id: DAWSection; label: string }[] = [
    { id: 'machine', label: 'MACHINE' },
    { id: 'synth', label: 'SYNTH' },
    { id: 'arpeggiator', label: 'ARP' },
    { id: 'sampler', label: 'SAMPLER' },
    { id: 'timeline', label: 'TIMELINE' },
    { id: 'mixer', label: 'MIXER' },
    { id: 'effects', label: 'FX' },
  ];

  const saveProject = () => {
    const data = JSON.stringify({ projectName, bpm, tracks: tracks.map(t => ({ id: t.id, name: t.name, vol: t.vol, pan: t.pan, mute: t.mute, solo: t.solo, color: t.color, effects: t.effects })) });
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${projectName.replace(/\s+/g, '_')}.slb`; a.click();
  };

  const loadProject = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.slb,.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const proj = JSON.parse(await file.text());
        if (proj.projectName) setProjectName(proj.projectName);
        if (proj.bpm) setBpm(proj.bpm);
        if (proj.tracks) setTracks(proj.tracks.map((t: TrackDef, i: number) => ({
          ...makeTrack(t.id || `t${i}`, t.name || `TRACK ${i}`, i),
          vol: t.vol ?? 0.8, pan: t.pan ?? 0, mute: t.mute ?? false, solo: t.solo ?? false,
          effects: t.effects ?? EFFECT_NAMES.map(() => ({ ...DEFAULT_EFFECT })),
        })));
      } catch { /* invalid file */ }
    };
    input.click();
  };

  const exportWav = () => {
    if (!engineRef.current) { initEngine(); return; }
    const e = engineRef.current;
    const offCtx = new OfflineAudioContext(2, e.ctx.sampleRate * 10, e.ctx.sampleRate);
    const osc = offCtx.createOscillator();
    const g = offCtx.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(offCtx.destination);
    osc.start(); osc.stop(10);
    offCtx.startRendering().then(buffer => {
      const numCh = buffer.numberOfChannels;
      const length = buffer.length;
      const sr = buffer.sampleRate;
      const bitsPerSample = 16;
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numCh * bytesPerSample;
      const dataSize = length * blockAlign;
      const bufSize = 44 + dataSize;
      const ab = new ArrayBuffer(bufSize);
      const view = new DataView(ab);
      const writeString = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeString(0, 'RIFF'); view.setUint32(4, bufSize - 8, true); writeString(8, 'WAVE');
      writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
      view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true); writeString(36, 'data'); view.setUint32(40, dataSize, true);
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numCh; ch++) {
          const sample = buffer.getChannelData(ch)[i];
          const clamped = Math.max(-1, Math.min(1, sample));
          view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
          offset += 2;
        }
      }
      const blob = new Blob([ab], { type: 'audio/wav' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${projectName.replace(/\s+/g, '_')}.wav`; a.click();
    });
  };

  const exportWavToHummingbird = () => {
    if (!engineRef.current) { initEngine(); return; }
    const e = engineRef.current;
    const offCtx = new OfflineAudioContext(2, e.ctx.sampleRate * 10, e.ctx.sampleRate);
    const osc = offCtx.createOscillator();
    const g = offCtx.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(offCtx.destination);
    osc.start(); osc.stop(10);
    offCtx.startRendering().then(async buffer => {
      const numCh = buffer.numberOfChannels;
      const length = buffer.length;
      const sr = buffer.sampleRate;
      const bitsPerSample = 16;
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numCh * bytesPerSample;
      const dataSize = length * blockAlign;
      const bufSize = 44 + dataSize;
      const ab = new ArrayBuffer(bufSize);
      const view = new DataView(ab);
      const writeString = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeString(0, 'RIFF'); view.setUint32(4, bufSize - 8, true); writeString(8, 'WAVE');
      writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
      view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true); writeString(36, 'data'); view.setUint32(40, dataSize, true);
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numCh; ch++) {
          const sample = buffer.getChannelData(ch)[i];
          const clamped = Math.max(-1, Math.min(1, sample));
          view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
          offset += 2;
        }
      }
      const blob = new Blob([ab], { type: 'audio/wav' });
      const file = new File([blob], `${projectName.replace(/\s+/g, '_')}.wav`, { type: 'audio/wav' });
      try { await musicPlayer.uploadFiles([file]); await musicPlayer.refresh(); alert('WAV → HUMMING BIRD\nSaved to player + Data Vault.'); }
      catch (err: any) { alert('Send failed: ' + (err?.message || 'unknown')); }
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: C, ...MONO, overflow: 'hidden' }}
      onClick={() => { if (!engineReady) initEngine(); }}>

      <div style={{
        background: `linear-gradient(to bottom, #111411, ${CHASSIS})`,
        borderBottom: `3px solid ${BORDER}`,
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <Screw />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ ...VT, fontSize: '1.6rem', color: OC, letterSpacing: '.25em', textShadow: `0 0 16px ${OC}88, 0 0 4px ${OC}44`, lineHeight: 1 }}>1999</div>
          <div style={{ ...MONO, fontSize: '.38rem', color: C2 + '.35)', letterSpacing: '.2em', marginTop: 1 }}>{boomerMode ? 'DAW' : 'THE LAB'}</div>
        </div>
        <div style={{ width: 1, height: 28, background: BORDER, margin: '0 4px' }} />
        <input value={projectName} onChange={e => setProjectName(e.target.value)}
          style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${BORDER}`, color: C, ...MONO, fontSize: '.48rem', letterSpacing: '.08em', outline: 'none', width: 140 }} />
        <MidiIndicator midi={midi} onSelectDevice={selectDevice} onSetChannel={setChannel} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <HwButton label="SAVE" onClick={saveProject} small />
          <HwButton label="LOAD" onClick={loadProject} small />
          <HwButton label="WAV" onClick={exportWav} small />
          <HwButton label="↑ HUMMING BIRD" onClick={exportWavToHummingbird} small color="#a855f7" />
          <HwButton label="OPEN HUMMING BIRD" onClick={openJukebox} small color="#a855f7" />
          {onClose && <HwButton label="✕" onClick={onClose} small color="#ff4444" />}
        </div>
        <Screw />
      </div>
      {jukeboxPicker}
      {backingTrack && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
          background: 'linear-gradient(90deg, rgba(168,85,247,0.18), rgba(168,85,247,0.04))',
          borderBottom: `1px solid rgba(168,85,247,0.4)`,
          ...MONO, fontSize: '.42rem', color: '#e9d5ff', letterSpacing: '.1em',
        }}>
          <span style={{ color: '#a855f7' }}>● BACKING TRACK</span>
          <span style={{ flex: 1, color: '#e9d5ff' }}>{backingTrack.artist} — {backingTrack.title}</span>
          <button onClick={musicPlayer.playPause} style={{ background: 'transparent', border: '1px solid rgba(168,85,247,0.5)', color: '#e9d5ff', padding: '1px 8px', cursor: 'pointer', ...MONO, fontSize: '.4rem' }}>
            {musicPlayer.playing && musicPlayer.current?.id === backingTrack.id ? 'PAUSE' : 'PLAY'}
          </button>
          <button onClick={() => { musicPlayer.stop(); setBackingTrack(null); }} style={{ background: 'transparent', border: '1px solid rgba(168,85,247,0.5)', color: '#e9d5ff', padding: '1px 8px', cursor: 'pointer', ...MONO, fontSize: '.4rem' }}>
            EJECT
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 2, padding: '4px 10px', background: '#0c0f0c', borderBottom: `1px solid ${BORDER}`, overflowX: 'auto', flexShrink: 0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            padding: '4px 10px',
            background: section === s.id ? 'linear-gradient(to bottom, rgba(56,189,248,.12), rgba(56,189,248,.04))' : 'transparent',
            border: section === s.id ? `1px solid ${C}44` : '1px solid transparent',
            borderBottom: section === s.id ? `2px solid ${C}` : '2px solid transparent',
            color: section === s.id ? C : C2 + '.35)',
            cursor: 'pointer', ...VT, fontSize: '.65rem', letterSpacing: '.1em', borderRadius: '4px 4px 0 0',
            transition: 'all .1s',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 10, position: 'relative' }}>

        <div style={{ display: section === 'machine' ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flexShrink: 0 }}>
              <DrumPads busGain={engineRef.current?.trackBuses[0]?.gain ?? null} activePads={activePads} />
            </div>
            <div style={{ flex: 1, minWidth: 300 }}>
              <StepSequencer
                busGain={engineRef.current?.trackBuses[0]?.gain ?? null}
                bpm={bpm}
                swing={swing}
                onActivePads={setActivePads}
                globalPlaying={globalPlaying}
                globalStep={globalStep}
                muted={instrumentMutes.drums}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Oscilloscope analyser={engineRef.current?.masterAnalyser ?? null} />
            </div>
            <div style={{ ...hwPanel, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={hwLabel}>CONTROLS</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <HwKnob label="FILTER" val={drumFilterCutoff} min={50} max={20000} step={10} onChange={setDrumFilterCutoff} color={OC} />
                <HwKnob label="DRIVE" val={drumDriveAmount} min={1} max={100} step={1} onChange={setDrumDriveAmount} color={OC} />
                <HwKnob label="DECAY" val={synthVoice.decay} min={0.001} max={2} onChange={v => setSynthVoice(sv => ({ ...sv, decay: v }))} />
                <HwKnob label="ATTACK" val={synthVoice.attack} min={0.001} max={2} onChange={v => setSynthVoice(sv => ({ ...sv, attack: v }))} />
                <HwKnob label="RELEASE" val={synthVoice.release} min={0.001} max={4} onChange={v => setSynthVoice(sv => ({ ...sv, release: v }))} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: section === 'synth' ? 'block' : 'none' }}>
          <SynthPanel busGain={engineRef.current?.trackBuses[1]?.gain ?? null} synth={synthVoice} onSynthChange={setSynthVoice} />
        </div>

        <div style={{ display: section === 'arpeggiator' ? 'block' : 'none' }}>
          <Arpeggiator
            busGain={engineRef.current?.trackBuses[4]?.gain ?? null}
            bpm={bpm}
            globalPlaying={globalPlaying}
            globalStep={globalStep}
            muted={instrumentMutes.arp}
            synth={synthVoice}
            arpActive={arpPlaying}
            onToggleArp={() => setArpPlaying(p => !p)}
          />
        </div>

        <div style={{ display: section === 'sampler' ? 'block' : 'none' }}>
          <Sampler busGain={engineRef.current?.trackBuses[3]?.gain ?? null} />
        </div>

        <div style={{ display: section === 'timeline' ? 'block' : 'none' }}>
          <Timeline tracks={tracks} bpm={bpm} />
        </div>

        <div style={{ display: section === 'mixer' ? 'block' : 'none' }}>
          <Mixer tracks={tracks} onTracksChange={setTracks} engine={engineRef.current} />
        </div>

        <div style={{ display: section === 'effects' ? 'block' : 'none' }}>
          <EffectsRack effects={masterEffects} onEffectsChange={setMasterEffects} engine={engineRef.current} />
        </div>

        <div style={{ height: 60 }} />

        <LooperOverlay
          bpm={bpm}
          globalPlaying={globalPlaying}
          muted={instrumentMutes.looper}
          onToggleMute={() => toggleMute('looper')}
          masterVol={masterVol}
          onMasterVolChange={setMasterVol}
        />
      </div>

      <div style={{ padding: '6px 10px', borderTop: `1px solid ${BORDER}`, background: CHASSIS, flexShrink: 0 }}>
        <TransportBar
          bpm={bpm} onBpmChange={setBpm}
          swing={swing} onSwingChange={setSwing}
          masterVol={masterVol} onMasterVolChange={setMasterVol}
          playing={globalPlaying} onPlayToggle={toggleGlobalPlay}
          engineReady={engineReady}
          instrumentMutes={instrumentMutes} onMuteToggle={toggleMute}
          instrumentVols={instrumentVols} onVolChange={setInstrumentVol}
        />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px',
        borderTop: `2px solid ${BORDER}`,
        background: `linear-gradient(to top, #111411, ${CHASSIS})`,
        flexShrink: 0,
      }}>
        <Screw />
        <span style={{ ...MONO, fontSize: '.35rem', color: OC2 + '.4)' }}>1999</span>
        <span style={{ ...MONO, fontSize: '.32rem', color: C2 + '.2)' }}>{boomerMode ? 'DAW' : 'THE LAB'} — {projectName} — {bpm} BPM — {tracks.length} TRACKS</span>
        <span style={{ ...MONO, fontSize: '.32rem', color: engineReady ? C2 + '.35)' : C2 + '.12)', marginLeft: 'auto' }}>WEB AUDIO {globalPlaying ? 'PLAYING' : engineReady ? 'RUNNING' : 'CLICK TO INIT'}</span>
        <Screw />
      </div>

      {/* Live music-bot coach. Ownership-gated inside the component. */}
      <TerrenceAssistDrawer
        surface="soundlab"
        getContext={() => ({
          genre: 'electronic',
          bpm,
          beatNotes: `Project: ${projectName}. Tracks: ${tracks.length}. Engine: ${engineReady ? 'ready' : 'idle'}.`,
        })}
      />
    </div>
  );
}

export default function SoundLab({ onClose }: { onClose?: () => void }) {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const BG_FULL = '#0a0d0a';
  if (onClose) {
    if (!isAuthenticated) {
      return <SignInPage context={boomerMode ? 'Sign in to access the music lab.' : 'Salaryman credentials required. 1999 access locked.'} />;
    }
    return <SoundLabInner onClose={onClose} />;
  }
  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access the music lab.' : 'Salaryman credentials required. 1999 access locked.'} />;
  }
  return (
      <div style={{ minHeight: '100vh', background: BG_FULL }}>
        <SoundLabInner />
      </div>
  );
}
