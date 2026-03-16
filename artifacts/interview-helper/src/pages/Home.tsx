import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy, Mic, Loader2, Radio, ScanSearch, Bot, Square, Keyboard, RotateCcw, MessageSquare, Send, Brain, ArrowRight, Clock, X, Zap, Globe } from 'lucide-react';
import { useLocation } from 'wouter';
import { useInterviewSolver, useVoiceListen, useScreenScan, useTypingSimulator, useAdvisorChat, type InterviewMode } from '@/hooks/use-interview';
import { ActionPanel } from '@/components/ActionPanel';
import { StatusIndicator } from '@/components/StatusIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { NavBar } from '@/components/NavBar';
import { OnboardingModal } from '@/components/OnboardingModal';
import { ProGate } from '@/components/ProGate';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

const TRIAL_SEEN_KEY = 'sm_trial_welcome_seen';

const LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'C#', 'Ruby', 'Swift'
];

const CHAT_STARTERS = [
  'hey i\'m conducting an interview — what tools should i use and can you set it up?',
  'i have a zoom call in 10 minutes, what should i prepare?',
  'can you build me a presentation on why we should expand into insurance?',
  'what\'s the best way to use this app for a sales meeting?',
  'analyze these competitor sites for me',
];

export default function Home() {
  const [, navigate] = useLocation();
  const { isPro, isTrial, trialDaysLeft, trialHoursLeft } = usePlan();
  const [trialBanner, setTrialBanner] = useState(() => {
    return isTrial && !localStorage.getItem(TRIAL_SEEN_KEY);
  });
  const dismissTrialBanner = () => { localStorage.setItem(TRIAL_SEEN_KEY, '1'); setTrialBanner(false); };
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState('Python');
  const [copied, setCopied] = useState(false);
  const [activePanel, setActivePanel] = useState<'solve' | 'listen' | 'scan'>('solve');
  const [typeMode, setTypeMode] = useState(false);
  const [rightTab, setRightTab] = useState<'output' | 'chat'>('chat');
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
      hp: Number(s.hp ?? 0),
      maxHp: Number(s.maxHp ?? 350),
      savings: Number(s.savings ?? 0),
    });
    let localLevel = 0;
    try {
      const raw = localStorage.getItem('sm_save');
      if (raw) { const p = parseFields(JSON.parse(raw)); localLevel = p.level; setGameSave(p); }
    } catch {}
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
  }, []);

  const { response, status, isStreaming, solve, cancel, reset } = useInterviewSolver();
  const { listenStatus, answer: listenAnswer, startListening, stopListening, reset: resetListen, isRecording, isProcessing: isListenProcessing } = useVoiceListen();
  const { scanStatus, answer: scanAnswer, autoPilot, countdown, lastScanMode, intervalSecs, setIntervalSecs, scanOnce, scanChat, startAutoPilot, stopStream, reset: resetScan, isConnecting, isAnalyzing } = useScreenScan();
  const { displayedText, isTyping, isDone: typingDone, start: startTyping, stop: stopTyping, reset: resetTyping } = useTypingSimulator();
  const { messages: chatMessages, businessMemory, isStreaming: chatStreaming, send: sendChat, clear: clearChat, clearMemory, updateMemory } = useAdvisorChat();

  const handlePABLOAction = (action: { to: string; tab?: string; autoFill?: Record<string, unknown> }) => {
    if (action.autoFill || action.tab) {
      localStorage.setItem('devdocs_action_prefill', JSON.stringify({
        ...action.autoFill,
        tab: action.tab,
        _ts: Date.now(),
      }));
    }
    navigate(action.to);
  };

  const displayResponse = activePanel === 'listen' ? listenAnswer : activePanel === 'scan' ? scanAnswer : response;

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const displayStatus = activePanel === 'listen' ? listenStatus : activePanel === 'scan' ? scanStatus : status;
  const canTypeMode = !!displayResponse && (displayStatus === 'done' || displayStatus === 'ready');

  // Extract plain text from markdown for typing (strip markdown formatting for code blocks)
  const getTypableText = () => {
    // Pull out fenced code blocks content, fall back to full text
    const codeMatch = displayResponse.match(/```[\w]*\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1] : displayResponse;
  };

  const handleToggleTypeMode = () => {
    if (!typeMode) {
      resetTyping();
      setTypeMode(true);
      const speed = (activePanel === 'scan' && lastScanMode === 'chat') ? 'chat' : 'code';
      startTyping(getTypableText(), speed);
    } else {
      stopTyping();
      setTypeMode(false);
    }
  };

  const handleRestartTyping = () => {
    resetTyping();
    const speed = (activePanel === 'scan' && lastScanMode === 'chat') ? 'chat' : 'code';
    startTyping(getTypableText(), speed);
  };

  // Reset type mode when response changes
  useEffect(() => {
    if (typeMode) { stopTyping(); setTypeMode(false); }
  }, [displayResponse]);

  // Auto-start Type Mode after a chat reply scan completes — fast/natural speed
  useEffect(() => {
    if (activePanel === 'scan' && scanStatus === 'done' && lastScanMode === 'chat' && scanAnswer && !typeMode) {
      resetTyping();
      setTypeMode(true);
      startTyping(scanAnswer, 'chat');
    }
  }, [scanStatus, lastScanMode]);

  const handleAction = (mode: InterviewMode) => {
    setActivePanel('solve');
    setTypeMode(false);
    resetListen(); resetScan();
    solve(question, language, mode);
  };

  const handleListen = () => {
    if (isRecording) { stopListening(); return; }
    setActivePanel('listen'); setTypeMode(false);
    reset(); resetScan();
    startListening();
  };

  const handleScanOnce = () => {
    setActivePanel('scan'); setTypeMode(false);
    reset(); resetListen();
    scanOnce();
  };

  const handleChatScan = () => {
    setActivePanel('scan'); setTypeMode(false);
    reset(); resetListen();
    scanChat();
  };

  const handleAutoPilot = () => {
    setActivePanel('scan'); setTypeMode(false);
    reset(); resetListen();
    startAutoPilot();
  };

  const handleStopAutoPilot = () => { stopStream(); setActivePanel('solve'); };

  const handleCopy = () => {
    const text = typeMode ? displayedText : displayResponse;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    reset(); resetListen(); stopStream(); resetTyping();
    setTypeMode(false); setActivePanel('solve');
  };

  const handleSendChat = (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim()) return;
    setChatInput('');
    sendChat(msg);
  };

  const isAnyBusy = isStreaming || isRecording || isListenProcessing || isConnecting || isAnalyzing;

  const typingProgress = displayedText.length / (getTypableText().length || 1);

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <NavBar />
      <OnboardingModal onComplete={updateMemory} />

      {/* City Info Section */}
      <div className="relative z-20 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, rgba(0,255,65,0.04), rgba(0,180,50,0.02))', borderBottom: '1px solid rgba(0,255,65,0.12)' }}>
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Terminal className="w-4 h-4" style={{ color: 'rgba(0,255,65,0.5)' }} />
            <div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', color: 'rgba(0,255,65,0.8)', letterSpacing: '0.15em', lineHeight: 1 }}>MINX CITY</div>
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

      {/* Terminal economy framing */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-2"
        style={{ background: 'rgba(0,255,65,0.03)', borderBottom: '1px solid rgba(0,255,65,0.08)' }}>
        <Terminal className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(0,255,65,0.35)' }} />
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', color: 'rgba(0,255,65,0.4)', letterSpacing: '0.08em', flex: 1 }}>
          <strong style={{ color: 'rgba(0,255,65,0.6)' }}>{boomerMode ? 'FREE TOOLS' : 'FREE TERMINAL'}</strong>
          {' '}— {boomerMode ? 'PABLO AI chat & Translator included free. Upgrade for Interview Solver, Screen Scanner, Voice Listener & more.' : 'PABLO AI & BABEL-3 LINGUAL CORTEX included free on all terminals. Upgrade device for full augmentation suite.'}
        </span>
      </div>

      {/* ── 7-day trial welcome banner ── */}
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

      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 min-h-0">

        {/* LEFT PANEL */}
        <section className="flex flex-col h-full space-y-3">

          {/* ── TRANSLATOR TOOL — free ── */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-cyan-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'TRANSLATOR — FREE' : PABLO_PRODUCTS.TRANSLATOR.name}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <select value={translatorFrom} onChange={e => setTranslatorFrom(e.target.value)}
                className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['tl','Filipino'],['id','Indonesian'],['ms','Malay'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['pl','Polish'],['tr','Turkish']].map(([code,name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              <button onClick={() => { const f = translatorFrom; setTranslatorFrom(translatorTo); setTranslatorTo(f); }}
                className="px-1.5 py-1 text-[10px] font-bold rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors shrink-0"
                title="Swap languages">
                ⇄
              </button>
              <select value={translatorTo} onChange={e => setTranslatorTo(e.target.value)}
                className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['tl','Filipino'],['id','Indonesian'],['ms','Malay'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['pl','Polish'],['tr','Turkish']].map(([code,name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
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
                if (!SRCtor) {
                  setTranslatorResult('Speech recognition not supported in this browser.');
                  return;
                }
                setTranslatorListening(true);
                const rec = new SRCtor();
                translatorRecRef.current = rec;
                rec.continuous = false; rec.interimResults = true; rec.lang = translatorFrom;
                rec.onresult = (ev) => {
                  const transcript = Array.from(ev.results).map(r => r[0].transcript).join('');
                  setTranslatorText(transcript);
                };
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
              } catch {
                setTranslatorResult('Translation service unavailable. Try again.');
              }
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

          {/* ═══════════════════════════════════════════════════════
              PAID FEATURES BELOW — requires subscription
              ═══════════════════════════════════════════════════════ */}

          {/* AUTOPILOT BANNER */}
          <AnimatePresence>
            {autoPilot && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-green-500/50 bg-green-500/10">
                <div className="flex items-center gap-3">
                  <div className="relative w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                    <span className="absolute inset-0 rounded-lg bg-green-500/30 animate-ping" />
                    <Bot className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-green-400 font-bold text-xs leading-none mb-0.5">AUTO-PILOT ACTIVE</p>
                    <p className="text-green-400/60 text-[10px]">
                      {isAnalyzing ? 'Reading screen now...' : countdown > 0 ? `Next scan in ${countdown}s` : 'Scanning...'}
                    </p>
                  </div>
                </div>
                <button onClick={handleStopAutoPilot}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-green-500/20 text-green-400 hover:bg-red-500/20 hover:text-red-400 border border-green-500/30 transition-colors">
                  <Square className="w-3 h-3 fill-current" /> STOP
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CAPTURE BUTTONS */}
          {!autoPilot && (
            <ProGate inline feature={`${PABLO_PRODUCTS.LIVE_LISTEN.short} & ${PABLO_PRODUCTS.SCAN_SCREEN.short}`}>
            <div className="grid grid-cols-2 gap-3">
              {/* LIVE LISTEN */}
              <motion.button onClick={handleListen}
                animate={isRecording ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                transition={isRecording ? { repeat: Infinity, duration: 1.2 } : {}}
                disabled={isListenProcessing || isConnecting || isAnalyzing || isStreaming}
                className={`relative flex flex-col items-start gap-2 px-4 py-3 rounded-2xl border-2 text-left transition-all duration-300
                  ${isRecording ? 'border-red-500 bg-red-500/15 text-red-400'
                    : isListenProcessing ? 'border-orange-500/40 bg-orange-500/10 text-orange-400 cursor-not-allowed'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-500 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed'}`}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isRecording ? 'bg-red-500/30' : 'bg-rose-500/20'}`}>
                    {isRecording && <span className="absolute inset-0 rounded-lg bg-red-500/40 animate-ping" />}
                    {isListenProcessing ? <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                      : isRecording ? <Radio className="w-4 h-4 text-red-400" />
                      : <Mic className="w-4 h-4 text-rose-400" />}
                  </div>
                  <span className={`font-bold ${boomerMode ? 'text-sm' : 'text-xs'}`}>{isRecording ? 'INTERCEPTING...' : isListenProcessing ? 'Processing...' : boomerMode ? 'LIVE LISTEN' : PABLO_PRODUCTS.LIVE_LISTEN.name}</span>
                  {isRecording && (
                    <div className="flex gap-0.5 ml-auto">
                      {[0,1,2].map(i => (
                        <motion.div key={i} className="w-0.5 bg-red-400 rounded-full"
                          animate={{ height: ['6px','14px','6px'] }}
                          transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.15 }} />
                      ))}
                    </div>
                  )}
                </div>
                <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} opacity-60`}>{isRecording ? 'Click to stop' : boomerMode ? 'Click to listen, get notes' : 'Click · Speak · Get bullets'}</p>
              </motion.button>

              {/* SCAN SCREEN */}
              <div className={`flex flex-col gap-1.5 px-4 py-3 rounded-2xl border-2 transition-all duration-300
                ${isConnecting || isAnalyzing ? 'border-sky-500/50 bg-sky-500/10' : 'border-sky-500/40 bg-sky-500/10'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="relative w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
                    {(isConnecting || isAnalyzing) && <span className="absolute inset-0 rounded-lg bg-sky-400/20 animate-ping" />}
                    {isConnecting ? <Loader2 className="w-4 h-4 animate-spin text-sky-400" /> : <ScanSearch className="w-4 h-4 text-sky-400" />}
                  </div>
                  <span className={`font-bold ${boomerMode ? 'text-sm' : 'text-xs'} text-sky-300`}>{boomerMode ? 'SCREEN SCANNER' : `${PABLO_PRODUCTS.SCAN_SCREEN.short} SCANNER`}</span>
                </div>
                {/* Scan Once + Chat Reply */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={handleScanOnce} disabled={isAnyBusy}
                    className={`py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}>
                    {boomerMode ? 'Scan Once' : 'Once'}
                  </button>
                  <button onClick={handleChatScan} disabled={isAnyBusy}
                    className={`py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1`}>
                    💬 {boomerMode ? 'Chat Reply' : 'Chat Reply'}
                  </button>
                </div>
                {/* Auto + speed */}
                <div className="flex items-center gap-1.5">
                  <button onClick={handleAutoPilot} disabled={isAnyBusy}
                    className={`flex-1 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1`}>
                    <Bot className="w-3 h-3" /> {boomerMode ? 'Auto Scan' : 'Auto'}
                  </button>
                  <span className="text-[9px] text-muted-foreground/40">every</span>
                  {[5, 10, 15].map(s => (
                    <button key={s} onClick={() => setIntervalSecs(s)} disabled={isAnyBusy}
                      className={`px-1.5 py-1.5 rounded text-[9px] font-bold transition-colors disabled:cursor-not-allowed
                        ${intervalSecs === s
                          ? 'bg-sky-500/30 text-sky-200 border border-sky-500/50'
                          : 'text-muted-foreground/40 hover:text-sky-300 hover:bg-sky-500/10'}`}>
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </ProGate>
          )}

          {/* PROBLEM DESCRIPTION */}
          <ProGate inline feature={boomerMode ? 'Problem Input' : PABLO_PRODUCTS.PROBLEM_DESC.short}>
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden relative group transition-colors focus-within:border-primary/50">
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code className="w-4 h-4" />{boomerMode ? 'PROBLEM INPUT' : `${PABLO_PRODUCTS.PROBLEM_DESC.short} TERMINAL`}
              </div>
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isAnyBusy}
                  className="bg-transparent text-sm text-foreground font-medium outline-none border-none cursor-pointer focus:ring-0 disabled:opacity-50">
                  {LANGUAGES.map(lang => <option key={lang} value={lang} className="bg-card text-foreground">{lang}</option>)}
                </select>
              </div>
            </div>
            <div className="flex-1 relative p-4">
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder="Or paste the question here..."
                disabled={isAnyBusy}
                className="w-full h-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 font-mono text-[14px] leading-relaxed disabled:opacity-50" />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground/30 pointer-events-none select-none">INPUT_BUFFER</div>
            </div>
          </div>
          </ProGate>

          <ActionPanel onAction={handleAction} isStreaming={isAnyBusy || autoPilot || (!question.trim() && activePanel === 'solve')} isPro={isPro} boomerMode={boomerMode} />

          {/* ── PRINTER TOOLS — quick access ── */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Keyboard className="w-3.5 h-3.5 text-violet-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-violet-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'PRINTER TOOLS' : PABLO_PRODUCTS.PRINTER.name}</span>
              </div>
              {canTypeMode && !isStreaming && (
                <button onClick={handleToggleTypeMode}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-md border transition-colors
                    ${typeMode
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-red-500/20 hover:text-red-300'
                      : 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'}`}>
                  <Keyboard className="w-3 h-3" />
                  {typeMode ? (isTyping ? 'Stop Typing' : 'Exit') : boomerMode ? 'Start Type Mode' : `${PABLO_PRODUCTS.TYPE_MODE.short} — GO`}
                </button>
              )}
            </div>
            <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {typeMode
                ? (isTyping ? 'Typing in progress — mirror this output in your editor.' : typingDone ? 'Typing complete.' : 'Type mode active.')
                : boomerMode ? 'Solve a question first, then have the answer typed out automatically.'
                : PABLO_PRODUCTS.PRINTER.desc}
            </p>
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section className="flex flex-col h-full max-h-[60vh] lg:max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

            {/* Panel header */}
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              {/* Tabs */}
              <div className="flex items-center gap-1">
                <button onClick={() => setRightTab('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors
                    ${rightTab === 'chat' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                  <Bot className="w-3.5 h-3.5" /> {boomerMode ? 'PABLO AI' : 'PABLO'}
                </button>
                <button onClick={() => setRightTab('output')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors
                    ${rightTab === 'output' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                  <Terminal className="w-3.5 h-3.5" /> Output
                </button>
              </div>

              {/* Header actions */}
              <div className="flex items-center gap-2">
                {rightTab === 'output' ? (
                  <>
                    {canTypeMode && !isStreaming && (
                      <button onClick={handleToggleTypeMode}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border transition-colors
                          ${typeMode
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40'
                            : 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'}`}>
                        <Keyboard className="w-3.5 h-3.5" />
                        {typeMode ? (isTyping ? 'Stop' : 'Exit') : PABLO_PRODUCTS.TYPE_MODE.short}
                      </button>
                    )}
                    {typeMode && !isTyping && typingDone && (
                      <button onClick={handleRestartTyping}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 transition-colors" title="Replay">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {isStreaming && (
                      <button onClick={cancel}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                        <StopCircle className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                    <button onClick={handleCopy} disabled={!(typeMode ? displayedText : displayResponse)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={handleReset} disabled={!displayResponse && displayStatus === 'idle' && !autoPilot}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button onClick={clearChat} disabled={chatMessages.length === 0}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Typing progress bar (output tab only) */}
            {rightTab === 'output' && typeMode && (
              <div className="h-0.5 bg-muted/30">
                <motion.div className="h-full bg-violet-500/60" animate={{ width: `${typingProgress * 100}%` }} transition={{ duration: 0.1 }} />
              </div>
            )}

            {/* ── OUTPUT TAB ── */}
            {rightTab === 'output' && (
              <div className="flex-1 overflow-y-auto p-6 relative">
                <AnimatePresence mode="wait">
                  {typeMode ? (
                    <motion.div key="typemode" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <Keyboard className="w-3.5 h-3.5 text-violet-400" />
                        <span className={`${boomerMode ? 'text-sm' : 'text-xs'} text-violet-400 font-mono font-bold`}>{boomerMode ? 'TYPE MODE' : `${PABLO_PRODUCTS.TYPE_MODE.short}`}</span>
                        {isTyping && <span className="text-xs text-muted-foreground font-mono">— mirror this in your editor</span>}
                        {typingDone && <span className="text-xs text-green-400 font-mono">— complete ✓</span>}
                      </div>
                      <pre className="font-mono text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-muted/20 rounded-xl p-4 border border-border min-h-[200px]">
                        {displayedText}
                        {isTyping && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />}
                      </pre>
                    </motion.div>
                  ) : !displayResponse && (displayStatus === 'idle' || displayStatus === 'done') ? (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4 border border-border">
                          <Terminal className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <p className="text-muted-foreground font-mono text-sm">Waiting for execution request...</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-full">
                      <MarkdownRenderer content={displayResponse} />
                      {(isStreaming || isListenProcessing || isAnalyzing) && (
                        <div className="mt-4"><span className="w-2 h-4 bg-primary animate-pulse rounded-sm inline-block" /></div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── CHAT TAB ── */}
            {rightTab === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center gap-4 py-8">
                      {/* PABLO intro */}
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
                      {/* Memory chip */}
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

                          {/* Action card */}
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

                {/* Input */}
                <div className="border-t border-border p-3 shrink-0">
                  <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border focus-within:border-emerald-500/40 transition-colors px-3 py-2">
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChat();
                        }
                      }}
                      placeholder="tell me what you're doing, I'll set it up..."
                      rows={1}
                      disabled={chatStreaming}
                      className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 max-h-32 overflow-y-auto"
                      style={{ fieldSizing: 'content' } as React.CSSProperties}
                    />
                    <button onClick={() => handleSendChat()} disabled={!chatInput.trim() || chatStreaming}
                      className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {chatStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
                </div>
              </div>
            )}

          </div>
        </section>

      </main>
    </div>
  );
}
