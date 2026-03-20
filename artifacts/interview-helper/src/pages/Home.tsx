import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { checkSpelling, SpellMatch } from '@/lib/spellcheck';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Bot, ArrowRight, Clock, X, Globe, Brain, Loader2, Send, MessageSquare, Mic, MicOff, Volume2, Phone, Layers, Radio } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { useAdvisorChat } from '@/hooks/use-interview';
import { useVoiceConversation } from '@/hooks/use-voice-conversation';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { OnboardingModal } from '@/components/OnboardingModal';
import { usePlan } from '@/hooks/use-plan';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { CITY_NAME } from '@/gameSystems';
import { WebsiteAnalyzer } from '@/components/WebsiteAnalyzer';
import { ProGate } from '@/components/ProGate';

const TRIAL_SEEN_KEY = 'sm_trial_welcome_seen';

function computeDecayedSalary(governmentBaseSalary: number, createdAt?: string): number {
  if (!createdAt || !governmentBaseSalary) return governmentBaseSalary;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / WEEK_MS);
  if (weeksElapsed <= 0) return governmentBaseSalary;
  return Math.round(governmentBaseSalary * Math.pow(0.99, weeksElapsed));
}

const CHAT_STARTERS = [
  'hey i\'m conducting an interview — what tools should i use and can you set it up?',
  'i have a zoom call in 10 minutes, what should i prepare?',
  'can you build me a presentation on why we should expand into insurance?',
  'what\'s the best way to use this app for a sales meeting?',
  'analyze these competitor sites for me',
];

