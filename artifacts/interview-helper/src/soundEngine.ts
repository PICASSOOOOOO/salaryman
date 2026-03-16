let _ctx: AudioContext | null = null;
let _musicVol = 0.35;
let _sfxVol   = 0.55;
let _muted    = false;
let _musicMuted = false;
let _sfxMuted   = false;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function gain(c: AudioContext, vol: number): GainNode {
  const g = c.createGain();
  g.gain.value = (_muted || _sfxMuted) ? 0 : vol * _sfxVol;
  g.connect(c.destination);
  return g;
}

function osc(c: AudioContext, type: OscillatorType, freq: number, g: GainNode): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  return o;
}

function play(o: OscillatorNode, start: number, stop: number) {
  o.start(start); o.stop(stop);
}

// ── SFX ───────────────────────────────────────────────────────────────────────

export function sfxAttack() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.28);
  const o = osc(c, 'sawtooth', 300, g);
  o.frequency.setValueAtTime(300, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.09);
  g.gain.setValueAtTime(0.28 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  play(o, t, t + 0.1);
  // Noise burst
  const buf = c.createBuffer(1, c.sampleRate * 0.04, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
  const src = c.createBufferSource(); src.buffer = buf;
  const ng = c.createGain(); ng.gain.value = (_muted || _sfxMuted) ? 0 : 0.18 * _sfxVol;
  src.connect(ng); ng.connect(c.destination);
  src.start(t); src.stop(t + 0.04);
}

export function sfxHit() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.35);
  const o = osc(c, 'square', 180, g);
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
  g.gain.setValueAtTime(0.35 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  play(o, t, t + 0.08);
}

export function sfxKill() {
  const c = ctx(); const t = c.currentTime;
  const freqs = [400, 320, 200, 100];
  freqs.forEach((f, i) => {
    const g = gain(c, 0.22);
    const o = osc(c, 'square', f, g);
    const st = t + i * 0.05;
    g.gain.setValueAtTime(0.22 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.05);
    play(o, st, st + 0.06);
  });
}

