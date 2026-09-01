import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Link2, Sparkles, Loader2, Copy, Check, Bot,
  Target, TrendingUp, Star, AlertTriangle, ChevronRight,
  FileText, Shield, Zap, Plus, Trash2, Clock, X,
  Search, MessageSquare, BookOpen, ExternalLink, Download,
} from 'lucide-react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { usePlan } from '@/hooks/use-plan';
import { SignInPage } from '@/components/SignInPrompt';
import { apiFetch } from '@/lib/api-client';
import { useLocation } from 'wouter';

type Tab = 'pipeline' | 'tracker' | 'resume' | 'prep';
type AppStatus = 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

interface TrackedJob {
  id: string;
  company: string;
  role: string;
  grade: string;
  score: number;
  status: AppStatus;
  url?: string;
  notes: string;
  appliedAt: string;
  recommendation: string;
  keywords: string[];
}

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; bg: string }> = {
  saved: { label: 'SAVED', color: 'text-zinc-400', bg: 'bg-zinc-500/15 border-zinc-500/25' },
  applied: { label: 'APPLIED', color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/25' },
  screening: { label: 'SCREENING', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' },
  interview: { label: 'INTERVIEW', color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/25' },
  offer: { label: 'OFFER', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25' },
  rejected: { label: 'REJECTED', color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/25' },
  withdrawn: { label: 'WITHDRAWN', color: 'text-zinc-500', bg: 'bg-zinc-500/10 border-zinc-500/20' },
};

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

function renderMd(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^---$/gm, '<hr />')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^[•·] (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br />');
}

function useTrackedJobs() {
  const [jobs, setJobs] = useState<TrackedJob[]>(() => {
    try { return JSON.parse(localStorage.getItem('jcc-tracked-jobs') ?? '[]'); } catch { return []; }
  });
  const save = useCallback((updated: TrackedJob[]) => {
    setJobs(updated);
    localStorage.setItem('jcc-tracked-jobs', JSON.stringify(updated));
  }, []);
  const add = useCallback((job: TrackedJob) => save([job, ...jobs]), [jobs, save]);
  const update = useCallback((id: string, patch: Partial<TrackedJob>) => {
    save(jobs.map(j => j.id === id ? { ...j, ...patch } : j));
  }, [jobs, save]);
  const remove = useCallback((id: string) => save(jobs.filter(j => j.id !== id)), [jobs, save]);
  return { jobs, add, update, remove };
}

function useUserResume() {
  const [resume, setResume] = useState(() => localStorage.getItem('jcc-resume') ?? '');
  const save = useCallback((r: string) => { setResume(r); localStorage.setItem('jcc-resume', r); }, []);
  return [resume, save] as const;
}

async function streamEndpoint(
  path: string,
  body: Record<string, unknown>,
  onStatus: (s: string) => void,
  onContent: (c: string) => void,
  onDone: () => void,
  onError: (e: string) => void,
  signal?: AbortSignal,
) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(d.error || 'Request failed');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No stream');
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if (d.status) onStatus(d.status);
        else if (d.content) onContent(d.content);
        else if (d.done) onDone();
        else if (d.error) onError(d.error);
      } catch {}
    }
  }
  onDone();
}

export default function JobCommandCenter() {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const plan = usePlan();
  const [, navigate] = useLocation();
  const hasAccess = plan.isOwner || plan.features.has('claw_bot');

  const [tab, setTab] = useState<Tab>('pipeline');
  const { jobs, add, update, remove } = useTrackedJobs();
  const [userResume, setUserResume] = useUserResume();

  const [jobDesc, setJobDesc] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [evalResult, setEvalResult] = useState('');
  const [evalParsed, setEvalParsed] = useState<Record<string, unknown> | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [resumeJobDesc, setResumeJobDesc] = useState('');
  const [resumeResult, setResumeResult] = useState('');
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);

  const [prepJobDesc, setPrepJobDesc] = useState('');
  const [prepCompany, setPrepCompany] = useState('');
  const [prepRole, setPrepRole] = useState('');
  const [prepResult, setPrepResult] = useState('');
  const [isPrepping, setIsPrepping] = useState(false);

  const [copied, setCopied] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppStatus | 'all'>('all');

  const abortRef = useRef<AbortController | null>(null);

  if (!isAuthenticated) return <SignInPage />;

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col bg-background items-center justify-center p-8">
        <div className="max-w-md text-center">
          <Bot className="w-16 h-16 mx-auto mb-4 text-emerald-400/30" />
          <h2 className="text-xl font-bold text-foreground mb-2" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.6rem' }}>
            {boomerMode ? 'PIXEL AGENTS REQUIRED' : 'ACCESS LEVEL: INSUFFICIENT'}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {boomerMode
              ? 'Job Command Center is a Pixel Agents feature. Subscribe to unlock AI-powered job evaluation, resume tailoring, and interview prep.'
              : 'JOB COMMAND CENTER REQUIRES PIXEL AGENTS CLEARANCE. $149/MO UNLOCKS FULL ACCESS.'}
          </p>
          <button onClick={() => navigate('/pledge')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-colors mx-auto">
            <Sparkles className="w-4 h-4" />
            {boomerMode ? 'GET PIXEL AGENTS' : 'ACTIVATE PIXEL AGENTS'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const evaluateJob = async () => {
    if (!jobDesc.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsEvaluating(true);
    setEvalResult('');
    setEvalParsed(null);
    try {
      let raw = '';
      await streamEndpoint(
        '/api/tools/job-evaluate',
        { jobDescription: jobDesc.trim(), jobUrl: jobUrl.trim() || undefined, userProfile: userResume || undefined },
        () => {},
        (c) => { raw += c; setEvalResult(raw); },
        () => {
          setIsEvaluating(false);
          try {
            const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            setEvalParsed(parsed);
          } catch {}
        },
        (e) => { setIsEvaluating(false); setEvalResult(`Error: ${e}`); },
        controller.signal,
      );
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setIsEvaluating(false);
        setEvalResult(`Error: ${(e as Error).message}`);
      }
    }
  };

  const saveToTracker = () => {
    if (!evalParsed) return;
    const p = evalParsed as Record<string, unknown>;
    add({
      id: Date.now().toString(36),
      company: String(p.company ?? 'Unknown'),
      role: String(p.role ?? 'Unknown'),
      grade: String(p.grade ?? 'C'),
      score: Number(p.score ?? 3),
      status: 'saved',
      url: jobUrl || undefined,
      notes: String(p.verdict ?? ''),
      appliedAt: new Date().toISOString(),
      recommendation: String(p.applyRecommendation ?? 'CONSIDER'),
      keywords: Array.isArray(p.resumeKeywords) ? (p.resumeKeywords as string[]) : [],
    });
    setTab('tracker');
  };

  const generateResume = async () => {
    if (!resumeJobDesc.trim() || !userResume.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingResume(true);
    setResumeResult('');
    try {
      let raw = '';
      await streamEndpoint(
        '/api/tools/job-resume',
        { jobDescription: resumeJobDesc.trim(), currentResume: userResume.trim() },
        () => {},
        (c) => { raw += c; setResumeResult(raw); },
        () => setIsGeneratingResume(false),
        (e) => { setIsGeneratingResume(false); setResumeResult(`Error: ${e}`); },
        controller.signal,
      );
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setIsGeneratingResume(false);
        setResumeResult(`Error: ${(e as Error).message}`);
      }
    }
  };

  const generatePrep = async () => {
    if (!prepJobDesc.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsPrepping(true);
    setPrepResult('');
    try {
      let raw = '';
      await streamEndpoint(
        '/api/tools/job-interview-prep',
        { jobDescription: prepJobDesc.trim(), company: prepCompany || undefined, role: prepRole || undefined, resume: userResume || undefined },
        () => {},
        (c) => { raw += c; setPrepResult(raw); },
        () => setIsPrepping(false),
        (e) => { setIsPrepping(false); setPrepResult(`Error: ${e}`); },
        controller.signal,
      );
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        setIsPrepping(false);
        setPrepResult(`Error: ${(e as Error).message}`);
      }
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const filteredJobs = statusFilter === 'all' ? jobs : jobs.filter(j => j.status === statusFilter);

  const TABS: { key: Tab; label: string; codename: string; icon: typeof Briefcase }[] = [
    { key: 'pipeline', label: 'EVALUATE', codename: 'PIPELINE', icon: Target },
    { key: 'tracker', label: 'TRACKER', codename: 'OPS LOG', icon: Briefcase },
    { key: 'resume', label: 'RESUME AI', codename: 'CV ENGINE', icon: FileText },
    { key: 'prep', label: 'INTERVIEW PREP', codename: 'BATTLE PREP', icon: Shield },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-4 md:p-6 relative z-10">
        <div className="max-w-4xl mx-auto">

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", letterSpacing: '0.1em', fontSize: '1.4rem' }}>
                    {boomerMode ? 'JOB COMMAND CENTER' : 'JOB COMMAND CENTER // JCC'}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">PIXEL AGENTS</span>
                </div>
                <p className="text-xs text-muted-foreground" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                  {boomerMode ? 'AI-POWERED JOB EVALUATION, RESUME TAILORING, AND INTERVIEW PREPARATION' : 'EVALUATE · TRACK · OPTIMIZE RESUME · PREPARE FOR BATTLE'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${tab === t.key ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-card text-muted-foreground border-border hover:border-emerald-500/20'}`}>
                  <Icon className="w-4 h-4" />
                  {boomerMode ? t.label : t.codename}
                  {t.key === 'tracker' && jobs.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">{jobs.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {tab === 'pipeline' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                    {boomerMode ? 'PASTE JOB DESCRIPTION' : 'TARGET ACQUISITION'}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input type="url" value={jobUrl} onChange={e => setJobUrl(e.target.value)}
                        placeholder={boomerMode ? 'Job posting URL (optional)' : 'JOB URL (OPTIONAL)'}
                        className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 transition-colors"
                        style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                        disabled={isEvaluating}
                      />
                    </div>
                  </div>
                  <textarea
                    value={jobDesc}
                    onChange={e => setJobDesc(e.target.value)}
                    placeholder={boomerMode ? 'Paste the full job description here...' : 'PASTE FULL JOB DESCRIPTION HERE...'}
                    className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 transition-colors resize-none"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    rows={8}
                    disabled={isEvaluating}
                  />
                  <div className="flex items-center gap-3">
                    <button onClick={evaluateJob} disabled={!jobDesc.trim() || isEvaluating}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40 shadow-lg shadow-emerald-500/20">
                      {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {boomerMode ? 'EVALUATE' : 'ANALYZE TARGET'}
                    </button>
                    {!userResume && (
                      <button onClick={() => setTab('resume')}
                        className="flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-400 transition-colors">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {boomerMode ? 'Add your resume for personalized scoring' : 'ADD RESUME FOR PERSONALIZED SCORING'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {(isEvaluating || evalResult) && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    {isEvaluating && !evalParsed && (
                      <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mr-3" />
                        <span className="text-sm font-bold" style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}>
                          {boomerMode ? 'EVALUATING JOB...' : 'ANALYZING TARGET...'}
                        </span>
                      </div>
                    )}

                    {evalParsed && (
                      <div className="rounded-2xl border border-emerald-500/15 bg-card/50 overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-start gap-4 mb-5">
                            <div className="w-14 h-14 rounded-2xl border-2 flex items-center justify-center shrink-0"
                              style={{ borderColor: GRADE_COLORS[String(evalParsed.grade)] ?? '#6366f1', background: `${GRADE_COLORS[String(evalParsed.grade)] ?? '#6366f1'}15` }}>
                              <span className="text-2xl font-bold" style={{ color: GRADE_COLORS[String(evalParsed.grade)] ?? '#6366f1', fontFamily: "var(--font-sans)" }}>
                                {String(evalParsed.grade)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-foreground text-lg" style={boomerMode ? {} : { fontFamily: "var(--font-sans)", fontSize: '1.3rem' }}>
                                {String(evalParsed.role ?? 'Role')}
                              </h3>
                              <p className="text-sm text-muted-foreground">{String(evalParsed.company ?? 'Company')} · {String(evalParsed.location ?? '')}</p>
                              <p className="text-xs text-emerald-400/70 mt-1">{String(evalParsed.verdict ?? '')}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-bold" style={{ color: GRADE_COLORS[String(evalParsed.grade)] ?? '#6366f1', fontFamily: "var(--font-sans)" }}>
                                {Number(evalParsed.score).toFixed(1)}
                              </div>
                              <div className="text-[10px] text-muted-foreground/50">/ 5.0</div>
                              <span className={`mt-1 inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                                String(evalParsed.applyRecommendation) === 'STRONG APPLY' ? 'bg-emerald-500/15 text-emerald-400' :
                                String(evalParsed.applyRecommendation) === 'APPLY' ? 'bg-sky-500/15 text-sky-400' :
                                String(evalParsed.applyRecommendation) === 'CONSIDER' ? 'bg-amber-500/15 text-amber-400' :
                                'bg-red-500/15 text-red-400'
                              }`}>
                                {String(evalParsed.applyRecommendation)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
                            {(Array.isArray(evalParsed.dimensions) ? (evalParsed.dimensions as Array<{ name: string; score: number; note: string }>) : []).map((dim) => (
                              <div key={dim.name} className="rounded-lg border border-border/50 p-2.5 text-center" title={dim.note}>
                                <div className="text-lg font-bold" style={{ fontFamily: "var(--font-sans)", color: dim.score >= 4 ? '#10b981' : dim.score >= 3 ? '#f59e0b' : '#ef4444' }}>
                                  {dim.score}
                                </div>
                                <div className="text-[8px] text-muted-foreground/50 uppercase tracking-wider leading-tight">{dim.name}</div>
                              </div>
                            ))}
                          </div>

                          {Array.isArray(evalParsed.keyInsights) && (
                            <div className="mb-4">
                              <div className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest mb-2">KEY INSIGHTS</div>
                              {(evalParsed.keyInsights as string[]).map((insight, i) => (
                                <div key={i} className="flex items-start gap-2 mb-1.5">
                                  <Star className="w-3 h-3 text-emerald-400/40 mt-0.5 shrink-0" />
                                  <span className="text-xs text-muted-foreground leading-relaxed">{insight}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {Array.isArray(evalParsed.resumeKeywords) && (evalParsed.resumeKeywords as string[]).length > 0 && (
                            <div className="mb-4">
                              <div className="text-[10px] font-bold text-sky-400/60 uppercase tracking-widest mb-2">ATS KEYWORDS</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(evalParsed.resumeKeywords as string[]).map((kw, i) => (
                                  <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold text-sky-400/70 border border-sky-500/20 bg-sky-500/5">{kw}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-4 border-t border-border/30">
                            <button onClick={saveToTracker}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                              <Plus className="w-3.5 h-3.5" />
                              {boomerMode ? 'SAVE TO TRACKER' : 'ADD TO OPS LOG'}
                            </button>
                            <button onClick={() => { setResumeJobDesc(jobDesc); setTab('resume'); }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/20 transition-colors">
                              <FileText className="w-3.5 h-3.5" />
                              {boomerMode ? 'TAILOR RESUME' : 'GENERATE CV'}
                            </button>
                            <button onClick={() => { setPrepJobDesc(jobDesc); setPrepCompany(String(evalParsed?.company ?? '')); setPrepRole(String(evalParsed?.role ?? '')); setTab('prep'); }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:border-emerald-500/20 transition-colors">
                              <Shield className="w-3.5 h-3.5" />
                              {boomerMode ? 'PREP INTERVIEW' : 'BATTLE PREP'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!evalParsed && evalResult && !isEvaluating && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{evalResult}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {tab === 'tracker' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {(['all', ...Object.keys(STATUS_CONFIG)] as Array<'all' | AppStatus>).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${statusFilter === s ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'text-muted-foreground border-border hover:border-emerald-500/20'}`}>
                    {s === 'all' ? `ALL (${jobs.length})` : `${STATUS_CONFIG[s].label} (${jobs.filter(j => j.status === s).length})`}
                  </button>
                ))}
              </div>

              {filteredJobs.length === 0 ? (
                <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground mb-2">
                    {boomerMode ? 'No tracked applications yet' : 'OPS LOG EMPTY'}
                  </p>
                  <button onClick={() => setTab('pipeline')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    {boomerMode ? 'Evaluate a job to get started' : 'RUN PIPELINE TO BEGIN'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredJobs.map(job => {
                    const sc = STATUS_CONFIG[job.status];
                    return (
                      <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-border bg-card/50 p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0"
                            style={{ borderColor: GRADE_COLORS[job.grade] ?? '#6366f1', background: `${GRADE_COLORS[job.grade] ?? '#6366f1'}15` }}>
                            <span className="text-lg font-bold" style={{ color: GRADE_COLORS[job.grade] ?? '#6366f1', fontFamily: "var(--font-sans)" }}>{job.grade}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="font-bold text-foreground text-sm truncate">{job.role}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${sc.bg} ${sc.color}`}>{sc.label}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{job.company}</span>
                              <span className="text-muted-foreground/30">·</span>
                              <span>{job.score.toFixed(1)}/5</span>
                              <span className="text-muted-foreground/30">·</span>
                              <span>{new Date(job.appliedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <select
                              value={job.status}
                              onChange={e => update(job.id, { status: e.target.value as AppStatus })}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-muted/50 border border-border text-foreground focus:outline-none cursor-pointer"
                            >
                              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                            {job.url && (
                              <a href={job.url} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button onClick={() => remove(job.id)}
                              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {job.notes && (
                          <p className="text-[10px] text-muted-foreground/50 mt-2 pl-[52px]">{job.notes}</p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {jobs.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'TOTAL', value: jobs.length, color: 'text-foreground' },
                    { label: 'ACTIVE', value: jobs.filter(j => ['applied', 'screening', 'interview'].includes(j.status)).length, color: 'text-sky-400' },
                    { label: 'OFFERS', value: jobs.filter(j => j.status === 'offer').length, color: 'text-emerald-400' },
                    { label: 'AVG SCORE', value: (jobs.reduce((a, j) => a + j.score, 0) / jobs.length).toFixed(1), color: 'text-amber-400' },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-lg border border-border/50 p-3 text-center">
                      <div className={`text-lg font-bold ${stat.color}`} style={{ fontFamily: "var(--font-sans)" }}>{stat.value}</div>
                      <div className="text-[8px] text-muted-foreground/40 uppercase tracking-wider">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'resume' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">
                    {boomerMode ? 'YOUR BASE RESUME' : 'BASE CV // SOURCE DOCUMENT'}
                  </span>
                  <div className="flex-1" />
                  {userResume && <span className="text-[9px] text-emerald-400/60">SAVED</span>}
                </div>
                <textarea
                  value={userResume}
                  onChange={e => setUserResume(e.target.value)}
                  placeholder={boomerMode ? 'Paste your current resume/CV here. This will be used as the base for all tailored versions and for personalized job scoring.' : 'PASTE BASE CV HERE. USED FOR ALL TAILORED VERSIONS + PERSONALIZED SCORING.'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-sky-500/40 transition-colors resize-none"
                  style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                  rows={6}
                />
              </div>

              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                    {boomerMode ? 'TAILOR FOR JOB' : 'ATS OPTIMIZATION TARGET'}
                  </span>
                </div>
                <textarea
                  value={resumeJobDesc}
                  onChange={e => setResumeJobDesc(e.target.value)}
                  placeholder={boomerMode ? 'Paste the job description to tailor your resume for...' : 'PASTE TARGET JOB DESCRIPTION...'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 transition-colors resize-none"
                  style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                  rows={6}
                  disabled={isGeneratingResume}
                />
                <button onClick={generateResume} disabled={!resumeJobDesc.trim() || !userResume.trim() || isGeneratingResume}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40 shadow-lg shadow-emerald-500/20">
                  {isGeneratingResume ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {boomerMode ? 'GENERATE TAILORED RESUME' : 'OPTIMIZE CV'}
                </button>
              </div>

              {resumeResult && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-emerald-500/15 bg-card/50 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-500/10 bg-emerald-500/[0.03]">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                        {boomerMode ? 'TAILORED RESUME' : 'OPTIMIZED CV'}
                      </span>
                      {isGeneratingResume && <Loader2 className="w-3 h-3 animate-spin text-emerald-400/50" />}
                    </div>
                    <button onClick={() => copyText(resumeResult, 'resume')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-emerald-400 border border-border hover:border-emerald-500/20 transition-colors">
                      {copied === 'resume' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied === 'resume' ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <div className="p-5 prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-h2:text-sm prose-h2:text-emerald-400 prose-h3:text-xs prose-p:text-xs prose-li:text-xs prose-strong:text-foreground"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    dangerouslySetInnerHTML={{ __html: renderMd(resumeResult) }}
                  />
                </motion.div>
              )}
            </div>
          )}

          {tab === 'prep' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                    {boomerMode ? 'INTERVIEW DETAILS' : 'MISSION PARAMETERS'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input type="text" value={prepCompany} onChange={e => setPrepCompany(e.target.value)}
                    placeholder={boomerMode ? 'Company name' : 'COMPANY'}
                    className="px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/40 transition-colors"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    disabled={isPrepping}
                  />
                  <input type="text" value={prepRole} onChange={e => setPrepRole(e.target.value)}
                    placeholder={boomerMode ? 'Role/position' : 'TARGET ROLE'}
                    className="px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/40 transition-colors"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    disabled={isPrepping}
                  />
                </div>
                <textarea
                  value={prepJobDesc}
                  onChange={e => setPrepJobDesc(e.target.value)}
                  placeholder={boomerMode ? 'Paste the job description for interview prep...' : 'PASTE JOB DESCRIPTION FOR BATTLE PREP...'}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/40 transition-colors resize-none"
                  style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                  rows={6}
                  disabled={isPrepping}
                />
                <button onClick={generatePrep} disabled={!prepJobDesc.trim() || isPrepping}
                  className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-40 shadow-lg shadow-violet-500/20">
                  {isPrepping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {boomerMode ? 'GENERATE PREP PACKAGE' : 'INITIATE BATTLE PREP'}
                </button>
              </div>

              {prepResult && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-violet-500/15 bg-card/50 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-violet-500/10 bg-violet-500/[0.03]">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                        {boomerMode ? 'INTERVIEW PREP' : 'BATTLE BRIEF'}
                      </span>
                      {isPrepping && <Loader2 className="w-3 h-3 animate-spin text-violet-400/50" />}
                    </div>
                    <button onClick={() => copyText(prepResult, 'prep')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-violet-400 border border-border hover:border-violet-500/20 transition-colors">
                      {copied === 'prep' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied === 'prep' ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <div className="p-5 prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-h2:text-sm prose-h2:text-violet-400 prose-h3:text-xs prose-p:text-xs prose-li:text-xs prose-strong:text-foreground"
                    style={boomerMode ? {} : { fontFamily: "var(--font-sans)" }}
                    dangerouslySetInnerHTML={{ __html: renderMd(prepResult) }}
                  />
                </motion.div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
