import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Link2, Play, Loader2, Sparkles, Copy, Check,
  Youtube, Globe, ExternalLink, FileText, Zap, ChevronRight,
  Bot, X, Bookmark, Download,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { apiFetch } from '@/lib/api-client';

type AnalysisPhase = 'idle' | 'fetching' | 'meta' | 'analyzing' | 'done' | 'error';

interface VideoMeta {
  platform: string;
  title: string;
  thumbnail: string | null;
  embedUrl: string | null;
  hasTranscript: boolean;
}

interface SavedAnalysis {
  id: string;
  url: string;
  title: string;
  platform: string;
  thumbnail: string | null;
  analysis: string;
  timestamp: number;
}

const PLATFORM_ICONS: Record<string, { icon: typeof Youtube; color: string }> = {
  youtube: { icon: Youtube, color: '#ff0000' },
  tiktok: { icon: Video, color: '#00f2ea' },
  vimeo: { icon: Play, color: '#1ab7ea' },
  instagram: { icon: Globe, color: '#e1306c' },
  twitter: { icon: Globe, color: '#1da1f2' },
  generic: { icon: Globe, color: '#6366f1' },
};

function getPlatformLabel(p: string): string {
  const labels: Record<string, string> = {
    youtube: 'YOUTUBE',
    tiktok: 'TIKTOK',
    vimeo: 'VIMEO',
    instagram: 'INSTAGRAM',
    twitter: 'X / TWITTER',
    generic: 'WEB VIDEO',
  };
  return labels[p] ?? 'VIDEO';
}

