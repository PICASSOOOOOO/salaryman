import {
  BG_OWNERS,
  claimBackgroundAudio,
  registerBackgroundAudio,
  releaseBackgroundAudio,
} from "./lib/audio-bus";

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
  g.gain.value = _sfxMuted ? 0 : vol * _sfxVol;
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
  const ng = c.createGain(); ng.gain.value = _sfxMuted ? 0 : 0.18 * _sfxVol;
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

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE SOUNDS — Salaryman audio identity.
// These four cues are the brand. They fire at moments the player should
// FEEL: the Salaryman leitmotif on story beats, the big-payout cascade on
// meaningful in-game money, the real-USD "deposit" on actual dollars hitting
// the player's account, and the lore-reveal stinger on story discoveries.
// ─────────────────────────────────────────────────────────────────────────────

// The Salaryman leitmotif — short branded musical phrase used as our audio
// signature. A descending suit-and-tie 3-note phrase (E5 → C5 → G4) over a
// warm brass swell with a glassy upper chime. ~1.1s.
export function sfxSalarymanSting() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  // Brass-like swell underneath the motif
  const brassG = gain(c, 0.0);
  const brass1 = osc(c, 'sawtooth', 130.81, brassG); // C3
  const brass2 = osc(c, 'sawtooth', 196.00, brassG); // G3
  const brassFilter = c.createBiquadFilter();
  brassFilter.type = 'lowpass';
  brassFilter.frequency.setValueAtTime(400, t);
  brassFilter.frequency.linearRampToValueAtTime(1600, t + 0.4);
  brassFilter.frequency.linearRampToValueAtTime(800, t + 1.1);
  brassG.disconnect();
  brassG.connect(brassFilter);
  brassFilter.connect(c.destination);
  brassG.gain.setValueAtTime(0, t);
  brassG.gain.linearRampToValueAtTime(0.18 * _sfxVol, t + 0.18);
  brassG.gain.linearRampToValueAtTime(0.10 * _sfxVol, t + 0.7);
  brassG.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
  play(brass1, t, t + 1.15);
  play(brass2, t, t + 1.15);
  // The motif: E5 → C5 → G4 (descending, confident)
  const motif: Array<[number, number, number]> = [
    [659.25, 0.00, 0.30], // E5
    [523.25, 0.22, 0.30], // C5
    [392.00, 0.50, 0.55], // G4 (held)
  ];
  motif.forEach(([f, off, dur]) => {
    const g = gain(c, 0.0);
    const o = osc(c, 'triangle', f, g);
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(0.22 * _sfxVol, t + off + 0.025);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    play(o, t + off, t + off + dur + 0.05);
  });
  // Glassy chime on top — a single bell-like sine on the final note
  const chimeG = gain(c, 0.0);
  const chime = osc(c, 'sine', 1568, chimeG); // G6
  chimeG.gain.setValueAtTime(0, t + 0.5);
  chimeG.gain.linearRampToValueAtTime(0.12 * _sfxVol, t + 0.52);
  chimeG.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  play(chime, t + 0.5, t + 1.15);
}

// Big payout — escalating ascending arpeggio with thumping bass, used when a
// player banks a meaningful sum (default threshold ≥ ƒ500). Amount scales the
// length, the upper octave, and the bass weight so a ƒ50,000 payout feels
// genuinely heavier than ƒ500.
export function sfxBigPayout(amount: number = 1000) {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  // amount → tier 0..3 → arpeggio length & upper octave
  const tier = amount >= 25000 ? 3 : amount >= 5000 ? 2 : amount >= 1000 ? 1 : 0;
  const baseSeq = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5 E5 G5 C6 E6
  const extSeq  = [...baseSeq, 1567.98, 2093.00];             // + G6 C7
  const seq = tier >= 2 ? extSeq : baseSeq;
  const noteDur = 0.06;
  const noteGap = 0.05;
  // Bass thump — sub kick that scales with tier
  const bassG = gain(c, 0.0);
  const bass = osc(c, 'sine', 60, bassG);
  const bassWeight = 0.18 + tier * 0.07;
  bass.frequency.setValueAtTime(110, t);
  bass.frequency.exponentialRampToValueAtTime(38, t + 0.18);
  bassG.gain.setValueAtTime(0, t);
  bassG.gain.linearRampToValueAtTime(bassWeight * _sfxVol, t + 0.01);
  bassG.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  play(bass, t, t + 0.45);
  // Ascending arpeggio
  seq.forEach((f, i) => {
    const g = gain(c, 0.0);
    const o = osc(c, 'square', f, g);
    const st = t + i * noteGap;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.20 * _sfxVol, st + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, st + noteDur);
    play(o, st, st + noteDur + 0.02);
    // Octave-up sparkle on the upper half of the arpeggio
    if (i >= seq.length - 3) {
      const sg = gain(c, 0.0);
      const so = osc(c, 'sine', f * 2, sg);
      sg.gain.setValueAtTime(0, st);
      sg.gain.linearRampToValueAtTime(0.10 * _sfxVol, st + 0.005);
      sg.gain.exponentialRampToValueAtTime(0.001, st + noteDur);
      play(so, st, st + noteDur + 0.02);
    }
  });
  // Cash-register "ka-ching" tail after the arpeggio
  const tailStart = t + seq.length * noteGap + 0.02;
  const ringG = gain(c, 0.0);
  const ring = osc(c, 'triangle', 2349, ringG); // D7-ish bell
  ringG.gain.setValueAtTime(0, tailStart);
  ringG.gain.linearRampToValueAtTime(0.18 * _sfxVol, tailStart + 0.01);
  ringG.gain.exponentialRampToValueAtTime(0.001, tailStart + 0.6);
  play(ring, tailStart, tailStart + 0.65);
  const ring2G = gain(c, 0.0);
  const ring2 = osc(c, 'sine', 3136, ring2G); // G7-ish overtone
  ring2G.gain.setValueAtTime(0, tailStart);
  ring2G.gain.linearRampToValueAtTime(0.10 * _sfxVol, tailStart + 0.015);
  ring2G.gain.exponentialRampToValueAtTime(0.001, tailStart + 0.5);
  play(ring2, tailStart, tailStart + 0.55);
}