export function sfxLevelUp() {
  const c = ctx(); const t = c.currentTime;
  const notes = [392, 494, 587];
  notes.forEach((f, i) => {
    const g = gain(c, 0.15);
    const o = osc(c, 'sine', f, g);
    const st = t + i * 0.12;
    g.gain.setValueAtTime(0.15 * _sfxVol, st);
    g.gain.linearRampToValueAtTime(0.08 * _sfxVol, st + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
    play(o, st, st + 0.45);
  });
  const shimmer = gain(c, 0.06);
  const shim = osc(c, 'sine', 1175, shimmer);
  const st2 = t + 0.36;
  shimmer.gain.setValueAtTime(0, st2);
  shimmer.gain.linearRampToValueAtTime(0.06 * _sfxVol, st2 + 0.1);
  shimmer.gain.exponentialRampToValueAtTime(0.001, st2 + 0.8);
  play(shim, st2, st2 + 0.85);
}

export function sfxMilestone() {
  const c = ctx(); const t = c.currentTime;
  const chord = [523, 659, 784];
  chord.forEach(f => {
    const g = gain(c, 0.1);
    const o = osc(c, 'sine', f, g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1 * _sfxVol, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    play(o, t, t + 1.3);
  });
  const sub = gain(c, 0.08);
  const so = osc(c, 'sine', 196, sub);
  sub.gain.setValueAtTime(0, t);
  sub.gain.linearRampToValueAtTime(0.08 * _sfxVol, t + 0.1);
  sub.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  play(so, t, t + 0.65);
}

export function sfxStep() {
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.02, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = (_muted || _sfxMuted) ? 0 : 0.06 * _sfxVol;
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 200; flt.Q.value = 0.8;
  src.connect(flt); flt.connect(g); g.connect(c.destination);
  src.start(t);
}

export function sfxEnter() {
  const c = ctx(); const t = c.currentTime;
  [440, 660].forEach((f, i) => {
    const g = gain(c, 0.22);
    const o = osc(c, 'triangle', f, g);
    const st = t + i * 0.1;
    g.gain.setValueAtTime(0.22 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
    play(o, st, st + 0.2);
  });
}

export function sfxTalk() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.12);
  const o = osc(c, 'square', 440 + Math.random() * 200, g);
  g.gain.setValueAtTime(0.12 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  play(o, t, t + 0.05);
}

export function sfxSave() {
  const c = ctx(); const t = c.currentTime;
  const freqs = [528, 660, 784, 1056];
  freqs.forEach((f, i) => {
    const g = gain(c, 0.18);
    const o = osc(c, 'sine', f, g);
    const st = t + i * 0.12;
    g.gain.setValueAtTime(0.0, st);
    g.gain.linearRampToValueAtTime(0.18 * _sfxVol, st + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
    play(o, st, st + 0.55);
  });
}

export function sfxPoison() {
  const c = ctx(); const t = c.currentTime;
  [180, 190, 175].forEach((f, i) => {
    const g = gain(c, 0.18);
    const o = osc(c, 'sawtooth', f, g);
    const st = t + i * 0.06;
    g.gain.setValueAtTime(0.18 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.2);
    play(o, st, st + 0.22);
  });
}

export function sfxDeath() {
  const c = ctx(); const t = c.currentTime;
  const freqs = [440, 330, 220, 165, 110, 82];
  freqs.forEach((f, i) => {
    const g = gain(c, 0.25);
    const o = osc(c, 'sawtooth', f, g);
    const st = t + i * 0.12;
    g.gain.setValueAtTime(0.25 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.14);
    play(o, st, st + 0.15);
  });
  // Low noise rumble
  const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.6;
  const src = c.createBufferSource(); src.buffer = buf;
  const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 120;
  const ng = c.createGain(); ng.gain.value = (_muted || _sfxMuted) ? 0 : 0.22 * _sfxVol;
  src.connect(flt); flt.connect(ng); ng.connect(c.destination);
  src.start(t + 0.4);
}

export function sfxHeal() {
  const c = ctx(); const t = c.currentTime;
  const notes = [262, 330, 392, 524];
  notes.forEach((f, i) => {
    const g = gain(c, 0.2);
    const o = osc(c, 'sine', f, g);
    const st = t + i * 0.1;
    g.gain.setValueAtTime(0.0, st);
    g.gain.linearRampToValueAtTime(0.2 * _sfxVol, st + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
    play(o, st, st + 0.28);
  });
}

export function sfxCoin() {
  const c = ctx(); const t = c.currentTime;
  const g1 = gain(c, 0.3);
  const o1 = osc(c, 'square', 988, g1);
  g1.gain.setValueAtTime(0.3 * _sfxVol, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  play(o1, t, t + 0.07);
  const g2 = gain(c, 0.3);
  const o2 = osc(c, 'square', 1319, g2);
  g2.gain.setValueAtTime(0.3 * _sfxVol, t + 0.06);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  play(o2, t + 0.06, t + 0.2);
}

export function sfxSecretCode() {
  const c = ctx(); const t = c.currentTime;
  const seq = [523, 659, 784, 1047, 1319, 1047, 784, 659, 523, 659, 784, 1047];
  seq.forEach((f, i) => {
    const g = gain(c, 0.22);
    const o = osc(c, 'square', f, g);
    const st = t + i * 0.07;
    g.gain.setValueAtTime(0.22 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
    play(o, st, st + 0.075);
  });
}

export function sfxError() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.3);
  const o = osc(c, 'square', 110, g);
  g.gain.setValueAtTime(0.3 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  play(o, t, t + 0.16);
}

export function sfxZoneCross() {
  const c = ctx(); const t = c.currentTime;
  [220, 180].forEach((f, i) => {
    const g = gain(c, 0.15);
    const o = osc(c, 'triangle', f, g);
    const st = t + i * 0.1;
    g.gain.setValueAtTime(0.15 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
    play(o, st, st + 0.14);
  });
}

// ── Music ─────────────────────────────────────────────────────────────────────

export function initMusic(_src?: string) {}

export function playMusic() {
  startAmbient();
}

export function pauseMusic() {
  stopAmbient();
}

export function setMusicVolume(v: number) {
  _musicVol = v;
  _applyAmbientVolume();
}

export function setSfxVolume(v: number) {
  _sfxVol = v;
}

export function getMuted(): boolean { return _muted; }
export function getMusicMuted(): boolean { return _musicMuted; }
export function getSfxMuted(): boolean { return _sfxMuted; }
export function getMusicVol(): number { return _musicVol; }
export function getSfxVol(): number { return _sfxVol; }

export function toggleMuteMusic(): boolean {
  _musicMuted = !_musicMuted;
  _applyAmbientVolume();
  return _musicMuted;
}

export function toggleMuteAll(): boolean {
  _muted = !_muted;
  _applyAmbientVolume();
  return _muted;
}

/** Legacy alias — toggles music mute only (not SFX). Use toggleMuteAll() for full silence. */
export function toggleMute(): boolean {
  return toggleMuteMusic();
}

export function setMuted(m: boolean) {
  _muted = m;
  _applyAmbientVolume();
}

export function setMusicMuted(m: boolean) {
  _musicMuted = m;
  _applyAmbientVolume();
}

export function resumeAudioContext() {
  _ctx?.resume();
}

// ── Procedural Synthwave Ambient Soundtrack ──────────────────────────────────

interface AmbientNode {
  node: AudioNode;
  stop?: () => void;
}

let _ambientNodes: AmbientNode[] = [];
let _ambientMaster: GainNode | null = null;
let _ambientRunning = false;
let _ambientTimers: ReturnType<typeof setTimeout>[] = [];
let _arpInterval: ReturnType<typeof setInterval> | null = null;
let _snareInterval: ReturnType<typeof setInterval> | null = null;
let _bassInterval: ReturnType<typeof setInterval> | null = null;

const SYNTHWAVE_BPM = 108;
const BEAT = 60 / SYNTHWAVE_BPM;

const CHORD_PROG = [
  [261.63, 311.13, 392.00],
  [220.00, 261.63, 329.63],
  [293.66, 349.23, 440.00],
  [246.94, 293.66, 369.99],
];

function _applyAmbientVolume() {
  if (_ambientMaster) {
    const c = ctx();
    const target = (_muted || _musicMuted) ? 0 : _musicVol;
    _ambientMaster.gain.cancelScheduledValues(c.currentTime);
    _ambientMaster.gain.setTargetAtTime(target, c.currentTime, 0.05);
  }
}

function startAmbient() {
  if (_ambientRunning) return;
  _ambientRunning = true;
  const c = ctx();

  _ambientMaster = c.createGain();
  _ambientMaster.gain.value = 0;
  _ambientMaster.connect(c.destination);

  const masterTarget = (_muted || _musicMuted) ? 0 : _musicVol;
  _ambientMaster.gain.setTargetAtTime(masterTarget, c.currentTime, 2.0);

  _createSynthPads(c);
  _startArpeggio(c);
  _startSubBass(c);
  _startSnareAccents(c);
}

function _createSynthPads(c: AudioContext) {
  const padFreqs = [130.81, 196.00, 261.63];
  for (const freq of padFreqs) {
    const g = c.createGain();
    g.gain.value = 0.045;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 800;
    flt.Q.value = 0.7;
    flt.connect(_ambientMaster!);
    g.connect(flt);

    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    o1.detune.value = -12;
    o1.connect(g);
    o1.start();

    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq;
    o2.detune.value = 12;
    o2.connect(g);
    o2.start();

    _ambientNodes.push(
      { node: o1, stop: () => { try { o1.stop(); } catch (_) {} } },
      { node: o2, stop: () => { try { o2.stop(); } catch (_) {} } },
      { node: g }, { node: flt }
    );
  }

  let chordIdx = 0;
  const padSweep = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = CHORD_PROG[chordIdx % CHORD_PROG.length];
    chordIdx++;
    const dur = BEAT * 8;
    const vol = 0.03;
    const now = c.currentTime;

    for (let i = 0; i < chord.length; i++) {
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(vol, now + dur * 0.15);
      g2.gain.setValueAtTime(vol, now + dur * 0.7);
      g2.gain.linearRampToValueAtTime(0, now + dur);
      const f2 = c.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = 600;
      f2.frequency.linearRampToValueAtTime(1200, now + dur * 0.4);
      f2.frequency.linearRampToValueAtTime(600, now + dur);
      f2.Q.value = 1;
      f2.connect(_ambientMaster!);
      g2.connect(f2);

      const oA = c.createOscillator();
      oA.type = 'sawtooth';
      oA.frequency.value = chord[i] * 0.5;
      oA.detune.value = -8;
      oA.connect(g2);
      oA.start(now);
      oA.stop(now + dur + 0.1);
      oA.onended = () => { try { oA.disconnect(); } catch (_) {} };

      const oB = c.createOscillator();
      oB.type = 'sawtooth';
      oB.frequency.value = chord[i] * 0.5;
      oB.detune.value = 8;
      oB.connect(g2);
      oB.start(now);
      oB.stop(now + dur + 0.1);
      oB.onended = () => { try { oB.disconnect(); g2.disconnect(); f2.disconnect(); } catch (_) {} };
    }

    const tid = setTimeout(padSweep, dur * 1000);
    _ambientTimers.push(tid);
  };
  const tid = setTimeout(padSweep, BEAT * 4 * 1000);
  _ambientTimers.push(tid);
}

function _startArpeggio(c: AudioContext) {
  let step = 0;
  let chordIdx = 0;
  const arpNote = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = CHORD_PROG[chordIdx % CHORD_PROG.length];
    const pattern = [0, 1, 2, 1, 0, 2, 1, 0];
    const noteIdx = pattern[step % pattern.length];
    const freq = chord[noteIdx];

    const now = c.currentTime;
    const dur = BEAT * 0.4;

    const g = c.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, now);
    flt.frequency.exponentialRampToValueAtTime(800, now + dur);
    flt.Q.value = 2;
    flt.connect(_ambientMaster!);
    g.connect(flt);

    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    o.connect(g);
    o.start(now);
    o.stop(now + dur + 0.05);
    o.onended = () => { try { o.disconnect(); g.disconnect(); flt.disconnect(); } catch (_) {} };

    step++;
    if (step % 16 === 0) chordIdx++;
  };

  _arpInterval = setInterval(arpNote, BEAT * 0.5 * 1000);
}

function _startSubBass(c: AudioContext) {
  let chordIdx = 0;
  const bassHit = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = CHORD_PROG[chordIdx % CHORD_PROG.length];
    const rootFreq = chord[0] * 0.25;
    const now = c.currentTime;
    const dur = BEAT * 0.8;

    const g = c.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    g.connect(_ambientMaster!);

    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootFreq;
    o.connect(g);
    o.start(now);
    o.stop(now + dur + 0.05);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };

    chordIdx++;
  };

  _bassInterval = setInterval(bassHit, BEAT * 2 * 1000);
}

function _startSnareAccents(c: AudioContext) {
  const fireSnare = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    if (Math.random() > 0.35) return;

    const now = c.currentTime;
    const dur = 0.15;

    const noiseLen = c.sampleRate * dur;
    const noiseBuf = c.createBuffer(1, noiseLen, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = c.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 1.5;

    const gateGain = c.createGain();
    gateGain.gain.setValueAtTime(0.08, now);
    gateGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(bp);
    bp.connect(gateGain);
    gateGain.connect(_ambientMaster!);
    noise.start(now);
    noise.stop(now + dur + 0.01);
    noise.onended = () => { try { noise.disconnect(); bp.disconnect(); gateGain.disconnect(); } catch (_) {} };

    const toneG = c.createGain();
    toneG.gain.setValueAtTime(0.05, now);
    toneG.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
    toneG.connect(_ambientMaster!);

    const toneO = c.createOscillator();
    toneO.type = 'triangle';
    toneO.frequency.setValueAtTime(180, now);
    toneO.frequency.exponentialRampToValueAtTime(80, now + dur * 0.5);
    toneO.connect(toneG);
    toneO.start(now);
    toneO.stop(now + dur + 0.01);
    toneO.onended = () => { try { toneO.disconnect(); toneG.disconnect(); } catch (_) {} };
  };

  _snareInterval = setInterval(fireSnare, BEAT * 2 * 1000);
}

let _teardownTimer: ReturnType<typeof setTimeout> | null = null;

function stopAmbient() {
  if (!_ambientRunning) return;
  _ambientRunning = false;

  for (const tid of _ambientTimers) clearTimeout(tid);
  _ambientTimers = [];
  if (_arpInterval) { clearInterval(_arpInterval); _arpInterval = null; }
  if (_snareInterval) { clearInterval(_snareInterval); _snareInterval = null; }
  if (_bassInterval) { clearInterval(_bassInterval); _bassInterval = null; }
  if (_teardownTimer) { clearTimeout(_teardownTimer); _teardownTimer = null; }

  const oldNodes = _ambientNodes;
  const oldMaster = _ambientMaster;
  _ambientNodes = [];
  _ambientMaster = null;

  const c = _ctx;
  if (c && oldMaster) {
    oldMaster.gain.cancelScheduledValues(c.currentTime);
    oldMaster.gain.setTargetAtTime(0, c.currentTime, 0.5);
  }

  _teardownTimer = setTimeout(() => {
    _teardownTimer = null;
    for (const n of oldNodes) {
      if (n.stop) try { n.stop(); } catch (_e) {}
      try { n.node.disconnect(); } catch (_e) {}
    }
    if (oldMaster) {
      try { oldMaster.disconnect(); } catch (_e) {}
    }
  }, 2000);
}

export function fadeOutAmbient(duration = 1.5) {
  if (!_ambientRunning || !_ambientMaster || !_ctx) return;
  _ambientMaster.gain.cancelScheduledValues(_ctx.currentTime);
  _ambientMaster.gain.setTargetAtTime(0, _ctx.currentTime, duration / 4);
}

export function fadeInAmbient(duration = 2.0) {
  if (!_ambientRunning || !_ctx) {
    startAmbient();
    return;
  }
  if (!_ambientMaster) return;
  const target = (_muted || _musicMuted) ? 0 : _musicVol;
  _ambientMaster.gain.cancelScheduledValues(_ctx.currentTime);
  _ambientMaster.gain.setTargetAtTime(target, _ctx.currentTime, duration / 4);
}

export function isAmbientRunning(): boolean {
  return _ambientRunning;
}

// ── Spatial Audio Engine ──────────────────────────────────────────────────────

const EARSHOT_RADIUS = 600;
const MAX_SPATIAL_DIST = 800;

export function spatialVolume(playerX: number, playerY: number, srcX: number, srcY: number, maxDist = MAX_SPATIAL_DIST): number {
  const dx = playerX - srcX;
  const dy = playerY - srcY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= maxDist) return 0;
  return Math.max(0, 1 - dist / maxDist);
}

