import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTranslationLanguage,
  getTranslationPreferences,
  saveTranslationPreferences,
  translateFreeText,
  TRANSLATION_LANGUAGES,
} from '@/lib/translate';

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function speakTextFree(text: string, languageCode: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getTranslationLanguage(languageCode).speechLocale;
  window.speechSynthesis.speak(utterance);
  return true;
}

interface LiveTranslatorProps {
  compact?: boolean;
  title?: string;
  conversationEnabled?: boolean;
  onConversationEnabledChange?: (enabled: boolean) => void;
  onPreferencesChange?: (preferences: { source: string; target: string }) => void;
}

export function LiveTranslator({
  compact = false,
  title = 'LIVE TRANSLATOR',
  conversationEnabled,
  onConversationEnabledChange,
  onPreferencesChange,
}: LiveTranslatorProps) {
  const initial = getTranslationPreferences();
  const [source, setSource] = useState(initial.source);
  const [target, setTarget] = useState(initial.target);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const persistPair = useCallback((nextSource: string, nextTarget: string) => {
    const next = { source: nextSource, target: nextTarget };
    saveTranslationPreferences(next);
    onPreferencesChange?.(next);
  }, [onPreferencesChange]);

  const runTranslation = useCallback(async (text = input) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setOutput(await translateFreeText(text, source, target));
    } catch {
      setOutput('');
      setError('Translation is temporarily unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, input, source, target]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setError('Speech input is not supported in this browser. Type instead.');
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    setError('');
    const recognition = new Recognition();
    recognition.lang = getTranslationLanguage(source).speechLocale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = event => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript ?? '';
      }
      if (transcript.trim()) setInput(transcript.trim());
      const finalResult = event.results[event.results.length - 1];
      if (finalResult && finalResult[0] && finalResult.isFinal) void runTranslation(transcript);
    };
    recognition.onerror = event => {
      setError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : 'Speech input stopped. Try again.');
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch {
      setListening(false);
      recognitionRef.current = null;
      setError('Could not start speech input.');
    }
  }, [listening, runTranslation, source, stopListening]);

  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch {}
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  const swap = () => {
    const nextSource = target;
    const nextTarget = source;
    setSource(nextSource);
    setTarget(nextTarget);
    persistPair(nextSource, nextTarget);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: compact ? '.45rem' : '.7rem',
      color: '#cfe8ff', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
        <div style={{ color: '#38bdf8', fontSize: compact ? '.52rem' : '.65rem', letterSpacing: '.14em' }}>{title}</div>
        {onConversationEnabledChange && (
          <button
            type="button"
            onClick={() => onConversationEnabledChange(!conversationEnabled)}
            style={{
              padding: '.25rem .4rem', background: conversationEnabled ? 'rgba(34,197,94,.12)' : 'transparent',
              border: `1px solid ${conversationEnabled ? 'rgba(34,197,94,.45)' : 'rgba(56,189,248,.25)'}`,
              color: conversationEnabled ? '#86efac' : 'rgba(56,189,248,.7)', cursor: 'pointer',
              fontSize: compact ? '.48rem' : '.55rem', letterSpacing: '.08em',
            }}
          >
            {conversationEnabled ? '● CONVERSATION ON' : '○ CONVERSATION OFF'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '.35rem', alignItems: 'center' }}>
        <select
          value={source}
          onChange={event => { setSource(event.target.value); persistPair(event.target.value, target); }}
          onKeyDown={event => event.stopPropagation()}
          aria-label="Source language"
          style={{ minWidth: 0, padding: '.32rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', fontSize: compact ? '.52rem' : '.62rem' }}
        >
          {TRANSLATION_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.nativeName}</option>)}
        </select>
        <button type="button" onClick={swap} aria-label="Swap languages" style={{ padding: '.25rem .45rem', background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', cursor: 'pointer' }}>⇄</button>
        <select
          value={target}
          onChange={event => { setTarget(event.target.value); persistPair(source, event.target.value); }}
          onKeyDown={event => event.stopPropagation()}
          aria-label="Target language"
          style={{ minWidth: 0, padding: '.32rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', fontSize: compact ? '.52rem' : '.62rem' }}
        >
          {TRANSLATION_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.nativeName}</option>)}
        </select>
      </div>

      <textarea
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={event => event.stopPropagation()}
        placeholder="Type or speak…"
        aria-label="Text to translate"
        style={{ width: '100%', minHeight: compact ? 54 : 76, boxSizing: 'border-box', resize: 'vertical', padding: '.45rem', background: 'rgba(0,8,0,.95)', border: '1px solid rgba(56,189,248,.22)', color: '#cfe8ff', fontSize: compact ? '.58rem' : '.68rem', outline: 'none' }}
      />
      <div style={{ display: 'flex', gap: '.35rem' }}>
        <button type="button" onClick={startListening} style={{ flex: 1, padding: '.35rem .45rem', background: listening ? 'rgba(248,113,113,.12)' : 'rgba(56,189,248,.08)', border: `1px solid ${listening ? 'rgba(248,113,113,.45)' : 'rgba(56,189,248,.3)'}`, color: listening ? '#fca5a5' : '#38bdf8', cursor: 'pointer', fontSize: compact ? '.54rem' : '.62rem' }}>
          {listening ? '■ STOP LISTENING' : '🎙 PUSH TO TALK'}
        </button>
        <button type="button" onClick={() => void runTranslation()} disabled={busy || !input.trim()} style={{ flex: 1, padding: '.35rem .45rem', background: busy ? 'transparent' : 'rgba(56,189,248,.12)', border: '1px solid rgba(56,189,248,.35)', color: busy ? 'rgba(56,189,248,.4)' : '#38bdf8', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer', fontSize: compact ? '.54rem' : '.62rem' }}>
          {busy ? 'TRANSLATING…' : 'TRANSLATE ▶'}
        </button>
      </div>

      {(output || busy) && (
        <div style={{ border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', background: 'rgba(0,8,0,.85)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
            <span style={{ color: 'rgba(56,189,248,.45)', fontSize: '.46rem', letterSpacing: '.12em' }}>TRANSLATION OUTPUT</span>
            {output && <button type="button" onClick={() => { if (!speakTextFree(output, target)) setError('Speech output is not supported in this browser.'); }} style={{ padding: '.2rem .4rem', background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.28)', color: '#38bdf8', cursor: 'pointer', fontSize: '.55rem' }}>🔊 HEAR</button>}
          </div>
          <div style={{ color: '#38bdf8', fontSize: compact ? '.62rem' : '.7rem', lineHeight: 1.55 }}>{busy ? 'Working…' : output}</div>
        </div>
      )}
      {error && <div role="alert" style={{ color: '#fca5a5', fontSize: '.55rem', lineHeight: 1.4 }}>{error}</div>}
      <div style={{ color: 'rgba(56,189,248,.3)', fontSize: '.44rem', lineHeight: 1.45 }}>
        FREE CONVERSATION MODE · browser speech input/output · no phone or PRIME charge
      </div>
    </div>
  );
}