function usePabloVoice() {
  const [isHolding, setIsHolding] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const transcriptRef = useRef('');

  const startHold = useCallback((onTranscript: (text: string) => void) => {
    const W = window as unknown as Record<string, unknown>;
    const SRCtor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void;
    }) | undefined;
    if (!SRCtor) return;

    setIsHolding(true);
    transcriptRef.current = '';
    const rec = new SRCtor();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      const full = Array.from(ev.results).map(r => r[0].transcript).join('');
      transcriptRef.current = full;
    };
    rec.onend = () => {
      setIsHolding(false);
      setIsTranscribing(false);
      recRef.current = null;
      if (transcriptRef.current.trim()) {
        onTranscript(transcriptRef.current.trim());
      }
    };
    rec.onerror = () => {
      setIsHolding(false);
      setIsTranscribing(false);
      recRef.current = null;
    };
    rec.start();
  }, []);

  const stopHold = useCallback(() => {
    if (recRef.current) {
      setIsTranscribing(true);
      recRef.current.stop();
    }
    setIsHolding(false);
  }, []);

  const speakResponse = useCallback((text: string) => {
    const clean = text.replace(/[#*`_~\[\]()>]/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'es-ES';
    u.rate = 0.95;
    u.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es') && v.name.toLowerCase().includes('male'))
      || voices.find(v => v.lang.startsWith('es'))
      || voices.find(v => v.lang.startsWith('en'));
    if (spanishVoice) u.voice = spanishVoice;

    setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { isHolding, isTranscribing, isSpeaking, startHold, stopHold, speakResponse, stopSpeaking };
}

export default function Home() {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  usePlan();
  const [trialPopup] = useState(false);
  const dismissTrialPopup = () => {};
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const [serverOnline, setServerOnline] = useState<number | null>(null);
  const [serverMax, setServerMax] = useState(50);
  const [gameSave, setGameSave] = useState<{ salary: number; governmentBaseSalary?: number; goldBalance: number; level: number; hp: number; maxHp: number; savings: number; createdAt?: string } | null>(null);

  const [translatorText, setTranslatorText] = useState('');
  const [translatorFrom, setTranslatorFrom] = useState(() => localStorage.getItem('sm_xlat_from') ?? 'vi');
  const [translatorTo, setTranslatorTo] = useState(() => localStorage.getItem('sm_xlat_to') ?? 'en');
  const [translatorResult, setTranslatorResult] = useState('');
  const [translatorListening, setTranslatorListening] = useState(false);
  const translatorRecRef = useRef<{ stop: () => void } | null>(null);

  const [dictWord, setDictWord] = useState('');
  const [dictResult, setDictResult] = useState<{ word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; synonyms?: string[] }[] }[] } | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState('');
  const [dictSuggestions, setDictSuggestions] = useState<string[]>([]);
  const [dictThesaurus, setDictThesaurus] = useState<{ synonymsByPos: Record<string, string[]>; antonyms: string[] } | null>(null);

  const [notes, setNotes] = useState<{ id: number; text: string; ts: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('sm_notes') ?? '[]'); } catch { return []; }
  });
  const [noteInput, setNoteInput] = useState('');
  const [spellMatches, setSpellMatches] = useState<SpellMatch[]>([]);
  const [spellPopup, setSpellPopup] = useState<{ match: SpellMatch; x: number; y: number } | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const noteWrapperRef = useRef<HTMLDivElement>(null);
  const spellCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { localStorage.setItem('sm_xlat_from', translatorFrom); }, [translatorFrom]);
  useEffect(() => { localStorage.setItem('sm_xlat_to', translatorTo); }, [translatorTo]);
  useEffect(() => { localStorage.setItem('sm_notes', JSON.stringify(notes)); }, [notes]);

  const lookupWord = async (word: string) => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    setDictLoading(true); setDictError(''); setDictResult(null); setDictSuggestions([]); setDictThesaurus(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
      if (!res.ok) {
        try {
          const [spellRes, soundsRes] = await Promise.all([
            fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&max=5`),
            fetch(`https://api.datamuse.com/words?sl=${encodeURIComponent(w)}&max=3`),
          ]);
          const spellData: { word: string }[] = spellRes.ok ? await spellRes.json() : [];
          const soundsData: { word: string }[] = soundsRes.ok ? await soundsRes.json() : [];
          const seen = new Set<string>();
          const suggestions: string[] = [];
          for (const item of [...spellData, ...soundsData]) {
            if (!seen.has(item.word) && item.word !== w) { seen.add(item.word); suggestions.push(item.word); }
          }
          if (suggestions.length > 0) {
            setDictSuggestions(suggestions.slice(0, 5));
            setDictError(`No definition found for "${w}".`);
          } else {
            setDictError(`No definition found for "${w}".`);
          }
        } catch {
          setDictError(`No definition found for "${w}".`);
        }
        setDictLoading(false);
        return;
      }
      const data = await res.json();
      const entry = data[0];
      setDictResult({ word: entry.word, phonetic: entry.phonetic ?? entry.phonetics?.find((p: { text?: string }) => p.text)?.text, meanings: entry.meanings ?? [] });
      try {
        const [synRes, antRes] = await Promise.all([
          fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20&md=p`),
          fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(w)}&max=10&md=p`),
        ]);
        const synData: { word: string; tags?: string[] }[] = synRes.ok ? await synRes.json() : [];
        const antData: { word: string; tags?: string[] }[] = antRes.ok ? await antRes.json() : [];
        const POS_LABELS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };
        const synonymsByPos: Record<string, string[]> = {};
        for (const item of synData) {
          const posTag = item.tags?.find(t => t in POS_LABELS) ?? 'other';
          const posLabel = POS_LABELS[posTag] ?? posTag;
          if (!synonymsByPos[posLabel]) synonymsByPos[posLabel] = [];
          if (synonymsByPos[posLabel].length < 6) synonymsByPos[posLabel].push(item.word);
        }
        const antonyms = antData.map(d => d.word);
        if (Object.keys(synonymsByPos).length > 0 || antonyms.length > 0) {
          setDictThesaurus({ synonymsByPos, antonyms });
        }
      } catch { }
    } catch { setDictError('Dictionary service unavailable.'); }
    setDictLoading(false);
  };

  const addNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    setNotes(prev => [{ id: Date.now(), text, ts: Date.now() }, ...prev]);
    setNoteInput('');
    setSpellMatches([]);
    setSpellPopup(null);
  };

  const deleteNote = (id: number) => setNotes(prev => prev.filter(n => n.id !== id));

  const handleNoteInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteInput(val);
    setSpellPopup(null);
    if (spellCheckTimerRef.current) clearTimeout(spellCheckTimerRef.current);
    if (!val.trim()) { setSpellMatches([]); return; }
    spellCheckTimerRef.current = setTimeout(async () => {
      const matches = await checkSpelling(val);
      setSpellMatches(matches);
    }, 800);
  };

  const applySpellCorrection = (match: SpellMatch, suggestion: string) => {
    const before = noteInput.slice(0, match.offset);
    const after = noteInput.slice(match.offset + match.length);
    const newText = before + suggestion + after;
    setNoteInput(newText);
    setSpellPopup(null);
    setSpellMatches(prev => prev.filter(m => m.offset !== match.offset));
    noteTextareaRef.current?.focus();
  };

  const handleNoteClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!spellMatches.length) return;
    const ta = e.currentTarget;
    const pos = ta.selectionStart ?? 0;
    const hit = spellMatches.find(m => pos >= m.offset && pos <= m.offset + m.length);
    if (!hit) { setSpellPopup(null); return; }
    const rect = ta.getBoundingClientRect();
    const wrapRect = noteWrapperRef.current?.getBoundingClientRect() ?? rect;
    setSpellPopup({ match: hit, x: e.clientX - wrapRect.left, y: rect.bottom - wrapRect.top + 4 });
  };

  const noteHighlightHtml = useMemo(() => {
    if (!spellMatches.length) return null;
    let result = '';
    let last = 0;
    const sorted = [...spellMatches].sort((a, b) => a.offset - b.offset);
    for (const m of sorted) {
      if (m.offset < last) continue;
      result += noteInput.slice(last, m.offset).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br/>');
      const word = noteInput.slice(m.offset, m.offset + m.length).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      result += `<span style="border-bottom:2px solid #f472b6;cursor:pointer;">${word}</span>`;
      last = m.offset + m.length;
    }
    result += noteInput.slice(last).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
    return result;
  }, [noteInput, spellMatches]);

  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(false);
  const lastSpokenRef = useRef(-1);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${import.meta.env.BASE_URL}api/world/server-status`).then(r => r.json()).then(d => { setServerOnline(d.online ?? 0); setServerMax(d.max ?? 50); }).catch(() => {});
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const parseFields = (s: Record<string, unknown>, fallbackCreatedAt?: string) => {
      const dataCreatedAt = s.createdAt as string | undefined;
      return {
        salary: Number(s.salary ?? 0),
        governmentBaseSalary: s.governmentBaseSalary !== undefined ? Number(s.governmentBaseSalary) : undefined,
        goldBalance: Number(s.goldBalance ?? 0),
        level: Number(s.level ?? 1),
        hp: Number(s.hp ?? 100),
        maxHp: Number(s.maxHp ?? 100),
        savings: Number(s.savings ?? 0),
        createdAt: dataCreatedAt ?? fallbackCreatedAt,
      };
    };
    let localLevel = 0;
    try {
      const raw = localStorage.getItem('sm_save');
      if (raw) {
        let localCreatedAt: string | undefined;
        let localGovSalary: number | undefined;
        try {
          const ch = localStorage.getItem('sm_char');
          if (ch) {
            const charData = JSON.parse(ch);
            localCreatedAt = charData.createdAt;
            localGovSalary = charData.governmentBaseSalary ?? charData.salary;
          }
        } catch {}
        const parsed = JSON.parse(raw);
        if (localGovSalary !== undefined && parsed.governmentBaseSalary === undefined) {
          parsed.governmentBaseSalary = localGovSalary;
        }
        const p = parseFields(parsed, localCreatedAt);
        localLevel = p.level;
        setGameSave(p);
      }
    } catch {}
    if (isAuthenticated) {
      fetch(`${import.meta.env.BASE_URL}api/salaryman/saves`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (!res?.saves?.length) return;
          const newest = res.saves.reduce((a: { lastSavedAt: string }, b: { lastSavedAt: string }) =>
            new Date(b.lastSavedAt) > new Date(a.lastSavedAt) ? b : a);
          if (newest?.data) {
            const dataObj = newest.data as Record<string, unknown>;
            if (dataObj.governmentBaseSalary === undefined) {
              const cls = (newest.charClass ?? dataObj.class) as string | undefined;
              dataObj.governmentBaseSalary = cls === 'corporate' ? 25000 : cls === 'replicant' ? 18000 : cls === 'outlaw' ? 10000 : undefined;
            }
            const cloud = parseFields(dataObj, newest.createdAt as string | undefined);
            if (cloud.level >= localLevel) setGameSave(cloud);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const { messages: chatMessages, businessMemory, isStreaming: chatStreaming, currentAgent, send: sendChat, sendVoice: sendChatVoice, clear: clearChat, clearMemory, updateMemory } = useAdvisorChat();

  const handlePABLOAction = (action: { to: string; tab?: string; autoFill?: Record<string, unknown> }) => {
    if (action.autoFill || action.tab) {
      const prefill = { ...action.autoFill, tab: action.tab, _ts: Date.now() };
      localStorage.setItem('devdocs_action_prefill', JSON.stringify(prefill));
      window.dispatchEvent(new CustomEvent('pablo-action', { detail: prefill }));
    }
    navigate(action.to);
  };

  useEffect(() => {
    const container = chatScrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [chatMessages]);

  const voice = usePabloVoice();

  const conv = useVoiceConversation({
    onSend: sendChatVoice,
    silenceTimeoutMs: 3000,
  });

  useEffect(() => {
    if (!autoSpeakEnabled) return;
    if (conv.isConvMode) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || chatStreaming) return;
    const idx = chatMessages.length - 1;
    if (idx > lastSpokenRef.current) {
      lastSpokenRef.current = idx;
      voice.speakResponse(lastMsg.content);
    }
  }, [chatMessages, chatStreaming, autoSpeakEnabled, voice, conv.isConvMode]);

  const handleSendChat = (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim()) return;
    setChatInput('');
    sendChat(msg);
  };

  const handleVoiceSend = useCallback((transcript: string) => {
    sendChat(transcript);
  }, [sendChat]);

  const LANGUAGES = [['en','English'],['es','Spanish'],['fr','French'],['de','German'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['vi','Vietnamese'],['th','Thai'],['tl','Filipino'],['id','Indonesian'],['ms','Malay'],['ar','Arabic'],['ru','Russian'],['hi','Hindi'],['it','Italian'],['nl','Dutch'],['sv','Swedish'],['pl','Polish'],['tr','Turkish']];

  return (
    <div className="flex flex-col bg-background relative">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <OnboardingModal onComplete={updateMemory} />

      {/* City Info Bar */}
      <div className="relative z-10 px-4 py-3 shrink-0"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(0,180,50,0.02))', borderBottom: '1px solid rgba(34,197,94,0.1)' }}>
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <Terminal className="w-4 h-4" style={{ color: 'rgba(34,197,94,0.5)' }} />
            <div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: '1.1rem', color: 'rgba(34,197,94,0.8)', letterSpacing: '0.15em', lineHeight: 1 }}>{CITY_NAME}</div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.5rem', color: 'rgba(34,197,94,0.3)', letterSpacing: '0.1em' }}>SERVER: PST · ONLINE · {typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'}</div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-1" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(34,197,94,0.25)', letterSpacing: '0.1em' }}>POPULATION</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(34,197,94,0.6)' }}>{serverOnline !== null ? `${serverOnline} / ${serverMax}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.1em' }}>ƒ SALARY</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(0,255,65,0.6)' }}>{gameSave ? `ƒ${computeDecayedSalary(gameSave.governmentBaseSalary ?? gameSave.salary, gameSave.createdAt).toLocaleString()}` : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.45rem', color: 'rgba(180,255,100,0.25)', letterSpacing: '0.1em' }}>NET WORTH</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(180,255,100,0.7)' }}>{gameSave ? `ƒ${(computeDecayedSalary(gameSave.governmentBaseSalary ?? gameSave.salary, gameSave.createdAt) + gameSave.goldBalance * 100000).toLocaleString()}` : '—'}</div>
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

      {/* Trial Unavailable Popup */}
      <AnimatePresence>
        {trialPopup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="relative w-full max-w-sm rounded-2xl border p-6"
              style={{ background: '#0f0f0f', borderColor: 'rgba(255,165,0,0.2)' }}
            >
              <button
                onClick={dismissTrialPopup}
                className="absolute top-3 right-3"
                style={{ color: 'rgba(255,165,0,0.4)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.2rem', lineHeight: 1 }}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 shrink-0" style={{ color: 'rgba(255,165,0,0.7)' }} />
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.12em', color: 'rgba(255,165,0,0.5)', textTransform: 'uppercase' }}>
                  PROGRAM STATUS UPDATE
                </span>
              </div>
              <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.85rem', color: 'rgba(255,165,0,0.95)', letterSpacing: '0.04em', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                FREE TRIAL PROGRAM — SUSPENDED
              </p>
              <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                The 7-day free trial has been temporarily suspended. Pablo Corp's payment infrastructure is not yet operational — subscriptions will be made available once the billing system clears compliance review.
                <br /><br />
                In the meantime, free-tier access remains fully functional. Pro augmentation modules will be unlocked upon subscription launch. Thank you for your patience and continued commitment to corporate excellence.
              </p>
              <button
                onClick={dismissTrialPopup}
                className="w-full rounded-lg py-2.5"
                style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', letterSpacing: '0.1em', background: 'rgba(255,165,0,0.12)', border: '1px solid rgba(255,165,0,0.3)', color: 'rgba(255,165,0,0.9)', cursor: 'pointer', textTransform: 'uppercase' }}
              >
                Understood. Proceed.
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex flex-col p-4 md:p-6 relative z-10 gap-6">

        {/* ── ROW 1: Translator (left) + PABLO Chat (right) ── */}
        <div className="flex flex-col lg:flex-row gap-6 min-h-0">

          {/* Translator — FREE */}
          <div className="lg:w-80 shrink-0 space-y-3">
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'TRANSLATOR — FREE' : PABLO_PRODUCTS.TRANSLATOR.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <select value={translatorFrom} onChange={e => setTranslatorFrom(e.target.value)}
                  className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
                </select>
                <button onClick={() => { const f = translatorFrom; setTranslatorFrom(translatorTo); setTranslatorTo(f); }}
                  className="px-1.5 py-1 text-[10px] font-bold rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors shrink-0"
                  title="Swap languages">⇄</button>
                <select value={translatorTo} onChange={e => setTranslatorTo(e.target.value)}
                  className={`flex-1 bg-background border border-border rounded-md px-2 py-1 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground outline-none`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {LANGUAGES.map(([code,name]) => <option key={code} value={code}>{name}</option>)}
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
                  if (!SRCtor) { setTranslatorResult('Speech recognition not supported.'); return; }
                  setTranslatorListening(true);
                  const rec = new SRCtor();
                  translatorRecRef.current = rec;
                  rec.continuous = false; rec.interimResults = true; rec.lang = translatorFrom;
                  rec.onresult = (ev) => { setTranslatorText(Array.from(ev.results).map(r => r[0].transcript).join('')); };
                  rec.onend = () => { setTranslatorListening(false); translatorRecRef.current = null; };
                  rec.onerror = () => { setTranslatorListening(false); translatorRecRef.current = null; };
                  rec.start();
                }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-md border transition-colors shrink-0
                    ${translatorListening ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-pink-500/10 text-pink-400 border-pink-500/30 hover:bg-pink-500/20'}`}>
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
                } catch { setTranslatorResult('Translation service unavailable. Try again.'); }
              }}
                className={`w-full flex items-center justify-center gap-2 px-3 ${boomerMode ? 'py-2.5 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors mb-2`}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                <ArrowRight className="w-3 h-3" /> TRANSLATE
              </button>
              {translatorResult && translatorResult !== 'Translating...' && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 flex items-start gap-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300 flex-1`} style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>{translatorResult}</p>
                  <button onClick={() => {
                    const u = new SpeechSynthesisUtterance(translatorResult);
                    const langMap: Record<string,string> = { en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-BR',ja:'ja-JP',ko:'ko-KR',zh:'zh-CN',vi:'vi-VN',th:'th-TH',tl:'fil-PH',id:'id-ID',ms:'ms-MY',ar:'ar-SA',ru:'ru-RU',hi:'hi-IN',it:'it-IT',nl:'nl-NL',sv:'sv-SE',pl:'pl-PL',tr:'tr-TR' };
                    u.lang = langMap[translatorTo] ?? translatorTo;
                    u.rate = 0.9;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(u);
                  }}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md border border-pink-500/30 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors"
                    title="Hear translation">
                    🔊 {boomerMode ? 'HEAR IT' : 'PLAY'}
                  </button>
                </div>
              )}
              {translatorResult === 'Translating...' && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300`} style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>{translatorResult}</p>
                </div>
              )}
            </div>

            {/* Dictionary — FREE */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'DICTIONARY — FREE' : PABLO_PRODUCTS.DICTIONARY.name}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <input value={dictWord} onChange={e => setDictWord(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') lookupWord(dictWord); }}
                  placeholder="Type a word..."
                  className={`flex-1 bg-background border border-border rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} text-foreground placeholder:text-muted-foreground/50 outline-none`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }} />
                <button onClick={() => lookupWord(dictWord)}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  LOOKUP
                </button>
              </div>
              {dictLoading && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className="text-xs text-pink-300" style={{ fontFamily: "'Share Tech Mono', monospace" }}>Looking up...</p>
                </div>
              )}
              {dictError && (
                <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2">
                  <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/70`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>{dictError}</p>
                  {dictSuggestions.length > 0 && (
                    <div className="mt-1.5">
                      <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/60 mb-1`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>DID YOU MEAN:</p>
                      <div className="flex flex-wrap gap-1">
                        {dictSuggestions.map(s => (
                          <button key={s} onClick={() => { setDictWord(s); lookupWord(s); }}
                            className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/25 transition-colors`}
                            style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {dictResult && (
                <div className="space-y-2">
                  <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-300`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>{dictResult.word.toUpperCase()}</span>
                      {dictResult.phonetic && <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/60`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>{dictResult.phonetic}</span>}
                    </div>
                    {dictResult.meanings.slice(0, 3).map((m, mi) => (
                      <div key={mi}>
                        <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/50 uppercase`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>{m.partOfSpeech}</span>
                        {m.definitions.slice(0, 2).map((d, di) => (
                          <p key={di} className={`${boomerMode ? 'text-sm' : 'text-xs'} text-pink-300/80 ml-2`} style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.5 }}>• {d.definition}</p>
                        ))}
                        {m.definitions[0]?.synonyms && m.definitions[0].synonyms.length > 0 && (
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/40 ml-2 mt-0.5`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>syn: {m.definitions[0].synonyms.slice(0, 4).join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {dictThesaurus && (Object.keys(dictThesaurus.synonymsByPos).length > 0 || dictThesaurus.antonyms.length > 0) && (
                    <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 space-y-1.5">
                      <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/70 uppercase`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>THESAURUS</span>
                      {Object.keys(dictThesaurus.synonymsByPos).length > 0 && (
                        <div className="space-y-1.5">
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>SYNONYMS</p>
                          {Object.entries(dictThesaurus.synonymsByPos).map(([pos, words]) => (
                            <div key={pos}>
                              <span className={`${boomerMode ? 'text-sm' : 'text-[10px]'} font-bold text-pink-400/40 uppercase ml-0.5`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>{pos}</span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {words.map(s => (
                                  <button key={s} onClick={() => { setDictWord(s); lookupWord(s); }}
                                    className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-500/20 bg-pink-500/5 text-pink-300/80 hover:bg-pink-500/20 hover:text-pink-300 transition-colors`}
                                    style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {dictThesaurus.antonyms.length > 0 && (
                        <div>
                          <p className={`${boomerMode ? 'text-sm' : 'text-[10px]'} text-pink-400/50 mb-1`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>ANTONYMS</p>
                          <div className="flex flex-wrap gap-1">
                            {dictThesaurus.antonyms.map(a => (
                              <button key={a} onClick={() => { setDictWord(a); lookupWord(a); }}
                                className={`${boomerMode ? 'text-sm px-2.5 py-1' : 'text-[10px] px-2 py-0.5'} rounded border border-pink-400/20 bg-pink-400/5 text-pink-400/70 hover:bg-pink-400/15 hover:text-pink-400 transition-colors`}
                                style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Notes — FREE */}
            <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-pink-400" />
                <span className={`${boomerMode ? 'text-sm' : 'text-xs'} font-bold text-pink-400`} style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em' }}>{boomerMode ? 'QUICK NOTES — FREE' : PABLO_PRODUCTS.NOTES.name}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <div ref={noteWrapperRef} className="flex-1 relative bg-background border border-border rounded-md">
                  {noteHighlightHtml && (
                    <div
                      aria-hidden
                      className={`absolute inset-0 px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} rounded-md pointer-events-none whitespace-pre-wrap break-words overflow-hidden text-foreground`}
                      style={{ fontFamily: "'Share Tech Mono', monospace", minHeight: 36, lineHeight: 1.5 }}
                      dangerouslySetInnerHTML={{ __html: noteHighlightHtml }}
                    />
                  )}
                  <textarea
                    ref={noteTextareaRef}
                    value={noteInput}
                    onChange={handleNoteInputChange}
                    onClick={handleNoteClick}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setSpellPopup(null); return; }
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); }
                    }}
                    placeholder="Jot a note..."
                    className={`w-full bg-transparent rounded-md px-3 py-1.5 ${boomerMode ? 'text-sm' : 'text-xs'} placeholder:text-muted-foreground/50 outline-none resize-none relative`}
                    style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      minHeight: 36,
                      lineHeight: 1.5,
                      color: noteHighlightHtml ? 'transparent' : undefined,
                      caretColor: noteHighlightHtml ? 'hsl(var(--foreground))' : undefined,
                    }}
                  />
                  {spellMatches.length > 0 && (
                    <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-pink-500/10 text-pink-400 border border-pink-500/20 pointer-events-none" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                      {spellMatches.length} TYPO{spellMatches.length !== 1 ? 'S' : ''}
                    </div>
                  )}
                  {spellPopup && (
                    <div
                      className="absolute z-50 rounded-md border border-pink-500/30 bg-card shadow-lg p-1.5 min-w-[120px]"
                      style={{ left: spellPopup.x, top: spellPopup.y, fontFamily: "'Share Tech Mono', monospace" }}
                    >
                      <div className="text-[9px] text-pink-400/60 px-1 pb-1 border-b border-pink-500/20 mb-1">
                        SUGGESTIONS FOR &quot;{spellPopup.match.word}&quot;
                      </div>
                      {spellPopup.match.suggestions.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground px-1 py-0.5">No suggestions</div>
                      ) : spellPopup.match.suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => applySpellCorrection(spellPopup.match, s)}
                          className="w-full text-left text-[11px] text-foreground px-2 py-1 rounded hover:bg-pink-500/10 hover:text-pink-300 transition-colors block"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={addNote}
                  className={`flex items-center gap-1.5 px-3 ${boomerMode ? 'py-2 text-sm' : 'py-1.5 text-xs'} font-bold rounded-md bg-pink-500/10 text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 transition-colors shrink-0 self-end`}
                  style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  SAVE
                </button>
              </div>
              {notes.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {notes.map(n => (
                    <div key={n.id} className="flex items-start gap-2 rounded-md border border-pink-500/10 bg-pink-500/5 px-2.5 py-1.5 group">
                      <p className="flex-1 text-xs text-pink-300/80 whitespace-pre-wrap break-words" style={{ fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.5 }}>{n.text}</p>
                      <button onClick={() => deleteNote(n.id)}
                        className="shrink-0 text-pink-500/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-[10px] mt-0.5"
                        title="Delete note">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {notes.length === 0 && (
                <p className="text-[10px] text-pink-400/30 text-center" style={{ fontFamily: "'Share Tech Mono', monospace" }}>No notes yet. Your notes persist locally.</p>
              )}
            </div>

            {/* Feature Module Quick-Access Tiles */}
            <div className="rounded-xl border border-green-500/15 bg-green-500/3 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Layers className="w-3.5 h-3.5" style={{ color: 'rgba(34,197,94,0.5)' }} />
                <span className="text-xs font-bold" style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.08em', color: 'rgba(34,197,94,0.6)' }}>MODULES</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { label: boomerMode ? 'CONSOLE' : PABLO_PRODUCTS.CONSOLE.short, desc: 'Interview solver & screen scan', path: '/console', color: 'rgba(34,197,94,0.5)', bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.15)', icon: '⌥' },
                  { label: boomerMode ? 'CONTACTS' : PABLO_PRODUCTS.CONTACTS.short, desc: 'CRM & relationship intel', path: '/contacts', color: 'rgba(100,180,255,0.6)', bg: 'rgba(100,180,255,0.05)', border: 'rgba(100,180,255,0.15)', icon: '◈' },
                  { label: boomerMode ? 'HIRING' : PABLO_PRODUCTS.HIRING.short, desc: 'Recruit & manage staff', path: '/hiring', color: 'rgba(255,160,50,0.6)', bg: 'rgba(255,160,50,0.05)', border: 'rgba(255,160,50,0.15)', icon: '▣' },
                  { label: boomerMode ? 'DOCUMENTS' : PABLO_PRODUCTS.PRINTER.short, desc: 'Invoices, contracts & files', path: '/documents', color: 'rgba(180,100,255,0.6)', bg: 'rgba(180,100,255,0.05)', border: 'rgba(180,100,255,0.15)', icon: '◻' },
                  { label: boomerMode ? 'CALENDAR' : PABLO_PRODUCTS.CALENDAR.short, desc: 'Schedule & appointments', path: '/calendar', color: 'rgba(255,220,50,0.6)', bg: 'rgba(255,220,50,0.05)', border: 'rgba(255,220,50,0.15)', icon: '◆' },
                  { label: boomerMode ? 'DASHBOARD' : PABLO_PRODUCTS.WORKSPACE.short, desc: 'Projects & brand kit', path: '/dashboard', color: 'rgba(80,220,200,0.6)', bg: 'rgba(80,220,200,0.05)', border: 'rgba(80,220,200,0.15)', icon: '⊞' },
                  { label: boomerMode ? 'STUDIO' : PABLO_PRODUCTS.STUDIO.short, desc: 'Content & asset forge', path: '/studio', color: 'rgba(255,100,180,0.6)', bg: 'rgba(255,100,180,0.05)', border: 'rgba(255,100,180,0.15)', icon: '◈' },
                  { label: boomerMode ? 'REPORTS' : PABLO_PRODUCTS.REPORTING.short, desc: 'Pipeline & analytics', path: '/reporting', color: 'rgba(255,140,80,0.6)', bg: 'rgba(255,140,80,0.05)', border: 'rgba(255,140,80,0.15)', icon: '▥' },
                  { label: boomerMode ? 'AI AGENTS' : PABLO_PRODUCTS.AI_AGENTS.short, desc: 'Multi-agent network', path: '/agents', color: 'rgba(200,140,255,0.6)', bg: 'rgba(200,140,255,0.05)', border: 'rgba(200,140,255,0.15)', icon: '⋈' },
                  { label: boomerMode ? 'DEALS' : PABLO_PRODUCTS.DEALS.short, desc: 'Track deal pipeline', path: '/business/deals', color: 'rgba(50,220,130,0.6)', bg: 'rgba(50,220,130,0.05)', border: 'rgba(50,220,130,0.15)', icon: '⇅' },
                  { label: boomerMode ? 'INVOICES' : PABLO_PRODUCTS.INVOICES.short, desc: 'Billing & invoices', path: '/business/invoices', color: 'rgba(120,200,255,0.6)', bg: 'rgba(120,200,255,0.05)', border: 'rgba(120,200,255,0.15)', icon: '⊟' },
                  { label: boomerMode ? 'CAMPAIGNS' : PABLO_PRODUCTS.STUDIO.short.replace('FORGE-7','SIGNAL-5'), desc: 'Email & outreach', path: '/creative/campaigns', color: 'rgba(255,120,200,0.6)', bg: 'rgba(255,120,200,0.05)', border: 'rgba(255,120,200,0.15)', icon: '⊛' },
                  { label: boomerMode ? 'BRAND KIT' : PABLO_PRODUCTS.BRAND_KIT.short, desc: 'Brand identity', path: '/creative/brand', color: 'rgba(255,180,100,0.6)', bg: 'rgba(255,180,100,0.05)', border: 'rgba(255,180,100,0.15)', icon: '◉' },
                  { label: boomerMode ? 'SOUND LAB' : PABLO_PRODUCTS.SOUND_LAB.short, desc: 'Audio production', path: '/creative/lab', color: 'rgba(160,120,255,0.6)', bg: 'rgba(160,120,255,0.05)', border: 'rgba(160,120,255,0.15)', icon: '♫' },
                  { label: boomerMode ? 'GOALS' : PABLO_PRODUCTS.GOALS.short, desc: 'Mission tracker', path: '/intel/goals', color: 'rgba(255,200,60,0.6)', bg: 'rgba(255,200,60,0.05)', border: 'rgba(255,200,60,0.15)', icon: '⊕' },
                  { label: boomerMode ? 'SEO' : PABLO_PRODUCTS.SEO.short, desc: 'Search optimization', path: '/intel/seo', color: 'rgba(100,255,180,0.6)', bg: 'rgba(100,255,180,0.05)', border: 'rgba(100,255,180,0.15)', icon: '⊜' },
                  { label: boomerMode ? 'WEB ANALYZER' : 'RECON-5', desc: 'Analyze any URL', path: '#web-analyzer', color: 'rgba(56,189,248,0.6)', bg: 'rgba(56,189,248,0.05)', border: 'rgba(56,189,248,0.15)', icon: '⊞' },
                ] as { label: string; desc: string; path: string; color: string; bg: string; border: string; icon: string }[]).map(mod => (
                  <button
                    key={mod.path}
                    onClick={() => {
                      if (mod.path.startsWith('#')) {
                        document.getElementById(mod.path.slice(1))?.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        navigate(mod.path);
                      }
                    }}
                    className="flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: mod.bg, border: `1px solid ${mod.border}` }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]" style={{ color: mod.color }}>{mod.icon}</span>
                      <span className="text-[10px] font-bold" style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.06em', color: mod.color }}>{mod.label}</span>
                    </div>
                    <span className="text-[9px] leading-tight" style={{ fontFamily: "'Share Tech Mono', monospace", color: 'rgba(255,255,255,0.25)' }}>{mod.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PABLO AI Chat — FREE */}
          <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden" style={{ minHeight: '400px', maxHeight: '70vh' }}>
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Bot className="w-3.5 h-3.5" /> {boomerMode ? 'PABLO AI' : 'PABLO NEURAL CORE'}
                {currentAgent && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                    currentAgent.provider === 'claude'
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    {boomerMode
                      ? (currentAgent.provider === 'claude' ? 'CODE EXPERT' : 'QUICK ASSIST')
                      : currentAgent.agentShort
                    }
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearChat} disabled={chatMessages.length === 0}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center gap-4 py-8">
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

                        {msg.role === 'assistant' && !chatStreaming && (
                          <div className="flex items-center gap-1 mt-1 ml-1">
                            {msg.agent && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                                msg.agent.provider === 'claude'
                                  ? 'bg-orange-500/10 text-orange-400/70 border-orange-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20'
                              }`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                                {boomerMode
                                  ? (msg.agent.provider === 'claude' ? 'Code Expert' : 'Quick Assist')
                                  : msg.agent.agentShort
                                }
                              </span>
                            )}
                            <button onClick={() => voice.speakResponse(msg.content)}
                              className="p-1 rounded-md text-muted-foreground/40 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                              title="Hear PABLO say this">
                              <Volume2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

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

              {conv.isConvMode && (
                <div className="border-t border-emerald-500/20 px-3 py-2 shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      conv.convState === 'listening' ? 'bg-emerald-400 animate-pulse' :
                      conv.convState === 'processing' ? 'bg-amber-400 animate-pulse' :
                      conv.convState === 'speaking' ? 'bg-purple-400 animate-pulse' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-xs flex-1" style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: '0.06em',
                      color: conv.convState === 'listening' ? 'rgba(52,211,153,0.8)' :
                             conv.convState === 'processing' ? 'rgba(251,191,36,0.8)' :
                             conv.convState === 'speaking' ? 'rgba(192,132,252,0.8)' :
                             'rgba(156,163,175,0.6)'
                    }}>
                      {conv.convState === 'listening' ? 'Listening... speak now' :
                       conv.convState === 'processing' ? 'Pablo is thinking...' :
                       conv.convState === 'speaking' ? 'Pablo is speaking...' :
                       'Voice conversation active'}
                    </span>
                    <button onClick={conv.stopConversation}
                      className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors"
                      style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                      END
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground/25 mt-1 text-center" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                    Say "goodbye Pablo" to end · All exchanges saved to chat
                  </p>
                </div>
              )}

              {/* Chat input + Voice PABLO */}
              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-end gap-2 bg-muted/30 rounded-xl border border-border focus-within:border-emerald-500/40 transition-colors px-3 py-2">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="tell me what you're doing, I'll set it up..."
                    rows={1}
                    disabled={chatStreaming || conv.isConvMode}
                    className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50 max-h-32 overflow-y-auto"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />

                  {/* Conversation Mode Button */}
                  {conv.isSupported && (
                    <button
                      onClick={() => conv.isConvMode ? conv.stopConversation() : conv.startConversation()}
                      disabled={chatStreaming && !conv.isConvMode}
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${conv.isConvMode
                          ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-400 animate-pulse'
                          : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400/60 hover:bg-emerald-500/20 hover:text-emerald-400'}`}
                      title={conv.isConvMode ? 'End conversation mode' : (boomerMode ? 'Start Voice Conversation' : 'CONV MODE — Hands-free talk with PABLO')}
                    >
                      <Radio className="w-4 h-4" />
                    </button>
                  )}

                  {/* Voice Hold Button — PRO */}
                  {!conv.isConvMode && (
                    <button
                      onMouseDown={() => voice.startHold(handleVoiceSend)}
                      onMouseUp={() => voice.stopHold()}
                      onMouseLeave={() => { if (voice.isHolding) voice.stopHold(); }}
                      onTouchStart={(e) => { e.preventDefault(); voice.startHold(handleVoiceSend); }}
                      onTouchEnd={() => voice.stopHold()}
                      disabled={chatStreaming || voice.isTranscribing}
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed
                        ${voice.isHolding
                          ? 'bg-red-500/30 border-red-500/50 text-red-400 scale-110 animate-pulse'
                          : voice.isSpeaking
                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                            : 'bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30'}`}
                      title={boomerMode ? 'Hold to talk to PABLO (Pro)' : 'VOX HOLD — Speak to PABLO'}
                    >
                      {voice.isHolding ? <Mic className="w-4 h-4" /> :
                       voice.isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> :
                       voice.isSpeaking ? <Volume2 className="w-4 h-4" /> :
                       <Mic className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Auto-speak toggle */}
                  {!conv.isConvMode && (
                    <button
                      onClick={() => {
                        if (voice.isSpeaking) { voice.stopSpeaking(); }
                        setAutoSpeakEnabled(p => !p);
                      }}
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors
                        ${autoSpeakEnabled
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : 'bg-muted/30 border-border text-muted-foreground/40 hover:text-foreground hover:bg-muted/50'}`}
                      title={autoSpeakEnabled ? 'Auto-speak ON — PABLO reads responses aloud' : 'Auto-speak OFF'}
                    >
                      {voice.isSpeaking ? <MicOff className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  )}

                  <button onClick={() => handleSendChat()} disabled={!chatInput.trim() || chatStreaming || conv.isConvMode}
                    className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {chatStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/30 mt-1.5 text-center">
                  {conv.isConvMode ? 'Voice conversation active — speak naturally' : 'Enter to send · Shift+Enter for new line · Hold mic or tap radio for conversation'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 2: Web Analyzer — FREE ── */}
        <div id="web-analyzer" className="w-full">
          <WebsiteAnalyzer />
        </div>

      </main>

      {isAuthenticated && (
        <button
          onClick={() => navigate('/phone')}
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 50,
            width: 48, height: 48, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.4)',
            color: 'rgba(34,197,94,0.9)',
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(34,197,94,0.15)',
          }}
          title="Open Phone System"
        >
          <Phone className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