export function isWithinEarshot(playerX: number, playerY: number, srcX: number, srcY: number, radius = EARSHOT_RADIUS): boolean {
  const dx = playerX - srcX;
  const dy = playerY - srcY;
  return (dx * dx + dy * dy) <= radius * radius;
}

function spatialGain(c: AudioContext, vol: number, spatialFactor: number): GainNode {
  const g = c.createGain();
  g.gain.value = (_muted || _sfxMuted) ? 0 : vol * _sfxVol * spatialFactor;
  g.connect(c.destination);
  return g;
}

export function sfxSpatialStep(playerX: number, playerY: number, srcX: number, srcY: number, surface: 'concrete' | 'metal' | 'dirt' | 'wood' = 'concrete') {
  const sv = spatialVolume(playerX, playerY, srcX, srcY);
  if (sv < 0.02) return;
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.025, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const freqMap = { concrete: 220, metal: 800, dirt: 120, wood: 350 };
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freqMap[surface]; flt.Q.value = surface === 'metal' ? 2.0 : 0.8;
  const g = spatialGain(c, 0.06, sv);
  src.connect(flt); flt.connect(g);
  src.start(t);
}

export function sfxDoor(playerX: number, playerY: number, srcX: number, srcY: number) {
  const sv = spatialVolume(playerX, playerY, srcX, srcY);
  if (sv < 0.02) return;
  const c = ctx(); const t = c.currentTime;
  const g = spatialGain(c, 0.15, sv);
  const o = osc(c, 'sine', 180, g);
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  play(o, t, t + 0.2);
}