export default function VideoAnalyzer() {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<SavedAnalysis[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('video-analyses') ?? '[]');
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyzeVideo = useCallback(async () => {
    if (!url.trim()) return;
    try { new URL(url); } catch {
      setError('Please enter a valid URL');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase('fetching');
    setMeta(null);
    setAnalysis('');
    setError('');

    try {
      const res = await apiFetch('/api/tools/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), goal: goal.trim() || undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.status === 'fetching') setPhase('fetching');
            else if (data.status === 'meta') {
              setPhase('meta');
              setMeta({
                platform: data.platform,
                title: data.title,
                thumbnail: data.thumbnail,
                embedUrl: data.embedUrl,
                hasTranscript: data.hasTranscript,
              });
            }
            else if (data.status === 'analyzing') setPhase('analyzing');
            else if (data.content) {
              setPhase('analyzing');
              setAnalysis(prev => prev + data.content);
            }
            else if (data.done) setPhase('done');
            else if (data.error) {
              setError(data.error);
              setPhase('error');
            }
          } catch {}
        }
      }

      setPhase('done');
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message || 'Analysis failed');
      setPhase('error');
    }
  }, [url, goal]);

  const saveAnalysis = useCallback(() => {
    if (!analysis || !meta) return;
    const entry: SavedAnalysis = {
      id: Date.now().toString(36),
      url,
      title: meta.title || url,
      platform: meta.platform,
      thumbnail: meta.thumbnail,
      analysis,
      timestamp: Date.now(),
    };
    const updated = [entry, ...saved].slice(0, 50);
    setSaved(updated);
    localStorage.setItem('video-analyses', JSON.stringify(updated));
  }, [analysis, meta, url, saved]);

  const loadSaved = useCallback((s: SavedAnalysis) => {
    setUrl(s.url);
    setMeta({
      platform: s.platform,
      title: s.title,
      thumbnail: s.thumbnail,
      embedUrl: null,
      hasTranscript: false,
    });
    setAnalysis(s.analysis);
    setPhase('done');
    setShowHistory(false);
  }, []);

  const copyAnalysis = () => {
    navigator.clipboard.writeText(analysis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAuthenticated) return <SignInPage />;

  const platformInfo = PLATFORM_ICONS[meta?.platform ?? 'generic'] ?? PLATFORM_ICONS.generic;
  const PlatformIcon = platformInfo.icon;
  const isProcessing = phase === 'fetching' || phase === 'meta' || phase === 'analyzing';

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-500/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-4 md:p-6 relative z-10">
        <div className="max-w-4xl mx-auto">

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Video className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.1em', fontSize: '1.4rem' }}>
                  {boomerMode ? 'VIDEO ANALYZER' : 'VID-SCAN // VIDEO INTELLIGENCE'}
                </h1>
                <p className="text-xs text-muted-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomerMode ? 'PASTE ANY VIDEO URL — YOUTUBE, TIKTOK, OR ANY WEBSITE. AI ANALYZES AND EXTRACTS ACTIONABLE INTELLIGENCE.' : 'PASTE VIDEO URL · AI EXTRACTS TRANSCRIPT · ANALYZES CONTENT · RETURNS ACTIONABLE INTEL'}
                </p>
              </div>
              {saved.length > 0 && (
                <button onClick={() => setShowHistory(!showHistory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showHistory ? 'bg-violet-500/15 text-violet-400 border-violet-500/30' : 'text-muted-foreground border-border hover:border-violet-500/20'}`}>
                  <Bookmark className="w-3.5 h-3.5" />
                  {saved.length}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/50 p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                {boomerMode ? 'VIDEO URL' : 'TARGET URL'}
              </span>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 relative">
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isProcessing && analyzeVideo()}
                  placeholder={boomerMode ? 'Paste YouTube, TikTok, or any video URL...' : 'https://youtube.com/watch?v=... | tiktok.com/... | any video URL'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-violet-500/40 transition-colors"
                  style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                  disabled={isProcessing}
                />
              </div>
              <button
                onClick={analyzeVideo}
                disabled={!url.trim() || isProcessing}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {boomerMode ? 'ANALYZE' : 'SCAN'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground/40" />
              <input
                type="text"
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder={boomerMode ? 'Optional: What should the AI focus on? (e.g., "marketing strategies", "competitor analysis")' : 'OPTIONAL FOCUS: marketing tactics | competitor intel | content ideas | sales techniques'}
                className="flex-1 px-3 py-2 rounded-lg bg-transparent border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/30 transition-colors"
                style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                disabled={isProcessing}
              />
            </div>

            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
              <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">SUPPORTED:</span>
              {['YOUTUBE', 'TIKTOK', 'VIMEO', 'INSTAGRAM', 'X/TWITTER', 'ANY URL'].map(p => (
                <span key={p} className="text-[8px] font-bold text-muted-foreground/30 tracking-wider">{p}</span>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {showHistory && saved.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden">
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {boomerMode ? 'SAVED ANALYSES' : 'ANALYSIS LOG'}
                    </span>
                    <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {saved.map(s => (
                      <button key={s.id} onClick={() => loadSaved(s)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-violet-500/20 hover:bg-violet-500/5 transition-all text-left">
                        {s.thumbnail ? (
                          <img src={s.thumbnail} alt="" className="w-12 h-9 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-9 rounded bg-muted/30 flex items-center justify-center shrink-0">
                            <Video className="w-4 h-4 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground/50">{getPlatformLabel(s.platform)} · {new Date(s.timestamp).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(phase !== 'idle' || meta) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>

                {meta && (
                  <div className="rounded-xl border border-border bg-card/50 p-4 mb-4">
                    <div className="flex items-center gap-3">
                      {meta.thumbnail ? (
                        <img src={meta.thumbnail} alt="" className="w-20 h-14 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-20 h-14 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                          <Video className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PlatformIcon className="w-3.5 h-3.5" style={{ color: platformInfo.color }} />
                          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: platformInfo.color }}>
                            {getPlatformLabel(meta.platform)}
                          </span>
                          {meta.hasTranscript && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                              TRANSCRIPT FOUND
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-foreground truncate">{meta.title || url}</p>
                      </div>
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-violet-500/20 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}

                {isProcessing && !analysis && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                      <span className="text-sm font-bold" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                        {phase === 'fetching'
                          ? (boomerMode ? 'FETCHING VIDEO DATA...' : 'ACQUIRING TARGET DATA...')
                          : phase === 'meta'
                          ? (boomerMode ? 'EXTRACTING METADATA...' : 'PARSING VIDEO METADATA...')
                          : (boomerMode ? 'AI IS ANALYZING...' : 'AI ANALYSIS IN PROGRESS...')}
                      </span>
                    </div>
                  </div>
                )}

                {analysis && (
                  <div ref={resultRef} className="rounded-2xl border border-violet-500/15 bg-card/50 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-violet-500/10 bg-violet-500/[0.03]">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-violet-400" />
                        <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                          {boomerMode ? 'AI ANALYSIS' : 'INTELLIGENCE REPORT'}
                        </span>
                        {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-violet-400/50" />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={saveAnalysis}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                          <Download className="w-3 h-3" />
                          SAVE
                        </button>
                        <button onClick={copyAnalysis}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'COPIED' : 'COPY'}
                        </button>
                      </div>
                    </div>
                    <div className="p-5 prose prose-sm prose-invert max-w-none
                      prose-headings:text-foreground prose-headings:font-bold
                      prose-h2:text-base prose-h2:border-b prose-h2:border-violet-500/10 prose-h2:pb-2 prose-h2:mb-4
                      prose-h3:text-sm prose-h3:text-violet-400 prose-h3:uppercase prose-h3:tracking-wider
                      prose-p:text-muted-foreground prose-p:text-xs prose-p:leading-relaxed
                      prose-li:text-muted-foreground prose-li:text-xs
                      prose-strong:text-foreground
                      prose-hr:border-border/30"
                      style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }}
                    />
                  </div>
                )}

                {phase === 'error' && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <p className="text-sm text-red-400 font-bold">{error || 'Analysis failed'}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {boomerMode ? 'The video may be private, region-locked, or the site may block automated access. Try a different URL.' : 'TARGET INACCESSIBLE. VIDEO MAY BE PRIVATE OR GEO-LOCKED. TRY ALTERNATE URL.'}
                    </p>
                  </div>
                )}

                {phase === 'done' && analysis && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                          {boomerMode ? 'WHAT NEXT?' : 'NEXT OPS'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        {boomerMode
                          ? 'This analysis is saved to your session. You can share these insights with your AI agents, apply strategies to your campaigns, or analyze another video.'
                          : 'INTEL CAPTURED. DEPLOY TO AGENTS. APPLY TO CAMPAIGNS. OR SCAN ANOTHER TARGET.'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => { setUrl(''); setMeta(null); setAnalysis(''); setPhase('idle'); setGoal(''); }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors">
                          <Video className="w-3.5 h-3.5" />
                          {boomerMode ? 'ANALYZE ANOTHER' : 'NEW SCAN'}
                        </button>
                        <button onClick={copyAnalysis}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-violet-500/20 transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                          {boomerMode ? 'COPY REPORT' : 'COPY INTEL'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {phase === 'idle' && !meta && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border/50 bg-card/30 p-8 text-center">
              <Video className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
              <h3 className="text-sm font-bold text-foreground mb-2" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.2rem', letterSpacing: '0.08em' }}>
                {boomerMode ? 'PASTE A VIDEO URL TO GET STARTED' : 'AWAITING TARGET URL'}
              </h3>
              <p className="text-xs text-muted-foreground/50 max-w-md mx-auto leading-relaxed mb-6">
                {boomerMode
                  ? 'Share any video from YouTube, TikTok, Vimeo, Instagram, X, or any website. Pablo will extract the transcript, analyze the content, and give you actionable strategies to implement.'
                  : 'YOUTUBE · TIKTOK · VIMEO · INSTAGRAM · X · ANY URL. AI EXTRACTS TRANSCRIPT + METADATA. ANALYZES CONTENT. RETURNS STRUCTURED INTELLIGENCE REPORT.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                {[
                  { label: boomerMode ? 'EXTRACT TRANSCRIPTS' : 'TRANSCRIPT EXTRACTION', desc: boomerMode ? 'Auto-pulls captions from YouTube and other platforms' : 'AUTO-CAPTURE FROM SUPPORTED PLATFORMS' },
                  { label: boomerMode ? 'AI ANALYSIS' : 'DEEP ANALYSIS', desc: boomerMode ? 'Identifies strategies, insights, and opportunities' : 'STRATEGIES · INSIGHTS · OPPORTUNITIES' },
                  { label: boomerMode ? 'ACTIONABLE INTEL' : 'ACTIONABLE INTEL', desc: boomerMode ? 'Get implementation steps with difficulty ratings' : 'IMPLEMENTATION STEPS + DIFFICULTY RATINGS' },
                ].map(f => (
                  <div key={f.label} className="rounded-xl border border-border/30 p-3">
                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">{f.label}</p>
                    <p className="text-[9px] text-muted-foreground/40 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

        </div>
      </main>
    </div>
  );
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^---$/gm, '<hr />')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^[•·] (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(.+)$/gm, (match) => {
      if (match.startsWith('<')) return match;
      return match;
    })
    .replace(/\n/g, '<br />');
}
