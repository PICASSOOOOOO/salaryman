import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy, Mic, MicOff, Loader2, Radio } from 'lucide-react';
import { useInterviewSolver, useVoiceListen, type InterviewMode } from '@/hooks/use-interview';
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
  const [activePanel, setActivePanel] = useState<'solve' | 'listen'>('solve');

  const { response, status, isStreaming, solve, cancel, reset } = useInterviewSolver();
  const { listenStatus, answer, startListening, stopListening, reset: resetListen, isRecording, isProcessing } = useVoiceListen();

  const handleAction = (mode: InterviewMode) => {
    setActivePanel('solve');
    solve(question, language, mode);
  };

  const handleListen = () => {
    if (isRecording) {
      stopListening();
    } else {
      setActivePanel('listen');
      resetListen();
      startListening();
    }
  };

  const displayResponse = activePanel === 'listen' ? answer : response;
  const displayStatus = activePanel === 'listen' ? listenStatus : status;

  const handleCopy = () => {
    if (!displayResponse) return;
    navigator.clipboard.writeText(displayResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    reset();
    resetListen();
    setActivePanel('solve');
  };

  const isAnyStreaming = isStreaming || isRecording || isProcessing;

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

      {/* Main Workspace */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 min-h-0">

        {/* LEFT PANEL */}
        <section className="flex flex-col h-full space-y-4">

          {/* LIVE LISTEN BUTTON */}
          <motion.button
            onClick={handleListen}
            animate={isRecording ? { scale: [1, 1.02, 1] } : { scale: 1 }}
            transition={isRecording ? { repeat: Infinity, duration: 1.2 } : {}}
            className={`
              relative w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left
              transition-all duration-300 overflow-hidden font-medium
              ${isRecording
                ? 'border-red-500 bg-red-500/15 text-red-400'
                : isProcessing
                ? 'border-orange-500/50 bg-orange-500/10 text-orange-400 cursor-not-allowed'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-500 hover:bg-rose-500/20'}
            `}
            disabled={isProcessing}
          >
            <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isRecording ? 'bg-red-500/30' : 'bg-rose-500/20'}`}>
              {isRecording && (
                <span className="absolute inset-0 rounded-xl bg-red-500/40 animate-ping" />
              )}
              {isProcessing
                ? <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                : isRecording
                ? <Radio className="w-5 h-5 text-red-400" />
                : <Mic className="w-5 h-5 text-rose-400" />
              }
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm leading-none mb-1">
                {isRecording ? 'LISTENING — click to stop' : isProcessing ? 'Translating...' : 'LIVE LISTEN'}
              </p>
              <p className="text-xs opacity-70 leading-relaxed">
                {isRecording
                  ? 'Speak the question now. Click stop when done.'
                  : isProcessing
                  ? 'Getting your answer in plain English...'
                  : 'Click, speak the question, get instant 3-bullet answer'}
              </p>
            </div>
            {isRecording && (
              <div className="flex items-center gap-1 shrink-0">
                {[0, 1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    className="w-1 bg-red-400 rounded-full"
                    animate={{ height: ['8px', '20px', '8px'] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  />
                ))}
              </div>
            )}
          </motion.button>

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
                  disabled={isAnyStreaming}
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
                disabled={isAnyStreaming}
                className="w-full h-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 font-mono text-[14px] leading-relaxed disabled:opacity-50"
              />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground/30 pointer-events-none select-none">
                INPUT_BUFFER
              </div>
            </div>
          </div>

          <ActionPanel onAction={handleAction} isStreaming={isAnyStreaming || (!question.trim() && activePanel === 'solve')} />
        </section>

        {/* RIGHT PANEL - OUTPUT */}
        <section className="flex flex-col h-full max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <StatusIndicator status={displayStatus as any} />

              <div className="flex items-center gap-2">
                {isStreaming && (
                  <button
                    onClick={cancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  disabled={!displayResponse}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy output"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleReset}
                  disabled={!displayResponse && displayStatus === 'idle'}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Clear output"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 relative">
              <AnimatePresence mode="wait">
                {!displayResponse && (displayStatus === 'idle' || displayStatus === 'done') ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4 border border-border">
                        <Terminal className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-muted-foreground font-mono text-sm">
                        Waiting for execution request...
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="min-h-full"
                  >
                    <MarkdownRenderer content={displayResponse} />
                    {(isStreaming || isProcessing) && (
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