export function sfxVehicle(playerX: number, playerY: number, srcX: number, srcY: number) {
  const sv = spatialVolume(playerX, playerY, srcX, srcY, 1200);
  if (sv < 0.02) return;
  const c = ctx(); const t = c.currentTime;
  const g = spatialGain(c, 0.08, sv);
  const o = osc(c, 'sawtooth', 55, g);
  const dur = 1.5 + Math.random() * 2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(g.gain.value || 0.04, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, t + dur);
  play(o, t, t + dur + 0.1);
}

export function sfxMachinery(playerX: number, playerY: number, srcX: number, srcY: number) {
  const sv = spatialVolume(playerX, playerY, srcX, srcY);
  if (sv < 0.02) return;
  const c = ctx(); const t = c.currentTime;
  const g = spatialGain(c, 0.05, sv);
  const o = osc(c, 'sawtooth', 80 + Math.random() * 20, g);
  const dur = 0.8 + Math.random() * 0.4;
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  play(o, t, t + dur + 0.05);
}

export function sfxWeaponDraw() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.18);
  const o = osc(c, 'sawtooth', 600, g);
  o.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  g.gain.setValueAtTime(0.18 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  play(o, t, t + 0.12);
}

export function sfxItemPickup() {
  const c = ctx(); const t = c.currentTime;
  [880, 1100].forEach((f, i) => {
    const g = gain(c, 0.2);
    const o = osc(c, 'sine', f, g);
    const st = t + i * 0.06;
    g.gain.setValueAtTime(0.2 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
    play(o, st, st + 0.12);
  });
}

export function sfxUIClick() {
  const c = ctx(); const t = c.currentTime;
  const g = gain(c, 0.12);
  const o = osc(c, 'square', 1200, g);
  g.gain.setValueAtTime(0.12 * _sfxVol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  play(o, t, t + 0.035);
}

export function sfxWeatherRain(playerX: number, playerY: number) {
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15;
  const src = c.createBufferSource(); src.buffer = buf;
  const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 800;
  const g = c.createGain(); g.gain.value = (_muted || _sfxMuted) ? 0 : 0.04 * _sfxVol;
  src.connect(flt); flt.connect(g); g.connect(c.destination);
  src.start(t);
}

export function sfxWeatherWind() {
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.sin((i / d.length) * Math.PI);
    d[i] = (Math.random() * 2 - 1) * 0.1 * env;
  }
  const src = c.createBufferSource(); src.buffer = buf;
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 300; flt.Q.value = 0.5;
  const g = c.createGain(); g.gain.value = (_muted || _sfxMuted) ? 0 : 0.035 * _sfxVol;
  src.connect(flt); flt.connect(g); g.connect(c.destination);
  src.start(t);
}

// ── Ambient Crowd Murmurs ─────────────────────────────────────────────────────

let _crowdMurmurSrc: AudioBufferSourceNode | null = null;
let _crowdMurmurGain: GainNode | null = null;
let _crowdRunning = false;

export function startCrowdMurmur() {
  if (_crowdRunning) return;
  _crowdRunning = true;
  const c = ctx();
  const dur = 4;
  const buf = c.createBuffer(2, c.sampleRate * dur, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const env = 0.5 + 0.5 * Math.sin((i / d.length) * Math.PI * 2 * (0.2 + Math.random() * 0.1));
      d[i] = (Math.random() * 2 - 1) * 0.06 * env;
    }
  }
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 350; flt.Q.value = 0.8;
  _crowdMurmurGain = c.createGain();
  _crowdMurmurGain.gain.value = 0;
  _crowdMurmurGain.connect(c.destination);
  flt.connect(_crowdMurmurGain);
  _crowdMurmurSrc = c.createBufferSource();
  _crowdMurmurSrc.buffer = buf;
  _crowdMurmurSrc.loop = true;
  _crowdMurmurSrc.connect(flt);
  _crowdMurmurSrc.start();
}

