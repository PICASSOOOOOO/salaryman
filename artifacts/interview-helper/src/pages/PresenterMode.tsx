import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Presentation, ChevronLeft, ChevronRight, Maximize2, Minimize2, Globe, Mic2, Loader2, X, Plus, MessageSquare } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ProGate } from '@/components/ProGate';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';

interface Slide {
  title: string;
  bullets: string[];
  say_this: string;
}

interface PresentationData {
  title: string;
  slides: Slide[];
}

interface InterviewQuestion {
  question: string;
  why: string;
  listen_for: string;
}

function streamSSESimple(
  url: string,
  body: object,
  onChunk: (content: string) => void,
  onPresentation: (data: PresentationData) => void,
  onInterview: (data: { questions: InterviewQuestion[] }) => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  const ctrl = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).then(async res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No stream');
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line || line === '[DONE]') continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) { onError(parsed.error); return; }
          if (parsed.done) { onDone(); return; }
          if (parsed.content) onChunk(parsed.content);
          if (parsed.presentation) onPresentation(parsed.presentation);
          if (parsed.interview) onInterview(parsed.interview);
        } catch {}
      }
    }
    onDone();
  }).catch(err => {
    if (err.name !== 'AbortError') onError(err.message);
  });

  return ctrl;
}

type ActiveTab = 'present' | 'analyze' | 'conduct';