// Real-USD deposit — distinct from in-game payouts. This fires when ACTUAL
// dollars hit the player's account (Stripe payout, USD conversion settling,
// payroll cleared). Combines the Salaryman sting with a deeper cash-register.
export function sfxRealUsdDeposit() {
  if (_sfxMuted) return;
  sfxSalarymanSting();
  const c = ctx(); const t = c.currentTime + 0.45;
  // Deep bass thump — "real money" weight
  const bassG = gain(c, 0.0);
  const bass = osc(c, 'sine', 55, bassG);
  bass.frequency.setValueAtTime(82, t);
  bass.frequency.exponentialRampToValueAtTime(36, t + 0.5);
  bassG.gain.setValueAtTime(0, t);
  bassG.gain.linearRampToValueAtTime(0.30 * _sfxVol, t + 0.02);
  bassG.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  play(bass, t, t + 0.75);
  // Two-note "deposit confirmed" stamp (G5 → C6)
  const stamp: Array<[number, number]> = [[783.99, 0.00], [1046.50, 0.18]];
  stamp.forEach(([f, off]) => {
    const g = gain(c, 0.0);
    const o = osc(c, 'square', f, g);
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(0.22 * _sfxVol, t + off + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.28);
    play(o, t + off, t + off + 0.32);
  });
  // Long shimmering tail — "money is real" sustain
  const shimmerG = gain(c, 0.0);
  const sh1 = osc(c, 'sine', 2093, shimmerG);
  const sh2 = osc(c, 'sine', 3136, shimmerG);
  shimmerG.gain.setValueAtTime(0, t + 0.18);
  shimmerG.gain.linearRampToValueAtTime(0.08 * _sfxVol, t + 0.30);
  shimmerG.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  play(sh1, t + 0.18, t + 1.45);
  play(sh2, t + 0.18, t + 1.45);
}

// Lore reveal — atmospheric stinger for story moments (cache discoveries,
// PABLO CORP truth drops, secret floor unlocks, mission completion). A slow
// reverse-cymbal-like swell into a held minor chord with one detuned voice
// for unease. ~1.8s.
export function sfxLoreReveal() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  // Reverse-cymbal swell using filtered noise
  const noiseLen = 0.9;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * noiseLen), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  const nSrc = c.createBufferSource();
  nSrc.buffer = buf;
  const nFilt = c.createBiquadFilter();
  nFilt.type = 'highpass';
  nFilt.frequency.setValueAtTime(800, t);
  nFilt.frequency.exponentialRampToValueAtTime(6000, t + noiseLen);
  const nG = c.createGain();
  nG.gain.setValueAtTime(0, t);
  nG.gain.linearRampToValueAtTime(0.10 * _sfxVol, t + noiseLen - 0.05);
  nG.gain.exponentialRampToValueAtTime(0.001, t + noiseLen + 0.05);
  nSrc.connect(nFilt); nFilt.connect(nG); nG.connect(c.destination);
  nSrc.start(t); nSrc.stop(t + noiseLen + 0.1);
  // Held minor chord (A minor: A2, E3, A3, C4, E4) — one voice detuned for unease
  const chord: Array<[number, number]> = [
    [110.00, 0.0],   // A2
    [164.81, 0.0],   // E3
    [220.00, 0.0],   // A3
    [261.63, +6.0],  // C4 detuned +6 cents
    [329.63, 0.0],   // E4
  ];
  chord.forEach(([f, detune]) => {
    const g = gain(c, 0.0);
    const o = osc(c, 'sine', f, g);
    o.detune.setValueAtTime(detune, t);
    g.gain.setValueAtTime(0, t + noiseLen - 0.1);
    g.gain.linearRampToValueAtTime(0.07 * _sfxVol, t + noiseLen + 0.05);
    g.gain.linearRampToValueAtTime(0.05 * _sfxVol, t + noiseLen + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + noiseLen + 1.3);
    play(o, t + noiseLen - 0.1, t + noiseLen + 1.4);
  });
  // Sub-bass thump under the chord — "the truth lands"
  const subG = gain(c, 0.0);
  const sub = osc(c, 'sine', 41.20, subG); // E1
  subG.gain.setValueAtTime(0, t + noiseLen - 0.05);
  subG.gain.linearRampToValueAtTime(0.16 * _sfxVol, t + noiseLen + 0.02);
  subG.gain.exponentialRampToValueAtTime(0.001, t + noiseLen + 0.9);
  play(sub, t + noiseLen - 0.05, t + noiseLen + 0.95);
}

export function sfxStep(vol = 1, freq = 200) {
  const c = ctx(); const t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * 0.02, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = _sfxMuted ? 0 : 0.06 * _sfxVol * vol;
  const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 0.8;
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
  const ng = c.createGain(); ng.gain.value = _sfxMuted ? 0 : 0.22 * _sfxVol;
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

// Tense, low-frequency sting for when a Banco Ombra debt collector enters the
// 150-unit danger zone. Three descending sawtooth tones with a sub-bass thud —
// designed to feel menacing without overpowering gameplay audio.
export function sfxDebtCollectorAlert() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  // Descending three-tone menace stab (sawtooth, filtered low)
  const tones = [130, 100, 78];
  tones.forEach((f, i) => {
    const st = t + i * 0.11;
    const g = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.Q.value = 2.8;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.28 * _sfxVol, st + 0.018);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
    lp.connect(c.destination); g.connect(lp);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(g);
    o.start(st); o.stop(st + 0.24);
    o.onended = () => { try { o.disconnect(); g.disconnect(); lp.disconnect(); } catch (_e) {} };
  });
  // Sub-bass thud at the end for weight
  const st2 = t + 0.3;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0, st2);
  sg.gain.linearRampToValueAtTime(0.35 * _sfxVol, st2 + 0.02);
  sg.gain.exponentialRampToValueAtTime(0.001, st2 + 0.38);
  sg.connect(c.destination);
  const so = c.createOscillator(); so.type = 'sine'; so.frequency.value = 55;
  so.frequency.exponentialRampToValueAtTime(30, st2 + 0.38);
  so.connect(sg);
  so.start(st2); so.stop(st2 + 0.4);
  so.onended = () => { try { so.disconnect(); sg.disconnect(); } catch (_e) {} };
}

export function sfxFinalNotice() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  // Two-pulse alarm siren: hi-lo alternating square wave bursts
  const pulses: Array<{ freq: number; st: number }> = [
    { freq: 880, st: 0 },
    { freq: 554, st: 0.12 },
    { freq: 880, st: 0.24 },
    { freq: 554, st: 0.36 },
  ];
  pulses.forEach(({ freq, st: offset }) => {
    const st = t + offset;
    const g = c.createGain();
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.32 * _sfxVol, st + 0.01);
    g.gain.setValueAtTime(0.32 * _sfxVol, st + 0.09);
    g.gain.linearRampToValueAtTime(0, st + 0.11);
    g.connect(c.destination);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq; o.connect(g);
    o.start(st); o.stop(st + 0.12);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_e) {} };
  });
  // Tail: descending siren sweep for urgency
  const sw = t + 0.5;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.22 * _sfxVol, sw);
  sg.gain.exponentialRampToValueAtTime(0.001, sw + 0.45);
  sg.connect(c.destination);
  const so = c.createOscillator(); so.type = 'sawtooth';
  so.frequency.setValueAtTime(660, sw);
  so.frequency.exponentialRampToValueAtTime(180, sw + 0.45);
  so.connect(sg);
  so.start(sw); so.stop(sw + 0.46);
  so.onended = () => { try { so.disconnect(); sg.disconnect(); } catch (_e) {} };
}

