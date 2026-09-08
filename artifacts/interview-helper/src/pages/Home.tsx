import { apiFetch } from '@/lib/api-client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HummingbirdIcon } from '@/components/HummingbirdIcon';
import { checkSpelling, SpellMatch } from '@/lib/spellcheck';
import { speakWithTTS } from '@/lib/tts';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Bot, ArrowRight, Clock, X, Globe, Brain, Loader2, Send, MessageSquare, Mic, MicOff, Volume2, Layers, Radio } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useAdvisorChat } from '@/hooks/use-interview';
import { useVoiceConversation } from '@/hooks/use-voice-conversation';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { OnboardingModal } from '@/components/OnboardingModal';
import { PrimeAdInterstitial } from '@/components/PrimeAdInterstitial';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { getActiveCityName, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { WebsiteAnalyzer } from '@/components/WebsiteAnalyzer';
import { ProGate } from '@/components/ProGate';
import { useMusicPlayer } from '@/contexts/MusicPlayerContext';

const TRIAL_SEEN_KEY = 'sm_trial_welcome_seen';

const CHAT_STARTERS = [
  'hey i\'m conducting an interview — what tools should i use and can you set it up?',
  'i have a zoom call in 10 minutes, what should i prepare?',
  'can you build me a presentation on why we should expand into insurance?',
  'what\'s the best way to use this app for a sales meeting?',
  'analyze these competitor sites for me',
];

function usePabloVoice() {
  const [isHolding, setIsHolding] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const transcriptRef = useRef('');

  const startHold = useCallback((onTranscript: (text: string) => void) => {
    const W = window as unknown as Record<string, unknown>;
    const SRCtor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void;
    }) | undefined;
    if (!SRCtor) return;

    setIsHolding(true);
    transcriptRef.current = '';
    const rec = new SRCtor();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      const full = Array.from(ev.results).map(r => r[0].transcript).join('');
      transcriptRef.current = full;
    };
    rec.onend = () => {
      setIsHolding(false);
      setIsTranscribing(false);
      recRef.current = null;
      if (transcriptRef.current.trim()) {
        onTranscript(transcriptRef.current.trim());
      }
    };
    rec.onerror = () => {
      setIsHolding(false);
      setIsTranscribing(false);
      recRef.current = null;
    };
    rec.start();
  }, []);

  const stopHold = useCallback(() => {
    if (recRef.current) {
      setIsTranscribing(true);
      recRef.current.stop();
    }
    setIsHolding(false);
  }, []);

  const ttsHandleRef = useRef<{ cancel: () => void } | null>(null);

  const speakResponse = useCallback((text: string) => {
    if (ttsHandleRef.current) {
      ttsHandleRef.current.cancel();
      ttsHandleRef.current = null;
    }
    setIsSpeaking(true);
    ttsHandleRef.current = speakWithTTS(text, () => {
      ttsHandleRef.current = null;
      setIsSpeaking(false);
    }, (_err) => {
      ttsHandleRef.current = null;
      setIsSpeaking(false);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (ttsHandleRef.current) {
      ttsHandleRef.current.cancel();
      ttsHandleRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState('');
  const toggleListenRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelRef = useRef(0);
  const [isTranscribing2, setIsTranscribing2] = useState(false);

  const startWhisperRecording = useCallback(async (onTranscript: (text: string) => void) => {
    onTranscriptRef.current = onTranscript;
    setMicError('');
    setLiveTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      let peakLevel = 0;
      const recordingStartTime = Date.now();
      const checkLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
        audioLevelRef.current = avg;
        if (avg > peakLevel) peakLevel = avg;
        if (mediaRecorderRef.current?.state === 'recording') {
          const elapsed = Math.round((Date.now() - recordingStartTime) / 1000);
          if (avg > 3) {
            setLiveTranscript(`🎤 Recording... ${elapsed}s (level: ${Math.round(avg)})`);
          } else {
            setLiveTranscript(`🎤 Listening... ${elapsed}s (speak louder if silent)`);
          }
          requestAnimationFrame(checkLevel);
        }
      };

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        analyserRef.current = null;
        try { audioCtx.close(); } catch {}

        const chunks = audioChunksRef.current;
        const recordDuration = Math.round((Date.now() - recordingStartTime) / 1000);
        setLiveTranscript(`Recorded ${chunks.length} chunks (${recordDuration}s, peak:${Math.round(peakLevel)}), sending...`);

        if (chunks.length === 0) {
          setMicError('No audio recorded — mic may not be capturing');
          setIsListening(false);
          toggleListenRef.current = null;
          return;
        }

        setIsTranscribing2(true);
        const rawBlob = new Blob(chunks, { type: mimeType });

        // iOS Safari: MediaRecorder emits fragmented audio/mp4 (AAC). The
        // client-side WAV conversion via `new AudioContext({sampleRate:16000})`
        // + decodeAudioData is unreliable on iOS — it often "succeeds" with a
        // silent buffer because iOS rejects non-default sample rates and/or
        // can't decode the still-fragmented mp4. That silent WAV then fools
        // the server's RIFF magic-byte check, ffmpeg gets skipped, and Whisper
        // receives silence → "Pablo can't hear me". Send the raw blob and let
        // server ffmpeg do the conversion (which is robust on every input).
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const skipClientWav = isIOS || isSafari;

        const convertToWav = async (inputBlob: Blob): Promise<Blob> => {
          if (skipClientWav) return inputBlob;
          try {
            const arrayBuf = await inputBlob.arrayBuffer();
            const actx = new AudioContext({ sampleRate: 16000 });
            const decoded = await actx.decodeAudioData(arrayBuf);
            const offline = new OfflineAudioContext(1, decoded.length, 16000);
            const src = offline.createBufferSource();
            src.buffer = decoded;
            src.connect(offline.destination);
            src.start();
            const rendered = await offline.startRendering();
            actx.close();
            const pcm = rendered.getChannelData(0);
            const wavBuf = new ArrayBuffer(44 + pcm.length * 2);
            const view = new DataView(wavBuf);
            const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + pcm.length * 2, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, 16000, true);
            view.setUint32(28, 32000, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, pcm.length * 2, true);
            for (let i = 0; i < pcm.length; i++) {
              const s = Math.max(-1, Math.min(1, pcm[i]));
              view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            return new Blob([wavBuf], { type: 'audio/wav' });
          } catch (e) {
            console.warn('WAV conversion failed, using original:', e);
            return inputBlob;
          }
        };

        const finalBlob = await convertToWav(rawBlob);
        const finalMime = finalBlob.type === 'audio/wav' ? 'audio/wav' : mimeType;

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (!base64) {
            setMicError('Failed to encode audio');
            setIsTranscribing2(false);
            setIsListening(false);
            toggleListenRef.current = null;
            return;
          }
          const sizeKB = Math.round(base64.length / 1024);
          setLiveTranscript(`Transcribing ${sizeKB}KB of audio...`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          apiFetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mimeType: finalMime }),
            signal: controller.signal,
          })
            .then(resp => {
              clearTimeout(timeoutId);
              if (!resp.ok) {
                return resp.text().then(t => {
                  setMicError(`Server error ${resp.status}: ${t.slice(0, 100)}`);
                });
              }
              return resp.json().then((data: { text?: string; rms?: number }) => {
                const text = data?.text?.trim();
                if (text) {
                  setLiveTranscript(text);
                  if (onTranscriptRef.current) onTranscriptRef.current(text);
                } else {
                  const rms = data?.rms ?? '?';
                  setMicError(`No speech detected (RMS: ${rms}, size: ${sizeKB}KB). Audio ${Number(rms) > 50 ? 'has sound but model cant hear speech' : 'appears SILENT - mic not capturing'}`);
                }
              });
            })
            .catch(err => {
              clearTimeout(timeoutId);
              if (err instanceof Error && err.name === 'AbortError') {
                setMicError('Transcription timed out (30s). Try a shorter recording.');
              } else {
                setMicError(`Network error: ${err instanceof Error ? err.message : 'unknown'}`);
              }
              console.error('Whisper fetch error:', err);
            })
            .finally(() => {
              setIsTranscribing2(false);
              setIsListening(false);
              toggleListenRef.current = null;
              mediaRecorderRef.current = null;
              setTimeout(() => setLiveTranscript(''), 3000);
            });
        };
        reader.onerror = () => {
          setMicError('Failed to read audio data');
          setIsTranscribing2(false);
          setIsListening(false);
          toggleListenRef.current = null;
        };
        reader.readAsDataURL(finalBlob);
      };

      setIsListening(true);
      recorder.start(1000);
      toggleListenRef.current = { stop: () => { try { recorder.stop(); } catch {} } };
      requestAnimationFrame(checkLevel);
      setLiveTranscript('🎤 Listening... speak now');

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 15000);

    } catch (err) {
      console.error('getUserMedia error:', err);
      setMicError('Could not access microphone');
      setIsListening(false);
    }
  }, []);

  const recordStartTimeRef = useRef(0);

  const startListening = useCallback((onTranscript: (text: string) => void) => {
    if (toggleListenRef.current) {
      const elapsed = Date.now() - recordStartTimeRef.current;
      if (elapsed < 2000) {
        setLiveTranscript('🎤 Keep speaking... (min 2s)');
        return;
      }
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }
    recordStartTimeRef.current = Date.now();
    startWhisperRecording(onTranscript);
  }, [startWhisperRecording]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }
    if (toggleListenRef.current) {
      toggleListenRef.current.stop();
      toggleListenRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
  }, []);

  return { isHolding, isTranscribing, isSpeaking, isListening, liveTranscript, micError, startHold, stopHold, startListening, stopListening, speakResponse, stopSpeaking };
}

