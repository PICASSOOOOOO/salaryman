import { useCallback, useEffect, useState } from 'react';

/**
 * Central audio-device preference manager.
 *
 * Why this exists:
 *   1. enumerateDevices() returns blank labels until the user has granted
 *      microphone permission. Auto-picking by name pre-permission means we
 *      always end up on the system default — exactly the bug users hit
 *      ("doesn't connect to the right device half the time").
 *   2. There was no user-facing picker, so a user with three mics had no
 *      way to overrule a wrong guess.
 *   3. Plug/unplug events were ignored. Yank AirPods → captured stream is
 *      now silent because the track is bound to a dead device.
 *
 * Preferences are persisted in localStorage so the choice survives reloads
 * and is shared across every voice surface (Pablo intro, World, Console).
 *
 * The hook exports both React state (for selectors) and module-level
 * getters (for non-React modules like tts.ts and use-voice-conversation.ts).
 */

const MIC_KEY = 'pablo.audio.micId';
const SPEAKER_KEY = 'pablo.audio.speakerId';
const CHANGE_EVENT = 'pablo-audio-device-changed';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

// ── Module-level getters/setters (for non-React consumers) ──────────────────

export function getPreferredMicId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(MIC_KEY); } catch { return null; }
}

export function getPreferredSpeakerId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(SPEAKER_KEY); } catch { return null; }
}

export function setPreferredMicId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(MIC_KEY, id);
    else localStorage.removeItem(MIC_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { kind: 'audioinput', deviceId: id } }));
}

export function setPreferredSpeakerId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(SPEAKER_KEY, id);
    else localStorage.removeItem(SPEAKER_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { kind: 'audiooutput', deviceId: id } }));
}

export function onAudioDeviceChanged(
  cb: (detail: { kind: 'audioinput' | 'audiooutput'; deviceId: string | null }) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/**
 * One-shot getUserMedia({ audio:true }) so the browser shows the permission
 * prompt and labels are subsequently populated by enumerateDevices().
 * Stops the stream immediately — we don't want to leave the mic open.
 */
export async function ensureAudioPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

export function supportsSinkId(): boolean {
  return typeof HTMLMediaElement !== 'undefined'
    && 'setSinkId' in HTMLMediaElement.prototype;
}

// ── React hook (for the selector UI) ───────────────────────────────────────

export function useAudioDevices() {
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [micId, setMicIdState] = useState<string | null>(() => getPreferredMicId());
  const [speakerId, setSpeakerIdState] = useState<string | null>(() => getPreferredSpeakerId());

  const refresh = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    let devs: MediaDeviceInfo[] = [];
    try { devs = await navigator.mediaDevices.enumerateDevices(); } catch { return; }
    const ins: AudioDevice[] = devs
      .filter(d => d.kind === 'audioinput' && d.deviceId)
      .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone', kind: 'audioinput' as const }));
    const outs: AudioDevice[] = devs
      .filter(d => d.kind === 'audiooutput' && d.deviceId)
      .map(d => ({ deviceId: d.deviceId, label: d.label || 'Speaker', kind: 'audiooutput' as const }));
    setInputs(ins);
    setOutputs(outs);
    // We have permission iff at least one input has a non-empty label.
    setHasPermission(ins.some(d => !!d.label && d.label !== 'Microphone'));

    // Drop a stale preference whose device has disappeared.
    const curMic = getPreferredMicId();
    if (curMic && !ins.some(d => d.deviceId === curMic)) setPreferredMicId(null);
    const curSp = getPreferredSpeakerId();
    if (curSp && !outs.some(d => d.deviceId === curSp)) setPreferredSpeakerId(null);
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return;
    const h = () => { void refresh(); };
    navigator.mediaDevices.addEventListener('devicechange', h);
    return () => navigator.mediaDevices.removeEventListener('devicechange', h);
  }, [refresh]);

  useEffect(() => {
    return onAudioDeviceChanged((d) => {
      if (d.kind === 'audioinput') setMicIdState(d.deviceId);
      else if (d.kind === 'audiooutput') setSpeakerIdState(d.deviceId);
    });
  }, []);

  const requestPermission = useCallback(async () => {
    const ok = await ensureAudioPermission();
    await refresh();
    return ok;
  }, [refresh]);

  return {
    inputs,
    outputs,
    hasPermission,
    supportsSinkId: supportsSinkId(),
    micId,
    speakerId,
    setMicId: setPreferredMicId,
    setSpeakerId: setPreferredSpeakerId,
    requestPermission,
    refresh,
  };
}
