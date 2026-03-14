let _ctx: AudioContext | null = null;
let _musicVol = 0.35;
let _sfxVol   = 0.55;
let _muted    = false;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function gain(c: AudioContext, vol: number): GainNode {
  const g = c.createGain();
  g.gain.value = _muted ? 0 : vol * _sfxVol;
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
  const ng = c.createGain(); ng.gain.value = _muted ? 0 : 0.18 * _sfxVol;
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
  const melody = [262, 330, 392, 524, 660, 784, 1047];
  melody.forEach((f, i) => {
    const g = gain(c, 0.3);
    const o = osc(c, 'square', f, g);
    const st = t + i * 0.08;
    g.gain.setValueAtTime(0.3 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
    play(o, st, st + 0.1);
  });
  // Final chord
  [524, 660, 784].forEach(f => {
    const g = gain(c, 0.2);
    const o = osc(c, 'triangle', f, g);
    const st = t + 0.65;
    g.gain.setValueAtTime(0.2 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
    play(o, st, st + 0.65);
  });
}

export function sfxStep() {
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.02, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = _muted ? 0 : 0.06 * _sfxVol;
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
  const ng = c.createGain(); ng.gain.value = _muted ? 0 : 0.22 * _sfxVol;
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

export function sfxKonami() {
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
export function getMusicVol(): number { return _musicVol; }
export function getSfxVol(): number { return _sfxVol; }

export function toggleMute(): boolean {
  _muted = !_muted;
  _applyAmbientVolume();
  return _muted;
}

export function setMuted(m: boolean) {
  _muted = m;
  _applyAmbientVolume();
}

export function resumeAudioContext() {
  _ctx?.resume();
}

// ── Procedural Ambient Soundtrack (dystopian stock score) ─────────────────────

interface AmbientLayer {
  osc: OscillatorNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
}

let _ambientLayers: AmbientLayer[] = [];
let _ambientMaster: GainNode | null = null;
let _ambientRunning = false;
let _ambientTimers: ReturnType<typeof setTimeout>[] = [];
let _swellInterval: ReturnType<typeof setInterval> | null = null;
let _driftInterval: ReturnType<typeof setInterval> | null = null;

function _applyAmbientVolume() {
  if (_ambientMaster) {
    const c = ctx();
    const target = _muted ? 0 : _musicVol;
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

  const masterTarget = _muted ? 0 : _musicVol;
  _ambientMaster.gain.setTargetAtTime(masterTarget, c.currentTime, 2.0);

  _createDroneLayer(c, 36, 'sine', 0.18);
  _createDroneLayer(c, 48, 'sine', 0.10);
  _createDroneLayer(c, 55, 'triangle', 0.06);

  _createStringLayer(c, 73.42, 0.04);
  _createStringLayer(c, 82.41, 0.035);
  _createStringLayer(c, 98.00, 0.03);

  _createPulseLayer(c, 30, 0.08);

  _startSwells(c);
  _startDrift(c);
}

function _createDroneLayer(c: AudioContext, freq: number, type: OscillatorType, vol: number) {
  const g = c.createGain();
  g.gain.value = vol;
  g.connect(_ambientMaster!);

  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  o.start();

  _ambientLayers.push({ osc: o, gain: g });
}

function _createStringLayer(c: AudioContext, freq: number, vol: number) {
  const flt = c.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = 400;
  flt.Q.value = 2;
  flt.connect(_ambientMaster!);

  const g = c.createGain();
  g.gain.value = vol;
  g.connect(flt);

  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  o.detune.value = (Math.random() - 0.5) * 15;
  o.connect(g);
  o.start();

  _ambientLayers.push({ osc: o, gain: g, filter: flt });
}

function _createPulseLayer(c: AudioContext, freq: number, vol: number) {
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(_ambientMaster!);

  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  o.connect(g);
  o.start();

  _ambientLayers.push({ osc: o, gain: g });

  const pulseCycle = () => {
    if (!_ambientRunning) return;
    const now = c.currentTime;
    const period = 4 + Math.random() * 4;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + period * 0.4);
    g.gain.linearRampToValueAtTime(0, now + period);
    const tid = setTimeout(pulseCycle, period * 1000);
    _ambientTimers.push(tid);
  };
  pulseCycle();
}

function _startSwells(c: AudioContext) {
  const swellOnce = () => {
    if (!_ambientRunning || !_ambientMaster) return;

    const dissonantFreqs = [110, 116.54, 123.47, 130.81, 138.59, 146.83, 155.56, 164.81];
    const f1 = dissonantFreqs[Math.floor(Math.random() * dissonantFreqs.length)];
    const f2 = f1 * (1 + (Math.random() * 0.06 - 0.03));

    const dur = 6 + Math.random() * 10;
    const vol = 0.015 + Math.random() * 0.025;

    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 200 + Math.random() * 300;
    flt.Q.value = 1.5 + Math.random() * 3;
    flt.connect(_ambientMaster!);

    const g = c.createGain();
    g.gain.value = 0;
    g.connect(flt);

    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = f1;
    o1.connect(g);

    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = f2;
    o2.connect(g);

    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + dur * 0.3);
    g.gain.linearRampToValueAtTime(vol * 0.7, now + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, now + dur);

    o1.start(now);
    o1.stop(now + dur + 0.1);
    o2.start(now);
    o2.stop(now + dur + 0.1);
  };

  const tid = setTimeout(swellOnce, 2000);
  _ambientTimers.push(tid);

  _swellInterval = setInterval(() => {
    if (!_ambientRunning) return;
    swellOnce();
  }, 8000 + Math.random() * 6000);
}

function _startDrift(c: AudioContext) {
  _driftInterval = setInterval(() => {
    if (!_ambientRunning) return;
    for (const layer of _ambientLayers) {
      if (layer.osc && layer.osc.frequency) {
        const base = layer.osc.frequency.value;
        const drift = base + (Math.random() - 0.5) * 2;
        layer.osc.frequency.setTargetAtTime(drift, c.currentTime, 3 + Math.random() * 4);
      }
      if (layer.filter) {
        const base = layer.filter.frequency.value;
        const drift = base + (Math.random() - 0.5) * 80;
        layer.filter.frequency.setTargetAtTime(Math.max(100, drift), c.currentTime, 2 + Math.random() * 3);
      }
      if (layer.osc.detune) {
        const drift = (Math.random() - 0.5) * 20;
        layer.osc.detune.setTargetAtTime(drift, c.currentTime, 4 + Math.random() * 4);
      }
    }
  }, 5000);
}

let _teardownTimer: ReturnType<typeof setTimeout> | null = null;

function stopAmbient() {
  if (!_ambientRunning) return;
  _ambientRunning = false;

  for (const tid of _ambientTimers) clearTimeout(tid);
  _ambientTimers = [];
  if (_swellInterval) { clearInterval(_swellInterval); _swellInterval = null; }
  if (_driftInterval) { clearInterval(_driftInterval); _driftInterval = null; }
  if (_teardownTimer) { clearTimeout(_teardownTimer); _teardownTimer = null; }

  const oldLayers = _ambientLayers;
  const oldMaster = _ambientMaster;
  _ambientLayers = [];
  _ambientMaster = null;

  const c = _ctx;
  if (c && oldMaster) {
    oldMaster.gain.cancelScheduledValues(c.currentTime);
    oldMaster.gain.setTargetAtTime(0, c.currentTime, 0.5);
  }

  _teardownTimer = setTimeout(() => {
    _teardownTimer = null;
    for (const layer of oldLayers) {
      try { layer.osc.stop(); } catch (_e) {}
      try { layer.osc.disconnect(); } catch (_e) {}
      try { layer.gain.disconnect(); } catch (_e) {}
      if (layer.filter) try { layer.filter.disconnect(); } catch (_e) {}
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
  const target = _muted ? 0 : _musicVol;
  _ambientMaster.gain.cancelScheduledValues(_ctx.currentTime);
  _ambientMaster.gain.setTargetAtTime(target, _ctx.currentTime, duration / 4);
}

export function isAmbientRunning(): boolean {
  return _ambientRunning;
}