export function updateCrowdMurmurVolume(nearbyNpcCount: number) {
  if (!_crowdMurmurGain || !_crowdRunning) return;
  const target = (_muted || _sfxMuted) ? 0 : Math.min(0.12, nearbyNpcCount * 0.012) * _sfxVol;
  const c = ctx();
  _crowdMurmurGain.gain.cancelScheduledValues(c.currentTime);
  _crowdMurmurGain.gain.setTargetAtTime(target, c.currentTime, 0.5);
}

export function stopCrowdMurmur() {
  if (!_crowdRunning) return;
  _crowdRunning = false;
  if (_crowdMurmurSrc) { try { _crowdMurmurSrc.stop(); } catch (_e) {} _crowdMurmurSrc = null; }
  if (_crowdMurmurGain) { try { _crowdMurmurGain.disconnect(); } catch (_e) {} _crowdMurmurGain = null; }
}

// ── Voice Actor TTS ───────────────────────────────────────────────────────────

let _ttsSupported: boolean | null = null;

function checkTTS(): boolean {
  if (_ttsSupported !== null) return _ttsSupported;
  _ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return _ttsSupported;
}

export function speakDialog(text: string, npcName: string, gender: 'm' | 'f' = 'm'): { cancel: () => void } {
  if (!checkTTS() || _muted) return { cancel: () => {} };
  const synth = window.speechSynthesis;
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.85 + Math.random() * 0.2;
  utt.pitch = gender === 'f' ? 1.1 + Math.random() * 0.3 : 0.7 + Math.random() * 0.2;
  utt.volume = Math.min(1, _sfxVol * 1.2);
  const voices = synth.getVoices();
  if (voices.length > 0) {
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    if (enVoices.length > 0) {
      const hash = npcName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      utt.voice = enVoices[hash % enVoices.length];
    }
  }
  synth.speak(utt);
  return { cancel: () => synth.cancel() };
}

