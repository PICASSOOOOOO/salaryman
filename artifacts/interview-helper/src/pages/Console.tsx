import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy, Mic, Loader2, ScanSearch, Bot, Square, Keyboard, RotateCcw, Music2, Radio, Upload, FileImage, FileAudio, FileVideo, X } from 'lucide-react';
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
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { useTranslation } from 'react-i18next';

const SoundLab = lazy(() => import('./SoundLab'));

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
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [consoleView, setConsoleView] = useState<'terminal' | 'lab'>('terminal');
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
    return <SignInPage context={boomerMode ? t('console.signInContext') : t('console.signInContextCodename')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-20 px-4 py-2 flex items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(34,197,94,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <button onClick={() => setConsoleView('terminal')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer', background: consoleView === 'terminal' ? 'rgba(34,197,94,0.08)' : 'transparent', border: consoleView === 'terminal' ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent', color: consoleView === 'terminal' ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.3)', borderRadius: '4px', transition: 'all .15s' }}>
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            {boomerMode ? t('console.terminal') : PABLO_PRODUCTS.CONSOLE.short}
          </button>
          <button onClick={() => setConsoleView('lab')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 10px', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer', background: consoleView === 'lab' ? 'rgba(236,72,153,0.08)' : 'transparent', border: consoleView === 'lab' ? '1px solid rgba(236,72,153,0.25)' : '1px solid transparent', color: consoleView === 'lab' ? 'rgba(236,72,153,0.7)' : 'rgba(34,197,94,0.3)', borderRadius: '4px', transition: 'all .15s' }}>
            <Music2 className="w-3.5 h-3.5 shrink-0" />
            {boomerMode ? t('console.lab') : PABLO_PRODUCTS.SOUND_LAB.short}
          </button>
        </div>
        <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.5rem', color: 'rgba(34,197,94,0.25)', letterSpacing: '0.06em' }}>
          {consoleView === 'terminal'
            ? (boomerMode ? t('console.fullSuite') : 'Full augmentation suite. All interception and solve modules available.')
            : (boomerMode ? `${t('console.lab')} — ${t('console.labDesc')}` : PABLO_PRODUCTS.SOUND_LAB.desc)}
        </span>
        <button
          onClick={() => {
            const nb = !boomerMode;
            setBoomerMode(nb);
            try { localStorage.setItem('sm_boomer', nb ? '1' : '0'); } catch {}
          }}
          style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '0.5rem',
            letterSpacing: '0.08em',
            padding: '2px 8px',
            cursor: 'pointer',
            borderRadius: '4px',
            transition: 'all .15s',
            whiteSpace: 'nowrap',
            background: boomerMode ? 'rgba(255,170,0,0.08)' : 'transparent',
            border: boomerMode ? '1px solid rgba(255,170,0,0.4)' : '1px solid rgba(34,197,94,0.15)',
            color: boomerMode ? 'rgba(255,170,0,0.9)' : 'rgba(34,197,94,0.3)',
          }}
          title={boomerMode ? t('nav.boomerModeTooltipOn') : t('nav.boomerModeTooltipOff')}
        >
          {boomerMode ? t('nav.boomerModeOn') : t('nav.boomerModeOff')}
        </button>
      </div>

      {consoleView === 'lab' ? (
        <div className="flex-1 relative z-10 min-h-0 overflow-auto">
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#22c55e', fontFamily: "'Share Tech Mono',monospace", fontSize: '0.9rem', letterSpacing: '.15em' }}>LOADING...</div>}>
            <SoundLab />
          </Suspense>
        </div>
      ) : (
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 min-h-0">

        {/* LEFT PANEL */}
        <section className="flex flex-col h-full space-y-3">

          {/* AUTOPILOT BANNER */}
          <AnimatePresence>
            {autoPilot && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-green-500/50 bg-green-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <div>
                    <p className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-green-300`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                      {boomerMode ? t('console.autoScanRunning') : t('console.autoPilotActive')}
                    </p>
                    {countdown > 0 && (
                      <p className="text-[10px] text-green-400/60" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
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
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-green-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-green-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'LIVE LISTEN' : PABLO_PRODUCTS.LIVE_LISTEN.short}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {consoleConv.isSupported && (
                  <button
                    onClick={() => consoleConv.isConvMode ? consoleConv.stopConversation() : consoleConv.startConversation()}
                    disabled={(isAnyBusy && !consoleConv.isConvMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                      ${consoleConv.isConvMode
                        ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 animate-pulse'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20'}`}
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
                        : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'}`}
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
                  consoleConv.convState === 'listening' ? 'bg-emerald-400 animate-pulse' :
                  consoleConv.convState === 'processing' ? 'bg-amber-400 animate-pulse' :
                  consoleConv.convState === 'speaking' ? 'bg-purple-400 animate-pulse' :
                  'bg-gray-400'
                }`} />
                <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold`} style={{ fontFamily: "'Share Tech Mono', monospace",
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
              <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
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
            <div className="flex items-center gap-1.5">
              <button onClick={handleAutoPilot} disabled={isAnyBusy}
                className={`flex-1 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 ${boomerMode ? 'text-xs' : 'text-[10px]'} font-bold hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1`}>
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
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-purple-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>
                  {boomerMode ? 'MEDIA ANALYZER' : PABLO_PRODUCTS.MEDIA_LAB.short}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {media.isAnalyzing && (
                  <span className="flex items-center gap-1 text-[10px] text-purple-300 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {media.phase || 'Processing...'}
                  </span>
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
              <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                {isDragging
                  ? (boomerMode ? 'Drop your file here...' : 'Release to analyze...')
                  : boomerMode ? 'Drag & drop or upload an image, audio, or video file for AI analysis.'
                  : PABLO_PRODUCTS.MEDIA_LAB.desc}
              </p>
            )}
          </div>

          {/* PROBLEM DESCRIPTION — free tier (CIPHER-X code understanding) */}
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
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-violet-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'PRINTER TOOLS' : PABLO_PRODUCTS.PRINTER.name}</span>
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
            <p className={`${boomerMode ? 'text-xs' : 'text-[10px]'} text-muted-foreground`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              {typeMode
                ? (isTyping ? t('console.typingInProgress') : typingDone ? t('console.typingComplete') : t('console.typeModeActive'))
                : boomerMode ? t('console.solveFirst')
                : PABLO_PRODUCTS.PRINTER.desc}
            </p>
          </div>
        </section>

        {/* RIGHT PANEL — OUTPUT */}
        <section className="flex flex-col h-full max-h-[60vh] lg:max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Terminal className="w-3.5 h-3.5" /> Output
              </div>
              <div className="flex items-center gap-2">
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
      )}
    </div>
  );
}