export function sfxHologramBeamIn() {
  const c = ctx(); const t = c.currentTime;
  const freqs = [220, 440, 660, 880, 1100, 1320, 1100, 880, 660, 440];
  freqs.forEach((f, i) => {
    const g = gain(c, 0.12);
    const o = osc(c, 'sine', f, g);
    const st = t + i * 0.04;
    g.gain.setValueAtTime(0.12 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.06);
    play(o, st, st + 0.065);
  });
  const g2 = gain(c, 0.08);
  const o2 = osc(c, 'sawtooth', 80, g2);
  g2.gain.setValueAtTime(0.08 * _sfxVol, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  play(o2, t, t + 0.5);
}

export function sfxHologramSignalLost() {
  const c = ctx(); const t = c.currentTime;
  const freqs = [880, 660, 440, 220, 110];
  freqs.forEach((f, i) => {
    const g = gain(c, 0.1);
    const o = osc(c, 'square', f, g);
    const st = t + i * 0.06;
    g.gain.setValueAtTime(0.1 * _sfxVol, st);
    g.gain.exponentialRampToValueAtTime(0.001, st + 0.08);
    play(o, st, st + 0.09);
  });
}

// ── Explosion SFX ─────────────────────────────────────────────────────────────
// Heavy weaponized boom. `intensity` ∈ [0..1+] scales magnitude — small frag
// grenades ≈ 0.4, big bombs ≈ 1.0, vehicle/secondary detonations ≈ 1.4.
export function sfxExplosion(intensity = 1) {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  const I = Math.max(0.2, Math.min(1.6, intensity));

  // Sub-bass thump — kick the chest.
  const subG = c.createGain();
  subG.gain.setValueAtTime(0.85 * I * _sfxVol, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.45 + 0.2 * I);
  subG.connect(c.destination);
  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120 * I, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.5);
  sub.connect(subG);
  sub.start(t); sub.stop(t + 0.55 + 0.2 * I);
  sub.onended = () => { try { sub.disconnect(); subG.disconnect(); } catch (_e) {} };

  // Mid crack — low square swept down, FM'd by a noise burst.
  const midG = c.createGain();
  midG.gain.setValueAtTime(0.55 * I * _sfxVol, t);
  midG.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  midG.connect(c.destination);
  const mid = c.createOscillator();
  mid.type = 'square';
  mid.frequency.setValueAtTime(220 * I, t);
  mid.frequency.exponentialRampToValueAtTime(60, t + 0.22);
  mid.connect(midG);
  mid.start(t); mid.stop(t + 0.34);
  mid.onended = () => { try { mid.disconnect(); midG.disconnect(); } catch (_e) {} };

  // White noise rumble — long tail, low-passed for distant thunder feel.
  const noiseDur = 1.1 + I * 0.8;
  const buf = c.createBuffer(1, c.sampleRate * noiseDur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.pow(1 - i / d.length, 1.6);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const nSrc = c.createBufferSource(); nSrc.buffer = buf;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900 * I, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + noiseDur);
  const nG = c.createGain();
  nG.gain.setValueAtTime(0.6 * I * _sfxVol, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + noiseDur);
  nSrc.connect(lp); lp.connect(nG); nG.connect(c.destination);
  nSrc.start(t); nSrc.stop(t + noiseDur);
  nSrc.onended = () => { try { nSrc.disconnect(); lp.disconnect(); nG.disconnect(); } catch (_e) {} };

  // Crackle/debris — short bandpass noise hits scattered after the boom.
  for (let k = 0; k < 4; k++) {
    const off = 0.05 + k * 0.04 + Math.random() * 0.05;
    const dur = 0.04 + Math.random() * 0.05;
    const cb = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cd.length);
    const cs = c.createBufferSource(); cs.buffer = cb;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 2500; bp.Q.value = 0.8;
    const cg = c.createGain();
    cg.gain.value = 0.18 * I * _sfxVol;
    cs.connect(bp); bp.connect(cg); cg.connect(c.destination);
    cs.start(t + off); cs.stop(t + off + dur);
    cs.onended = () => { try { cs.disconnect(); bp.disconnect(); cg.disconnect(); } catch (_e) {} };
  }
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

// ── Cinematic cues ────────────────────────────────────────────────────────────
// Used by the PostOnboardingIntro cinematic (the elevator first-day arrival).
// Kept clean and bell-like so the moment lands without UI buzz.

// Elevator "you have arrived" chime — a pristine two-tone bell (E6 → C6) with a
// soft octave partial for shimmer and a long exponential decay. Not a buzzer.
export function sfxElevatorChime() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  const tones = [
    { f: 1318.51, at: 0 },     // E6
    { f: 1046.50, at: 0.22 },  // C6
  ];
  for (const { f, at } of tones) {
    const st = t + at;
    const g = c.createGain();
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.16 * _sfxVol, st + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 1.15);
    g.connect(c.destination);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g);
    o.start(st); o.stop(st + 1.2);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_e) {} };
    // Glassy octave partial for bell shimmer.
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, st);
    g2.gain.linearRampToValueAtTime(0.04 * _sfxVol, st + 0.012);
    g2.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);
    g2.connect(c.destination);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01; o2.connect(g2);
    o2.start(st); o2.stop(st + 0.6);
    o2.onended = () => { try { o2.disconnect(); g2.disconnect(); } catch (_e) {} };
  }
}

// Pneumatic doors sliding open — a soft band of filtered noise that swells in
// then settles as the lowpass sweeps up and back down, over a low rail rumble.
export function sfxDoorSlide() {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;
  const dur = 1.25;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.sin((i / d.length) * Math.PI); // swell in then out
    d[i] = (Math.random() * 2 - 1) * env * 0.5;
  }
  const src = c.createBufferSource(); src.buffer = buf;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(280, t);
  lp.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.6);
  lp.frequency.exponentialRampToValueAtTime(520, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16 * _sfxVol, t + 0.12);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(lp); lp.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur);
  src.onended = () => { try { src.disconnect(); lp.disconnect(); g.disconnect(); } catch (_e) {} };
  // Low rail rumble under the slide.
  const rg = c.createGain();
  rg.gain.setValueAtTime(0.06 * _sfxVol, t);
  rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  rg.connect(c.destination);
  const ro = c.createOscillator(); ro.type = 'sine'; ro.frequency.value = 70; ro.connect(rg);
  ro.start(t); ro.stop(t + dur);
  ro.onended = () => { try { ro.disconnect(); rg.disconnect(); } catch (_e) {} };
}