export function cancelSpeech() {
  if (checkTTS()) window.speechSynthesis.cancel();
}

// ── Proximity Conversation Events ─────────────────────────────────────────────

export interface ConversationLine {
  speaker: string;
  text: string;
  gender: 'm' | 'f';
}

export interface ConversationEvent {
  id: string;
  x: number;
  y: number;
  lines: ConversationLine[];
  currentLine: number;
  timer: number;
  finished: boolean;
}

export const POLICE_STOP_DIALOGS: ConversationLine[][] = [
  [
    { speaker: 'OFFICER', text: 'Citizen. Stop. Identification check.', gender: 'm' },
    { speaker: 'CITIZEN', text: 'I have my papers right here...', gender: 'm' },
    { speaker: 'OFFICER', text: 'These expired three weeks ago. That is a citation. ƒ200 fine. Move along.', gender: 'm' },
  ],
  [
    { speaker: 'OFFICER', text: 'You. Where are you headed?', gender: 'f' },
    { speaker: 'CITIZEN', text: 'Just going home, officer.', gender: 'f' },
    { speaker: 'OFFICER', text: 'Home is that way. You were walking the other way. Suspicious. I am filing a report.', gender: 'f' },
    { speaker: 'CITIZEN', text: 'That... that is the long way around...', gender: 'f' },
    { speaker: 'OFFICER', text: 'Report filed. Move along.', gender: 'f' },
  ],
  [
    { speaker: 'OFFICER', text: 'Halt. Random inspection. Open your bag.', gender: 'm' },
    { speaker: 'CITIZEN', text: 'It is just groceries.', gender: 'f' },
    { speaker: 'OFFICER', text: 'Unlicensed produce. Section 14-C. That is a ƒ150 infraction. PABLO Corp. approved vendors only.', gender: 'm' },
  ],
  [
    { speaker: 'OFFICER', text: 'You match a description. Stand still.', gender: 'f' },
    { speaker: 'CITIZEN', text: 'What description? I was just—', gender: 'm' },
    { speaker: 'OFFICER', text: 'The description says: resident of Minx City. That is you. Papers. Now.', gender: 'f' },
    { speaker: 'CITIZEN', text: 'Everyone is a resident of—', gender: 'm' },
    { speaker: 'OFFICER', text: 'Noted. Proceed. Slowly.', gender: 'f' },
  ],
];