export default function PresenterMode() {
  const { isPro, loading: planLoading } = usePlan();
  const [tab, setTab] = useState<ActiveTab>('present');

  // ── Presentation ──────────────────────────────────────────────────────────
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [slideCount, setSlideCount] = useState(5);
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showScript, setShowScript] = useState(true);

  const generatePresentation = () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setPresentation(null);
    streamSSESimple(
      '/api/tools/generate-presentation',
      { topic, context, slideCount },
      () => {},
      (data) => { setPresentation(data); setCurrentSlide(0); },
      () => {},
      () => setGenerating(false),
      () => setGenerating(false),
    );
  };

  // ── URL Analyzer ──────────────────────────────────────────────────────────
  const [urls, setUrls] = useState<string[]>(['']);
  const [analysisFocus, setAnalysisFocus] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeUrls = () => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;
    setAnalyzing(true);
    setAnalysisResult('');
    streamSSESimple(
      '/api/tools/analyze-urls',
      { urls: validUrls, focus: analysisFocus },
      (chunk) => setAnalysisResult(prev => prev + chunk),
      () => {},
      () => {},
      () => setAnalyzing(false),
      () => setAnalyzing(false),
    );
  };

  // ── Interview Conductor ───────────────────────────────────────────────────
  const [interviewSubject, setInterviewSubject] = useState('');
  const [interviewRole, setInterviewRole] = useState('');
  const [interviewStyle, setInterviewStyle] = useState<'technical' | 'casual' | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(6);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [conductingInterview, setConductingInterview] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  // ── Pablo prefill from chat action ─────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('devdocs_action_prefill');
      if (!raw) return;
      const prefill = JSON.parse(raw) as Record<string, unknown>;
      const age = Date.now() - ((prefill._ts as number) || 0);
      if (age > 30000) { localStorage.removeItem('devdocs_action_prefill'); return; }
      localStorage.removeItem('devdocs_action_prefill');

      const tab = prefill.tab as ActiveTab | undefined;
      if (tab) setTab(tab);

      if (tab === 'conduct' || prefill.subject) {
        if (prefill.subject) setInterviewSubject(prefill.subject as string);
        if (prefill.role) setInterviewRole(prefill.role as string);
        if (prefill.style) setInterviewStyle(prefill.style as 'technical' | 'casual' | 'mixed');
        if (prefill.count) setQuestionCount(Number(prefill.count));
        if (tab === 'conduct') setTab('conduct');
      } else if (tab === 'present' || prefill.topic) {
        if (prefill.topic) setTopic(prefill.topic as string);
        if (prefill.context) setContext(prefill.context as string);
        if (prefill.slideCount) setSlideCount(Number(prefill.slideCount));
        if (tab === 'present') setTab('present');
      } else if (tab === 'analyze' || prefill.urls) {
        if (Array.isArray(prefill.urls)) setUrls(prefill.urls as string[]);
        if (prefill.focus) setAnalysisFocus(prefill.focus as string);
        if (tab === 'analyze') setTab('analyze');
      }
    } catch {}
  }, []);

  const generateInterview = () => {
    if (!interviewSubject.trim()) return;
    setConductingInterview(true);
    setInterviewQuestions([]);
    setCurrentQ(0);
    streamSSESimple(
      '/api/tools/conduct-interview',
      { subject: interviewSubject, role: interviewRole, style: interviewStyle, count: questionCount },
      () => {},
      () => {},
      (data) => setInterviewQuestions(data.questions),
      () => setConductingInterview(false),
      () => setConductingInterview(false),
    );
  };

  const slide = presentation?.slides[currentSlide];
  const totalSlides = presentation?.slides.length ?? 0;

  if (!planLoading && !isPro) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <NavBar />
        <ProGate feature={PABLO_PRODUCTS.PRESENTER.name} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/8 blur-[120px] rounded-full pointer-events-none" />

      {!fullScreen && <NavBar />}

      <main className="flex-1 flex flex-col p-6 relative z-10">

        {/* Page header */}
        {!fullScreen && (
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Presentation className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Presenter Studio</h2>
              <p className="text-sm text-muted-foreground">Generate slides, analyze websites, conduct interviews — then screen-share on Zoom or Meet</p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        {!fullScreen && (
          <div className="flex items-center gap-1 mb-6 bg-muted/20 rounded-xl p-1 w-fit border border-border">
            {([
              { id: 'present', label: 'Presentation', icon: Presentation },
              { id: 'analyze', label: 'Website Analyzer', icon: Globe },
              { id: 'conduct', label: 'Interview Conductor', icon: Mic2 },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                  ${tab === id ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        )}

        {/* ── PRESENTATION TAB ── */}
        {tab === 'present' && !fullScreen && (
          <div className="flex gap-6 flex-1">
            {/* Setup panel */}
            {!presentation && (
              <div className="w-80 shrink-0 space-y-4">
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <h3 className="font-bold text-sm text-foreground">Build a Presentation</h3>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Topic *</label>
                    <input value={topic} onChange={e => setTopic(e.target.value)}
                      placeholder="e.g. Why we should switch to microservices"
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Extra context (optional)</label>
                    <textarea value={context} onChange={e => setContext(e.target.value)}
                      placeholder="Audience, goal, key points to include..."
                      rows={3}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Number of slides</label>
                    <div className="flex gap-2">
                      {[3, 5, 7].map(n => (
                        <button key={n} onClick={() => setSlideCount(n)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                            ${slideCount === n ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={generatePresentation} disabled={!topic.trim() || generating}
                    className="w-full py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-bold hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : '✦ Generate Slides'}
                  </button>
                </div>

                <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-indigo-300">How to present on Zoom / Meet</p>
                  <p>1. Click Generate → review your slides</p>
                  <p>2. Click ⛶ Fullscreen to enter presenter view</p>
                  <p>3. In Zoom/Meet, share this browser window/tab</p>
                  <p>4. Others see your slides; you see the script</p>
                </div>
              </div>
            )}

            {/* Slide preview / navigator */}
            {presentation && (
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-foreground">{presentation.title}</h3>
                    <p className="text-xs text-muted-foreground">{totalSlides} slides</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowScript(v => !v); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground transition-colors">
                      <MessageSquare className="w-3.5 h-3.5" /> {showScript ? 'Hide Script' : 'Show Script'}
                    </button>
                    <button onClick={() => setFullScreen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 transition-colors">
                      <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
                    </button>
                    <button onClick={() => { setPresentation(null); setTopic(''); setContext(''); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Slide grid for selection */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {presentation.slides.map((s, i) => (
                    <button key={i} onClick={() => setCurrentSlide(i)}
                      className={`shrink-0 w-36 h-20 rounded-xl border p-2 text-left transition-colors
                        ${currentSlide === i ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-border bg-muted/20 hover:bg-muted/40'}`}>
                      <p className="text-[9px] text-muted-foreground font-mono mb-1">{i + 1}</p>
                      <p className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2">{s.title}</p>
                    </button>
                  ))}
                </div>

                {/* Current slide detail */}
                {slide && (
                  <div className="bg-card border border-border rounded-2xl p-6 flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground font-mono mb-1">SLIDE {currentSlide + 1} / {totalSlides}</p>
                        <h4 className="text-xl font-bold text-foreground">{slide.title}</h4>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setCurrentSlide(v => Math.max(0, v - 1))} disabled={currentSlide === 0}
                          className="p-2 rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setCurrentSlide(v => Math.min(totalSlides - 1, v + 1))} disabled={currentSlide === totalSlides - 1}
                          className="p-2 rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <ul className="space-y-2 mb-5">
                      {slide.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>

                    {showScript && (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">{PABLO_PRODUCTS.SAY_THIS.name}</p>
                        <p className="text-sm text-emerald-200 leading-relaxed">{slide.say_this}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FULLSCREEN PRESENTER VIEW ── */}
        {fullScreen && slide && (
          <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col p-12">
            <button onClick={() => setFullScreen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors z-10">
              <Minimize2 className="w-5 h-5" />
            </button>

            <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full">
              <p className="text-white/30 text-sm font-mono mb-4">{presentation?.title} · {currentSlide + 1} / {totalSlides}</p>
              <AnimatePresence mode="wait">
                <motion.div key={currentSlide} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                  <h1 className="text-5xl font-bold text-white mb-10 leading-tight">{slide.title}</h1>
                  <ul className="space-y-4">
                    {slide.bullets.map((b, i) => (
                      <motion.li key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className="flex items-start gap-4 text-2xl text-white/85">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 mt-3 shrink-0" />
                        {b}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Teleprompter bar */}
            <div className="border-t border-white/10 pt-5 mt-5">
              <p className="text-[11px] text-white/30 uppercase tracking-widest mb-2">Say this</p>
              <p className="text-white/70 text-lg leading-relaxed">{slide.say_this}</p>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-6 mt-6">
              <button onClick={() => setCurrentSlide(v => Math.max(0, v - 1))} disabled={currentSlide === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors font-semibold">
                <ChevronLeft className="w-5 h-5" /> Prev
              </button>
              <div className="flex gap-1.5">
                {presentation?.slides.map((_, i) => (
                  <button key={i} onClick={() => setCurrentSlide(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === currentSlide ? 'bg-indigo-400' : 'bg-white/20 hover:bg-white/40'}`} />
                ))}
              </div>
              <button onClick={() => setCurrentSlide(v => Math.min(totalSlides - 1, v + 1))} disabled={currentSlide === totalSlides - 1}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors font-semibold">
                Next <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ── WEBSITE ANALYZER TAB ── */}
        {tab === 'analyze' && (
          <div className="flex gap-6 flex-1">
            <div className="w-80 shrink-0 space-y-4">
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-sm text-foreground">Analyze Websites</h3>
                <p className="text-xs text-muted-foreground">Paste up to 5 URLs. AI reads and summarizes each one with key takeaways you can talk through.</p>

                <div className="space-y-2">
                  {urls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={url} onChange={e => {
                        const next = [...urls]; next[i] = e.target.value; setUrls(next);
                      }}
                        placeholder={`https://example.com`}
                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                      {urls.length > 1 && (
                        <button onClick={() => setUrls(urls.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {urls.length < 5 && (
                    <button onClick={() => setUrls([...urls, ''])}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add URL
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Focus (optional)</label>
                  <input value={analysisFocus} onChange={e => setAnalysisFocus(e.target.value)}
                    placeholder="e.g. pricing, competitors, tech stack"
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                </div>

                <button onClick={analyzeUrls} disabled={urls.every(u => !u.trim()) || analyzing}
                  className="w-full py-2.5 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : '⌕ Analyze Sites'}
                </button>
              </div>
            </div>

            <div className="flex-1 bg-card border border-border rounded-2xl p-6 overflow-y-auto min-h-[400px]">
              {!analysisResult && !analyzing && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <Globe className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-muted-foreground text-sm">Paste URLs and click Analyze</p>
                  <p className="text-xs text-muted-foreground/50">Works best with public pages — blogs, company sites, competitor pages, etc.</p>
                </div>
              )}
              {analysisResult && <MarkdownRenderer content={analysisResult} />}
              {analyzing && !analysisResult && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Fetching and reading sites...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INTERVIEW CONDUCTOR TAB ── */}
        {tab === 'conduct' && (
          <div className="flex gap-6 flex-1">
            <div className="w-80 shrink-0 space-y-4">
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-sm text-foreground">Interview Conductor</h3>
                <p className="text-xs text-muted-foreground">AI generates questions + coaching notes. You read them live in the interview.</p>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">What / Who *</label>
                  <input value={interviewSubject} onChange={e => setInterviewSubject(e.target.value)}
                    placeholder="e.g. Senior backend engineer, insurance agent, marketing hire"
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Role / Position (optional)</label>
                  <input value={interviewRole} onChange={e => setInterviewRole(e.target.value)}
                    placeholder="e.g. Head of Claims, Lead Developer"
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50" />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Style</label>
                  <div className="flex gap-2">
                    {(['technical', 'casual', 'mixed'] as const).map(s => (
                      <button key={s} onClick={() => setInterviewStyle(s)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-colors
                          ${interviewStyle === s ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Questions</label>
                  <div className="flex gap-2">
                    {[4, 6, 8].map(n => (
                      <button key={n} onClick={() => setQuestionCount(n)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                          ${questionCount === n ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground border border-border hover:text-foreground'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={generateInterview} disabled={!interviewSubject.trim() || conductingInterview}
                  className="w-full py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-bold hover:bg-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {conductingInterview ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : '✦ Generate Questions'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {interviewQuestions.length === 0 && !conductingInterview && (
                <div className="bg-card border border-border rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center gap-3 text-center p-6">
                  <Mic2 className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-muted-foreground text-sm">Fill in the details and generate your question list</p>
                </div>
              )}

              {conductingInterview && (
                <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> Crafting questions...
                </div>
              )}

              {interviewQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-foreground">{interviewQuestions.length} questions — tap to expand coaching notes</p>
                    <div className="flex gap-2">
                      <button onClick={() => setCurrentQ(v => Math.max(0, v - 1))} disabled={currentQ === 0}
                        className="px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex items-center gap-1">
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </button>
                      <span className="px-3 py-1.5 text-xs text-muted-foreground">{currentQ + 1} / {interviewQuestions.length}</span>
                      <button onClick={() => setCurrentQ(v => Math.min(interviewQuestions.length - 1, v + 1))} disabled={currentQ === interviewQuestions.length - 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex items-center gap-1">
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Current question highlighted */}
                  <AnimatePresence mode="wait">
                    <motion.div key={currentQ} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-rose-500/10 border-2 border-rose-500/40 rounded-2xl p-5 mb-4">
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-2">Ask this now</p>
                      <p className="text-lg font-semibold text-foreground leading-snug mb-4">{interviewQuestions[currentQ]?.question}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-background/40 rounded-xl p-3">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Why ask it</p>
                          <p className="text-xs text-muted-foreground">{interviewQuestions[currentQ]?.why}</p>
                        </div>
                        <div className="bg-background/40 rounded-xl p-3">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Good answer sounds like</p>
                          <p className="text-xs text-muted-foreground">{interviewQuestions[currentQ]?.listen_for}</p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* All questions list */}
                  {interviewQuestions.map((q, i) => (
                    <div key={i}
                      className={`bg-card border rounded-xl overflow-hidden transition-colors cursor-pointer
                        ${i === currentQ ? 'border-rose-500/30' : 'border-border hover:border-border/80'}`}
                      onClick={() => { setCurrentQ(i); setExpanded(expanded === i ? null : i); }}>
                      <div className="flex items-start gap-3 p-4">
                        <span className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5
                          ${i === currentQ ? 'bg-rose-500/30 text-rose-300' : 'bg-muted/30 text-muted-foreground'}`}>
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground flex-1 leading-snug">{q.question}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