// ── Music ─────────────────────────────────────────────────────────────────────

let _scoreMuted = false;

export function initMusic(_src?: string) {}

export function playMusic() {
  if (!_scoreMuted) startAmbient();
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
export function getScoreMuted(): boolean { return _scoreMuted; }

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

export function toggleMusicMute(): boolean {
  _musicMuted = !_musicMuted;
  _applyAmbientVolume();
  return _musicMuted;
}

export function toggleScoreMute(): boolean {
  _scoreMuted = !_scoreMuted;
  if (_scoreMuted) {
    stopAmbient();
  } else if (!_muted && !_musicMuted) {
    startAmbient();
  }
  _applyAmbientVolume();
  return _scoreMuted;
}

export function setMusicMuted(m: boolean) { _musicMuted = m; _applyAmbientVolume(); }
export function setScoreMuted(m: boolean) {
  _scoreMuted = m;
  if (m) stopAmbient();
  else if (!_muted && !_musicMuted) startAmbient();
  _applyAmbientVolume();
}

let _ambientRadioLastPlay = 0;
// ── NPC Ambient Vocalizations (Vietnamese-cadence tonal murmurs) ──────────────
// Generates short, subdued non-verbal vocalizations with rising/falling tones
// resembling Vietnamese speech patterns — like Simlish but quieter.
export function sfxNpcMurmur(npcSeed = 0) {
  if (_sfxMuted) return;
  const c = ctx(); const t = c.currentTime;

  const masterG = c.createGain();
  const vol = 0.045 + (((npcSeed * 7 + 3) % 10) / 10) * 0.02;
  masterG.gain.setValueAtTime(0, t);
  masterG.gain.linearRampToValueAtTime(vol * _sfxVol, t + 0.04);
  masterG.connect(c.destination);

  // Pick a base pitch seeded per NPC (80–240 Hz range — human vocal range)
  const basePitch = 90 + ((npcSeed * 13 + 7) % 30) * 5;

  // Vietnamese-like tonal patterns: sequences of rising, falling, level tones
  const TONE_PATTERNS: Array<[number, number][]> = [
    [[1.0, 1.3], [1.3, 1.0]],              // rising-falling (hỏi tone)
    [[1.0, 1.0], [1.0, 1.4]],              // level then rise (sắc tone)
    [[1.2, 0.8], [0.8, 0.6]],              // falling drop (huyền tone)
    [[1.0, 1.5], [1.5, 0.9], [0.9, 1.1]], // dipping rise (ngã tone)
    [[1.0, 0.9], [0.9, 0.9]],              // low level (nặng)
  ];
  const pattern = TONE_PATTERNS[(npcSeed + Math.floor(Math.random() * 2)) % TONE_PATTERNS.length];

  // Vowel formants — approximate the nasal/open vowel quality of Vietnamese
  const fmtFreq1 = 500 + ((npcSeed * 5) % 200);
  const fmtFreq2 = 1200 + ((npcSeed * 11) % 400);

  let segT = t;
  for (const [startMult, endMult] of pattern) {
    const segDur = 0.12 + Math.random() * 0.1;
    const startFreq = basePitch * startMult;
    const endFreq = basePitch * endMult;

    // Main vocal tone (sine — soft, non-buzzy)
    const vocalG = c.createGain();
    vocalG.gain.setValueAtTime(0.6, segT);
    vocalG.gain.linearRampToValueAtTime(0.8, segT + segDur * 0.3);
    vocalG.gain.linearRampToValueAtTime(0, segT + segDur);

    const fmt1 = c.createBiquadFilter();
    fmt1.type = 'bandpass';
    fmt1.frequency.value = fmtFreq1;
    fmt1.Q.value = 4;

    const fmt2 = c.createBiquadFilter();
    fmt2.type = 'bandpass';
    fmt2.frequency.value = fmtFreq2;
    fmt2.Q.value = 3;

    const vocalOsc = c.createOscillator();
    vocalOsc.type = 'sawtooth';
    vocalOsc.frequency.setValueAtTime(startFreq, segT);
    vocalOsc.frequency.linearRampToValueAtTime(endFreq, segT + segDur);
    vocalOsc.detune.value = (npcSeed % 5) * 3 - 7;

    vocalOsc.connect(fmt1);
    vocalOsc.connect(fmt2);
    fmt1.connect(vocalG);
    fmt2.connect(vocalG);
    vocalG.connect(masterG);

    vocalOsc.start(segT);
    vocalOsc.stop(segT + segDur + 0.01);
    vocalOsc.onended = () => {
      try { vocalOsc.disconnect(); fmt1.disconnect(); fmt2.disconnect(); vocalG.disconnect(); } catch (_) {}
    };

    segT += segDur + 0.02 + Math.random() * 0.04;
  }

  const totalDur = segT - t + 0.15;
  masterG.gain.setTargetAtTime(0, segT - 0.08, 0.06);
  setTimeout(() => { try { masterG.disconnect(); } catch (_) {} }, (totalDur + 0.3) * 1000);
}

export function sfxAmbientRadio(playerX: number, playerY: number, srcX: number, srcY: number) {
  const now = performance.now();
  if (now - _ambientRadioLastPlay < 3000) return;
  const sv = spatialVolume(playerX, playerY, srcX, srcY, 400);
  if (sv < 0.03) return;
  _ambientRadioLastPlay = now;
  const c = ctx(); const t = c.currentTime;
  const dur = 2 + Math.random() * 1.5;
  const g = spatialGain(c, 0.06, sv);
  const baseFreq = 220 + Math.random() * 110;
  const o1 = osc(c, 'sine', baseFreq, g);
  const o2 = osc(c, 'triangle', baseFreq * 1.5, g);
  g.gain.setValueAtTime(g.gain.value * 0.3, t);
  g.gain.linearRampToValueAtTime(g.gain.value || 0.02, t + 0.3);
  g.gain.setTargetAtTime(0, t + dur - 0.5, 0.2);
  play(o1, t, t + dur);
  play(o2, t, t + dur);
}

export function resumeAudioContext() {
  _ctx?.resume();
}

// ── Procedural Synthwave Ambient Soundtrack (Multi-Track) ─────────────────────

interface AmbientNode {
  node: AudioNode;
  stop?: () => void;
}

interface SoundtrackTrack {
  name: string;
  bpm: number;
  chords: number[][];
  padWave: OscillatorType;
  arpWave: OscillatorType;
  filterCutoff: number;
  padVol: number;
  arpVol: number;
  bassVol: number;
}

const SOUNDTRACK_TRACKS: SoundtrackTrack[] = [
  { name: 'NEON DRIFT', bpm: 108, chords: [[261.63,311.13,392.00],[220.00,261.63,329.63],[293.66,349.23,440.00],[246.94,293.66,369.99]], padWave: 'sawtooth', arpWave: 'square', filterCutoff: 800, padVol: 0.045, arpVol: 0.06, bassVol: 0.08 },
  { name: 'SHADOW PROTOCOL', bpm: 92, chords: [[196.00,246.94,293.66],[174.61,220.00,261.63],[164.81,207.65,246.94],[146.83,174.61,220.00]], padWave: 'sine', arpWave: 'triangle', filterCutoff: 600, padVol: 0.035, arpVol: 0.04, bassVol: 0.06 },
  { name: 'MINX AFTER DARK', bpm: 120, chords: [[329.63,392.00,493.88],[293.66,349.23,440.00],[261.63,329.63,392.00],[220.00,277.18,329.63]], padWave: 'sawtooth', arpWave: 'sawtooth', filterCutoff: 1000, padVol: 0.04, arpVol: 0.07, bassVol: 0.09 },
  { name: 'WASTELAND HYMN', bpm: 80, chords: [[130.81,164.81,196.00],[146.83,174.61,220.00],[123.47,155.56,196.00],[110.00,138.59,164.81]], padWave: 'triangle', arpWave: 'sine', filterCutoff: 500, padVol: 0.05, arpVol: 0.03, bassVol: 0.07 },
  { name: 'CORPO PULSE', bpm: 130, chords: [[349.23,440.00,523.25],[293.66,369.99,440.00],[329.63,415.30,493.88],[261.63,329.63,392.00]], padWave: 'square', arpWave: 'square', filterCutoff: 1200, padVol: 0.03, arpVol: 0.08, bassVol: 0.10 },
];

let _ambientNodes: AmbientNode[] = [];
let _ambientMaster: GainNode | null = null;
let _ambientRunning = false;
let _ambientTimers: ReturnType<typeof setTimeout>[] = [];
let _arpInterval: ReturnType<typeof setInterval> | null = null;
let _snareInterval: ReturnType<typeof setInterval> | null = null;
let _bassInterval: ReturnType<typeof setInterval> | null = null;
let _currentTrackIdx = 0;
let _trackShuffleOrder: number[] = [];
let _trackShufflePos = 0;
let _trackRotateTimer: ReturnType<typeof setTimeout> | null = null;

function _shuffleTracks() {
  _trackShuffleOrder = SOUNDTRACK_TRACKS.map((_, i) => i);
  for (let i = _trackShuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [_trackShuffleOrder[i], _trackShuffleOrder[j]] = [_trackShuffleOrder[j], _trackShuffleOrder[i]];
  }
  _trackShufflePos = 0;
}

function _nextTrack() {
  if (_trackShuffleOrder.length === 0) _shuffleTracks();
  _trackShufflePos = (_trackShufflePos + 1) % _trackShuffleOrder.length;
  if (_trackShufflePos === 0) _shuffleTracks();
  _currentTrackIdx = _trackShuffleOrder[_trackShufflePos];
}

function _getCurrentTrack(): SoundtrackTrack {
  return SOUNDTRACK_TRACKS[_currentTrackIdx] ?? SOUNDTRACK_TRACKS[0];
}

export function getCurrentTrackName(): string { return _getCurrentTrack().name; }
export function getTrackCount(): number { return SOUNDTRACK_TRACKS.length; }
export function skipTrack() {
  if (!_ambientRunning) return;
  stopAmbient();
  _nextTrack();
  startAmbient();
}

const BEAT_FN = () => 60 / _getCurrentTrack().bpm;

const CHORD_PROG_FN = () => _getCurrentTrack().chords;

function _applyAmbientVolume() {
  if (_ambientMaster) {
    const c = ctx();
    const target = (_muted || _musicMuted) ? 0 : _musicVol;
    _ambientMaster.gain.cancelScheduledValues(c.currentTime);
    _ambientMaster.gain.setTargetAtTime(target, c.currentTime, 0.05);
  }
  // Keep the meditative office bed in lockstep with the same gate (it tracks
  // `_musicVol`, so AMBIANCE-off / mute / voice-ducking all reach it here).
  _applyOfficeAmbientVolume();
  // When the user mutes everything, the world isn't truly silent — a darker
  // anxiety drone takes the soundtrack's place. When they unmute, fade out.
  if (_muted) {
    _startMutedAmbient();
  } else {
    _stopMutedAmbient();
  }
}

function startAmbient() {
  if (_ambientRunning) return;
  // World score is a background-music tier: claim ownership so any other tier
  // (office bed, radio, Hummingbird) that was playing gets paused.
  claimBackgroundAudio(BG_OWNERS.worldScore);
  _ambientRunning = true;
  const c = ctx();

  _ambientMaster = c.createGain();
  _ambientMaster.gain.value = 0;
  _ambientMaster.connect(c.destination);

  const masterTarget = (_muted || _musicMuted) ? 0 : _musicVol;
  _ambientMaster.gain.setTargetAtTime(masterTarget, c.currentTime, 2.0);

  const track = _getCurrentTrack();
  _createSynthPads(c, track);
  _startArpeggio(c, track);
  _startSubBass(c, track);
  _startSnareAccents(c);

  if (_trackRotateTimer) clearTimeout(_trackRotateTimer);
  _trackRotateTimer = setTimeout(() => {
    if (_ambientRunning && !_scoreMuted) {
      stopAmbient();
      _nextTrack();
      startAmbient();
    }
  }, 90000 + Math.random() * 30000);
}

function _createSynthPads(c: AudioContext, track: SoundtrackTrack) {
  const padFreqs = track.chords[0] ?? [130.81, 196.00, 261.63];
  for (const freq of padFreqs) {
    const g = c.createGain();
    g.gain.value = track.padVol;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = track.filterCutoff;
    flt.Q.value = 0.7;
    flt.connect(_ambientMaster!);
    g.connect(flt);

    const o1 = c.createOscillator();
    o1.type = track.padWave;
    o1.frequency.value = freq;
    o1.detune.value = -12;
    o1.connect(g);
    o1.start();

    const o2 = c.createOscillator();
    o2.type = track.padWave;
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
  const BEAT = BEAT_FN();
  const chordProg = CHORD_PROG_FN();
  const padSweep = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = chordProg[chordIdx % chordProg.length];
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

function _startArpeggio(c: AudioContext, track: SoundtrackTrack) {
  let step = 0;
  let chordIdx = 0;
  const BEAT = 60 / track.bpm;
  const chordProg = track.chords;
  const arpNote = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = chordProg[chordIdx % chordProg.length];
    const pattern = [0, 1, 2, 1, 0, 2, 1, 0];
    const noteIdx = pattern[step % pattern.length];
    const freq = chord[noteIdx];

    const now = c.currentTime;
    const dur = BEAT * 0.4;

    const g = c.createGain();
    g.gain.setValueAtTime(track.arpVol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, now);
    flt.frequency.exponentialRampToValueAtTime(800, now + dur);
    flt.Q.value = 2;
    flt.connect(_ambientMaster!);
    g.connect(flt);

    const o = c.createOscillator();
    o.type = track.arpWave;
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

function _startSubBass(c: AudioContext, track: SoundtrackTrack) {
  let chordIdx = 0;
  const BEAT = 60 / track.bpm;
  const chordProg = track.chords;
  const bassHit = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    const chord = chordProg[chordIdx % chordProg.length];
    const rootFreq = chord[0] * 0.25;
    const now = c.currentTime;
    const dur = BEAT * 0.8;

    const g = c.createGain();
    g.gain.setValueAtTime(track.bassVol, now);
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
  // Soundtrack simplification: snare accents are the noisiest element of the
  // mix and the user asked for "less complicated" music. Drop the per-bar
  // probability and halve the cadence so the snare is a sparse hint, not a
  // beat that fights the pads/arp.
  const fireSnare = () => {
    if (!_ambientRunning || !_ambientMaster) return;
    if (Math.random() > 0.12) return;

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

  _snareInterval = setInterval(fireSnare, BEAT_FN() * 4 * 1000);
}

// ── Muted Mode: Anxiety / Dark-Wave Drone ─────────────────────────────────────
// When the user mutes everything, the world isn't really silent — a quieter,
// dread-coloured drone takes over. Two detuned sub-octave sines + a slow
// dissonant minor-second pad + filtered breath noise = that "the room is too
// quiet" feeling. Designed to sit BELOW conversational hearing and NEVER feel
// musical.
let _mutedRunning = false;
let _mutedMaster: GainNode | null = null;
let _mutedNodes: AmbientNode[] = [];
let _mutedTimers: ReturnType<typeof setTimeout>[] = [];
let _mutedPadInterval: ReturnType<typeof setInterval> | null = null;

function _startMutedAmbient() {
  if (_mutedRunning) return;
  _mutedRunning = true;
  const c = ctx();

  _mutedMaster = c.createGain();
  _mutedMaster.gain.value = 0;
  _mutedMaster.connect(c.destination);
  // Final muted-mode level is tiny — this is meant to *underline* silence,
  // not replace music. Rises slowly.
  _mutedMaster.gain.setTargetAtTime(0.10, c.currentTime, 1.6);

  // Two detuned sub-bass drones, very low. Slight beating between them.
  const droneFreqs: Array<[number, number]> = [[55, -7], [55, 7], [82.4, -5]];
  for (const [f, detune] of droneFreqs) {
    const g = c.createGain();
    g.gain.value = 0.32;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.6;
    lp.connect(_mutedMaster);
    g.connect(lp);
    const o = c.createOscillator();
    o.type = 'sine'; o.frequency.value = f; o.detune.value = detune;
    o.connect(g);
    o.start();
    _mutedNodes.push(
      { node: o, stop: () => { try { o.stop(); } catch (_e) {} } },
      { node: g }, { node: lp },
    );
  }

  // Slow LFO modulating the master so the drone "breathes" — adds anxiety.
  const lfoG = c.createGain();
  lfoG.gain.value = 0.04;
  const lfo = c.createOscillator();
  lfo.type = 'sine'; lfo.frequency.value = 0.08;
  lfo.connect(lfoG);
  lfoG.connect(_mutedMaster.gain);
  lfo.start();
  _mutedNodes.push(
    { node: lfo, stop: () => { try { lfo.stop(); } catch (_e) {} } },
    { node: lfoG },
  );

  // Wind/breath layer: filtered pink-ish noise, very quiet.
  const noiseLen = c.sampleRate * 6;
  const nb = c.createBuffer(1, noiseLen, c.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1);
  const nSrc = c.createBufferSource();
  nSrc.buffer = nb; nSrc.loop = true;
  const nlp = c.createBiquadFilter();
  nlp.type = 'lowpass'; nlp.frequency.value = 420; nlp.Q.value = 0.5;
  const nhp = c.createBiquadFilter();
  nhp.type = 'highpass'; nhp.frequency.value = 60;
  const nG = c.createGain(); nG.gain.value = 0.18;
  nSrc.connect(nhp); nhp.connect(nlp); nlp.connect(nG); nG.connect(_mutedMaster);
  nSrc.start();
  _mutedNodes.push(
    { node: nSrc, stop: () => { try { nSrc.stop(); } catch (_e) {} } },
    { node: nlp }, { node: nhp }, { node: nG },
  );

  // Sparse dissonant pad notes — minor-second cluster, played every 8–16s,
  // very long attack/release. Suggests something out there.
  const DARK_NOTES = [82.4, 87.3, 130.8, 138.6]; // E2, F2, C3, Db3
  const padTick = () => {
    if (!_mutedRunning || !_mutedMaster) return;
    const now = c.currentTime;
    const dur = 5 + Math.random() * 4;
    const pickN = 2 + Math.floor(Math.random() * 2);
    const used = new Set<number>();
    for (let k = 0; k < pickN; k++) {
      let idx = Math.floor(Math.random() * DARK_NOTES.length);
      while (used.has(idx)) idx = (idx + 1) % DARK_NOTES.length;
      used.add(idx);
      const f = DARK_NOTES[idx];
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.07, now + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, now + dur);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 1.2;
      lp.connect(_mutedMaster!);
      g.connect(lp);
      const o = c.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(g);
      o.start(now); o.stop(now + dur + 0.2);
      o.onended = () => { try { o.disconnect(); g.disconnect(); lp.disconnect(); } catch (_e) {} };
    }
  };
  // First pad note ~3s in, then every 9–18s.
  const seed = setTimeout(padTick, 3000);
  _mutedTimers.push(seed);
  _mutedPadInterval = setInterval(() => { if (Math.random() < 0.6) padTick(); }, 9000 + Math.random() * 9000);
}

function _stopMutedAmbient() {
  if (!_mutedRunning) return;
  _mutedRunning = false;
  for (const tid of _mutedTimers) clearTimeout(tid);
  _mutedTimers = [];
  if (_mutedPadInterval) { clearInterval(_mutedPadInterval); _mutedPadInterval = null; }
  const oldNodes = _mutedNodes;
  const oldMaster = _mutedMaster;
  _mutedNodes = [];
  _mutedMaster = null;
  if (_ctx && oldMaster) {
    oldMaster.gain.cancelScheduledValues(_ctx.currentTime);
    oldMaster.gain.setTargetAtTime(0, _ctx.currentTime, 0.6);
  }
  setTimeout(() => {
    for (const n of oldNodes) { try { n.stop?.(); n.node.disconnect(); } catch (_e) {} }
    if (oldMaster) { try { oldMaster.disconnect(); } catch (_e) {} }
  }, 1500);
}

let _teardownTimer: ReturnType<typeof setTimeout> | null = null;

function stopAmbient() {
  if (!_ambientRunning) return;
  _ambientRunning = false;
  releaseBackgroundAudio(BG_OWNERS.worldScore);

  for (const tid of _ambientTimers) clearTimeout(tid);
  _ambientTimers = [];
  if (_arpInterval) { clearInterval(_arpInterval); _arpInterval = null; }
  if (_snareInterval) { clearInterval(_snareInterval); _snareInterval = null; }
  if (_bassInterval) { clearInterval(_bassInterval); _bassInterval = null; }
  if (_teardownTimer) { clearTimeout(_teardownTimer); _teardownTimer = null; }
  if (_trackRotateTimer) { clearTimeout(_trackRotateTimer); _trackRotateTimer = null; }

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

// ── Quiet Meditative Office Ambient ───────────────────────────────────────────
// A calm, slow pad bed for the OFFICE scene — deliberately NOT the aggressive
// synthwave score. Warm low drone + slow chord swells + sparse soft chimes.
// It gates its loudness through the SAME `_musicVol` path the synthwave bed uses
// (see `_applyOfficeAmbientVolume`, called from `_applyAmbientVolume`), so it
// automatically respects master mute, the AMBIANCE on/off toggle, and voice
// ducking without any extra wiring. Started/stopped by the office page only.
let _officeNodes: AmbientNode[] = [];
let _officeMaster: GainNode | null = null;
let _officeRunning = false;
let _officeTimers: ReturnType<typeof setTimeout>[] = [];

// Slow, restful progression in a warm low register (C → Am → F → Gsus).
const OFFICE_CHORDS: number[][] = [
  [130.81, 196.00, 246.94, 392.00], // C  G  B  G(8va)
  [110.00, 164.81, 220.00, 329.63], // A  E  A  E(8va)
  [174.61, 220.00, 261.63, 349.23], // F  A  C  F(8va)
  [146.83, 196.00, 293.66, 392.00], // D  G  D  G  (Gsus-ish resolve)
];

// Track the same gate as the main ambient bed, just a touch quieter & calmer.
function _officeTargetVol(): number {
  return (_muted || _musicMuted) ? 0 : _musicVol * 0.85;
}

function _applyOfficeAmbientVolume() {
  if (!_officeMaster || !_ctx) return;
  const target = _officeTargetVol();
  _officeMaster.gain.cancelScheduledValues(_ctx.currentTime);
  _officeMaster.gain.setTargetAtTime(target, _ctx.currentTime, 0.3);
}

// Track a transient swell/chime voice so stopOfficeAmbient() can force-stop ALL
// outstanding oscillators immediately (not let them ring out for up to ~11s) and
// so they don't accumulate in _officeNodes across a long session. Self-removes
// from the registry when the voice ends naturally.
function _registerOfficeVoice(o: OscillatorNode, cleanup: () => void) {
  const entry: AmbientNode = { node: o, stop: () => { try { o.stop(); } catch (_e) {} } };
  _officeNodes.push(entry);
  o.onended = () => {
    cleanup();
    const i = _officeNodes.indexOf(entry);
    if (i >= 0) _officeNodes.splice(i, 1);
  };
}

export function startOfficeAmbient() {
  if (_officeRunning) return;
  // Office bed is a background-music tier: claim ownership so any other tier
  // (world score, radio, Hummingbird) that was playing gets paused.
  claimBackgroundAudio(BG_OWNERS.officeAmbient);
  _officeRunning = true;
  const c = ctx();

  _officeMaster = c.createGain();
  _officeMaster.gain.value = 0;
  _officeMaster.connect(c.destination);
  _officeMaster.gain.setTargetAtTime(_officeTargetVol(), c.currentTime, 3.0);

  // Sustained warm drone (root + fifth), gently detuned for slow movement.
  for (const f of [65.41, 98.00]) { // C2, G2
    const g = c.createGain(); g.gain.value = 0.05;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 420; flt.Q.value = 0.5;
    flt.connect(_officeMaster); g.connect(flt);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = f; o1.detune.value = -6; o1.connect(g); o1.start();
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f; o2.detune.value = 7; o2.connect(g); o2.start();
    _officeNodes.push(
      { node: o1, stop: () => { try { o1.stop(); } catch (_e) {} } },
      { node: o2, stop: () => { try { o2.stop(); } catch (_e) {} } },
      { node: g }, { node: flt },
    );
  }

  // Slow chord swells — each chord fades in, sustains, fades out over ~11s.
  let idx = 0;
  const swell = () => {
    if (!_officeRunning || !_officeMaster) return;
    const chord = OFFICE_CHORDS[idx % OFFICE_CHORDS.length]; idx++;
    const now = c.currentTime;
    const dur = 11;
    for (const freq of chord) {
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.022, now + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, now + dur);
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 0.6;
      flt.connect(_officeMaster); g.connect(flt);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.detune.value = Math.random() * 8 - 4;
      o.connect(g); o.start(now); o.stop(now + dur + 0.2);
      _registerOfficeVoice(o, () => { try { o.disconnect(); g.disconnect(); flt.disconnect(); } catch (_e) {} });
    }
    const tid = setTimeout(swell, (dur - 1) * 1000);
    _officeTimers.push(tid);
  };
  swell();

  // Sparse, soft chimes for a meditative texture (calm pentatonic, long decay).
  const chime = () => {
    if (!_officeRunning || !_officeMaster) return;
    const now = c.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99]; // C5 D5 E5 G5
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.018, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
    g.connect(_officeMaster);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.connect(g);
    o.start(now); o.stop(now + 3.6);
    _registerOfficeVoice(o, () => { try { o.disconnect(); g.disconnect(); } catch (_e) {} });
    const tid = setTimeout(chime, 9000 + Math.random() * 11000);
    _officeTimers.push(tid);
  };
  const ctid = setTimeout(chime, 6000 + Math.random() * 6000);
  _officeTimers.push(ctid);
}

export function stopOfficeAmbient() {
  if (!_officeRunning) return;
  _officeRunning = false;
  releaseBackgroundAudio(BG_OWNERS.officeAmbient);

  for (const tid of _officeTimers) clearTimeout(tid);
  _officeTimers = [];

  const oldNodes = _officeNodes;
  const oldMaster = _officeMaster;
  _officeNodes = [];
  _officeMaster = null;

  const c = _ctx;
  if (c && oldMaster) {
    oldMaster.gain.cancelScheduledValues(c.currentTime);
    oldMaster.gain.setTargetAtTime(0, c.currentTime, 0.4);
  }
  setTimeout(() => {
    for (const n of oldNodes) {
      if (n.stop) try { n.stop(); } catch (_e) {}
      try { n.node.disconnect(); } catch (_e) {}
    }
    if (oldMaster) { try { oldMaster.disconnect(); } catch (_e) {} }
  }, 800);
}

// ── Shadow Tower public-space audio ─────────────────────────────────────────
// A single owner for elevator/lobby ambience and the deliberately different
// Shadow floor bed. The nodes are force-stopped on route changes so the
// elevator motif never leaks into another scene.
let _towerAmbientNodes: AmbientNode[] = [];
let _towerAmbientMaster: GainNode | null = null;
let _towerAmbientRunning = false;
export function startTowerAmbient(kind: "lobby" | "shadow" = "lobby") {
  if (_towerAmbientRunning) return;
  _towerAmbientRunning = true;
  const c = ctx();
  _towerAmbientMaster = c.createGain();
  _towerAmbientMaster.gain.value = 0;
  _towerAmbientMaster.connect(c.destination);
  _towerAmbientMaster.gain.setTargetAtTime((_muted || _musicMuted) ? 0 : _musicVol * (kind === "shadow" ? 0.72 : 0.38), c.currentTime, 1.4);
  const notes = kind === "shadow" ? [38.89, 46.25, 58.27] : [196, 246.94, 293.66];
  for (const [index, frequency] of notes.entries()) {
    const gainNode = c.createGain();
    gainNode.gain.value = kind === "shadow" ? 0.06 : 0.025;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "shadow" ? 280 : 1200;
    filter.connect(_towerAmbientMaster);
    gainNode.connect(filter);
    const oscillator = c.createOscillator();
    oscillator.type = kind === "shadow" ? (index === 0 ? "sawtooth" : "sine") : "triangle";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = index * 4;
    oscillator.connect(gainNode);
    oscillator.start();
    _towerAmbientNodes.push(
      { node: oscillator, stop: () => { try { oscillator.stop(); } catch (_e) {} } },
      { node: gainNode }, { node: filter },
    );
  }
}
export function stopTowerAmbient() {
  if (!_towerAmbientRunning) return;
  _towerAmbientRunning = false;
  _towerAmbientMaster?.gain.setTargetAtTime(0, _ctx?.currentTime ?? 0, 0.25);
  for (const entry of _towerAmbientNodes) { try { entry.stop?.(); entry.node.disconnect(); } catch (_e) {} }
  _towerAmbientNodes = [];
  try { _towerAmbientMaster?.disconnect(); } catch (_e) {}
  _towerAmbientMaster = null;
}

// Enclosed elevator bed: a low motor hum, a quiet fluorescent tone, and a
// repeating lift pulse. It has its own owner so it cannot leak into the lobby
// directory or into a destination floor.
let _elevatorAmbientNodes: AmbientNode[] = [];
let _elevatorAmbientMaster: GainNode | null = null;
let _elevatorAmbientRunning = false;
export function startElevatorAmbient() {
  if (_elevatorAmbientRunning) return;
  _elevatorAmbientRunning = true;
  const c = ctx();
  const master = c.createGain();
  _elevatorAmbientMaster = master;
  master.gain.value = 0;
  master.connect(c.destination);
  master.gain.setTargetAtTime((_muted || _musicMuted) ? 0 : _musicVol * 0.24, c.currentTime, 0.8);

  const addTone = (frequency: number, type: OscillatorType, volume: number, detune = 0) => {
    const oscillator = c.createOscillator();
    const gainNode = c.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    gainNode.gain.value = volume;
    oscillator.connect(gainNode);
    gainNode.connect(master);
    oscillator.start();
    _elevatorAmbientNodes.push(
      { node: oscillator, stop: () => { try { oscillator.stop(); } catch (_e) {} } },
      { node: gainNode },
    );
  };
  addTone(54, "sine", 0.18);
  addTone(108, "triangle", 0.035, 3);
  addTone(220, "sine", 0.018, -4);
}

export function stopElevatorAmbient() {
  if (!_elevatorAmbientRunning) return;
  _elevatorAmbientRunning = false;
  _elevatorAmbientMaster?.gain.setTargetAtTime(0, _ctx?.currentTime ?? 0, 0.18);
  for (const entry of _elevatorAmbientNodes) { try { entry.stop?.(); entry.node.disconnect(); } catch (_e) {} }
  _elevatorAmbientNodes = [];
  try { _elevatorAmbientMaster?.disconnect(); } catch (_e) {}
  _elevatorAmbientMaster = null;
}

export function isOfficeAmbientRunning(): boolean {
  return _officeRunning;
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
  g.gain.value = _sfxMuted ? 0 : vol * _sfxVol * spatialFactor;
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
  const g = c.createGain(); g.gain.value = _sfxMuted ? 0 : 0.04 * _sfxVol;
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
  const g = c.createGain(); g.gain.value = _sfxMuted ? 0 : 0.035 * _sfxVol;
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
  const target = _sfxMuted ? 0 : Math.min(0.12, nearbyNpcCount * 0.012) * _sfxVol;
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

// ── Background-tier coordination ──────────────────────────────────────────────
// Register the two procedural engine tiers with the central coordinator so any
// OTHER tier (radio, Hummingbird) claiming ownership pauses them. (startAmbient /
// startOfficeAmbient claim ownership themselves; these registrations are the
// receiving end.) Function declarations are hoisted, so referencing the stoppers
// here at module load is safe.
registerBackgroundAudio(BG_OWNERS.worldScore, () => stopAmbient());
registerBackgroundAudio(BG_OWNERS.officeAmbient, () => stopOfficeAmbient());

// Force-stop every procedural background source the engine owns: world score,
// office bed, crowd murmur, and the muted-mode anxiety drone. Used by the
// App-level route-change backstop so a page that forgot to clean up cannot leak
// engine audio into the next route. Crowd murmur and the drone are not tiers in
// the coordinator (crowd murmur coexists with the score; the drone only plays
// while everything is muted), so they are stopped explicitly here.
export function stopAllBackgroundAudio() {
  stopAmbient();
  stopOfficeAmbient();
  stopCrowdMurmur();
  _stopMutedAmbient();
}

// ── Voice Actor TTS ───────────────────────────────────────────────────────────
//
// Removed: speakDialog() / cancelSpeech() previously used the browser's
// SpeechSynthesis API. The whole app is ElevenLabs-only — no robotic
// browser voices anywhere. NPC dialog should go through speakGameTTS()
// in src/lib/tts.ts (which routes to /api/game-tts and respects the
// per-character voice mapping in NPC_VOICES).

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