export const CORPO_MILITARY_STOP_DIALOGS: ConversationLine[][] = [
  [
    { speaker: 'CORPO GUARD', text: 'This is a restricted perimeter. State your business with PABLO Corp.', gender: 'm' },
    { speaker: 'CITIZEN', text: 'I am just walking through.', gender: 'm' },
    { speaker: 'CORPO GUARD', text: 'Walking through is not a recognized business function. Reroute. Now.', gender: 'm' },
  ],
  [
    { speaker: 'CORPO GUARD', text: 'You are within 50 meters of PABLO Corp. property. Explain.', gender: 'f' },
    { speaker: 'CITIZEN', text: 'The sidewalk is public...', gender: 'f' },
    { speaker: 'CORPO GUARD', text: 'PABLO Corp. maintains this sidewalk. It is corp property. Vacate.', gender: 'f' },
  ],
  [
    { speaker: 'CORPO GUARD', text: 'Scanning... no employee badge detected. You have ten seconds.', gender: 'm' },
    { speaker: 'CITIZEN', text: 'Ten seconds for what?', gender: 'f' },
    { speaker: 'CORPO GUARD', text: 'To leave. Nine. Eight...', gender: 'm' },
  ],
];

export function createConversationEvent(x: number, y: number, lines: ConversationLine[]): ConversationEvent {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    x, y, lines, currentLine: 0, timer: 0, finished: false,
  };
}

export function tickConversationEvent(ev: ConversationEvent, dt: number): ConversationEvent {
  if (ev.finished) return ev;
  const newTimer = ev.timer + dt;
  if (newTimer >= 3.0) {
    const nextLine = ev.currentLine + 1;
    if (nextLine >= ev.lines.length) {
      return { ...ev, timer: 0, finished: true };
    }
    return { ...ev, currentLine: nextLine, timer: 0 };
  }
  return { ...ev, timer: newTimer };
}
