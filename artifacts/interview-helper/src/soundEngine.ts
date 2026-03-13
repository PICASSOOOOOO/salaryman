let _ctx: AudioContext | null = null;
let _musicEl: HTMLAudioElement | null = null;
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

export function initMusic(src: string) {
  if (_musicEl) { _musicEl.pause(); _musicEl = null; }
  const el = new Audio(src);
  el.loop = true;
  el.volume = _muted ? 0 : _musicVol;
  el.preload = 'auto';
  _musicEl = el;
}

export function playMusic() {
  if (!_musicEl) return;
  _musicEl.play().catch(() => {});
}

export function pauseMusic() {
  _musicEl?.pause();
}

export function setMusicVolume(v: number) {
  _musicVol = v;
  if (_musicEl && !_muted) _musicEl.volume = v;
}

export function setSfxVolume(v: number) {
  _sfxVol = v;
}

export function getMuted(): boolean { return _muted; }
export function getMusicVol(): number { return _musicVol; }
export function getSfxVol(): number { return _sfxVol; }

export function toggleMute(): boolean {
  _muted = !_muted;
  if (_musicEl) _musicEl.volume = _muted ? 0 : _musicVol;
  return _muted;
}

export function setMuted(m: boolean) {
  _muted = m;
  if (_musicEl) _musicEl.volume = _muted ? 0 : _musicVol;
}

export function resumeAudioContext() {
  _ctx?.resume();
}
