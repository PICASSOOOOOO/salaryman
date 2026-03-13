import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, Settings2, Trash2, StopCircle, Check, Copy } from 'lucide-react';
import { useInterviewSolver, type InterviewMode } from '@/hooks/use-interview';
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
  
  const { response, status, isStreaming, solve, cancel, reset } = useInterviewSolver();

  const handleAction = (mode: InterviewMode) => {
    solve(question, language, mode);
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Decorative background blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="h-16 border-b border-border flex items-center px-6 shrink-0 bg-background/50 backdrop-blur-xl z-10 relative">
        <div className="flex items-center gap-3 text-foreground">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold tracking-tight leading-none">Interview Helper</h1>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">LIVE.ASSIST_v1.0</p>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 min-h-0">
        
        {/* LEFT PANEL - INPUT */}
        <section className="flex flex-col h-full space-y-4">
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
                  disabled={isStreaming}
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
                placeholder="Paste the coding question here..."
                disabled={isStreaming}
                className="w-full h-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 font-mono text-[14px] leading-relaxed disabled:opacity-50"
              />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground/30 pointer-events-none select-none">
                INPUT_BUFFER
              </div>
            </div>
          </div>

          <ActionPanel onAction={handleAction} isStreaming={isStreaming || !question.trim()} />
        </section>

        {/* RIGHT PANEL - OUTPUT */}
        <section className="flex flex-col h-full max-h-[calc(100vh-120px)]">
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            
            {/* Output Header */}
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <StatusIndicator status={status} />
              
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
                  disabled={!response}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy output"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={reset}
                  disabled={!response && status === 'idle'}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Clear output"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Output Content */}
            <div className="flex-1 overflow-y-auto p-6 relative">
              <AnimatePresence mode="wait">
                {!response && status === 'idle' ? (
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
                    <MarkdownRenderer content={response} />
                    {isStreaming && (
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