export default function Home() {
  hydrateActiveCityFromSave();
  const [homeLocation, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  usePlan();
  const [trialPopup] = useState(false);
  const dismissTrialPopup = () => {};
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  // Hide the "LATE FOR WORK" intro hook for users who've already completed
  // onboarding — they don't need to be invited back through the front door.
  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem('sm_save');
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { pabloOnboardingDone?: boolean };
      return Boolean(parsed.pabloOnboardingDone);
    } catch { return false; }
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'sm_save') return;
      try {
        const parsed = e.newValue ? (JSON.parse(e.newValue) as { pabloOnboardingDone?: boolean }) : null;
        setOnboardingDone(Boolean(parsed?.pabloOnboardingDone));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  // Auto-funnel: the Tower lobby is the open home for a fresh visitor;
  // immigration is not part of normal entry. Returning users land in their
  // office. Session flag prevents an infinite loop if the user back-navigates
  // to `/`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Home is kept-alive (always mounted, just hidden off-route), so guard the
    // auto-funnel to the actual home route — otherwise it fires on a direct
    // /office load and clobbers the URL (dropping query params like ?embed=1).
    if (homeLocation !== '/') return;
    try {
      if (window.sessionStorage.getItem('sm_intro_redirected') === '1') return;
      window.sessionStorage.setItem('sm_intro_redirected', '1');
    } catch { /* private mode — fall through and redirect once */ }
    navigate(onboardingDone ? '/office' : '/tower', { replace: true });
  }, [onboardingDone, navigate, homeLocation]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const { current: musicCurrent, playing: musicPlaying } = useMusicPlayer();
  const musicActive = Boolean(musicCurrent) && musicPlaying;

  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  const [orgData, setOrgData] = useState<{ org: { id: number; name: string; industry?: string; size?: string } | null; member: { role: string; title?: string; salary?: string; department?: string } | null; members: { userId: string; role: string; inviteEmail?: string; title?: string; status: string }[] } | null>(null);
  const [worldBiz, setWorldBiz] = useState<{ id: number; businessType: string; companyName?: string; industry?: string; companySize?: string; contactEmail?: string; isPaid: boolean }[]>([]);
  const [bizRegOpen, setBizRegOpen] = useState(false);
  const [bizRegForm, setBizRegForm] = useState({ companyName: '', businessType: 'real' as 'real' | 'minx', industry: '', companySize: '', contactEmail: '' });
  const [bizRegLoading, setBizRegLoading] = useState(false);
  const [bizRegError, setBizRegError] = useState('');

  const [translatorText, setTranslatorText] = useState('');
  const [translatorFrom, setTranslatorFrom] = useState(() => localStorage.getItem('sm_xlat_from') ?? 'vi');
  const [translatorTo, setTranslatorTo] = useState(() => localStorage.getItem('sm_xlat_to') ?? 'en');
  const [translatorResult, setTranslatorResult] = useState('');
  const [translatorListening, setTranslatorListening] = useState(false);
  const translatorRecRef = useRef<{ stop: () => void } | null>(null);

  const [dictWord, setDictWord] = useState('');
  const [dictResult, setDictResult] = useState<{ word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; synonyms?: string[] }[] }[] } | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState('');
  const [dictSuggestions, setDictSuggestions] = useState<string[]>([]);
  const [dictThesaurus, setDictThesaurus] = useState<{ synonymsByPos: Record<string, string[]>; antonyms: string[] } | null>(null);
  const [dictListening, setDictListening] = useState(false);
  const dictRecRef = useRef<{ stop: () => void } | null>(null);

  const [thesWord, setThesWord] = useState('');
  const [thesLoading, setThesLoading] = useState(false);
  const [thesError, setThesError] = useState('');
  const [thesSynonyms, setThesSynonyms] = useState<Record<string, string[]>>({});
  const [thesAntonyms, setThesAntonyms] = useState<string[]>([]);
  const [thesRelated, setThesRelated] = useState<string[]>([]);
  const [thesLookedUp, setThesLookedUp] = useState('');
  const [thesListening, setThesListening] = useState(false);
  const thesRecRef = useRef<{ stop: () => void } | null>(null);

  const CCY_LIST = ['USD','EUR','GBP','JPY','CNY','VND','KRW','AUD','CAD','CHF','HKD','SGD','INR','MXN','BRL','THB','PHP','IDR','MYR','NZD','SEK','NOK','DKK','PLN','TRY','ZAR','AED','SAR'];
  const [ccyAmount, setCcyAmount] = useState(() => localStorage.getItem('sm_ccy_amount') ?? '100');
  const [ccyFrom, setCcyFrom] = useState(() => localStorage.getItem('sm_ccy_from') ?? 'USD');
  const [ccyTo, setCcyTo] = useState(() => localStorage.getItem('sm_ccy_to') ?? 'EUR');
  const [ccyResult, setCcyResult] = useState<{ value: number; rate: number; date: string } | null>(null);
  const [ccyLoading, setCcyLoading] = useState(false);
  const [ccyError, setCcyError] = useState('');

  const convertCurrency = useCallback(async () => {
    const amt = parseFloat(ccyAmount);
    if (!isFinite(amt)) { setCcyError('Enter a valid amount'); setCcyResult(null); return; }
    if (ccyFrom === ccyTo) { setCcyResult({ value: amt, rate: 1, date: new Date().toISOString().slice(0,10) }); setCcyError(''); return; }
    setCcyLoading(true); setCcyError('');
    try {
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?amount=${encodeURIComponent(amt)}&base=${ccyFrom}&symbols=${ccyTo}`);
      if (!r.ok) throw new Error('rate fetch failed');
      const d = await r.json();
      const value = d?.rates?.[ccyTo];
      if (typeof value !== 'number') throw new Error('no rate');
      setCcyResult({ value, rate: value / amt, date: d.date || '' });
    } catch {
      setCcyError('Exchange service unavailable.');
      setCcyResult(null);
    }
    setCcyLoading(false);
  }, [ccyAmount, ccyFrom, ccyTo]);

  useEffect(() => { localStorage.setItem('sm_ccy_amount', ccyAmount); }, [ccyAmount]);
  useEffect(() => { localStorage.setItem('sm_ccy_from', ccyFrom); }, [ccyFrom]);
  useEffect(() => { localStorage.setItem('sm_ccy_to', ccyTo); }, [ccyTo]);

  const [calcExpr, setCalcExpr] = useState('');
  const [calcResult, setCalcResult] = useState<string>('');
  const [calcError, setCalcError] = useState('');

  const evalCalc = useCallback((raw: string) => {
    const expr = raw.trim();
    if (!expr) { setCalcResult(''); setCalcError(''); return; }
    // Whitelist: digits, decimal, +-*/(), %, whitespace. Reject anything else.
    if (!/^[\d\s+\-*/().%]+$/.test(expr)) { setCalcError('Invalid characters'); setCalcResult(''); return; }
    try {
      // Treat trailing % as /100 for the preceding number group.
      const safe = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${safe});`)();
      if (typeof v !== 'number' || !isFinite(v)) { setCalcError('Math error'); setCalcResult(''); return; }
      setCalcResult(String(Number(v.toFixed(10))));
      setCalcError('');
    } catch {
      setCalcError('Math error');
      setCalcResult('');
    }
  }, []);

  const calcKey = (k: string) => {
    if (k === 'C') { setCalcExpr(''); setCalcResult(''); setCalcError(''); return; }
    if (k === '⌫') { const n = calcExpr.slice(0, -1); setCalcExpr(n); evalCalc(n); return; }
    if (k === '=') { evalCalc(calcExpr); return; }
    const n = calcExpr + k;
    setCalcExpr(n); evalCalc(n);
  };

  const speechSupported = typeof window !== 'undefined' && !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );

  const startWordSpeech = useCallback((
    setWord: (w: string) => void,
    onWord: (w: string) => void,
    setListening: (v: boolean) => void,
    recRef: React.MutableRefObject<{ stop: () => void } | null>
  ) => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    const W = window as unknown as Record<string, unknown>;
    const SRCtor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void;
    }) | undefined;
    if (!SRCtor) return;
    setListening(true);
    const rec = new SRCtor();
    recRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    let finalWord = '';
    rec.onresult = (ev) => {
      finalWord = Array.from(ev.results).map(r => r[0].transcript).join('').trim().split(/\s+/)[0] ?? '';
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalWord) { setWord(finalWord); onWord(finalWord); }
    };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    rec.start();
  }, []);

  const lookupThesaurus = async (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    setThesLoading(true); setThesError(''); setThesSynonyms({}); setThesAntonyms([]); setThesRelated([]); setThesLookedUp(w);
    try {
      const [synRes, antRes, relRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=25&md=p`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(w)}&max=10`),
        fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(w)}&max=12`),
      ]);
      const synData: { word: string; tags?: string[] }[] = synRes.ok ? await synRes.json() : [];
      const antData: { word: string }[] = antRes.ok ? await antRes.json() : [];
      const relData: { word: string }[] = relRes.ok ? await relRes.json() : [];
      const POS_LABELS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };
      const synonymsByPos: Record<string, string[]> = {};
      for (const item of synData) {
        const posTag = item.tags?.find(t => t in POS_LABELS) ?? 'other';
        const posLabel = POS_LABELS[posTag] ?? posTag;
        if (!synonymsByPos[posLabel]) synonymsByPos[posLabel] = [];
        if (synonymsByPos[posLabel].length < 8) synonymsByPos[posLabel].push(item.word);
      }
      const antonyms = antData.map(d => d.word);
      const synWords = new Set(synData.map(d => d.word));
      const related = relData.filter(d => d.word !== w && !synWords.has(d.word)).map(d => d.word).slice(0, 8);
      if (Object.keys(synonymsByPos).length === 0 && antonyms.length === 0 && related.length === 0) {
        setThesError(`No thesaurus results for "${w}".`);
      } else {
        setThesSynonyms(synonymsByPos);
        setThesAntonyms(antonyms);
        setThesRelated(related);
      }
    } catch { setThesError('Thesaurus service unavailable.'); }
    setThesLoading(false);
  };

  const [notes, setNotes] = useState<{ id: number; text: string; ts: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('sm_notes') ?? '[]'); } catch { return []; }
  });
  const [noteInput, setNoteInput] = useState('');
  const [spellMatches, setSpellMatches] = useState<SpellMatch[]>([]);
  const [spellPopup, setSpellPopup] = useState<{ match: SpellMatch; x: number; y: number } | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const noteWrapperRef = useRef<HTMLDivElement>(null);
  const spellCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { localStorage.setItem('sm_xlat_from', translatorFrom); }, [translatorFrom]);
  useEffect(() => { localStorage.setItem('sm_xlat_to', translatorTo); }, [translatorTo]);
  useEffect(() => { localStorage.setItem('sm_notes', JSON.stringify(notes)); }, [notes]);

  const lookupWord = async (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    setDictLoading(true); setDictError(''); setDictResult(null); setDictSuggestions([]); setDictThesaurus(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
      if (!res.ok) {
        try {
          const [spellRes, soundsRes] = await Promise.all([
            fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&max=5`),
            fetch(`https://api.datamuse.com/words?sl=${encodeURIComponent(w)}&max=3`),
          ]);
          const spellData: { word: string }[] = spellRes.ok ? await spellRes.json() : [];
          const soundsData: { word: string }[] = soundsRes.ok ? await soundsRes.json() : [];
          const seen = new Set<string>();
          const suggestions: string[] = [];
          for (const item of [...spellData, ...soundsData]) {
            if (!seen.has(item.word) && item.word !== w) { seen.add(item.word); suggestions.push(item.word); }
          }
          if (suggestions.length > 0) {
            setDictSuggestions(suggestions.slice(0, 5));
            setDictError(`No definition found for "${w}".`);
          } else {
            setDictError(`No definition found for "${w}".`);
          }
        } catch {
          setDictError(`No definition found for "${w}".`);
        }
        setDictLoading(false);
        return;
      }
      const data = await res.json();
      const entry = data[0];
      setDictResult({ word: entry.word, phonetic: entry.phonetic ?? entry.phonetics?.find((p: { text?: string }) => p.text)?.text, meanings: entry.meanings ?? [] });
      try {
        const [synRes, antRes] = await Promise.all([
          fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20&md=p`),
          fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(w)}&max=10&md=p`),
        ]);
        const synData: { word: string; tags?: string[] }[] = synRes.ok ? await synRes.json() : [];
        const antData: { word: string; tags?: string[] }[] = antRes.ok ? await antRes.json() : [];
        const POS_LABELS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };
        const synonymsByPos: Record<string, string[]> = {};
        for (const item of synData) {
          const posTag = item.tags?.find(t => t in POS_LABELS) ?? 'other';
          const posLabel = POS_LABELS[posTag] ?? posTag;
          if (!synonymsByPos[posLabel]) synonymsByPos[posLabel] = [];
          if (synonymsByPos[posLabel].length < 6) synonymsByPos[posLabel].push(item.word);
        }
        const antonyms = antData.map(d => d.word);
        if (Object.keys(synonymsByPos).length > 0 || antonyms.length > 0) {
          setDictThesaurus({ synonymsByPos, antonyms });
        }
      } catch { }
    } catch { setDictError('Dictionary service unavailable.'); }
    setDictLoading(false);
  };

  const addNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    setNotes(prev => [{ id: Date.now(), text, ts: Date.now() }, ...prev]);
    setNoteInput('');
    setSpellMatches([]);
    setSpellPopup(null);
  };

  const deleteNote = (id: number) => setNotes(prev => prev.filter(n => n.id !== id));

  const handleNoteInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteInput(val);
    setSpellPopup(null);
    if (spellCheckTimerRef.current) clearTimeout(spellCheckTimerRef.current);
    if (!val.trim()) { setSpellMatches([]); return; }
    spellCheckTimerRef.current = setTimeout(async () => {
      const matches = await checkSpelling(val);
      setSpellMatches(matches);
    }, 800);
  };

  const applySpellCorrection = (match: SpellMatch, suggestion: string) => {
    const before = noteInput.slice(0, match.offset);
    const after = noteInput.slice(match.offset + match.length);
    const newText = before + suggestion + after;
    setNoteInput(newText);
    setSpellPopup(null);
    setSpellMatches(prev => prev.filter(m => m.offset !== match.offset));
    noteTextareaRef.current?.focus();
  };

  const handleNoteClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!spellMatches.length) return;
    const ta = e.currentTarget;
    const pos = ta.selectionStart ?? 0;
    const hit = spellMatches.find(m => pos >= m.offset && pos <= m.offset + m.length);
    if (!hit) { setSpellPopup(null); return; }
    const rect = ta.getBoundingClientRect();
    const wrapRect = noteWrapperRef.current?.getBoundingClientRect() ?? rect;
    setSpellPopup({ match: hit, x: e.clientX - wrapRect.left, y: rect.bottom - wrapRect.top + 4 });
  };

  const noteHighlightHtml = useMemo(() => {
    if (!spellMatches.length) return null;
    let result = '';
    let last = 0;
    const sorted = [...spellMatches].sort((a, b) => a.offset - b.offset);
    for (const m of sorted) {
      if (m.offset < last) continue;
      result += noteInput.slice(last, m.offset).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br/>');
      const word = noteInput.slice(m.offset, m.offset + m.length).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      result += `<span style="border-bottom:2px solid #f472b6;cursor:pointer;">${word}</span>`;
      last = m.offset + m.length;
    }
    result += noteInput.slice(last).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
    return result;
  }, [noteInput, spellMatches]);

  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);
  const lastSpokenRef = useRef(-1);

  useEffect(() => {
    const sendHeartbeat = () => {
      if (isAuthenticated) {
        apiFetch('/api/world/heartbeat', { method: 'POST', credentials: 'include' }).catch(() => {});
      }
    };
    sendHeartbeat();
    const iv = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(iv);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetch('/api/orgs/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOrgData({ org: data.org, member: data.member, members: data.members ?? [] }); })
      .catch(() => {});
    apiFetch('/api/world/my-business', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.businesses) setWorldBiz(data.businesses); })
      .catch(() => {});
  }, [isAuthenticated]);

  const registerBusiness = async () => {
    setBizRegLoading(true);
    setBizRegError('');
    try {
      const playerName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim().toUpperCase() : (user?.email?.split('@')[0] ?? 'PLAYER').toUpperCase();
      const res = await apiFetch('/api/world/register', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, ...bizRegForm }),
      });
      const data = await res.json();
      if (!res.ok) { setBizRegError(data.error || 'Registration failed'); setBizRegLoading(false); return; }
      const refreshRes = await apiFetch('/api/world/my-business', { credentials: 'include' });
      if (refreshRes.ok) { const d = await refreshRes.json(); setWorldBiz(d.businesses ?? []); }
      setBizRegOpen(false);
      setBizRegForm({ companyName: '', businessType: 'real', industry: '', companySize: '', contactEmail: '' });
    } catch { setBizRegError('Network error'); }
    setBizRegLoading(false);
  };

  const { messages: chatMessages, businessMemory, isStreaming: chatStreaming, currentAgent, send: sendChat, sendVoice: sendChatVoice, clear: clearChat, clearMemory, updateMemory } = useAdvisorChat();

  const handlePABLOAction = (action: { to: string; tab?: string; autoFill?: Record<string, unknown> }) => {
    if (action.autoFill || action.tab) {
      const prefill = { ...action.autoFill, tab: action.tab, _ts: Date.now() };
      localStorage.setItem('devdocs_action_prefill', JSON.stringify(prefill));
      window.dispatchEvent(new CustomEvent('pablo-action', { detail: prefill }));
    }
    navigate(action.to);
  };

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [chatMessages]);

  const voice = usePabloVoice();

  const conv = useVoiceConversation({
    onSend: sendChatVoice,
    silenceTimeoutMs: 3000,
  });

  useEffect(() => {
    if (!autoSpeakEnabled) return;
    if (conv.isConvMode) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || chatStreaming) return;
    const idx = chatMessages.length - 1;
    if (idx > lastSpokenRef.current) {
      lastSpokenRef.current = idx;
      voice.speakResponse(lastMsg.content);
    }
  }, [chatMessages, chatStreaming, autoSpeakEnabled, voice, conv.isConvMode]);

  const handleSendChat = (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim()) return;
    setChatInput('');
    sendChat(msg);
  };

  const handleVoiceSend = useCallback((transcript: string) => {
    sendChat(transcript);
  }, [sendChat]);

  const LANGUAGES = [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['km','Khmer'],['tl','Filipino'],['id','Indonesian'],['ms','Malay'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['pl','Polish'],['tr','Turkish']];

  return (
    <div className="flex flex-col bg-background relative">
      {/* Removed the giant top-left + bottom-right ambient blur blobs that
          rendered as a "blue streak" bleeding across the home page. The
          terminal vibe wants flat black, not a glowing aura. */}

      <OnboardingModal onComplete={updateMemory} />
      <PrimeAdInterstitial />

      {/* City Info Bar moved into the office page (PabloOffice) — it now lives
          in the game (the office) instead of as a standalone terminal header. */}

      {/* Trial Unavailable Popup */}
      <AnimatePresence>
        {trialPopup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="relative w-full max-w-sm rounded-2xl border p-6"
              style={{ background: '#0f0f0f', borderColor: 'rgba(255,165,0,0.2)' }}
            >
              <button
                onClick={dismissTrialPopup}
                className="absolute top-3 right-3"
                style={{ color: 'rgba(255,165,0,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.2rem', lineHeight: 1 }}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 shrink-0" style={{ color: 'rgba(255,165,0,0.7)' }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', letterSpacing: '0.12em', color: 'rgba(255,165,0,0.5)', textTransform: 'uppercase' }}>
                  PROGRAM STATUS UPDATE
                </span>
              </div>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: 'rgba(255,165,0,0.95)', letterSpacing: '0.04em', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                SUBSCRIPTION LAUNCH — PENDING
              </p>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                Pablo Corp's payment infrastructure is not yet operational — subscriptions will be made available once the billing system clears compliance review.
                <br /><br />
                In the meantime, all standard modules remain fully functional. Pro augmentation modules will be unlocked upon subscription launch. Thank you for your patience and continued commitment to corporate excellence.
              </p>
              <button
                onClick={dismissTrialPopup}
                className="w-full rounded-lg py-2.5"
                style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', letterSpacing: '0.1em', background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.3)', color: 'rgba(255,165,0,0.9)', cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Understood. Proceed.
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex flex-col p-4 md:p-6 relative z-10 gap-4 flex-1 min-h-0">

        {/* Hub Banner — chrome-less. Earlier version had a sky-tinted box that
            read as a blue strip across the terminal; we keep just the wordmark
            + intro CTA inline. */}
        <div className="px-1 py-1.5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400/70" />
            <div>
              <span className="text-[10px] font-bold tracking-wider" style={{ fontFamily: "var(--font-sans)", color: 'rgba(56,189,248,0.7)' }}>THE SALARYMAN PLATFORM</span>
              <span className="text-[9px] ml-2" style={{ fontFamily: "var(--font-sans)", color: 'rgba(255,255,255,0.25)' }}>AI AGENTS + INTERVIEWS + PRESENTATIONS + CREATIVE TOOLS + PHONE SYSTEM</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/office')}
            className="ml-auto group flex items-center gap-2 px-3 py-1.5 rounded-md transition"
            style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(6,182,212,0.12))',
              border: '1px solid rgba(236,72,153,0.45)',
              boxShadow: '0 0 10px rgba(236,72,153,0.25)',
            }}
            title="Punch in — head to the office. Toggle your computer there to open the terminal."
            data-testid="hub-late-to-work"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" style={{ boxShadow: '0 0 6px #ec4899' }}/>
            <span className="text-[10px] font-bold tracking-[0.3em] text-pink-100" style={{ fontFamily: "var(--font-sans)" }}>
              ▸ YOU'RE LATE TO WORK
            </span>
          </button>
        </div>

        {/* ── Main Layout: Sidebar Tools (left) + PABLO Chat (right) ── */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">

          {/* Sidebar Tools */}
          <div className="lg:w-96 shrink-0 space-y-3 lg:overflow-y-auto lg:max-h-[calc(100vh-180px)]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(56,189,248,0.15) transparent' }}>
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'TRANSLATOR' : PABLO_PRODUCTS.TRANSLATOR.name}</span>
              </div>
              {/* Stack the FROM/TO selects vertically with the swap button on
                  its own row so the swap can never visually overlap the
                  native dropdown menu of the TO select on small viewports
                  (was the source of the "English dropdown blocked by ⇄"
                  report). Also gives both selects full width to render long
                  language names without truncation. */}
              <div className="flex flex-col gap-1.5 mb-1.5">
                <select value={translatorFrom} onChange={e => setTranslatorFrom(e.target.value)}
                  aria-label="Translate from"
                  className={`w-full bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <button onClick={() => { const f = translatorFrom; setTranslatorFrom(translatorTo); setTranslatorTo(f); }}
                  className="self-center px-2 py-0.5 text-[10px] font-bold rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors"
                  aria-label="Swap from and to languages"
                  title="Swap languages">⇄ SWAP</button>
                <select value={translatorTo} onChange={e => setTranslatorTo(e.target.value)}
                  aria-label="Translate to"
                  className={`w-full bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <button onClick={() => {
                  if (translatorListening) {
                    try { translatorRecRef.current?.stop(); } catch {}
                    translatorRecRef.current = null;
                    setTranslatorListening(false);
                    return;
                  }
                  const W = window as unknown as Record<string, unknown>;
                  const SRCtor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => { continuous: boolean; interimResults: boolean; lang: string; onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }) | undefined;
                  if (!SRCtor) { setTranslatorResult('Speech recognition not supported.'); return; }
                  setTranslatorListening(true);
                  const rec = new SRCtor();
                  translatorRecRef.current = rec;
                  rec.continuous = false; rec.interimResults = true; rec.lang = translatorFrom;
                  rec.onresult = (ev) => { setTranslatorText(Array.from(ev.results).map(r => r[0].transcript).join('')); };
                  rec.onend = () => { setTranslatorListening(false); translatorRecRef.current = null; };
                  rec.onerror = () => { setTranslatorListening(false); translatorRecRef.current = null; };
                  rec.start();
                }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md border transition-colors shrink-0
                    ${translatorListening ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-pink-500/10 text-pink-400 border-pink-500/30 hover:bg-pink-500/20'}`}>
                  <Mic className="w-3 h-3" />
                  {translatorListening ? 'Stop' : 'Speak'}
                </button>
              </div>
              <textarea value={translatorText} onChange={e => setTranslatorText(e.target.value)}
                placeholder="Type or speak text to translate..."
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none mb-2"
                style={{ fontFamily: "var(--font-sans)", minHeight: 48 }} />
              <button onClick={async () => {
                if (!translatorText.trim()) return;
                setTranslatorResult('Translating...');
                try {
                  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(translatorText)}&langpair=${translatorFrom}|${translatorTo}`);
                  const data = await res.json();
                  setTranslatorResult(data.responseData?.translatedText ?? 'Translation unavailable.');
                } catch { setTranslatorResult('Translation service unavailable. Try again.'); }
              }}
                className={`w-full flex items-center justify-center gap-2 px-3 ${boomerMode ? 'py-2.5 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors mb-2`}
                style={{ fontFamily: "var(--font-sans)" }}>
                <ArrowRight className="w-3 h-3" /> TRANSLATE
              </button>
              {translatorResult && translatorResult !== 'Translating...' && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 flex items-start gap-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300 flex-1`} style={{ fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>{translatorResult}</p>
                  <button onClick={() => {
                    speakWithTTS(translatorResult, () => {}, undefined);
                  }}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors"
                    title="Hear translation">
                    🔊 {boomerMode ? 'HEAR IT' : 'PLAY'}
                  </button>
                </div>
              )}
              {translatorResult === 'Translating...' && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300`} style={{ fontFamily: "var(--font-sans)", lineHeight: 1.6 }}>{translatorResult}</p>
                </div>
              )}
            </div>

            {/* Dictionary */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'DICTIONARY' : PABLO_PRODUCTS.DICTIONARY.name}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <input value={dictWord} onChange={e => setDictWord(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') lookupWord(dictWord); }}
                  placeholder="Type a word..."
                  className={`flex-1 bg-background border border-border rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground placeholder:text-muted-foreground/50 outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }} />
                {speechSupported && (
                  <button
                    onClick={() => startWordSpeech(setDictWord, lookupWord, setDictListening, dictRecRef)}
                    className={`flex items-center justify-center ${boomerMode ? 'w-9 h-9' : 'w-7 h-7'} rounded-md border transition-colors shrink-0 ${dictListening ? 'bg-pink-500/30 border-pink-400 text-pink-300 animate-pulse' : 'bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20'}`}
                    title={dictListening ? 'Listening…' : 'Speak a word'}>
                    {dictListening ? <MicOff className={boomerMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} /> : <Mic className={boomerMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
                  </button>
                )}
                <button onClick={() => lookupWord(dictWord)}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  LOOKUP
                </button>
              </div>
              {dictLoading && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className="text-xs text-pink-300" style={{ fontFamily: "var(--font-sans)" }}>Looking up...</p>
                </div>
              )}
              {dictError && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/70`} style={{ fontFamily: "var(--font-sans)" }}>{dictError}</p>
                  {dictSuggestions.length > 0 && (
                    <div className="mt-1.5">
                      <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/60 mb-1`} style={{ fontFamily: "var(--font-sans)" }}>DID YOU MEAN:</p>
                      <div className="flex flex-wrap gap-1">
                        {dictSuggestions.map(s => (
                          <button key={s} onClick={() => { setDictWord(s); lookupWord(s); }}
                            className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/25 transition-colors`}
                            style={{ fontFamily: "var(--font-sans)" }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {dictResult && (
                <div className="space-y-2">
                  <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-300`} style={{ fontFamily: "var(--font-sans)" }}>{dictResult.word.toUpperCase()}</span>
                      {dictResult.phonetic && <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/60`} style={{ fontFamily: "var(--font-sans)" }}>{dictResult.phonetic}</span>}
                    </div>
                    {dictResult.meanings.slice(0, 3).map((m, mi) => (
                      <div key={mi}>
                        <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/50 uppercase`} style={{ fontFamily: "var(--font-sans)" }}>{m.partOfSpeech}</span>
                        {m.definitions.slice(0, 2).map((d, di) => (
                          <p key={di} className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/80 ml-2`} style={{ fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>• {d.definition}</p>
                        ))}
                        {m.definitions[0]?.synonyms && m.definitions[0].synonyms.length > 0 && (
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/40 ml-2 mt-0.5`} style={{ fontFamily: "var(--font-sans)" }}>syn: {m.definitions[0].synonyms.slice(0, 4).join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {dictThesaurus && (Object.keys(dictThesaurus.synonymsByPos).length > 0 || dictThesaurus.antonyms.length > 0) && (
                    <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 space-y-1.5">
                      <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/70 uppercase`} style={{ fontFamily: "var(--font-sans)" }}>THESAURUS</span>
                      {Object.keys(dictThesaurus.synonymsByPos).length > 0 && (
                        <div className="space-y-1.5">
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50`} style={{ fontFamily: "var(--font-sans)" }}>SYNONYMS</p>
                          {Object.entries(dictThesaurus.synonymsByPos).map(([pos, words]) => (
                            <div key={pos}>
                              <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/40 uppercase ml-0.5`} style={{ fontFamily: "var(--font-sans)" }}>{pos}</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {words.map(s => (
                                  <button key={s} onClick={() => { setDictWord(s); lookupWord(s); }}
                                    className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/20 bg-pink-500/5 text-pink-300/80 hover:bg-pink-500/20 hover:text-pink-300 transition-colors`}
                                    style={{ fontFamily: "var(--font-sans)" }}>
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {dictThesaurus.antonyms.length > 0 && (
                        <div>
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50 mb-1`} style={{ fontFamily: "var(--font-sans)" }}>ANTONYMS</p>
                          <div className="flex flex-wrap gap-1">
                            {dictThesaurus.antonyms.map(a => (
                              <button key={a} onClick={() => { setDictWord(a); lookupWord(a); }}
                                className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-400/20 bg-pink-400/5 text-pink-400/70 hover:bg-pink-400/15 hover:text-pink-400 transition-colors`}
                                style={{ fontFamily: "var(--font-sans)" }}>
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Thesaurus */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'THESAURUS' : PABLO_PRODUCTS.THESAURUS.name}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <input value={thesWord} onChange={e => setThesWord(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') lookupThesaurus(thesWord); }}
                  placeholder="Type a word..."
                  className={`flex-1 bg-background border border-border rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground placeholder:text-muted-foreground/50 outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }} />
                {speechSupported && (
                  <button
                    onClick={() => startWordSpeech(setThesWord, lookupThesaurus, setThesListening, thesRecRef)}
                    className={`flex items-center justify-center ${boomerMode ? 'w-9 h-9' : 'w-7 h-7'} rounded-md border transition-colors shrink-0 ${thesListening ? 'bg-pink-500/30 border-pink-400 text-pink-300 animate-pulse' : 'bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20'}`}
                    title={thesListening ? 'Listening…' : 'Speak a word'}>
                    {thesListening ? <MicOff className={boomerMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} /> : <Mic className={boomerMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} />}
                  </button>
                )}
                <button onClick={() => lookupThesaurus(thesWord)}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  SEARCH
                </button>
              </div>
              {thesLoading && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className="text-xs text-pink-300" style={{ fontFamily: "var(--font-sans)" }}>Searching...</p>
                </div>
              )}
              {thesError && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/70`} style={{ fontFamily: "var(--font-sans)" }}>{thesError}</p>
                </div>
              )}
              {!thesLoading && !thesError && thesLookedUp && (Object.keys(thesSynonyms).length > 0 || thesAntonyms.length > 0 || thesRelated.length > 0) && (
                <div className="space-y-2">
                  <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 space-y-1.5">
                    <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-300`} style={{ fontFamily: "var(--font-sans)" }}>{thesLookedUp.toUpperCase()}</span>
                    {Object.keys(thesSynonyms).length > 0 && (
                      <div className="space-y-1.5">
                        <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50`} style={{ fontFamily: "var(--font-sans)" }}>SYNONYMS</p>
                        {Object.entries(thesSynonyms).map(([pos, words]) => (
                          <div key={pos}>
                            <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/40 uppercase ml-0.5`} style={{ fontFamily: "var(--font-sans)" }}>{pos}</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {words.map(s => (
                                <button key={s} onClick={() => { setThesWord(s); lookupThesaurus(s); }}
                                  className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/20 bg-pink-500/5 text-pink-300/80 hover:bg-pink-500/20 hover:text-pink-300 transition-colors`}
                                  style={{ fontFamily: "var(--font-sans)" }}>
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {thesAntonyms.length > 0 && (
                      <div>
                        <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50 mb-1`} style={{ fontFamily: "var(--font-sans)" }}>ANTONYMS</p>
                        <div className="flex flex-wrap gap-1">
                          {thesAntonyms.map(a => (
                            <button key={a} onClick={() => { setThesWord(a); lookupThesaurus(a); }}
                              className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-400/20 bg-pink-400/5 text-pink-400/70 hover:bg-pink-400/15 hover:text-pink-400 transition-colors`}
                              style={{ fontFamily: "var(--font-sans)" }}>
                              {a}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {thesRelated.length > 0 && (
                      <div>
                        <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50 mb-1`} style={{ fontFamily: "var(--font-sans)" }}>RELATED WORDS</p>
                        <div className="flex flex-wrap gap-1">
                          {thesRelated.map(r => (
                            <button key={r} onClick={() => { setThesWord(r); lookupThesaurus(r); }}
                              className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/15 bg-pink-500/5 text-pink-300/60 hover:bg-pink-500/15 hover:text-pink-300 transition-colors`}
                              style={{ fontFamily: "var(--font-sans)" }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Currency Converter */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'CURRENCY CONVERTER' : PABLO_PRODUCTS.CURRENCY.name}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 mb-2 items-center">
                <input
                  type="number" inputMode="decimal" value={ccyAmount}
                  onChange={e => setCcyAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') convertCurrency(); }}
                  placeholder="Amount"
                  className={`min-w-0 bg-background border border-border rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground placeholder:text-muted-foreground/50 outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }} />
                <select value={ccyFrom} onChange={e => setCcyFrom(e.target.value)}
                  className={`bg-background border border-border rounded-md px-2 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  {CCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => { const f = ccyFrom; setCcyFrom(ccyTo); setCcyTo(f); }}
                  title="Swap currencies"
                  className={`flex items-center justify-center ${boomerMode ? 'w-9 h-9' : 'w-7 h-7'} rounded-md border bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20 transition-colors col-span-3 justify-self-center my-0.5`}
                  style={{ fontFamily: "var(--font-sans)" }}>⇅</button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-1.5 mb-2">
                <select value={ccyTo} onChange={e => setCcyTo(e.target.value)}
                  className={`bg-background border border-border rounded-md px-2 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  {CCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={convertCurrency}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  CONVERT
                </button>
              </div>
              {ccyLoading && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className="text-xs text-pink-300" style={{ fontFamily: "var(--font-sans)" }}>Fetching rate...</p>
                </div>
              )}
              {ccyError && !ccyLoading && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/70`} style={{ fontFamily: "var(--font-sans)" }}>{ccyError}</p>
                </div>
              )}
              {ccyResult && !ccyLoading && !ccyError && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <div className={`${boomerMode ? 'text-base' : 'text-sm'} font-bold text-pink-300`} style={{ fontFamily: "var(--font-sans)" }}>
                    {ccyAmount} {ccyFrom} = {ccyResult.value.toLocaleString(undefined, { maximumFractionDigits: 4 })} {ccyTo}
                  </div>
                  <div className="text-[10px] text-pink-400/60 mt-0.5" style={{ fontFamily: "var(--font-sans)" }}>
                    1 {ccyFrom} = {ccyResult.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {ccyTo}
                    {ccyResult.date && ` · ${ccyResult.date}`}
                  </div>
                </div>
              )}
            </div>

            {/* Calculator */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'CALCULATOR' : PABLO_PRODUCTS.CALCULATOR.name}</span>
              </div>
              <input
                value={calcExpr}
                onChange={e => { setCalcExpr(e.target.value); evalCalc(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') evalCalc(calcExpr); }}
                placeholder="e.g. (12+3)*4 or 250*15%"
                className={`w-full bg-background border border-border rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground placeholder:text-muted-foreground/50 outline-none mb-2`}
                style={{ fontFamily: "var(--font-sans)" }} />
              <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 mb-2 min-h-[2.25rem] flex items-center justify-end">
                {calcError ? (
                  <span className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/70`} style={{ fontFamily: "var(--font-sans)" }}>{calcError}</span>
                ) : (
                  <span className={`${boomerMode ? 'text-base' : 'text-sm'} font-bold text-pink-300`} style={{ fontFamily: "var(--font-sans)" }}>= {calcResult || '0'}</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {['C','(',')','⌫','7','8','9','/','4','5','6','*','1','2','3','-','0','.','%','+'].map(k => (
                  <button key={k} onClick={() => calcKey(k)}
                    className={`${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 transition-colors font-bold`}
                    style={{ fontFamily: "var(--font-sans)" }}>{k}</button>
                ))}
                <button onClick={() => calcKey('=')}
                  className={`col-span-4 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} rounded-md border border-pink-400/50 bg-pink-500/20 text-pink-200 hover:bg-pink-500/30 transition-colors font-bold`}
                  style={{ fontFamily: "var(--font-sans)" }}>=</button>
              </div>
            </div>

            {/* Quick Notes */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>{boomerMode ? 'QUICK NOTES' : PABLO_PRODUCTS.NOTES.name}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <div ref={noteWrapperRef} className="flex-1 relative bg-background border border-border rounded-md">
                  {noteHighlightHtml && (
                    <div
                      aria-hidden
                      className={`absolute inset-0 px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} rounded-md pointer-events-none whitespace-pre-wrap break-words overflow-hidden text-foreground`}
                      style={{ fontFamily: "var(--font-sans)", minHeight: 36, lineHeight: 1.5 }}
                      dangerouslySetInnerHTML={{ __html: noteHighlightHtml }}
                    />
                  )}
                  <textarea
                    ref={noteTextareaRef}
                    value={noteInput}
                    onChange={handleNoteInputChange}
                    onClick={handleNoteClick}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setSpellPopup(null); return; }
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); }
                    }}
                    placeholder="Jot a note..."
                    className={`w-full bg-transparent rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} placeholder:text-muted-foreground/50 outline-none resize-none relative`}
                    style={{
                      fontFamily: "var(--font-sans)",
                      minHeight: 36,
                      lineHeight: 1.5,
                      color: noteHighlightHtml ? 'transparent' : undefined,
                      caretColor: noteHighlightHtml ? 'hsl(var(--foreground))' : undefined,
                    }}
                  />
                  {spellMatches.length > 0 && (
                    <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-pink-500/10 text-pink-400 border border-pink-500/20 pointer-events-none" style={{ fontFamily: "var(--font-sans)" }}>
                      {spellMatches.length} TYPO{spellMatches.length !== 1 ? 'S' : ''}
                    </div>
                  )}
                  {spellPopup && (
                    <div
                      className="absolute z-50 rounded-md border border-pink-500/30 bg-card shadow-lg p-1.5 min-w-[120px]"
                      style={{ left: spellPopup.x, top: spellPopup.y, fontFamily: "var(--font-sans)" }}
                    >
                      <div className="text-[9px] text-pink-400/60 px-1 pb-1 border-b border-pink-500/20 mb-1">
                        SUGGESTIONS FOR &quot;{spellPopup.match.word}&quot;
                      </div>
                      {spellPopup.match.suggestions.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground px-1 py-0.5">No suggestions</div>
                      ) : spellPopup.match.suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => applySpellCorrection(spellPopup.match, s)}
                          className="w-full text-left text-[11px] text-foreground px-2 py-1 rounded hover:bg-pink-500/10 hover:text-pink-300 transition-colors block"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={addNote}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0 self-end`}
                  style={{ fontFamily: "var(--font-sans)" }}>
                  SAVE
                </button>
              </div>
              {notes.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {notes.map(n => (
                    <div key={n.id} className="flex items-start gap-2 rounded-md border border-pink-500/10 bg-pink-500/5 px-2.5 py-1.5 group">
                      <p className="flex-1 text-xs text-pink-300/80 whitespace-pre-wrap break-words" style={{ fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>{n.text}</p>
                      <button onClick={() => deleteNote(n.id)}
                        className="shrink-0 text-pink-500/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-[10px] mt-0.5"
                        title="Delete note">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {notes.length === 0 && (
                <p className="text-[10px] text-pink-400/30 text-center" style={{ fontFamily: "var(--font-sans)" }}>No notes yet. Your notes persist locally.</p>
              )}
            </div>

            {/* Feature Module Quick-Access Tiles */}
            <div className="rounded-xl border border-sky-500/15 bg-sky-500/3 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Layers className="w-3.5 h-3.5" style={{ color: 'rgba(56,189,248,0.5)' }} />
                <span className="text-xs font-bold" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em', color: 'rgba(56,189,248,0.6)' }}>MODULES</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { label: boomerMode ? 'TERMINAL' : PABLO_PRODUCTS.CONSOLE.short, desc: 'Interview solver & screen scan', path: '/console', color: 'rgba(56,189,248,0.5)', bg: 'rgba(56,189,248,0.05)', border: 'rgba(56,189,248,0.15)', icon: '⌥' },
                  { label: boomerMode ? 'CONTACTS' : PABLO_PRODUCTS.CONTACTS.short, desc: 'CRM & relationship intel', path: '/business/contacts', color: 'rgba(100,180,255,0.6)', bg: 'rgba(100,180,255,0.05)', border: 'rgba(100,180,255,0.15)', icon: '◈' },
                  { label: boomerMode ? 'HIRING' : PABLO_PRODUCTS.HIRING.short, desc: 'Recruit & manage staff', path: '/business/hiring', color: 'rgba(255,160,50,0.6)', bg: 'rgba(255,160,50,0.05)', border: 'rgba(255,160,50,0.15)', icon: '▣' },
                  { label: boomerMode ? 'DOCUMENTS' : PABLO_PRODUCTS.PRINTER.short, desc: 'Invoices, contracts & files', path: '/business/documents', color: 'rgba(180,100,255,0.6)', bg: 'rgba(180,100,255,0.05)', border: 'rgba(180,100,255,0.15)', icon: '◻' },
                  { label: boomerMode ? 'CALENDAR' : PABLO_PRODUCTS.CALENDAR.short, desc: 'Schedule & appointments', path: '/business/calendar', color: 'rgba(255,220,50,0.6)', bg: 'rgba(255,220,50,0.05)', border: 'rgba(255,220,50,0.15)', icon: '◆' },
                  { label: boomerMode ? 'DASHBOARD' : PABLO_PRODUCTS.WORKSPACE.short, desc: 'Projects & brand kit', path: '/dashboard', color: 'rgba(80,220,200,0.6)', bg: 'rgba(80,220,200,0.05)', border: 'rgba(80,220,200,0.15)', icon: '⊞' },
                  { label: boomerMode ? 'DARK ROOM' : PABLO_PRODUCTS.DARK_ROOM.short, desc: 'Content & production lab', path: '/creative/darkroom', color: 'rgba(255,100,180,0.6)', bg: 'rgba(255,100,180,0.05)', border: 'rgba(255,100,180,0.15)', icon: '◈' },
                  { label: boomerMode ? 'REPORTS' : PABLO_PRODUCTS.REPORTING.short, desc: 'Pipeline & analytics', path: '/intel/reports', color: 'rgba(255,140,80,0.6)', bg: 'rgba(255,140,80,0.05)', border: 'rgba(255,140,80,0.15)', icon: '▥' },
                  { label: boomerMode ? 'MY AGENTS' : PABLO_PRODUCTS.AI_AGENTS.short, desc: 'Agent Command Center', path: '/bots', color: 'rgba(200,140,255,0.6)', bg: 'rgba(200,140,255,0.05)', border: 'rgba(200,140,255,0.15)', icon: '⋈' },
                  { label: boomerMode ? 'DEALS' : PABLO_PRODUCTS.DEALS.short, desc: 'Track deal pipeline', path: '/business/deals', color: 'rgba(50,220,130,0.6)', bg: 'rgba(50,220,130,0.05)', border: 'rgba(50,220,130,0.15)', icon: '⇅' },
                  { label: boomerMode ? 'INVOICES' : PABLO_PRODUCTS.INVOICES.short, desc: 'Billing & invoices', path: '/business/invoices', color: 'rgba(120,200,255,0.6)', bg: 'rgba(120,200,255,0.05)', border: 'rgba(120,200,255,0.15)', icon: '⊟' },
                  { label: boomerMode ? 'CAMPAIGNS' : 'SIGNAL-5', desc: 'Email & outreach', path: '/marketing/campaigns', color: 'rgba(255,120,200,0.6)', bg: 'rgba(255,120,200,0.05)', border: 'rgba(255,120,200,0.15)', icon: '⊛' },
                  { label: boomerMode ? 'BRAND KIT' : PABLO_PRODUCTS.BRAND_KIT.short, desc: 'Brand identity', path: '/creative/brand', color: 'rgba(255,180,100,0.6)', bg: 'rgba(255,180,100,0.05)', border: 'rgba(255,180,100,0.15)', icon: '◉' },
                  { label: boomerMode ? '1999' : PABLO_PRODUCTS.SOUND_LAB.short, desc: 'Audio production', path: '/creative/lab', color: 'rgba(160,120,255,0.6)', bg: 'rgba(160,120,255,0.05)', border: 'rgba(160,120,255,0.15)', icon: '♫' },
                  { label: 'HUMMING BIRD', desc: 'Personal soundtrack', path: '/creative/music', color: 'rgba(167,139,250,0.7)', bg: 'rgba(167,139,250,0.05)', border: 'rgba(167,139,250,0.15)', icon: 'hummingbird', activeKey: 'music' as const },
                  { label: boomerMode ? 'LEADS' : 'PROSPECT-9', desc: 'Lead database', path: '/marketing/leads', color: 'rgba(255,160,100,0.6)', bg: 'rgba(255,160,100,0.05)', border: 'rgba(255,160,100,0.15)', icon: '⊕' },
                  { label: boomerMode ? 'GOALS' : PABLO_PRODUCTS.GOALS.short, desc: 'Mission tracker', path: '/intel/goals', color: 'rgba(255,200,60,0.6)', bg: 'rgba(255,200,60,0.05)', border: 'rgba(255,200,60,0.15)', icon: '⊕' },
                  { label: boomerMode ? 'SEO' : PABLO_PRODUCTS.SEO.short, desc: 'Search optimization', path: '/marketing/seo', color: 'rgba(100,255,180,0.6)', bg: 'rgba(100,255,180,0.05)', border: 'rgba(100,255,180,0.15)', icon: '⊜' },
                  { label: boomerMode ? 'WEB ANALYZER' : 'RECON-5', desc: 'Analyze any URL', path: '#web-analyzer', color: 'rgba(56,189,248,0.6)', bg: 'rgba(56,189,248,0.05)', border: 'rgba(56,189,248,0.15)', icon: '⊞' },
                ] as { label: string; desc: string; path: string; color: string; bg: string; border: string; icon: string; activeKey?: 'music' }[]).map(mod => {
                  const isMusicActive = mod.activeKey === 'music' && musicActive;
                  return (
                  <button
                    key={mod.path}
                    onClick={() => {
                      if (mod.path.startsWith('#')) {
                        document.getElementById(mod.path.slice(1))?.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        navigate(mod.path);
                      }
                    }}
                    className="flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: isMusicActive ? 'rgba(167,139,250,0.12)' : mod.bg,
                      border: `1px solid ${isMusicActive ? 'rgba(167,139,250,0.6)' : mod.border}`,
                      boxShadow: isMusicActive ? '0 0 14px rgba(167,139,250,0.45), inset 0 0 0 1px rgba(167,139,250,0.25)' : undefined,
                      animation: isMusicActive ? 'tab-active-pulse 2.4s ease-in-out infinite' : undefined,
                    }}
                  >
                    {mod.icon === 'hummingbird' ? (
                      <>
                        <div className="flex items-center justify-between w-full">
                          <HummingbirdIcon size={20} color={mod.color} />
                          {isMusicActive && (
                            <span className="text-[8px] font-bold tracking-widest" style={{ color: 'rgba(167,139,250,0.95)', textShadow: '0 0 6px rgba(167,139,250,0.7)' }}>● LIVE</span>
                          )}
                        </div>
                        <span className="hidden sm:block text-[9px] leading-tight" style={{ fontFamily: "var(--font-sans)", color: 'rgba(255,255,255,0.25)' }}>{mod.desc}</span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] inline-flex items-center" style={{ color: mod.color }}>{mod.icon}</span>
                          <span className="text-[10px] font-bold" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.06em', color: mod.color }}>{mod.label}</span>
                          {isMusicActive && (
                            <span className="ml-auto text-[8px] font-bold tracking-widest" style={{ color: 'rgba(167,139,250,0.95)', textShadow: '0 0 6px rgba(167,139,250,0.7)' }}>● LIVE</span>
                          )}
                        </div>
                        <span className="hidden sm:block text-[9px] leading-tight" style={{ fontFamily: "var(--font-sans)", color: 'rgba(255,255,255,0.25)' }}>{mod.desc}</span>
                      </>
                    )}
                  </button>
                  );
                })}
                <style>{`
                  @keyframes tab-active-pulse {
                    0%,100% { box-shadow: 0 0 10px rgba(167,139,250,0.35), inset 0 0 0 1px rgba(167,139,250,0.2); }
                    50%     { box-shadow: 0 0 18px rgba(167,139,250,0.65), inset 0 0 0 1px rgba(167,139,250,0.4); }
                  }
                `}</style>
              </div>
            </div>

            {isAuthenticated && (
              <>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-sky-400" style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', letterSpacing: '0.12em' }}>{getActiveCityName()}</span>
                    <span className="text-[8px] text-sky-400/30" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.1em' }}>SERVER: PST · 24 CITIES WORLDWIDE</span>
                  </div>
                </div>

                {/* Employment Status */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>EMPLOYMENT STATUS</span>
                  </div>
                  {orgData?.org ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold text-emerald-300" style={{ fontFamily: "var(--font-sans)" }}>EMPLOYED</span>
                      </div>
                      <div className="space-y-1.5 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
                        <div>
                          <div style={{ fontSize: '0.45rem', color: 'rgba(52,211,153,0.4)', letterSpacing: '0.1em' }}>EMPLOYER</div>
                          <div className="text-xs text-emerald-300 font-bold" style={{ fontFamily: "var(--font-sans)" }}>{orgData.org.name.toUpperCase()}</div>
                        </div>
                        {orgData.member?.role && (
                          <div>
                            <div style={{ fontSize: '0.45rem', color: 'rgba(52,211,153,0.4)', letterSpacing: '0.1em' }}>POSITION</div>
                            <div className="text-xs text-emerald-300" style={{ fontFamily: "var(--font-sans)" }}>{(orgData.member.title ?? orgData.member.role).toUpperCase()}</div>
                          </div>
                        )}
                        {orgData.member?.department && (
                          <div>
                            <div style={{ fontSize: '0.45rem', color: 'rgba(52,211,153,0.4)', letterSpacing: '0.1em' }}>DEPARTMENT</div>
                            <div className="text-xs text-emerald-300" style={{ fontFamily: "var(--font-sans)" }}>{orgData.member.department.toUpperCase()}</div>
                          </div>
                        )}
                        {orgData.member?.salary && (
                          <div>
                            <div style={{ fontSize: '0.45rem', color: 'rgba(52,211,153,0.4)', letterSpacing: '0.1em' }}>SALARY</div>
                            <div className="text-xs text-emerald-300" style={{ fontFamily: "var(--font-sans)" }}>${Number(orgData.member.salary).toLocaleString()}</div>
                          </div>
                        )}
                        {orgData.org.industry && (
                          <div>
                            <div style={{ fontSize: '0.45rem', color: 'rgba(52,211,153,0.4)', letterSpacing: '0.1em' }}>INDUSTRY</div>
                            <div className="text-xs text-emerald-300/70" style={{ fontFamily: "var(--font-sans)" }}>{orgData.org.industry.toUpperCase()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400/60" />
                      <span className="text-xs text-amber-300/70" style={{ fontFamily: "var(--font-sans)" }}>NOT EMPLOYED — REGISTER A BUSINESS BELOW OR JOIN AN ORGANIZATION</span>
                    </div>
                  )}
                </div>

                {/* Business Registration */}
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-400" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>BUSINESS REGISTRATION</span>
                    </div>
                    {!bizRegOpen && (
                      <button onClick={() => setBizRegOpen(true)}
                        className="text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                        style={{ fontFamily: "var(--font-sans)" }}>
                        + REGISTER
                      </button>
                    )}
                  </div>

                  {worldBiz.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {worldBiz.map(biz => (
                        <div key={biz.id} className="rounded-md border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-cyan-300" style={{ fontFamily: "var(--font-sans)" }}>{(biz.companyName ?? 'UNNAMED').toUpperCase()}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-bold" style={{
                              fontFamily: "var(--font-sans)",
                              ...(biz.businessType === 'real' ? { color: 'rgba(52,211,153,0.8)', borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.1)' } : { color: 'rgba(56,189,248,0.8)', borderColor: 'rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.1)' })
                            }}>
                              {biz.businessType === 'real' ? 'REAL ENTERPRISE' : 'MINX CORP'}
                            </span>
                          </div>
                          {biz.industry && <div className="text-[10px] text-cyan-400/60" style={{ fontFamily: "var(--font-sans)" }}>INDUSTRY: {biz.industry.toUpperCase()}</div>}
                          {biz.companySize && <div className="text-[10px] text-cyan-400/60" style={{ fontFamily: "var(--font-sans)" }}>SIZE: {biz.companySize.toUpperCase()}</div>}
                          {biz.contactEmail && <div className="text-[10px] text-cyan-400/60" style={{ fontFamily: "var(--font-sans)" }}>CONTACT: {biz.contactEmail.toUpperCase()}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {orgData?.org && orgData.members.length > 0 && (
                    <div className="rounded-md border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 mb-2">
                      <div className="text-[10px] font-bold text-cyan-400/70 mb-1.5" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.08em' }}>
                        ORGANIZATION STRUCTURE — {orgData.org.name.toUpperCase()}
                      </div>
                      <div className="space-y-1">
                        {orgData.members.filter(m => m.status === 'active' || m.status === 'invited').map((m, i) => {
                          const classification = m.role === 'owner' ? 'OWNER / PARTNER' : m.role === 'manager' ? 'PARTNER / MANAGER' : 'EMPLOYEE';
                          return (
                            <div key={i} className="flex items-center justify-between text-[10px]" style={{ fontFamily: "var(--font-sans)" }}>
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: m.status === 'active' ? 'rgba(52,211,153,0.6)' : 'rgba(255,200,50,0.4)' }} />
                                <span className="text-cyan-300/80">{(m.inviteEmail ?? m.userId).toUpperCase()}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {m.title && <span className="text-cyan-400/40">{m.title.toUpperCase()}</span>}
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold border" style={{
                                  ...(m.role === 'owner' ? { color: 'rgba(255,200,50,0.8)', borderColor: 'rgba(255,200,50,0.3)', background: 'rgba(255,200,50,0.1)' }
                                    : m.role === 'manager' ? { color: 'rgba(200,140,255,0.8)', borderColor: 'rgba(200,140,255,0.3)', background: 'rgba(200,140,255,0.1)' }
                                    : { color: 'rgba(56,189,248,0.8)', borderColor: 'rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.1)' })
                                }}>
                                  {classification}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {bizRegOpen && (
                    <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                      <div className="text-[10px] font-bold text-cyan-400/70" style={{ fontFamily: "var(--font-sans)" }}>REGISTER NEW BUSINESS</div>
                      <select value={bizRegForm.businessType} onChange={e => setBizRegForm(f => ({ ...f, businessType: e.target.value as 'real' | 'minx' }))}
                        className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground outline-none" style={{ fontFamily: "var(--font-sans)" }}>
                        <option value="real">REAL-WORLD ENTERPRISE</option>
                        <option value="minx">MINX CORP (IN-GAME)</option>
                      </select>
                      <input value={bizRegForm.companyName} onChange={e => setBizRegForm(f => ({ ...f, companyName: e.target.value }))}
                        placeholder="Company name" className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none" style={{ fontFamily: "var(--font-sans)" }} />
                      <input value={bizRegForm.industry} onChange={e => setBizRegForm(f => ({ ...f, industry: e.target.value }))}
                        placeholder="Industry (e.g. Technology, Finance)" className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none" style={{ fontFamily: "var(--font-sans)" }} />
                      <input value={bizRegForm.companySize} onChange={e => setBizRegForm(f => ({ ...f, companySize: e.target.value }))}
                        placeholder="Company size (e.g. 1-10, 50-100)" className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none" style={{ fontFamily: "var(--font-sans)" }} />
                      <input value={bizRegForm.contactEmail} onChange={e => setBizRegForm(f => ({ ...f, contactEmail: e.target.value }))}
                        placeholder="Contact email" className="w-full bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none" style={{ fontFamily: "var(--font-sans)" }} />
                      {bizRegError && <div className="text-[10px] text-red-400" style={{ fontFamily: "var(--font-sans)" }}>{bizRegError}</div>}
                      <div className="flex gap-2">
                        <button onClick={() => { setBizRegOpen(false); setBizRegError(''); }}
                          className="flex-1 text-xs py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: "var(--font-sans)" }}>
                          CANCEL
                        </button>
                        <button onClick={registerBusiness} disabled={bizRegLoading || !bizRegForm.companyName.trim()}
                          className="flex-1 text-xs py-1.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors disabled:opacity-50" style={{ fontFamily: "var(--font-sans)" }}>
                          {bizRegLoading ? 'REGISTERING...' : 'REGISTER'}
                        </button>
                      </div>
                    </div>
                  )}

                  {worldBiz.length === 0 && !bizRegOpen && (
                    <p className="text-[10px] text-cyan-400/30 text-center" style={{ fontFamily: "var(--font-sans)" }}>NO BUSINESSES REGISTERED. CLICK + REGISTER TO GET STARTED.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* PABLO Chat — FREE */}
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden" style={{ minHeight: '400px', maxHeight: 'calc(100vh - 180px)' }}>
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Bot className="w-3.5 h-3.5" /> {boomerMode ? 'PABLO' : 'PABLO NEURAL CORE'}
                {currentAgent && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                    currentAgent.provider === 'claude'
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                      : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                  }`} style={{ fontFamily: "var(--font-sans)" }}>
                    {boomerMode
                      ? (currentAgent.provider === 'claude' ? 'CODE EXPERT' : 'QUICK ASSIST')
                      : currentAgent.agentShort
                    }
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearChat} disabled={chatMessages.length === 0}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center gap-4 py-8">
                    <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                      <Bot className="w-7 h-7 text-sky-400/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground mb-1">Hey, I'm PABLO</p>
                      <p className="text-xs text-muted-foreground">I run this whole app. Tell me what you're doing and I'll set it all up for you.</p>
                    </div>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {CHAT_STARTERS.map(s => (
                        <button key={s} onClick={() => handleSendChat(s)}
                          className="text-left text-xs px-3 py-2 rounded-xl bg-muted/40 hover:bg-sky-500/10 hover:text-sky-300 border border-border hover:border-sky-500/30 text-muted-foreground transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <>
                    {businessMemory && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/5 border border-sky-500/15 text-[11px] text-sky-400/70">
                        <Brain className="w-3 h-3 shrink-0" />
                        <span className="flex-1 line-clamp-1">{businessMemory.split('\n')[0].replace(/^[•\-*]\s*/, '')}</span>
                        <button onClick={clearMemory} className="text-muted-foreground/40 hover:text-red-400 transition-colors text-[10px]">forget</button>
                      </div>
                    )}

                    {chatMessages.map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                          ${msg.role === 'user'
                            ? 'bg-primary/20 text-foreground rounded-br-md'
                            : 'bg-muted/50 text-foreground rounded-bl-md border border-border/50'}`}>
                          {msg.role === 'assistant' ? (
                            <>
                              <MarkdownRenderer content={msg.content} />
                              {chatStreaming && i === chatMessages.length - 1 && (
                                <span className="inline-block w-1.5 h-3.5 bg-sky-400 ml-0.5 animate-pulse rounded-sm align-middle" />
                              )}
                            </>
                          ) : msg.content}
                        </div>

                        {msg.role === 'assistant' && !chatStreaming && (
                          <div className="flex items-center gap-1 mt-1 ml-1">
                            {msg.agent && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                msg.agent.provider === 'claude'
                                  ? 'bg-orange-500/10 text-orange-400/70 border-orange-500/20'
                                  : 'bg-sky-500/10 text-sky-400/70 border-sky-500/20'
                              }`} style={{ fontFamily: "var(--font-sans)" }}>
                                {boomerMode
                                  ? (msg.agent.provider === 'claude' ? 'Code Expert' : 'Quick Assist')
                                  : msg.agent.agentShort
                                }
                              </span>
                            )}
                            <button onClick={() => voice.speakResponse(msg.content)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-sky-500/20 bg-sky-500/10 text-sky-400/70 hover:text-sky-400 hover:bg-sky-500/20 transition-colors"
                              style={{ fontFamily: "var(--font-sans)" }}
                              title="Hear PABLO say this">
                              <Volume2 className="w-3 h-3" /> {boomerMode ? 'HEAR THIS' : 'PLAY'}
                            </button>
                          </div>
                        )}

                        {msg.role === 'assistant' && msg.action && !chatStreaming && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.95, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            onClick={() => handlePABLOAction(msg.action!)}
                            className="mt-2 max-w-[85%] w-full flex items-center gap-3 px-4 py-3 rounded-2xl rounded-tl-md bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-500/50 transition-all group text-left"
                          >
                            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0 group-hover:bg-sky-500/30 transition-colors">
                              <ArrowRight className="w-4 h-4 text-sky-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-sky-300 truncate">{msg.action.label}</p>
                              {msg.action.description && (
                                <p className="text-[11px] text-sky-400/60 truncate">{msg.action.description}</p>
                              )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-sky-400/40 group-hover:text-sky-400 transition-colors shrink-0" />
                          </motion.button>
                        )}
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {conv.isConvMode && (
                <div className="border-t border-sky-500/20 px-3 py-2 shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/5 border border-sky-500/20">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      conv.convState === 'listening' ? 'bg-sky-400 animate-pulse' :
                      conv.convState === 'processing' ? 'bg-amber-400 animate-pulse' :
                      conv.convState === 'speaking' ? 'bg-purple-400 animate-pulse' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-xs flex-1" style={{ fontFamily: "var(--font-sans)", letterSpacing: '0.06em',
                      color: conv.convState === 'listening' ? 'rgba(52,211,153,0.8)' :
                             conv.convState === 'processing' ? 'rgba(251,191,36,0.8)' :
                             conv.convState === 'speaking' ? 'rgba(192,132,252,0.8)' :
                             'rgba(156,163,175,0.6)'
                    }}>
                      {conv.convState === 'listening' ? 'Listening... speak now' :
                       conv.convState === 'processing' ? 'Pablo is thinking...' :
                       conv.convState === 'speaking' ? 'Pablo is speaking...' :
                       'Voice conversation active'}
                    </span>
                    <button onClick={conv.stopConversation}
                      className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors"
                      style={{ fontFamily: "var(--font-sans)" }}>
                      END
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground/25 mt-1 text-center" style={{ fontFamily: "var(--font-sans)" }}>
                    Say "goodbye Pablo" to end · All exchanges saved to chat
                  </p>
                </div>
              )}

              {/* Chat input + Voice PABLO */}
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border focus-within:border-sky-500/40 transition-colors px-3 py-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="tell me what you're doing, I'll set it up..."
                    rows={1}
                    disabled={chatStreaming || conv.isConvMode}
                    className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 max-h-32 overflow-y-auto"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />

                  <button onClick={() => handleSendChat()} disabled={!chatInput.trim() || chatStreaming || conv.isConvMode}
                    className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {chatStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>

                {voice.liveTranscript && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-[10px] text-purple-400/60 mb-1" style={{ fontFamily: "var(--font-sans)" }}>
                      {voice.isListening ? 'RECORDING:' : 'PABLO HEARS:'}
                    </p>
                    <p className="text-sm text-purple-300 italic">"{voice.liveTranscript}"</p>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => voice.isListening ? voice.stopListening() : voice.startListening(handleVoiceSend)}
                    disabled={chatStreaming || conv.isConvMode}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                      ${voice.isListening
                        ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                        : 'bg-purple-500/15 border-purple-500/30 text-purple-400 hover:bg-purple-500/25'}`}
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {voice.isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {voice.isListening ? (voice.liveTranscript ? 'SEND' : 'LISTENING...') : (boomerMode ? 'SPEAK TO PABLO' : 'MIC')}
                  </button>

                  <button
                    onClick={() => {
                      if (voice.isSpeaking) { voice.stopSpeaking(); }
                      setAutoSpeakEnabled(p => !p);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors
                      ${autoSpeakEnabled
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-muted/30 border-border text-muted-foreground/40 hover:text-foreground hover:bg-muted/50'}`}
                    style={{ fontFamily: "var(--font-sans)" }}
                    title={autoSpeakEnabled ? 'PABLO reads every response aloud' : 'PABLO stays silent'}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {autoSpeakEnabled ? (boomerMode ? 'PABLO VOICE ON' : 'VOICE ON') : (boomerMode ? 'PABLO VOICE OFF' : 'VOICE OFF')}
                  </button>

                  {conv.isSupported && (
                    <button
                      onClick={() => conv.isConvMode ? conv.stopConversation() : conv.startConversation()}
                      disabled={chatStreaming && !conv.isConvMode}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${conv.isConvMode
                          ? 'bg-sky-500/25 border-sky-500/50 text-sky-400 animate-pulse'
                          : conv.permissionDenied
                          ? 'bg-red-500/15 border-red-500/30 text-red-400'
                          : 'bg-sky-500/10 border-sky-500/25 text-sky-400/60 hover:bg-sky-500/20 hover:text-sky-400'}`}
                      style={{ fontFamily: "var(--font-sans)" }}
                      title={conv.permissionDenied ? 'Microphone access denied — open app in a new browser tab to enable' : conv.isConvMode ? 'End conversation mode' : 'Hands-free back-and-forth with PABLO'}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      {conv.isConvMode ? 'END CONV' : conv.permissionDenied ? 'MIC BLOCKED' : (boomerMode ? 'CONVERSATION MODE' : 'CONV')}
                    </button>
                  )}
                  {conv.permissionDenied && (
                    <span className="text-[10px] text-red-400/80" style={{ fontFamily: "var(--font-sans)" }}>
                      Open in new tab for mic access
                    </span>
                  )}
                  {voice.micError && (
                    <span className="text-[10px] text-red-400/80" style={{ fontFamily: "var(--font-sans)" }}>
                      {voice.micError}
                    </span>
                  )}

                  {voice.isSpeaking && (
                    <button
                      onClick={() => voice.stopSpeaking()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-colors ml-auto"
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      <X className="w-3.5 h-3.5" />
                      STOP
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center" style={{ fontFamily: "var(--font-sans)" }}>
                  {voice.isListening ? 'Listening... tap MIC again or wait to send' :
                   conv.isConvMode ? 'Voice conversation active — speak naturally' :
                   voice.isSpeaking ? 'PABLO is speaking...' :
                   'Enter to send · Tap MIC to speak · PABLO reads replies aloud'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 2: Web Analyzer — FREE ── */}
        <div id="web-analyzer" className="w-full">
          <WebsiteAnalyzer />
        </div>

      </main>

    </div>
  );
}
