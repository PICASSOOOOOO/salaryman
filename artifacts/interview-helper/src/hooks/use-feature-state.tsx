import { apiFetch } from '@/lib/api-client';
import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

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

  apiFetch(url, {
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

interface FeatureState {
  presentation: {
    topic: string;
    setTopic: (v: string) => void;
    context: string;
    setContext: (v: string) => void;
    slideCount: number;
    setSlideCount: (v: number) => void;
    presentation: PresentationData | null;
    currentSlide: number;
    setCurrentSlide: (v: number) => void;
    generating: boolean;
    showScript: boolean;
    setShowScript: (v: boolean) => void;
    generate: () => void;
    clear: () => void;
  };
  webAnalyzer: {
    urls: string[];
    setUrls: (v: string[]) => void;
    analysisFocus: string;
    setAnalysisFocus: (v: string) => void;
    analysisResult: string;
    analyzing: boolean;
    analysisError: string;
    analyze: () => void;
    clear: () => void;
  };
  interviewConductor: {
    subject: string;
    setSubject: (v: string) => void;
    role: string;
    setRole: (v: string) => void;
    style: 'technical' | 'casual' | 'mixed';
    setStyle: (v: 'technical' | 'casual' | 'mixed') => void;
    questionCount: number;
    setQuestionCount: (v: number) => void;
    questions: InterviewQuestion[];
    conducting: boolean;
    currentQ: number;
    setCurrentQ: (v: number) => void;
    generate: () => void;
    clear: () => void;
  };
  prefill: {
    applyPrefill: (data: Record<string, unknown>) => void;
  };
}

const FeatureStateContext = createContext<FeatureState | null>(null);

export function FeatureStateProvider({ children }: { children: ReactNode }) {
  const presCtrl = useRef<AbortController | null>(null);
  const analyzeCtrl = useRef<AbortController | null>(null);
  const conductCtrl = useRef<AbortController | null>(null);

  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [slideCount, setSlideCount] = useState(5);
  const [pres, setPres] = useState<PresentationData | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [showScript, setShowScript] = useState(true);

  const generatePresentation = useCallback(() => {
    if (!topic.trim()) return;
    presCtrl.current?.abort();
    setGenerating(true);
    setPres(null);
    presCtrl.current = streamSSESimple(
      `${import.meta.env.BASE_URL}api/tools/generate-presentation`,
      { topic, context, slideCount },
      () => {},
      (data) => { setPres(data); setCurrentSlide(0); },
      () => {},
      () => setGenerating(false),
      () => setGenerating(false),
    );
  }, [topic, context, slideCount]);

  const clearPresentation = useCallback(() => {
    presCtrl.current?.abort();
    setPres(null);
    setTopic('');
    setContext('');
    setGenerating(false);
  }, []);

  const [urls, setUrls] = useState<string[]>(['']);
  const [analysisFocus, setAnalysisFocus] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const analyzeUrls = useCallback(() => {
    const validUrls = urls.filter(u => u.trim());
    if (validUrls.length === 0) return;
    analyzeCtrl.current?.abort();
    setAnalyzing(true);
    setAnalysisResult('');
    setAnalysisError('');
    analyzeCtrl.current = streamSSESimple(
      `${import.meta.env.BASE_URL}api/tools/analyze-urls`,
      { urls: validUrls, focus: analysisFocus },
      (chunk) => setAnalysisResult(prev => prev + chunk),
      () => {},
      () => {},
      () => setAnalyzing(false),
      (msg) => { setAnalyzing(false); setAnalysisError(msg || 'Failed to analyze URLs. The site may be blocked or unavailable.'); },
    );
  }, [urls, analysisFocus]);

  const clearAnalyzer = useCallback(() => {
    analyzeCtrl.current?.abort();
    setUrls(['']);
    setAnalysisFocus('');
    setAnalysisResult('');
    setAnalyzing(false);
    setAnalysisError('');
  }, []);

  const [subject, setSubject] = useState('');
  const [role, setRole] = useState('');
  const [style, setStyle] = useState<'technical' | 'casual' | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(6);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [conducting, setConducting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);

  const generateInterview = useCallback(() => {
    if (!subject.trim()) return;
    conductCtrl.current?.abort();
    setConducting(true);
    setQuestions([]);
    setCurrentQ(0);
    conductCtrl.current = streamSSESimple(
      `${import.meta.env.BASE_URL}api/tools/conduct-interview`,
      { subject, role, style, count: questionCount },
      () => {},
      () => {},
      (data) => setQuestions(data.questions),
      () => setConducting(false),
      () => setConducting(false),
    );
  }, [subject, role, style, questionCount]);

  const clearInterview = useCallback(() => {
    conductCtrl.current?.abort();
    setSubject('');
    setRole('');
    setQuestions([]);
    setConducting(false);
    setCurrentQ(0);
  }, []);

  const applyPrefillData = useCallback((prefill: Record<string, unknown>) => {
    const age = Date.now() - ((prefill._ts as number) || 0);
    if (age > 30000) return;
    if (prefill.subject) setSubject(prefill.subject as string);
    if (prefill.role) setRole(prefill.role as string);
    if (prefill.style) setStyle(prefill.style as 'technical' | 'casual' | 'mixed');
    if (prefill.count) setQuestionCount(Number(prefill.count));
    if (prefill.topic) setTopic(prefill.topic as string);
    if (prefill.context) setContext(prefill.context as string);
    if (prefill.slideCount) setSlideCount(Number(prefill.slideCount));
    if (Array.isArray(prefill.urls)) setUrls(prefill.urls as string[]);
    if (prefill.focus) setAnalysisFocus(prefill.focus as string);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('devdocs_action_prefill');
      if (!raw) return;
      const prefill = JSON.parse(raw) as Record<string, unknown>;
      const age = Date.now() - ((prefill._ts as number) || 0);
      if (age > 30000) { localStorage.removeItem('devdocs_action_prefill'); return; }
      localStorage.removeItem('devdocs_action_prefill');
      applyPrefillData(prefill);
    } catch {}
  }, [applyPrefillData]);

  useEffect(() => {
    const onPabloAction = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail;
      if (detail) applyPrefillData(detail);
    };
    window.addEventListener('pablo-action', onPabloAction);
    return () => window.removeEventListener('pablo-action', onPabloAction);
  }, [applyPrefillData]);

  const value: FeatureState = {
    presentation: {
      topic, setTopic, context, setContext, slideCount, setSlideCount,
      presentation: pres, currentSlide, setCurrentSlide,
      generating, showScript, setShowScript,
      generate: generatePresentation, clear: clearPresentation,
    },
    webAnalyzer: {
      urls, setUrls, analysisFocus, setAnalysisFocus,
      analysisResult, analyzing, analysisError,
      analyze: analyzeUrls, clear: clearAnalyzer,
    },
    interviewConductor: {
      subject, setSubject, role, setRole, style, setStyle,
      questionCount, setQuestionCount,
      questions, conducting, currentQ, setCurrentQ,
      generate: generateInterview, clear: clearInterview,
    },
    prefill: {
      applyPrefill: (data) => applyPrefillData(data),
    },
  };

  return (
    <FeatureStateContext.Provider value={value}>
      {children}
    </FeatureStateContext.Provider>
  );
}

export function useFeatureState() {
  const ctx = useContext(FeatureStateContext);
  if (!ctx) throw new Error('useFeatureState must be used within FeatureStateProvider');
  return ctx;
}
