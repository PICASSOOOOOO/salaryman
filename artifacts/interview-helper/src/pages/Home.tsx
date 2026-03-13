import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy, Mic, Loader2, Radio, ScanSearch } from 'lucide-react';
import { useInterviewSolver, useVoiceListen, useScreenScan, type InterviewMode } from '@/hooks/use-interview';
import { ActionPanel } from '@/components/ActionPanel';
import { StatusIndicator } from '@/components/StatusIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

const LANGUAGES = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'C#', 'Ruby', 'Swift'
];

export default function Home() {
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState('Python');
  const [copied, setCopied] = useState(false);
  const [activePanel, setActivePanel] = useState<'solve' | 'listen' | 'scan'>('solve');

  const { response, status, isStreaming, solve, cancel, reset } = useInterviewSolver();
  const { listenStatus, answer: listenAnswer, startListening, stopListening, reset: resetListen, isRecording, isProcessing: isListenProcessing } = useVoiceListen();
  const { scanStatus, answer: scanAnswer, scanScreen, reset: resetScan, isCapturing, isAnalyzing } = useScreenScan();

  const handleAction = (mode: InterviewMode) => {
    setActivePanel('solve');
    resetListen(); resetScan();
    solve(question, language, mode);
  };

  const handleListen = () => {
    if (isRecording) {
      stopListening();
    } else {
      setActivePanel('listen');
      reset(); resetScan();
      startListening();
    }
  };

  const handleScan = () => {
    setActivePanel('scan');
    reset(); resetListen();
    scanScreen();
  };

  const displayResponse = activePanel === 'listen' ? listenAnswer : activePanel === 'scan' ? scanAnswer : response;
  const displayStatus = activePanel === 'listen' ? listenStatus : activePanel === 'scan' ? scanStatus : status;

  const handleCopy = () => {
    if (!displayResponse) return;
    navigator.clipboard.writeText(displayResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    reset(); resetListen(); resetScan();
    setActivePanel('solve');
  };

  const isAnyBusy = isStreaming || isRecording || isListenProcessing || isCapturing || isAnalyzing;

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="h-16 border-b border-border flex items-center px-6 shrink-0 bg-background/50 backdrop-blur-xl z-10 relative">
        <div className="flex items-center gap-3 text-foreground">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight leading-none">DevDocs</h1>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">v3.1.2 — reference</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 min-h-0">

        {/* LEFT PANEL */}
        <section className="flex flex-col h-full space-y-3">

          {/* Top capture buttons — side by side */}
          <div className="grid grid-cols-2 gap-3">

            {/* LIVE LISTEN */}
            <motion.button
              onClick={handleListen}
              animate={isRecording ? { scale: [1, 1.02, 1] } : { scale: 1 }}
              transition={isRecording ? { repeat: Infinity, duration: 1.2 } : {}}
              disabled={isListenProcessing || isCapturing || isAnalyzing || isStreaming}
              className={`
                relative flex flex-col items-start gap-2 px-4 py-3 rounded-2xl border-2 text-left
                transition-all duration-300 overflow-hidden
                ${isRecording
                  ? 'border-red-500 bg-red-500/15 text-red-400'
                  : isListenProcessing
                  ? 'border-orange-500/40 bg-orange-500/10 text-orange-400 cursor-not-allowed'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-500 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed'}
              `}
            >
              <div className="flex items-center gap-2 w-full">
                <div className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isRecording ? 'bg-red-500/30' : 'bg-rose-500/20'}`}>
                  {isRecording && <span className="absolute inset-0 rounded-lg bg-red-500/40 animate-ping" />}
                  {isListenProcessing
                    ? <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                    : isRecording
                    ? <Radio className="w-4 h-4 text-red-400" />
                    : <Mic className="w-4 h-4 text-rose-400" />
                  }
                </div>
                <span className="font-bold text-xs leading-none">
                  {isRecording ? 'LISTENING...' : isListenProcessing ? 'Thinking...' : 'LIVE LISTEN'}
                </span>
                {isRecording && (
                  <div className="flex items-center gap-0.5 ml-auto">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-0.5 bg-red-400 rounded-full"
                        animate={{ height: ['6px', '14px', '6px'] }}
                        transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[10px] opacity-60 leading-tight">
                {isRecording ? 'Click to stop & get answer' : isListenProcessing ? 'Processing...' : 'Click · Speak · Get bullets'}
              </p>
            </motion.button>

            {/* SCAN SCREEN */}
            <motion.button
              onClick={handleScan}
              disabled={isAnyBusy}
              className={`
                relative flex flex-col items-start gap-2 px-4 py-3 rounded-2xl border-2 text-left
                transition-all duration-300 overflow-hidden
                ${isCapturing
                  ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                  : isAnalyzing
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-300 cursor-not-allowed'
                  : 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:border-sky-500 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed'}
              `}
            >
              <div className="flex items-center gap-2 w-full">
                <div className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isCapturing ? 'bg-sky-500/30' : 'bg-sky-500/20'}`}>
                  {isCapturing && <span className="absolute inset-0 rounded-lg bg-sky-500/30 animate-ping" />}
                  {isAnalyzing
                    ? <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    : <ScanSearch className="w-4 h-4 text-sky-400" />
                  }
                </div>
                <span className="font-bold text-xs leading-none">
                  {isCapturing ? 'SELECT WINDOW...' : isAnalyzing ? 'Analyzing...' : 'SCAN SCREEN'}
                </span>
              </div>
              <p className="text-[10px] opacity-60 leading-tight">
                {isCapturing ? 'Pick your coding window' : isAnalyzing ? 'Reading what\'s on screen...' : 'Snapshot any window · instant answer'}
              </p>
            </motion.button>
          </div>

          {/* Problem Description */}
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden relative group transition-colors focus-within:border-primary/50">
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code className="w-4 h-4" />
                Problem Description
              </div>
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isAnyBusy}
                  className="bg-transparent text-sm text-foreground font-medium outline-none border-none cursor-pointer focus:ring-0 disabled:opacity-50"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang} value={lang} className="bg-card text-foreground">{lang}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 relative p-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Or paste the question here..."
                disabled={isAnyBusy}
                className="w-full h-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 font-mono text-[14px] leading-relaxed disabled:opacity-50"
              />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground/30 pointer-events-none select-none">
                INPUT_BUFFER
              </div>
            </div>
          </div>

          <ActionPanel onAction={handleAction} isStreaming={isAnyBusy || (!question.trim() && activePanel === 'solve')} />
        </section>

        {/* RIGHT PANEL */}
        <section className="flex flex-col h-full max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <StatusIndicator status={displayStatus as any} />
              <div className="flex items-center gap-2">
                {isStreaming && (
                  <button onClick={cancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                    <StopCircle className="w-3.5 h-3.5" />Stop
                  </button>
                )}
                <button onClick={handleCopy} disabled={!displayResponse}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy output">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={handleReset} disabled={!displayResponse && displayStatus === 'idle'}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Clear output">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 relative">
              <AnimatePresence mode="wait">
                {!displayResponse && (displayStatus === 'idle' || displayStatus === 'done') ? (
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
                      <div className="mt-4 flex items-center gap-1">
                        <span className="w-2 h-4 bg-primary animate-pulse rounded-sm" />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
