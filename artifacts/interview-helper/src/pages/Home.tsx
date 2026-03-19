import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Bot, ArrowRight, Clock, X, Zap, Globe, Brain, Loader2, Send, MessageSquare, Mic, MicOff, Volume2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAdvisorChat } from '@/hooks/use-interview';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { OnboardingModal } from '@/components/OnboardingModal';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { CITY_NAME } from '@/gameSystems';
import { WebsiteAnalyzer } from '@/components/WebsiteAnalyzer';
import { ProGate } from '@/components/ProGate';

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

  const speakResponse = useCallback((text: string) => {
    const clean = text.replace(/[#*`_~\[\]()>]/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'es-ES';
    u.rate = 0.95;
    u.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('male'))
      || voices.find(v => v.lang.startsWith('es'))
      || voices.find(v => v.lang.startsWith('en'));
    if (spanishVoice) u.voice = spanishVoice;

    setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { isHolding, isTranscribing, isSpeaking, startHold, stopHold, speakResponse, stopSpeaking };
}

export default function Home() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { isPro, isTrial, trialDaysLeft, trialHoursLeft } = usePlan();
  const [trialBanner, setTrialBanner] = useState(() => {
    return isTrial && !localStorage.getItem(TRIAL_SEEN_KEY);
  });
  const dismissTrialBanner = () => { localStorage.setItem(TRIAL_SEEN_KEY, '1'); setTrialBanner(false); };
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [serverOnline, setServerOnline] = useState<number | null>(null);
  const [serverMax, setServerMax] = useState(50);
  const [gameSave, setGameSave] = useState<{ salary: number; goldBalance: number; level: number; hp: number; maxHp: number; savings: number } | null>(null);

  const [translatorText, setTranslatorText] = useState('');
  const [translatorFrom, setTranslatorFrom] = useState('vi');
  const [translatorTo, setTranslatorTo] = useState('en');
  const [translatorResult, setTranslatorResult] = useState('');
  const [translatorListening, setTranslatorListening] = useState(false);
  const translatorRecRef = useRef<{ stop: () => void } | null>(null);

  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);
  const lastSpokenRef = useRef(-1);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${import.meta.env.BASE_URL}api/world/server-status`).then(r => r.json()).then(d => { setServerOnline(d.online ?? 0); setServerMax(d.max ?? 50); }).catch(() => {});
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const parseFields = (s: Record<string, unknown>) => ({
      salary: Number(s.salary ?? 0),
      goldBalance: Number(s.goldBalance ?? 0),
      level: Number(s.level ?? 1),
      hp: Number(s.hp ?? 100),
      maxHp: Number(s.maxHp ?? 100),
      savings: Number(s.savings ?? 0),
    });
    let localLevel = 0;
    try {
      const raw = localStorage.getItem('sm_save');
      if (raw) { const p = parseFields(JSON.parse(raw)); localLevel = p.level; setGameSave(p); }
    } catch {}
    if (isAuthenticated) {
      fetch(`${import.meta.env.BASE_URL}api/salaryman/saves`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (!res?.saves?.length) return;
          const newest = res.saves.reduce((a: { lastSavedAt: string }, b: { lastSavedAt: string }) =>
            new Date(b.lastSavedAt) > new Date(a.lastSavedAt) ? b : a);
          if (newest?.data) {
            const cloud = parseFields(newest.data as Record<string, unknown>);
            if (cloud.level >= localLevel) setGameSave(cloud);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const { messages: chatMessages, businessMemory, isStreaming: chatStreaming, send: sendChat, clear: clearChat, clearMemory, updateMemory } = useAdvisorChat();

  const handlePABLOAction = (action: { to: string; tab?: string; autoFill?: Record<string, unknown> }) => {
    if (action.autoFill || action.tab) {
      const prefill = { ...action.autoFill, tab: action.tab, _ts: Date.now() };
      localStorage.setItem('devdocs_action_prefill', JSON.stringify(prefill));
      window.dispatchEvent(new CustomEvent('pablo-action', { detail: prefill }));
    }
    navigate(action.to);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const voice = usePabloVoice();

  useEffect(() => {
    if (!autoSpeakEnabled || !isPro) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || chatStreaming) return;
    const idx = chatMessages.length - 1;
    if (idx > lastSpokenRef.current) {
      lastSpokenRef.current = idx;
      voice.speakResponse(lastMsg.content);
    }
  }, [chatMessages, chatStreaming, autoSpeakEnabled, isPro, voice]);

  const handleSendChat = (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim()) return;
    setChatInput('');
    sendChat(msg);
  };

  const handleVoiceSend = useCallback((transcript: string) => {
    sendChat(transcript);
  }, [sendChat]);

  const LANGUAGES = [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['tl','Filipino'],['id','Indonesian'],['ms','Malay'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['pl','Polish'],['tr','Turkish']];

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <OnboardingModal onComplete={updateMemory} />

      {/* City Info Bar */}
      <div className="relative z-20 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, rgba(0,255,65,0.04), rgba(0,180,50,0.02))', borderBottom: '1px solid rgba(0,255,65,0.12)' }}>
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Terminal className="w-4 h-4" style={{ color: 'rgba(0,255,65,0.5)' }} />
            <div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', color: 'rgba(0,255,65,0.8)', letterSpacing: '0.15em', lineHeight: 1 }}>{CITY_NAME}</div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.5rem', color: 'rgba(0,255,65,0.3)', letterSpacing: '0.1em' }}>SERVER: PST · ONLINE · {typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'}</div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.1em' }}>POPULATION</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.6)' }}>{serverOnline !== null ? `${serverOnline} / ${serverMax}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.1em' }}>ƒ SALARY</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.6)' }}>{gameSave ? `ƒ${gameSave.salary.toLocaleString()}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(180,255,100,0.25)', letterSpacing: '0.1em' }}>NET WORTH</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(180,255,100,0.7)' }}>{gameSave ? `ƒ${(gameSave.salary + gameSave.goldBalance * 100000).toLocaleString()}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(255,204,0,0.25)', letterSpacing: '0.1em' }}>GOLD</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,204,0,0.7)' }}>{gameSave ? `${gameSave.goldBalance} oz` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(255,100,100,0.25)', letterSpacing: '0.1em' }}>♥ HEARTS</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,100,100,0.7)' }}>{gameSave ? `LV.${gameSave.level} · ${gameSave.hp}/${gameSave.maxHp}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(100,200,255,0.25)', letterSpacing: '0.1em' }}>AVAILABLE</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(100,200,255,0.7)' }}>{gameSave ? `$${(gameSave.savings * 0.012).toFixed(2)}` : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trial Banner */}
      <AnimatePresence>
        {trialBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="relative z-20 flex items-center gap-3 px-4 py-2.5"
            style={{ background: 'rgba(255,165,0,0.07)', borderBottom: '1px solid rgba(255,165,0,0.25)' }}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,165,0,0.8)' }} />
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', color: 'rgba(255,165,0,0.75)', letterSpacing: '0.08em', flex: 1 }}>
              <strong style={{ color: 'rgba(255,165,0,0.95)' }}>7-DAY FREE TRIAL STARTED.</strong>
              {' '}All augmentation modules active for {trialDaysLeft > 1 ? `${trialDaysLeft} more days` : `${trialHoursLeft} more hours`}. No card required.
            </span>
            <a href="/upgrade" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', color: 'rgba(255,165,0,0.8)', letterSpacing: '0.08em', textDecoration: 'underline', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Zap className="w-3 h-3" /> Upgrade early →
            </a>
            <button onClick={dismissTrialBanner} style={{ color: 'rgba(255,165,0,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 0.2rem', lineHeight: 1 }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col p-4 md:p-6 relative z-10 min-h-0 gap-6">

        {/* ── ROW 1: Translator (left) + PABLO Chat (right) ── */}
        <div className="flex flex-col lg:flex-row gap-6 min-h-0">

          {/* Translator — FREE */}
          <div className="lg:w-80 shrink-0 space-y-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-cyan-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'TRANSLATOR — FREE' : PABLO_PRODUCTS.TRANSLATOR.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <select value={translatorFrom} onChange={e => setTranslatorFrom(e.target.value)}
                  className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <button onClick={() => { const f = translatorFrom; setTranslatorFrom(translatorTo); setTranslatorTo(f); }}
                  className="px-1.5 py-1 text-[10px] font-bold rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0"
                  title="Swap languages">⇄</button>
                <select value={translatorTo} onChange={e => setTranslatorTo(e.target.value)}
                  className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
                </select>
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
                    ${translatorListening ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20'}`}>
                  <Mic className="w-3 h-3" />
                  {translatorListening ? 'Stop' : 'Speak'}
                </button>
              </div>
              <textarea value={translatorText} onChange={e => setTranslatorText(e.target.value)}
                placeholder="Type or speak text to translate..."
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none mb-2"
                style={{ fontFamily: "'Share Tech Mono', monospace", minHeight: 48 }} />
              <button onClick={async () => {
                if (!translatorText.trim()) return;
                setTranslatorResult('Translating...');
                try {
                  const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(translatorText)}&langpair=${translatorFrom}|${translatorTo}`);
                  const data = await res.json();
                  setTranslatorResult(data.responseData?.translatedText ?? 'Translation unavailable.');
                } catch { setTranslatorResult('Translation service unavailable. Try again.'); }
              }}
                className={`w-full flex items-center justify-center gap-2 px-3 ${boomerMode ? 'py-2.5 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors mb-2`}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                <ArrowRight className="w-3 h-3" /> TRANSLATE
              </button>
              {translatorResult && translatorResult !== 'Translating...' && (
                <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 flex items-start gap-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-cyan-300 flex-1`} style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>{translatorResult}</p>
                  <button onClick={() => {
                    const u = new SpeechSynthesisUtterance(translatorResult);
                    const langMap: Record<string,string> = { en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-BR',ja:'ja-JP',ko:'ko-KR',zh:'zh-CN',vi:'vi-VN',th:'th-TH',tl:'fil-PH',id:'id-ID',ms:'ms-MY',ar:'ar-SA',ru:'ru-RU',hi:'hi-IN',it:'it-IT',nl:'nl-NL',sv:'sv-SE',pl:'pl-PL',tr:'tr-TR' };
                    u.lang = langMap[translatorTo] ?? translatorTo;
                    u.rate = 0.9;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                    title="Hear translation">
                    🔊 {boomerMode ? 'HEAR IT' : 'PLAY'}
                  </button>
                </div>
              )}
              {translatorResult === 'Translating...' && (
                <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-cyan-300`} style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>{translatorResult}</p>
                </div>
              )}
            </div>
          </div>

          {/* PABLO AI Chat — FREE */}
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden max-h-[60vh] lg:max-h-[calc(100vh-260px)]">
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Bot className="w-3.5 h-3.5" /> {boomerMode ? 'PABLO AI' : 'PABLO NEURAL CORE'}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearChat} disabled={chatMessages.length === 0}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center gap-4 py-8">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <Bot className="w-7 h-7 text-emerald-400/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground mb-1">Hey, I'm PABLO</p>
                      <p className="text-xs text-muted-foreground">I run this whole app. Tell me what you're doing and I'll set it all up for you.</p>
                    </div>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {CHAT_STARTERS.map(s => (
                        <button key={s} onClick={() => handleSendChat(s)}
                          className="text-left text-xs px-3 py-2 rounded-xl bg-muted/40 hover:bg-emerald-500/10 hover:text-emerald-300 border border-border hover:border-emerald-500/30 text-muted-foreground transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <>
                    {businessMemory && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-400/70">
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
                                <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse rounded-sm align-middle" />
                              )}
                            </>
                          ) : msg.content}
                        </div>

                        {msg.role === 'assistant' && !chatStreaming && (
                          <div className="flex items-center gap-1 mt-1 ml-1">
                            <button onClick={() => voice.speakResponse(msg.content)}
                              className="p-1 rounded-md text-muted-foreground/40 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                              title="Hear PABLO say this">
                              <Volume2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {msg.role === 'assistant' && msg.action && !chatStreaming && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.95, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            onClick={() => handlePABLOAction(msg.action!)}
                            className="mt-2 max-w-[85%] w-full flex items-center gap-3 px-4 py-3 rounded-2xl rounded-tl-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 transition-all group text-left"
                          >
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/30 transition-colors">
                              <ArrowRight className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-emerald-300 truncate">{msg.action.label}</p>
                              {msg.action.description && (
                                <p className="text-[11px] text-emerald-400/60 truncate">{msg.action.description}</p>
                              )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-emerald-400/40 group-hover:text-emerald-400 transition-colors shrink-0" />
                          </motion.button>
                        )}
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Chat input + Voice PABLO */}
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border focus-within:border-emerald-500/40 transition-colors px-3 py-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="tell me what you're doing, I'll set it up..."
                    rows={1}
                    disabled={chatStreaming}
                    className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 max-h-32 overflow-y-auto"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />

                  {/* Voice Hold Button — PRO */}
                  <ProGate inline feature={boomerMode ? 'Voice PABLO' : 'VOX PABLO'}>
                    <button
                      onMouseDown={() => voice.startHold(handleVoiceSend)}
                      onMouseUp={() => voice.stopHold()}
                      onMouseLeave={() => { if (voice.isHolding) voice.stopHold(); }}
                      onTouchStart={(e) => { e.preventDefault(); voice.startHold(handleVoiceSend); }}
                      onTouchEnd={() => voice.stopHold()}
                      disabled={chatStreaming || voice.isTranscribing}
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${voice.isHolding
                          ? 'bg-red-500/30 border-red-500/50 text-red-400 scale-110 animate-pulse'
                          : voice.isSpeaking
                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                            : 'bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30'}`}
                      title={boomerMode ? 'Hold to talk to PABLO (Pro)' : 'VOX HOLD — Speak to PABLO'}
                    >
                      {voice.isHolding ? <Mic className="w-4 h-4" /> :
                       voice.isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> :
                       voice.isSpeaking ? <Volume2 className="w-4 h-4" /> :
                       <Mic className="w-4 h-4" />}
                    </button>
                  </ProGate>

                  {/* Auto-speak toggle — PRO */}
                  {isPro && (
                    <button
                      onClick={() => {
                        if (voice.isSpeaking) { voice.stopSpeaking(); }
                        setAutoSpeakEnabled(p => !p);
                      }}
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors
                        ${autoSpeakEnabled
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : 'bg-muted/30 border-border text-muted-foreground/40 hover:text-foreground hover:bg-muted/50'}`}
                      title={autoSpeakEnabled ? 'Auto-speak ON — PABLO reads responses aloud' : 'Auto-speak OFF'}
                    >
                      {voice.isSpeaking ? <MicOff className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  )}

                  <button onClick={() => handleSendChat()} disabled={!chatInput.trim() || chatStreaming}
                    className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {chatStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center">Enter to send · Shift+Enter for new line · Hold mic to speak</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 2: Web Analyzer — FREE ── */}
        <div className="w-full">
          <WebsiteAnalyzer />
        </div>

      </main>
    </div>
  );
}
