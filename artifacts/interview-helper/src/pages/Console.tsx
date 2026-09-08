import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy, Mic, Loader2, ScanSearch, Bot, Square, Keyboard, RotateCcw, Radio, Upload, FileImage, FileAudio, FileVideo, X, MoreHorizontal } from 'lucide-react';
import { useInterviewSolver, useVoiceListen, useScreenScan, useTypingSimulator, useAdvisorChat, type InterviewMode } from '@/hooks/use-interview';
import { useVoiceConversation } from '@/hooks/use-voice-conversation';
import { useMediaAnalyzer, detectMediaFileType, validateMediaFile } from '@/hooks/use-media-analyzer';
import { ActionPanel } from '@/components/ActionPanel';
import { StatusIndicator } from '@/components/StatusIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ProGate } from '@/components/ProGate';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { TowerLifeHub } from '@/components/TowerLifeHub';
import { useAuth } from '@/hooks/use-auth';

const LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'C#', 'Ruby', 'Swift'
];

export default function Console() {
  const { isPro, features } = usePlan();
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState('Python');
  const [copied, setCopied] = useState(false);
  const [activePanel, setActivePanel] = useState<'solve' | 'listen' | 'scan' | 'media'>('solve');
  const [typeMode, setTypeMode] = useState(false);
  const [showTowerLife, setShowTowerLife] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const { t } = useTranslation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const { response, status, isStreaming, solve, cancel, reset } = useInterviewSolver();
  const { listenStatus, answer: listenAnswer, startListening, stopListening, reset: resetListen, isRecording, isProcessing: isListenProcessing } = useVoiceListen();
  const { scanStatus, answer: scanAnswer, autoPilot, countdown, lastScanMode, intervalSecs, setIntervalSecs, scanOnce, scanChat, startAutoPilot, stopStream, reset: resetScan, isConnecting, isAnalyzing } = useScreenScan();
  const { displayedText, isTyping, isDone: typingDone, start: startTyping, stop: stopTyping, reset: resetTyping } = useTypingSimulator();
  const { messages: convMessages, sendVoice: sendConsoleVoice, isStreaming: convStreaming } = useAdvisorChat();
  const media = useMediaAnalyzer();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const consoleConv = useVoiceConversation({
    onSend: sendConsoleVoice,
    silenceTimeoutMs: 3000,
  });

  const lastConvResponse = consoleConv.isConvMode || convMessages.length > 0
    ? convMessages.filter(m => m.role === 'assistant' && m.content).map(m => m.content).join('\n\n---\n\n')
    : '';

  const displayResponse = consoleConv.isConvMode ? lastConvResponse : activePanel === 'media' ? media.response : activePanel === 'listen' ? listenAnswer : activePanel === 'scan' ? scanAnswer : response;
  const displayStatus = consoleConv.isConvMode
    ? (consoleConv.convState === 'processing' || convStreaming ? 'streaming' : consoleConv.convState === 'idle' && !lastConvResponse ? 'idle' : 'done')
    : activePanel === 'media' ? (media.isAnalyzing ? 'analyzing' : media.status === 'done' ? 'done' : media.status === 'error' ? 'error' : 'idle')
    : activePanel === 'listen' ? listenStatus : activePanel === 'scan' ? scanStatus : status;
  const canTypeMode = !!displayResponse && (displayStatus === 'done' || displayStatus === 'ready');

  const toSolverStatus = (s: typeof displayStatus): import('@/hooks/use-interview').SolverStatus => {
    if (s === 'idle' || s === 'done' || s === 'error') return s;
    if (s === 'thinking' || s === 'streaming') return s;
    if (s === 'recording' || s === 'transcribing' || s === 'connecting') return 'thinking';
    if (s === 'ready') return 'done';
    if (s === 'analyzing') return 'streaming';
    return 'idle';
  };

  const getTypableText = () => {
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

  useEffect(() => {
    if (typeMode) { stopTyping(); setTypeMode(false); }
  }, [displayResponse]);

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

  const { isAuthenticated: _consoleAuth } = useAuth();
  const isAnyBusy = isStreaming || isRecording || isListenProcessing || isConnecting || isAnalyzing || media.isAnalyzing;

  const handleMediaFile = useCallback((file: File) => {
    setActivePanel('media');
    setTypeMode(false);
    reset(); resetListen(); resetScan();
    media.analyze(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isAnyBusy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleMediaFile(file);
  }, [handleMediaFile, isAnyBusy]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleReset = () => {
    reset(); resetListen(); stopStream(); resetTyping(); media.reset();
    setTypeMode(false); setActivePanel('solve');
  };
  const typingProgress = displayedText.length / (getTypableText().length || 1);

  if (!_consoleAuth) {
    return <SignInPage context={boomerMode ? t('console.signInContext') : t('console.signInContextCodename')} returnTo="/console" />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-x-hidden font-sans">
      {/* Restrained depth accents keep the workspace legible without terminal effects. */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full pointer-events-none" style={{ background: 'rgba(52,211,153,0.10)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full pointer-events-none" style={{ background: 'rgba(255,176,0,0.07)' }} />

      {/* TERMINAL WINDOW TITLEBAR */}
      <div className="relative z-40 flex flex-wrap items-center gap-2 px-3 py-2 md:flex-nowrap md:gap-3 md:px-4"
        style={{ background: 'rgba(8,12,10,0.65)', borderBottom: '1px solid rgba(52,211,153,0.18)' }}>
        {/* Compact workspace identity. Decorative window chrome is intentionally
            omitted so the action row never competes with the app navigation. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5" style={{ fontSize: '0.62rem', letterSpacing: '0.05em', textShadow: '0 0 6px rgba(52,211,153,0.35)' }}>
          <Terminal className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(52,211,153,0.85)' }} />
          <span className="hidden sm:inline" style={{ color: 'rgba(52,211,153,0.6)' }}>pablo@cipher-x</span>
          <span className="hidden sm:inline" style={{ color: 'rgba(120,160,140,0.5)' }}>:</span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,176,0,0.75)' }}>~</span>
          <span className="hidden sm:inline" style={{ color: 'rgba(120,160,140,0.5)' }}>$</span>
          <span className="truncate" style={{ color: 'rgba(190,235,210,0.9)' }}>
            ./{(boomerMode ? t('console.terminal') : PABLO_PRODUCTS.CONSOLE.short).toLowerCase()} --all-modules
          </span>
          <span className="hidden sm:inline-block w-[7px] h-[13px] ml-0.5 align-middle animate-pulse" style={{ background: 'rgba(52,211,153,0.8)' }} />
        </div>
        <div className="console-titlebar-actions relative flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-2 py-1 md:hidden"
          aria-label="Open console navigation"
          aria-expanded={showMobileActions}
          onClick={() => setShowMobileActions((open) => !open)}
          style={{
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            color: 'rgba(190,235,210,0.9)',
            border: '1px solid rgba(52,211,153,0.28)',
            background: showMobileActions ? 'rgba(52,211,153,0.12)' : 'transparent',
          }}
        >
          {showMobileActions ? <X className="h-3 w-3" /> : <MoreHorizontal className="h-3 w-3" />}
          MORE
        </button>
        <Link
          href="/pablo"
          data-testid="console-open-pablo"
          className="hidden items-center gap-1.5 rounded px-2 py-1 md:inline-flex"
          style={{
            fontSize: '0.55rem',
            letterSpacing: '0.1em',
            color: 'rgba(236,72,153,0.9)',
            border: '1px solid rgba(236,72,153,0.32)',
            background: 'rgba(236,72,153,0.06)',
          }}
          title="Open Pablo"
        >
          <Radio className="w-3 h-3" />
          PABLO
        </Link>
          <Link
            href="/phone?from=terminal"
            data-testid="console-open-phone"
            className="hidden items-center gap-1.5 rounded px-2 py-1 md:inline-flex"
            style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'rgba(110,231,183,0.95)', border: '1px solid rgba(110,231,183,0.32)', background: 'rgba(110,231,183,0.06)' }}
            title="Open Phone System"
          >
            <Radio className="w-3 h-3" />
            PHONE SYSTEM
          </Link>
        <button
          type="button"
          onClick={() => setShowTowerLife(true)}
          className="hidden items-center gap-1.5 rounded px-2 py-1 md:inline-flex"
          style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'rgba(196,181,253,0.95)', border: '1px solid rgba(196,181,253,0.32)', background: 'rgba(196,181,253,0.06)' }}
          data-testid="console-open-tower-life"
        >
          TOWER CLASSIFIEDS
        </button>
        <span className="hidden xl:inline truncate" style={{ fontSize: '0.5rem', color: 'rgba(52,211,153,0.32)', letterSpacing: '0.06em', maxWidth: '38%' }}>
          {boomerMode ? t('console.fullSuite') : 'Full augmentation suite. All interception and solve modules available.'}
        </span>
        <button
          className="hidden md:inline-flex"
          onClick={() => {
            const nb = !boomerMode;
            setBoomerMode(nb);
            try { localStorage.setItem('sm_boomer', nb ? '1' : '0'); } catch {}
          }}
          style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: '0.5rem',
            letterSpacing: '0.08em',
            padding: '2px 8px',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'all .15s',
            whiteSpace: 'nowrap',
            background: boomerMode ? 'rgba(255,176,0,0.08)' : 'transparent',
            border: boomerMode ? '1px solid rgba(255,176,0,0.4)' : '1px solid rgba(52,211,153,0.2)',
            color: boomerMode ? 'rgba(255,176,0,0.9)' : 'rgba(52,211,153,0.4)',
          }}
          title={boomerMode ? t('nav.boomerModeTooltipOn') : t('nav.boomerModeTooltipOff')}
        >
          {boomerMode ? t('nav.boomerModeOn') : t('nav.boomerModeOff')}
        </button>
        </div>
        {showMobileActions && (
          <div
            className="absolute right-3 top-full z-50 mt-2 grid min-w-44 gap-1 rounded-lg border p-2 shadow-xl md:hidden"
            style={{
              borderColor: 'rgba(52,211,153,0.24)',
              background: 'rgba(8,12,10,0.97)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.35)',
            }}
          >
            <Link
              href="/pablo"
              onClick={() => setShowMobileActions(false)}
              className="flex min-h-10 items-center gap-2 rounded px-3 text-left text-[10px] font-bold tracking-[0.12em] text-pink-300 hover:bg-pink-500/10"
            >
              <Radio className="h-3 w-3" /> PABLO
            </Link>
            <Link
              href="/phone?from=terminal"
              onClick={() => setShowMobileActions(false)}
              className="flex min-h-10 items-center gap-2 rounded px-3 text-left text-[10px] font-bold tracking-[0.12em] text-emerald-300 hover:bg-emerald-500/10"
            >
              <Radio className="h-3 w-3" /> PHONE SYSTEM
            </Link>
            <button
              type="button"
              onClick={() => { setShowTowerLife(false); setShowTowerLife(true); setShowMobileActions(false); }}
              className="flex min-h-10 items-center gap-2 rounded px-3 text-left text-[10px] font-bold tracking-[0.12em] text-violet-300 hover:bg-violet-500/10"
            >
              TOWER CLASSIFIEDS
            </button>
            <button
              type="button"
              onClick={() => {
                const nb = !boomerMode;
                setBoomerMode(nb);
                setShowMobileActions(false);
                try { localStorage.setItem('sm_boomer', nb ? '1' : '0'); } catch {}
              }}
              className="flex min-h-10 items-center gap-2 rounded px-3 text-left text-[10px] font-bold tracking-[0.12em] text-amber-300 hover:bg-amber-500/10"
            >
              <Settings2 className="h-3 w-3" /> {boomerMode ? 'MODERN MODE' : 'BOOMER MODE'}
            </button>
          </div>
        )}
      </div>

      <main className="flex-1 min-w-0 p-3 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 relative z-10">

        {/* LEFT PANEL */}
        <section className="min-w-0 flex flex-col space-y-3 lg:h-full">

          {/* AUTOPILOT BANNER */}
          <AnimatePresence>
            {autoPilot && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-sky-500/50 bg-sky-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <div>
                    <p className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-green-300`} style={{ fontFamily: "'Fira Code', monospace" }}>
                      {boomerMode ? t('console.autoScanRunning') : t('console.autoPilotActive')}
                    </p>
                    {countdown > 0 && (
                      <p className="text-[10px] text-green-400/60" style={{ fontFamily: "'Fira Code', monospace" }}>
                        {t('console.nextScan')} {countdown}{t('console.seconds')}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={handleStopAutoPilot}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/30 transition-colors">
                  <Square className="w-3 h-3 fill-current" />
                  {boomerMode ? t('console.stop') : t('console.kill')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STATUS INDICATOR */}
          <StatusIndicator status={toSolverStatus(displayStatus)} />

          {/* LIVE LISTEN */}
          <ProGate inline featureKey="live_listen" feature={boomerMode ? 'Live Listener' : PABLO_PRODUCTS.LIVE_LISTEN.short}>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-green-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-green-400`} style={{ fontFamily: "'Fira Code', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'LIVE LISTEN' : PABLO_PRODUCTS.LIVE_LISTEN.short}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {consoleConv.isSupported && (
                  <button
                    onClick={() => consoleConv.isConvMode ? consoleConv.stopConversation() : consoleConv.startConversation()}
                    disabled={(isAnyBusy && !consoleConv.isConvMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                      ${consoleConv.isConvMode
                        ? 'bg-sky-500/25 text-sky-300 border-sky-500/40 animate-pulse'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/25 hover:bg-sky-500/20'}`}
                  >
                    <Radio className="w-3 h-3" />
                    {consoleConv.isConvMode ? t('console.endConv') : (boomerMode ? t('console.voiceChat') : t('console.convMode'))}
                  </button>
                )}
                <button
                  onClick={handleListen}
                  disabled={(isAnyBusy && !isRecording) || isListenProcessing || consoleConv.isConvMode}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                    ${isRecording
                      ? 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30'
                      : isListenProcessing
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
                        : 'bg-sky-500/10 text-green-400 border-sky-500/30 hover:bg-sky-500/20'}`}
                >
                  {isRecording ? (
                    <><StopCircle className="w-3 h-3" /> {boomerMode ? t('console.stopRecording') : t('console.stop')}</>
                  ) : isListenProcessing ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> {t('console.processing')}</>
                  ) : (
                    <><Mic className="w-3 h-3" /> {boomerMode ? t('console.startRecording') : t('console.listen')}</>
                  )}
                </button>
              </div>
            </div>
            {consoleConv.isConvMode ? (
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  consoleConv.convState === 'listening' ? 'bg-sky-400 animate-pulse' :
                  consoleConv.convState === 'processing' ? 'bg-amber-400 animate-pulse' :
                  consoleConv.convState === 'speaking' ? 'bg-purple-400 animate-pulse' :
                  'bg-gray-400'
                }`} />
                <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold`} style={{ fontFamily: "'Fira Code', monospace",
                  color: consoleConv.convState === 'listening' ? 'rgba(52,211,153,0.9)' :
                         consoleConv.convState === 'processing' ? 'rgba(251,191,36,0.9)' :
                         consoleConv.convState === 'speaking' ? 'rgba(192,132,252,0.9)' :
                         'rgba(156,163,175,0.6)',
                }}>
                  {consoleConv.convState === 'listening' ? t('console.convListening') :
                   consoleConv.convState === 'processing' ? t('console.convThinking') :
                   consoleConv.convState === 'speaking' ? t('console.convSpeaking') :
                   t('console.convActive')}
                </p>
              </div>
            ) : (
              <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Fira Code', monospace" }}>
                {boomerMode ? t('console.liveListenDesc') : PABLO_PRODUCTS.LIVE_LISTEN.desc}
              </p>
            )}
          </div>
          </ProGate>

          {/* SCREEN SCAN */}
          <ProGate inline featureKey="screen_scan" feature={boomerMode ? 'Screen Scanner' : PABLO_PRODUCTS.SCAN_SCREEN.short}>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <ScanSearch className="w-3.5 h-3.5 text-sky-400" />
              <span className={`font-bold ${boomerMode ? 'text-sm' : 'text-xs'} text-sky-300`}>{boomerMode ? 'SCREEN SCANNER' : `${PABLO_PRODUCTS.SCAN_SCREEN.short} SCANNER`}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={handleScanOnce} disabled={isAnyBusy}
                className={`py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}>
                {boomerMode ? t('console.scanOnce') : t('console.once')}
              </button>
              <button onClick={handleChatScan} disabled={isAnyBusy}
                className={`py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1`}>
                💬 {t('console.chatReply')}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={handleAutoPilot} disabled={isAnyBusy}
                className={`flex-1 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-green-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1`}>
                <Bot className="w-3 h-3" /> {boomerMode ? t('console.autoScan') : t('console.auto')}
              </button>
              <span className="text-[9px] text-muted-foreground/40">{t('console.every')}</span>
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
          </ProGate>

          {/* MEDIA ANALYZER */}
          <div
            className={`rounded-xl border p-3 transition-all ${isDragging ? 'border-purple-400/60 bg-purple-500/15 ring-2 ring-purple-400/20' : 'border-purple-500/20 bg-purple-500/5'}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-purple-400`} style={{ fontFamily: "'Fira Code', monospace", letterSpacing: '0.08em' }}>
                  {boomerMode ? 'MEDIA ANALYZER' : PABLO_PRODUCTS.MEDIA_LAB.short}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {media.isAnalyzing && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[10px] text-purple-300 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {media.phase || 'Processing...'}
                    </span>
                    <div className="w-16 h-1.5 bg-purple-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-400 rounded-full transition-all duration-500" style={{ width: `${media.progress}%` }} />
                    </div>
                    <span className="text-[9px] text-purple-400/60 font-mono tabular-nums">{media.elapsed}s</span>
                  </div>
                )}
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  disabled={isAnyBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                    bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20`}
                >
                  <Upload className="w-3 h-3" />
                  {boomerMode ? 'Upload File' : 'Upload'}
                </button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,audio/*,video/*,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp,.heic,.svg,.cr2,.nef,.wav,.mp3,.aac,.ogg,.flac,.wma,.m4a,.aiff,.opus,.amr,.mp4,.mov,.avi,.mkv,.webm,.flv,.wmv,.3gp,.mpeg,.mpg,.m4v"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            {media.fileName && activePanel === 'media' ? (
              <div className="flex items-center gap-2 mt-1">
                {media.fileType === 'image' ? <FileImage className="w-3 h-3 text-purple-300/70" /> :
                 media.fileType === 'audio' ? <FileAudio className="w-3 h-3 text-purple-300/70" /> :
                 media.fileType === 'video' ? <FileVideo className="w-3 h-3 text-purple-300/70" /> :
                 <Upload className="w-3 h-3 text-purple-300/70" />}
                <span className="text-[10px] text-purple-300/70 font-mono truncate max-w-[200px]">{media.fileName}</span>
                <span className="text-[9px] text-purple-400/50 font-mono uppercase">{media.fileType}</span>
                {!media.isAnalyzing && (
                  <button onClick={() => { media.reset(); setActivePanel('solve'); }} className="ml-auto">
                    <X className="w-3 h-3 text-purple-400/40 hover:text-purple-400 transition-colors" />
                  </button>
                )}
              </div>
            ) : (
              <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Fira Code', monospace" }}>
                {isDragging
                  ? (boomerMode ? 'Drop your file here...' : 'Release to analyze...')
                  : boomerMode ? 'Drag & drop or upload an image, audio, or video file for AI analysis.'
                  : PABLO_PRODUCTS.MEDIA_LAB.desc}
              </p>
            )}
          </div>

          {/* PROBLEM DESCRIPTION — free tier (CIPHER-X code understanding) */}
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden relative group transition-colors focus-within:border-primary/50">
            <div className="min-h-12 h-auto border-b border-border flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 bg-muted/30">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code className="w-4 h-4" />{boomerMode ? 'PROBLEM INPUT' : `${PABLO_PRODUCTS.PROBLEM_DESC.short} TERMINAL`}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isAnyBusy}
                  className="bg-transparent text-sm text-foreground font-medium outline-none border-none cursor-pointer focus:ring-0 disabled:opacity-50">
                  {LANGUAGES.map(lang => <option key={lang} value={lang} className="bg-card text-foreground">{lang}</option>)}
                </select>
              </div>
            </div>
            <div className="flex-1 relative p-4">
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder={t('console.pasteQuestion')}
                disabled={isAnyBusy}
                className="w-full h-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 font-mono text-[14px] leading-relaxed disabled:opacity-50" />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground/30 pointer-events-none select-none">{t('console.inputBuffer')}</div>
            </div>
          </div>

          <ActionPanel onAction={handleAction} isStreaming={isAnyBusy || autoPilot || (!question.trim() && activePanel === 'solve')} hasSayThis={isPro || features.has('say_this')} boomerMode={boomerMode} />

          {/* PRINTER TOOLS */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Keyboard className="w-3.5 h-3.5 text-violet-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-violet-400`} style={{ fontFamily: "'Fira Code', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'PRINTER TOOLS' : PABLO_PRODUCTS.PRINTER.name}</span>
              </div>
              {canTypeMode && !isStreaming && (
                <button onClick={handleToggleTypeMode}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-md border transition-colors
                    ${typeMode
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-red-500/20 hover:text-red-300'
                      : 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'}`}>
                  <Keyboard className="w-3 h-3" />
                  {typeMode ? (isTyping ? t('console.stopTyping') : t('console.exit')) : boomerMode ? t('console.startTypeMode') : `${PABLO_PRODUCTS.TYPE_MODE.short} — ${t('console.go')}`}
                </button>
              )}
            </div>
            <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Fira Code', monospace" }}>
              {typeMode
                ? (isTyping ? t('console.typingInProgress') : typingDone ? t('console.typingComplete') : t('console.typeModeActive'))
                : boomerMode ? t('console.solveFirst')
                : PABLO_PRODUCTS.PRINTER.desc}
            </p>
          </div>
        </section>

        {/* RIGHT PANEL — OUTPUT */}
        <section className="min-w-0 flex flex-col lg:h-full lg:max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

            <div className="min-h-12 h-auto border-b flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 shrink-0" style={{ borderColor: 'rgba(52,211,153,0.18)', background: 'rgba(8,12,10,0.45)' }}>
              <div className="flex items-center gap-2 text-xs font-medium" style={{ fontFamily: "'Fira Code', monospace", color: 'rgba(56,189,248,0.85)', letterSpacing: '0.06em' }}>
                <Terminal className="w-3.5 h-3.5" /> stdout
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
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
                  {copied ? <Check className="w-4 h-4 text-sky-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={handleReset} disabled={!displayResponse && displayStatus === 'idle' && !autoPilot}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {typeMode && (
              <div className="h-0.5 bg-muted/30">
                <motion.div className="h-full bg-violet-500/60" animate={{ width: `${typingProgress * 100}%` }} transition={{ duration: 0.1 }} />
              </div>
            )}

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
                    className="absolute inset-0 flex items-center justify-center px-6">
                    <div className="w-full max-w-md" style={{ fontFamily: "'Fira Code', monospace", fontSize: '0.8rem', lineHeight: 1.7 }}>
                      <p style={{ color: 'rgba(52,211,153,0.45)' }}>
                        <span style={{ color: 'rgba(52,211,153,0.7)' }}>pablo@cipher-x</span>:<span style={{ color: 'rgba(255,176,0,0.7)' }}>~</span>$ ./cipher-x --listen
                      </p>
                      <p style={{ color: 'rgba(52,211,153,0.4)' }}>[ ok ] interception modules online</p>
                      <p style={{ color: 'rgba(52,211,153,0.4)' }}>[ ok ] awaiting input buffer...</p>
                      <p style={{ color: 'rgba(190,235,210,0.75)' }}>
                        <span style={{ color: 'rgba(52,211,153,0.7)' }}>pablo@cipher-x</span>:<span style={{ color: 'rgba(255,176,0,0.7)' }}>~</span>$
                        <span className="inline-block w-[8px] h-[15px] ml-1 align-middle animate-pulse" style={{ background: 'rgba(52,211,153,0.85)' }} />
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-full">
                    <MarkdownRenderer content={displayResponse} />
                    {(isStreaming || isListenProcessing || isAnalyzing || media.isAnalyzing) && (
                      <div className="mt-4"><span className="w-2 h-4 bg-primary animate-pulse rounded-sm inline-block" /></div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>
      {showTowerLife && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-3 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-5xl overflow-y-auto">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setShowTowerLife(false)} className="border border-white/20 bg-black/80 px-3 py-2 text-xs text-zinc-300 hover:border-violet-300/60">CLOSE</button>
            </div>
            <TowerLifeHub cityLabel="SHADOW TOWER" floorLabel="REMOTE TERMINAL · ALL TENANTS" />
          </div>
        </div>
      )}
    </div>
  );
}
