import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  BookOpen, Plus, Trash2,
  Wand2, Download, Loader2, RotateCcw,
  FileText, Sparkles, ArrowRight, GripVertical,
  Lightbulb, PenTool, Mic, Music2, Search, Repeat,
  Play, Pause, Upload, Volume2,
  Bold, Italic, Heading1, Heading2, Quote, List, ListOrdered, Minus,
  Menu, X as XIcon,
} from 'lucide-react';
import { speakWithTTS, WRITER_VOICES, loadWriterVoice, saveWriterVoice, type WriterVoiceOption } from '@/lib/tts';
import TerrenceAssistDrawer from '@/components/TerrenceAssistDrawer';
import {
  lineSyllables, alliterationLetters,
  fetchRhymes, fetchNearRhymes, fetchMeansLike, fetchSynonyms, fetchAdjectives,
  fileToAudioBuffer, fetchTTSBuffer, mixVocalsAndBeat, audioBufferToWavBlob,
  isMusicGenre, type DatamuseHit,
} from '@/lib/song-tools';
import { useTrackPicker } from '@/components/TrackPicker';
import { HummingbirdIcon } from '@/components/HummingbirdIcon';
import type { Track as HumTrack } from '@/contexts/MusicPlayerContext';

// Beat-dock repeat modes:
//   off  — play once and stop
//   one  — loop the current track end-to-end
// A/B loop (set via A and B buttons) takes priority over both — it's a
// tighter, hook-bar loop that the writer toggles on demand.
type RepeatMode = 'off' | 'one';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '').replace(/^\//, '');
function apiUrl(path: string) {
  return `/${BASE ? BASE + '/' : ''}api/${path}`.replace(/\/+/g, '/');
}

type Genre = 'fiction' | 'nonfiction' | 'screenplay' | 'poetry' | 'essay' | 'memoir' | 'journalism' | 'technical' | 'rap' | 'song';
type Tone = 'literary' | 'conversational' | 'formal' | 'lyrical' | 'gritty' | 'humorous' | 'dramatic' | 'minimalist';

interface Chapter {
  id: string;
  title: string;
  content: string;
  notes: string;
  wordCount: number;
}

interface Project {
  id: string;
  title: string;
  genre: Genre;
  tone: Tone;
  synopsis: string;
  chapters: Chapter[];
  createdAt: number;
  updatedAt: number;
  // Music-mode (rap / song) settings — only meaningful when genre is rap/song.
  // Persisted with the project so each track keeps its own tempo + bar grid.
  bpm?: number;          // beats per minute (default 90)
  linesPerBar?: number;  // lines that count as one bar in the bar counter (default 4)
}

const GENRES: { id: Genre; label: string; desc: string }[] = [
  { id: 'fiction', label: 'FICTION', desc: 'Novels, short stories, creative narratives' },
  { id: 'nonfiction', label: 'NON-FICTION', desc: 'Informational, research-based writing' },
  { id: 'screenplay', label: 'SCREENPLAY', desc: 'Film & TV scripts, dialogue-heavy' },
  { id: 'poetry', label: 'POETRY', desc: 'Verse, prose poetry, spoken word' },
  { id: 'essay', label: 'ESSAY', desc: 'Opinion pieces, personal essays, analysis' },
  { id: 'memoir', label: 'MEMOIR', desc: 'Personal stories, autobiography' },
  { id: 'journalism', label: 'JOURNALISM', desc: 'Long-form articles, investigative pieces' },
  { id: 'technical', label: 'TECHNICAL', desc: 'Manuals, documentation, white papers' },
  { id: 'rap',     label: 'RAP',     desc: 'Bars, flow, rhyme schemes — beat-aware editor' },
  { id: 'song',    label: 'SONG',    desc: 'Verses, hooks, bridges — beat-aware editor' },
];

const TONES: { id: Tone; label: string }[] = [
  { id: 'literary', label: 'LITERARY' },
  { id: 'conversational', label: 'CONVERSATIONAL' },
  { id: 'formal', label: 'FORMAL' },
  { id: 'lyrical', label: 'LYRICAL' },
  { id: 'gritty', label: 'GRITTY' },
  { id: 'humorous', label: 'HUMOROUS' },
  { id: 'dramatic', label: 'DRAMATIC' },
  { id: 'minimalist', label: 'MINIMALIST' },
];

const STORAGE_KEY = 'sm_writer_projects';

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjects(projects: Project[]): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not save to local storage';
    console.error('[HEMINGWAY] saveProjects failed', err);
    return { ok: false, error: msg };
  }
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function newChapter(title = 'UNTITLED CHAPTER'): Chapter {
  return { id: uid(), title, content: '', notes: '', wordCount: 0 };
}

function newProject(): Project {
  return {
    id: uid(),
    title: 'UNTITLED PROJECT',
    genre: 'fiction',
    tone: 'literary',
    synopsis: '',
    chapters: [newChapter('CHAPTER 1')],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: 90,
    linesPerBar: 4,
  };
}

export default function WriterStudio() {
  const { isAuthenticated, login } = useAuth();
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiAction, setAiAction] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const project = projects.find(p => p.id === activeProjectId) ?? null;
  const chapter = project?.chapters[activeChapterIdx] ?? null;

  // Debounced localStorage flush. JSON.stringify on a large novel can be
  // megabytes; doing that synchronously on every keystroke (the old behavior)
  // caused renderer OOMs that took down every Salaryman tab in the same
  // origin. We hold the latest snapshot in a ref and flush at most every
  // 600ms, plus immediately on unmount/visibilitychange so nothing is lost.
  const projectsRef = useRef<Project[]>(projects);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const flushNow = useCallback((force = false) => {
    if (!dirtyRef.current && !force) return;
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    const result = saveProjects(projectsRef.current);
    if (result.ok) {
      dirtyRef.current = false;
      setSaveError(null);
    } else {
      // Keep dirty so the next edit / retry / unload tries again. Don't
      // throw — the UI surfaces the error via the SAVE FAILED · RETRY button.
      dirtyRef.current = true;
      setSaveError(result.error);
    }
  }, []);

  const persist = useCallback((updated: Project[]) => {
    setProjects(updated);
    projectsRef.current = updated;
    dirtyRef.current = true;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushNow, 600);
  }, [flushNow]);

  // Flush on unmount, tab hide, and page unload so debounced edits aren't lost.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushNow(); };
    const onBeforeUnload = () => { flushNow(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushNow();
    };
  }, [flushNow]);

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    persist(projects.map(p => p.id === activeProjectId ? fn({ ...p, updatedAt: Date.now() }) : p));
  }, [projects, activeProjectId, persist]);

  const updateChapter = useCallback((fn: (c: Chapter) => Chapter) => {
    updateProject(p => ({
      ...p,
      chapters: p.chapters.map((c, i) => i === activeChapterIdx ? fn({ ...c }) : c),
    }));
  }, [updateProject, activeChapterIdx]);

  // ===========================================================
  // MUSIC TOOLS — togglable accessories that work for ANY genre.
  // A novelist can flip on the beat dock to write to a beat just as
  // easily as a rapper can use the rhyme book. The two music UIs are
  // independent toggles: BEAT (bottom dock) and RHYMES (right panel).
  // For rap/song projects we auto-open them on first visit so the user
  // doesn't have to hunt for them.
  // ===========================================================
  const isMusic = isMusicGenre(project?.genre ?? null);
  const [showRhymeBook, setShowRhymeBook]   = useState<boolean>(false);
  const [showBeatDock,  setShowBeatDock]    = useState<boolean>(false);
  // Auto-enable both when switching into a music project the first time.
  const lastMusicProjectId = useRef<string | null>(null);
  useEffect(() => {
    if (isMusic && project && lastMusicProjectId.current !== project.id) {
      lastMusicProjectId.current = project.id;
      setShowRhymeBook(true);
      setShowBeatDock(true);
    }
  }, [isMusic, project]);

  // Rhyme book panel state (right side)
  type RhymeTab = 'rhymes' | 'thesaurus' | 'tools';
  const [rhymeTab, setRhymeTab]         = useState<RhymeTab>('rhymes');
  const [rhymeQuery, setRhymeQuery]     = useState('');
  const [rhymeLoading, setRhymeLoading] = useState(false);
  const [rhymeHits, setRhymeHits]       = useState<DatamuseHit[]>([]);
  const [nearHits,  setNearHits]        = useState<DatamuseHit[]>([]);
  const [synHits,   setSynHits]         = useState<DatamuseHit[]>([]);
  const [mlHits,    setMlHits]          = useState<DatamuseHit[]>([]);
  const [adjHits,   setAdjHits]         = useState<DatamuseHit[]>([]);

  const lookupWord = useCallback(async (raw: string) => {
    const w = raw.trim().toLowerCase().replace(/[^a-z'-]/g, '');
    if (!w) return;
    setRhymeQuery(w);
    setRhymeLoading(true);
    try {
      if (rhymeTab === 'rhymes') {
        const [r, n] = await Promise.all([fetchRhymes(w), fetchNearRhymes(w)]);
        setRhymeHits(r); setNearHits(n);
      } else if (rhymeTab === 'thesaurus') {
        const [s, m, a] = await Promise.all([fetchSynonyms(w), fetchMeansLike(w), fetchAdjectives(w)]);
        setSynHits(s); setMlHits(m); setAdjHits(a);
      }
    } finally {
      setRhymeLoading(false);
    }
  }, [rhymeTab]);

  // Insert text at the editor's caret. Used by rhyme/thesaurus result
  // chips so tapping a word drops it where the user was typing.
  const insertAtCursor = useCallback((text: string) => {
    if (!chapter) return;
    const ta = editorRef.current;
    const before = chapter.content;
    if (!ta) {
      const merged = before + (before.endsWith(' ') || !before ? '' : ' ') + text;
      updateChapter(c => ({ ...c, content: merged, wordCount: wordCount(merged) }));
      return;
    }
    const start = ta.selectionStart ?? before.length;
    const end   = ta.selectionEnd   ?? before.length;
    const left  = before.slice(0, start);
    const right = before.slice(end);
    const pad   = (left && !/\s$/.test(left)) ? ' ' : '';
    const merged = left + pad + text + right;
    updateChapter(c => ({ ...c, content: merged, wordCount: wordCount(merged) }));
    requestAnimationFrame(() => {
      const pos = (left + pad + text).length;
      ta.focus();
      try { ta.setSelectionRange(pos, pos); } catch {}
    });
  }, [chapter, updateChapter]);

  // Apply lightweight markdown formatting to the editor selection. The
  // chapter body is markdown (export wraps it as `# title\n\n{content}`),
  // so freewriting genres get bold/italic/headings/lists/quotes/dividers
  // that round-trip cleanly. Inline marks wrap the selection; block marks
  // prefix each selected line (toggling a fresh prefix in over any old one).
  const applyFormat = useCallback((kind: 'bold' | 'italic' | 'h1' | 'h2' | 'quote' | 'ul' | 'ol' | 'hr') => {
    if (!chapter) return;
    const ta = editorRef.current;
    const text = chapter.content;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const sel = text.slice(start, end);

    const commit = (next: string, caretStart: number, caretEnd: number) => {
      updateChapter(c => ({ ...c, content: next, wordCount: wordCount(next) }));
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        try { ta.setSelectionRange(caretStart, caretEnd); } catch {}
      });
    };

    // Inline marks (bold / italic) wrap the selection.
    if (kind === 'bold' || kind === 'italic') {
      const mark = kind === 'bold' ? '**' : '*';
      const inner = sel || (kind === 'bold' ? 'bold text' : 'italic text');
      const next = text.slice(0, start) + mark + inner + mark + text.slice(end);
      const caretStart = start + mark.length;
      commit(next, caretStart, caretStart + inner.length);
      return;
    }

    // Horizontal rule on its own line.
    if (kind === 'hr') {
      const left = text.slice(0, start);
      const pad = left && !left.endsWith('\n') ? '\n' : '';
      const insert = `${pad}\n---\n\n`;
      const next = left + insert + text.slice(end);
      const pos = (left + insert).length;
      commit(next, pos, pos);
      return;
    }

    // Block marks (headings / quote / lists) prefix each line spanned by
    // the selection (or the line the caret sits on).
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
    let lineEnd = end;
    while (lineEnd < text.length && text[lineEnd] !== '\n') lineEnd++;
    const block = text.slice(lineStart, lineEnd);
    const prefixFor = (i: number): string =>
      kind === 'h1' ? '# '
      : kind === 'h2' ? '## '
      : kind === 'quote' ? '> '
      : kind === 'ul' ? '- '
      : `${i + 1}. `;
    const formatted = block
      .split('\n')
      .map((ln, i) => prefixFor(i) + ln.replace(/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/, ''))
      .join('\n');
    const next = text.slice(0, lineStart) + formatted + text.slice(lineEnd);
    commit(next, lineStart, lineStart + formatted.length);
  }, [chapter, updateChapter]);

  // Word the rhyme book defaults to when the user clicks LOOKUP without typing:
  // the word at / before the caret.
  const wordAtCursor = useCallback((): string => {
    const ta = editorRef.current;
    if (!ta) return '';
    const pos = ta.selectionStart ?? 0;
    const text = ta.value;
    let start = pos;
    while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) start--;
    let end = pos;
    while (end < text.length && /[A-Za-z'-]/.test(text[end])) end++;
    return text.slice(start, end);
  }, []);

  // ===========================================================
  // LINE ANALYSIS — syllables per line + alliteration per line +
  // bar grouping. Recomputed any time the chapter content changes.
  // ===========================================================
  const lines = useMemo(() => (chapter?.content ?? '').split('\n'), [chapter?.content]);
  const linesPerBar = Math.max(1, project?.linesPerBar ?? 4);
  const bpm = Math.max(20, Math.min(300, project?.bpm ?? 90));
  const lineStats = useMemo(() => lines.map((line, i) => ({
    syllables: lineSyllables(line),
    alliteration: alliterationLetters(line),
    barIdx: Math.floor(i / linesPerBar) + 1,
    isBarStart: i % linesPerBar === 0,
  })), [lines, linesPerBar]);
  const totalSyllables = useMemo(() => lineStats.reduce((s, l) => s + l.syllables, 0), [lineStats]);
  const nonEmptyLines = lines.filter(l => l.trim()).length;
  const totalBars = Math.max(1, Math.ceil(nonEmptyLines / linesPerBar));
  // Beats per bar follows the project's time signature (default 4/4).
  // Wired here so 3/4 waltzes and 6/8 ballads get accurate length estimates.
  const beatsPerBar = 4; // single-time-signature for v1; stored in song-tools for future expansion
  // Use FRACTIONAL bars for the duration estimate so the song-length meter
  // ticks per line as the writer types, instead of jumping every 4 lines
  // (which made the "needle" feel frozen).
  const fractionalBars = Math.max(0, nonEmptyLines / linesPerBar);
  const estSeconds = Math.round((fractionalBars * beatsPerBar * 60) / bpm);

  // ===========================================================
  // BEAT DOCK — upload an instrumental, loop it, write to the rhythm.
  // Lives in HEMINGWAY itself rather than depending on Humming Bird so
  // the writer never has to leave the page.
  // ===========================================================
  const [beatFileName, setBeatFileName] = useState<string>('');
  const [beatUrl, setBeatUrl]           = useState<string>('');         // object URL for <audio>
  const [beatBufferRef]                 = useState<{ current: AudioBuffer | null }>({ current: null });
  const beatAudioRef                    = useRef<HTMLAudioElement | null>(null);
  const [beatPlaying, setBeatPlaying]   = useState(false);
  const [beatVolume,  setBeatVolume]    = useState(0.7);
  const [loopA, setLoopA]               = useState<number>(0);          // seconds
  const [loopB, setLoopB]               = useState<number>(0);          // seconds; 0 = none
  const [beatDur, setBeatDur]           = useState<number>(0);
  const [beatPos, setBeatPos]           = useState<number>(0);
  const [mixing, setMixing]             = useState<boolean>(false);
  const [mixError, setMixError]         = useState<string>('');
  const [acapHandle, setAcapHandle]     = useState<{ cancel: () => void } | null>(null);
  // Track whether the current beatUrl is a blob (uploaded file we own) or a
  // remote Hummingbird stream URL — only blobs need URL.revokeObjectURL on
  // teardown, otherwise we'd silently no-op (or error in some browsers).
  const beatSourceKindRef = useRef<'blob' | 'humbird' | null>(null);
  // Explicit user-controlled repeat mode for the beat dock, separate from
  // A/B looping (which is a tighter hook-bar loop set via the A/B buttons).
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('one');
  // Hummingbird picker — pulls a saved track from the user's library so they
  // don't have to re-upload an instrumental every session.
  const { pick: pickHumTrack, picker: humPicker } = useTrackPicker('PICK A BEAT FROM HUMMING BIRD');
  const [humTrackInfo, setHumTrackInfo] = useState<{ id: number; label: string } | null>(null);

  // Performance voice — picked from WRITER_VOICES, persisted across sessions.
  // Drives both A CAPPELLA (live read) and MIX (baked WAV vocal).
  const [voiceKey, setVoiceKey] = useState<string>(() => loadWriterVoice());
  const setVoice = useCallback((key: string) => { setVoiceKey(key); saveWriterVoice(key); }, []);
  const voiceLabel = WRITER_VOICES.find(v => v.key === voiceKey)?.label ?? 'PABLO';

  // Centralized teardown so blob URLs created via createObjectURL get
  // released — no-ops for Hummingbird stream URLs.
  const releaseCurrentBeatUrl = useCallback(() => {
    if (beatUrl && beatSourceKindRef.current === 'blob') {
      try { URL.revokeObjectURL(beatUrl); } catch {}
    }
  }, [beatUrl]);

  // Load a beat file → object URL (for <audio>) + decoded AudioBuffer (for mix)
  const loadBeatFile = useCallback(async (file: File) => {
    try {
      releaseCurrentBeatUrl();
      const url = URL.createObjectURL(file);
      beatSourceKindRef.current = 'blob';
      setBeatUrl(url);
      setBeatFileName(file.name);
      setHumTrackInfo(null);
      setLoopA(0); setLoopB(0); setBeatPos(0); setBeatPlaying(false);
      // Decode for offline mixing
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      try {
        const buf = await fileToAudioBuffer(file, ctx);
        beatBufferRef.current = buf;
        setBeatDur(buf.duration);
      } finally {
        try { ctx.close(); } catch {}
      }
    } catch (err) {
      console.error('[HEMINGWAY] failed to load beat', err);
      setMixError('Could not decode that file. Try MP3 or WAV.');
    }
  }, [releaseCurrentBeatUrl, beatBufferRef]);

  // Load a track from the user's Hummingbird library. The audio element
  // streams it directly (cookie-authed); we skip AudioBuffer decoding here
  // so the writer doesn't pay for a download/decode just to play. MIX will
  // remain disabled for Hummingbird-loaded sources (uploads only).
  const loadFromHummingbird = useCallback((track: HumTrack) => {
    releaseCurrentBeatUrl();
    const url = apiUrl(`music/stream/${track.id}`);
    beatSourceKindRef.current = 'humbird';
    beatBufferRef.current = null;
    setBeatUrl(url);
    setBeatFileName(`${track.artist} — ${track.title}`);
    setHumTrackInfo({ id: track.id, label: `${track.artist} — ${track.title}` });
    setBeatDur(track.durationSec || 0);
    setLoopA(0); setLoopB(0); setBeatPos(0); setBeatPlaying(false);
  }, [releaseCurrentBeatUrl, beatBufferRef]);

  // Free the blob URL on unmount (avoid leaking object URLs).
  useEffect(() => () => { releaseCurrentBeatUrl(); }, [releaseCurrentBeatUrl]);

  const playPauseBeat = useCallback(() => {
    const el = beatAudioRef.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setBeatPlaying(true); }
    else            { el.pause(); setBeatPlaying(false); }
  }, []);

  // A/B looping: every timeupdate, if we're past loopB and have one set,
  // jump back to loopA. This gives the writer a tight loop on a hook bar.
  useEffect(() => {
    const el = beatAudioRef.current;
    if (!el) return;
    const onTime = () => {
      setBeatPos(el.currentTime);
      if (loopB > loopA && el.currentTime >= loopB) el.currentTime = loopA;
    };
    el.addEventListener('timeupdate', onTime);
    el.volume = beatVolume;
    return () => el.removeEventListener('timeupdate', onTime);
  }, [loopA, loopB, beatVolume]);

  // Sync volume to the audio element when it changes.
  useEffect(() => {
    const el = beatAudioRef.current;
    if (el) el.volume = beatVolume;
  }, [beatVolume]);

  // === A CAPPELLA — speak the lyrics as a vocal reference =================
  const speakAcappella = useCallback(() => {
    if (!chapter?.content.trim()) return;
    if (acapHandle) { acapHandle.cancel(); setAcapHandle(null); return; }
    const handle = speakWithTTS(
      chapter.content,
      () => setAcapHandle(null),
      () => setAcapHandle(null),
      { character: voiceKey },
    );
    setAcapHandle(handle);
  }, [chapter, acapHandle, voiceKey]);

  // === MIX — bake vocals + beat into a downloadable WAV ===================
  const mixToWav = useCallback(async () => {
    if (!chapter?.content.trim() || !beatBufferRef.current) {
      setMixError('Need lyrics AND a beat to mix.');
      return;
    }
    setMixing(true); setMixError('');
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      let vocals: AudioBuffer;
      try { vocals = await fetchTTSBuffer(chapter.content, ctx, voiceKey); }
      finally { try { ctx.close(); } catch {} }
      const mixed = await mixVocalsAndBeat(vocals, beatBufferRef.current, { vocalsGain: 1.0, beatGain: 0.5 });
      const blob = audioBufferToWavBlob(mixed);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safe = (project?.title || 'track').replace(/\s+/g, '_').toLowerCase();
      a.download = `${safe}-${Date.now()}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error('[HEMINGWAY] mix failed', err);
      setMixError(err instanceof Error ? err.message : 'Mix failed');
    } finally {
      setMixing(false);
    }
  }, [chapter, beatBufferRef, project?.title]);

  // Cleanup on unmount: stop any TTS, free object URL, drop the decoded
  // beat buffer so it's eligible for GC (a long instrumental can be tens
  // of MB held in memory).
  useEffect(() => () => {
    acapHandle?.cancel();
    if (beatUrl && beatSourceKindRef.current === 'blob') {
      try { URL.revokeObjectURL(beatUrl); } catch {}
    }
    beatBufferRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateProject = () => {
    const p = newProject();
    const updated = [...projects, p];
    persist(updated);
    setActiveProjectId(p.id);
    setActiveChapterIdx(0);
  };

  const handleDeleteProject = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    persist(updated);
    if (activeProjectId === id) {
      setActiveProjectId(updated[0]?.id ?? null);
      setActiveChapterIdx(0);
    }
  };

  const handleAddChapter = () => {
    if (!project) return;
    const idx = project.chapters.length;
    updateProject(p => ({
      ...p,
      chapters: [...p.chapters, newChapter(`CHAPTER ${idx + 1}`)],
    }));
    setActiveChapterIdx(idx);
  };

  const handleDeleteChapter = (idx: number) => {
    if (!project || project.chapters.length <= 1) return;
    updateProject(p => ({
      ...p,
      chapters: p.chapters.filter((_, i) => i !== idx),
    }));
    if (activeChapterIdx >= idx && activeChapterIdx > 0) {
      setActiveChapterIdx(activeChapterIdx - 1);
    }
  };

  const streamFromAI = async (action: string, context: string) => {
    if (generating) return;
    setGenerating(true);
    setAiAction(action);
    setStreamText('');

    // Abort any in-flight stream so a second click doesn't double-write the chapter.
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch(apiUrl('studio/writer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action,
          genre: project?.genre ?? 'fiction',
          tone: project?.tone ?? 'literary',
          title: project?.title ?? '',
          synopsis: project?.synopsis ?? '',
          chapterTitle: chapter?.title ?? '',
          chapterContent: chapter?.content ?? '',
          chapterNotes: chapter?.notes ?? '',
          context,
          // Songwriting context — only meaningful for rap/song but cheap to
          // always send. Server uses these to tailor flow/meter advice.
          bpm: project?.bpm ?? 90,
          linesPerBar: project?.linesPerBar ?? 4,
          timeSignature: '4/4',
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setStreamText(`Error: ${err.error ?? 'Something went wrong'}`);
        setGenerating(false);
        setAiAction(null);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setGenerating(false); setAiAction(null); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

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
            if (data.content) {
              full += data.content;
              setStreamText(full);
            }
          } catch {}
        }
      }

      if (action === 'continue' || action === 'write_section') {
        updateChapter(c => {
          const sep = c.content.trim() ? '\n\n' : '';
          const merged = c.content + sep + full;
          return { ...c, content: merged, wordCount: wordCount(merged) };
        });
      } else if (action === 'outline') {
        setShowOutline(true);
      } else if (action === 'rewrite') {
        updateChapter(c => ({ ...c, content: full, wordCount: wordCount(full) }));
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setStreamText('Generation failed. Please try again.');
      }
    }

    setGenerating(false);
    setAiAction(null);
  };

  const handleExport = () => {
    if (!project) return;
    const text = project.chapters.map(c =>
      `# ${c.title}\n\n${c.content}`
    ).join('\n\n---\n\n');
    const full = `${project.title}\nGenre: ${project.genre} | Tone: ${project.tone}\n${project.synopsis ? `\nSynopsis: ${project.synopsis}\n` : ''}\n${'='.repeat(60)}\n\n${text}`;
    const blob = new Blob([full], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportDocument = async (file: File) => {
    if (!project) return;
    setImporting(true);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(apiUrl('studio/parse-document'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) {
        let msg = `Import failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
        setImportError(msg);
        return;
      }
      const data = await res.json() as { title: string; text: string; wordCount: number };
      const imported: Chapter = {
        id: uid(),
        title: (data.title || 'IMPORTED DOCUMENT').toUpperCase().slice(0, 80),
        content: data.text,
        notes: '',
        wordCount: data.wordCount ?? wordCount(data.text),
      };
      updateProject(p => ({ ...p, chapters: [...p.chapters, imported] }));
      setActiveChapterIdx(project.chapters.length);
    } catch {
      setImportError('Import failed — check the file and try again.');
    } finally {
      setImporting(false);
    }
  };

  const totalWords = project?.chapters.reduce((sum, c) => sum + c.wordCount, 0) ?? 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-4">
          <BookOpen className="w-12 h-12 text-amber-400/40 mx-auto" />
          <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">ACCESS RESTRICTED</p>
          <p className="text-zinc-600 font-mono text-xs">SIGN IN TO ACCESS HEMINGWAY</p>
          <button onClick={() => login()} className="px-6 py-2 border border-amber-500/30 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500/10 transition-colors">SIGN IN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="sm:hidden text-zinc-500 hover:text-amber-400 transition-colors p-1 -ml-1"
            aria-label="Toggle project list"
          >
            {sidebarOpen ? <XIcon className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <PenTool className="w-4 h-4 text-amber-400/60" />
          <span className="text-amber-400/80 text-xs tracking-[0.2em] uppercase">HEMINGWAY</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-600 tracking-wider">
          {/* Music tool toggles — work in any genre. A novelist can flip on
              the beat dock to write to a loop; a rapper can pull up the
              rhyme book. Both default ON for rap/song projects. */}
          <button
            onClick={() => setShowBeatDock(s => !s)}
            data-testid="hemingway-toggle-beat"
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              showBeatDock
                ? 'border-pink-500/40 text-pink-300 bg-pink-500/10'
                : 'border-white/[0.06] text-zinc-500 hover:text-pink-300 hover:border-pink-500/25'
            }`}
            title="Toggle the beat dock — upload an instrumental and write to a loop"
          >
            <Music2 className="w-3 h-3" /> BEAT
          </button>
          <button
            onClick={() => setShowRhymeBook(s => !s)}
            data-testid="hemingway-toggle-rhymes"
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              showRhymeBook
                ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                : 'border-white/[0.06] text-zinc-500 hover:text-cyan-300 hover:border-cyan-500/25'
            }`}
            title="Toggle the rhyme book — rhymes, thesaurus, syllables, bars"
          >
            <BookOpen className="w-3 h-3" /> RHYMES
          </button>
          <span className="mx-1 text-zinc-800">|</span>
          <span>{totalWords.toLocaleString()} WORDS</span>
          {showRhymeBook && (
            <>
              <span>·</span>
              <span className="text-cyan-400/80">{totalSyllables} SYL</span>
              <span>·</span>
              <span className="text-cyan-400/80" data-testid="hemingway-bars-counter">{totalBars} BARS</span>
              <span>·</span>
              <span
                className="text-cyan-400/80"
                title="Estimated song length at the current tempo — updates per line"
                data-testid="hemingway-est-length"
              >
                {Math.floor(estSeconds / 60)}:{String(estSeconds % 60).padStart(2, '0')} EST
              </span>
            </>
          )}
          <span>·</span>
          <span>{project?.chapters.length ?? 0} CHAPTERS</span>
          {project && (
            <>
              <span>·</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1 disabled:opacity-40"
              >
                <Upload className="w-3 h-3" /> {importing ? 'IMPORTING…' : 'IMPORT'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportDocument(f); e.currentTarget.value = ''; }}
              />
              <span>·</span>
              <button onClick={handleExport} className="text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                <Download className="w-3 h-3" /> EXPORT
              </button>
              {importError && (
                <span className="text-red-400/80 text-[10px]">{importError}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar — always visible on desktop; slide-over drawer on mobile */}
        <div className={`
          ${sidebarOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-64'
            : 'hidden sm:flex w-56'}
          shrink-0 border-r border-white/[0.06] flex-col bg-[#09090b] overflow-y-auto
        `}>
          <div className="p-3 border-b border-white/[0.04]">
            <button
              onClick={handleCreateProject}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] tracking-widest uppercase text-amber-400 border border-amber-500/25 rounded hover:bg-amber-500/10 transition-colors"
            >
              <Plus className="w-3 h-3" /> NEW PROJECT
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {projects.map(p => (
              <div
                key={p.id}
                className={`group px-3 py-2.5 cursor-pointer border-b border-white/[0.03] transition-colors ${
                  p.id === activeProjectId
                    ? 'bg-amber-500/8 border-l-2 border-l-amber-500/50'
                    : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'
                }`}
                onClick={() => { setActiveProjectId(p.id); setActiveChapterIdx(0); }}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] truncate ${p.id === activeProjectId ? 'text-amber-300' : 'text-zinc-400'}`}>
                    {p.title}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[9px] text-zinc-700 mt-0.5">
                  {p.genre.toUpperCase()} · {p.chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()} WORDS
                </div>
              </div>
            ))}
          </div>

          {/* Chapter list */}
          {project && (
            <div className="border-t border-white/[0.06]">
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[9px] text-zinc-600 tracking-widest uppercase">CHAPTERS</span>
                <button
                  onClick={handleAddChapter}
                  title="Add a new chapter"
                  aria-label="Add a new chapter"
                  data-testid="hemingway-add-chapter-icon"
                  className="flex items-center justify-center w-5 h-5 text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {project.chapters.map((c, i) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors ${
                    i === activeChapterIdx
                      ? 'bg-amber-500/8 text-amber-300'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
                  }`}
                  onClick={() => setActiveChapterIdx(i)}
                >
                  <GripVertical className="w-2.5 h-2.5 text-zinc-700 shrink-0" />
                  <span className="text-[10px] truncate flex-1">{c.title}</span>
                  <span className="text-[8px] text-zinc-700">{c.wordCount}</span>
                  {project.chapters.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteChapter(i); }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddChapter}
                data-testid="hemingway-add-chapter"
                className="w-full flex items-center justify-center gap-1.5 mt-1 px-3 py-2 text-[9px] tracking-widest uppercase text-zinc-500 hover:text-amber-400 border-t border-white/[0.06] hover:bg-amber-500/5 transition-colors"
              >
                <Plus className="w-3 h-3" /> ADD CHAPTER
              </button>
            </div>
          )}
        </div>

        {/* Main editor area */}
        {project && chapter ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chapter header + settings */}
            <div className="px-6 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <input
                value={project.title}
                onChange={e => updateProject(p => ({ ...p, title: e.target.value }))}
                className="bg-transparent text-zinc-200 text-sm font-bold outline-none flex-1 placeholder:text-zinc-700"
                placeholder="PROJECT TITLE"
              />
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`text-[10px] tracking-widest px-2 py-1 rounded border transition-colors ${
                  showSettings ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' : 'text-zinc-600 border-zinc-800 hover:text-zinc-400'
                }`}
              >
                {showSettings ? 'HIDE SETTINGS' : 'SETTINGS'}
              </button>
            </div>

            {showSettings && (
              <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.01] space-y-4">
                <div>
                  <label className="text-[9px] text-zinc-600 tracking-widest uppercase mb-1.5 block">SYNOPSIS</label>
                  <textarea
                    value={project.synopsis}
                    onChange={e => updateProject(p => ({ ...p, synopsis: e.target.value }))}
                    placeholder="What is this work about? Pablo uses this to stay on track..."
                    rows={3}
                    className="w-full bg-black/30 border border-white/[0.06] rounded px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-amber-500/30 resize-none"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[9px] text-zinc-600 tracking-widest uppercase mb-1.5 block">GENRE</label>
                    <div className="grid grid-cols-4 gap-1">
                      {GENRES.map(g => (
                        <button
                          key={g.id}
                          onClick={() => updateProject(p => ({ ...p, genre: g.id }))}
                          className={`px-2 py-1.5 text-[9px] tracking-wider rounded border transition-colors text-left ${
                            project.genre === g.id
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-zinc-600 tracking-widest uppercase mb-1.5 block">TONE</label>
                    <div className="grid grid-cols-4 gap-1">
                      {TONES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => updateProject(p => ({ ...p, tone: t.id }))}
                          className={`px-2 py-1.5 text-[9px] tracking-wider rounded border transition-colors ${
                            project.tone === t.id
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chapter title */}
            <div className="px-6 py-2 border-b border-white/[0.04]">
              <input
                value={chapter.title}
                onChange={e => updateChapter(c => ({ ...c, title: e.target.value }))}
                className="bg-transparent text-amber-400/70 text-xs tracking-[0.15em] uppercase outline-none w-full placeholder:text-zinc-700"
                placeholder="CHAPTER TITLE"
              />
            </div>

            {/* AI toolbar */}
            <div className="px-6 py-2 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => streamFromAI('outline', '')}
                disabled={generating}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <Lightbulb className="w-3 h-3" /> OUTLINE
              </button>
              <button
                onClick={() => streamFromAI('write_section', '')}
                disabled={generating}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <Wand2 className="w-3 h-3" /> WRITE
              </button>
              <button
                onClick={() => streamFromAI('continue', '')}
                disabled={generating || !chapter.content.trim()}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <ArrowRight className="w-3 h-3" /> CONTINUE
              </button>
              <button
                onClick={() => streamFromAI('rewrite', '')}
                disabled={generating || !chapter.content.trim()}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <RotateCcw className="w-3 h-3" /> REWRITE
              </button>
              <button
                onClick={() => streamFromAI('expand', '')}
                disabled={generating || !chapter.content.trim()}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <Sparkles className="w-3 h-3" /> EXPAND
              </button>
              <button
                onClick={() => streamFromAI('critique', '')}
                disabled={generating || !chapter.content.trim()}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors disabled:opacity-30 shrink-0"
              >
                <FileText className="w-3 h-3" /> CRITIQUE
              </button>

              {/* VOICE PICKER — choose the performer who reads / sings the
                  lyrics. Persisted across sessions; drives both A CAPPELLA
                  (live read) and the MIX bake. */}
              <VoicePickerInline
                value={voiceKey}
                onChange={setVoice}
                label={voiceLabel}
              />
              {/* A CAPPELLA — speak the lyrics through the chosen voice as
                  a vocal reference. Tap once to start, again to stop. */}
              <button
                onClick={speakAcappella}
                disabled={!chapter.content.trim()}
                data-testid="hemingway-acappella"
                className={`flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider rounded transition-colors disabled:opacity-30 shrink-0 border ${
                  acapHandle
                    ? 'border-pink-500/50 bg-pink-500/15 text-pink-200'
                    : 'border-white/[0.06] text-zinc-500 hover:text-pink-300 hover:border-pink-500/25 hover:bg-pink-500/5'
                }`}
                title="Speak the lyrics back as a vocal reference"
              >
                <Mic className="w-3 h-3" /> {acapHandle ? 'STOP' : 'A CAPPELLA'}
              </button>
              {/* MIX — render lyrics + uploaded beat into a downloadable WAV.
                  Disabled until both lyrics and a beat are loaded. */}
              <button
                onClick={mixToWav}
                disabled={mixing || !chapter.content.trim() || !beatBufferRef.current}
                data-testid="hemingway-mix"
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-pink-300 border border-white/[0.06] rounded hover:border-pink-500/25 hover:bg-pink-500/5 transition-colors disabled:opacity-30 shrink-0"
                title="Bake vocals + beat into a single WAV you can download"
              >
                {mixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} MIX
              </button>

              {saveError && (
                <button
                  onClick={() => { flushNow(true); }}
                  className="flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider text-red-300 border border-red-500/40 bg-red-500/10 rounded shrink-0"
                  title={saveError}
                >
                  SAVE FAILED · RETRY
                </button>
              )}
              {generating && (
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                  <span className="text-[9px] text-amber-400/60 tracking-wider uppercase">{aiAction ?? 'WRITING'}...</span>
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="text-[9px] text-red-400/60 hover:text-red-400 tracking-wider"
                  >
                    STOP
                  </button>
                </div>
              )}

              <div className="ml-auto text-[9px] text-zinc-700 tracking-wider shrink-0">
                {chapter.wordCount.toLocaleString()} WORDS
              </div>
            </div>

            {/* FORMATTING TOOLBAR — markdown formatting for freewriting (prose)
                genres. Hidden for rap/song where the bar grid, not headings, is
                the structure. Wraps the selection (bold/italic) or prefixes the
                current line(s) (headings/quote/lists). */}
            {!isMusic && (
              <div
                className="px-6 py-1.5 border-b border-white/[0.06] flex items-center gap-1 overflow-x-auto"
                data-testid="hemingway-format-toolbar"
              >
                <span className="text-[8px] text-zinc-700 tracking-widest uppercase mr-1 shrink-0">FORMAT</span>
                <FmtButton onClick={() => applyFormat('bold')} title="Bold (**text**)"><Bold className="w-3 h-3" /></FmtButton>
                <FmtButton onClick={() => applyFormat('italic')} title="Italic (*text*)"><Italic className="w-3 h-3" /></FmtButton>
                <span className="w-px h-3.5 bg-white/[0.08] mx-0.5 shrink-0" aria-hidden="true" />
                <FmtButton onClick={() => applyFormat('h1')} title="Heading 1 (#)"><Heading1 className="w-3 h-3" /></FmtButton>
                <FmtButton onClick={() => applyFormat('h2')} title="Heading 2 (##)"><Heading2 className="w-3 h-3" /></FmtButton>
                <span className="w-px h-3.5 bg-white/[0.08] mx-0.5 shrink-0" aria-hidden="true" />
                <FmtButton onClick={() => applyFormat('quote')} title="Block quote (>)"><Quote className="w-3 h-3" /></FmtButton>
                <FmtButton onClick={() => applyFormat('ul')} title="Bullet list (-)"><List className="w-3 h-3" /></FmtButton>
                <FmtButton onClick={() => applyFormat('ol')} title="Numbered list (1.)"><ListOrdered className="w-3 h-3" /></FmtButton>
                <FmtButton onClick={() => applyFormat('hr')} title="Divider (---)"><Minus className="w-3 h-3" /></FmtButton>
              </div>
            )}

            {/* Editor + AI output */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex overflow-hidden">
                {/* Line-stat gutter — only shown when the rhyme book is open
                    so a novelist who never asked for it isn't distracted by
                    syllable counts. Each line shows: bar number (only on
                    the first line of a bar) and syllable count. */}
                {showRhymeBook && (
                  <div
                    className="shrink-0 select-none border-r border-white/[0.04] bg-black/20 text-right pr-1.5 pl-2 py-6 overflow-hidden"
                    style={{ fontFamily: "var(--font-sans)", fontSize: '11px', lineHeight: '1.85', minWidth: '64px' }}
                    aria-hidden="true"
                  >
                    {lineStats.map((s, i) => (
                      <div key={i} className="flex items-center justify-end gap-1.5" style={{ height: '1.85em' }}>
                        {s.isBarStart && (
                          <span className="text-cyan-400/60 text-[9px] tracking-wider">▸B{s.barIdx}</span>
                        )}
                        <span className={s.syllables > 0 ? 'text-amber-300/50 text-[10px]' : 'text-zinc-800 text-[10px]'}>
                          {s.syllables || '·'}
                        </span>
                        {s.alliteration.size > 0 && (
                          <span className="text-pink-400/70 text-[9px] uppercase">
                            {[...s.alliteration].join('')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={editorRef}
                  value={chapter.content}
                  onChange={e => {
                    const val = e.target.value;
                    updateChapter(c => ({ ...c, content: val, wordCount: wordCount(val) }));
                  }}
                  placeholder="Start writing, or use the toolbar above to let Pablo write for you..."
                  className="flex-1 bg-transparent text-zinc-300 text-sm outline-none resize-none placeholder:text-zinc-800 px-8 py-6"
                  style={{
                    fontFamily: showRhymeBook ? "var(--font-sans)" : "'Georgia', 'Times New Roman', serif",
                    fontSize: '15px',
                    lineHeight: '1.85',
                  }}
                />
              </div>

              {/* === RHYME BOOK PANEL ===========================================
                  Tools that work for ANY genre but are most useful for
                  rap/song/poetry: rhyme dictionary, song-flavoured thesaurus,
                  syllable + bar + tempo analytics. Toggleable from the header. */}
              {showRhymeBook && (
                <div className="w-80 shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col overflow-hidden" data-testid="hemingway-rhymebook">
                  <div className="px-3 py-2 border-b border-white/[0.04] flex items-center gap-2">
                    <BookOpen className="w-3 h-3 text-cyan-400/60" />
                    <span className="text-[9px] text-cyan-400/70 tracking-widest uppercase">RHYME BOOK</span>
                  </div>
                  {/* Tabs */}
                  <div className="flex border-b border-white/[0.04]">
                    {(['rhymes','thesaurus','tools'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setRhymeTab(t)}
                        className={`flex-1 py-1.5 text-[9px] tracking-widest uppercase transition-colors ${
                          rhymeTab === t
                            ? 'text-cyan-300 border-b border-cyan-500/60 bg-cyan-500/5'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Search box (rhymes + thesaurus tabs) */}
                  {rhymeTab !== 'tools' && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); lookupWord(rhymeQuery || wordAtCursor()); }}
                      className="px-3 py-2 border-b border-white/[0.04] flex items-center gap-1.5"
                    >
                      <Search className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                      <input
                        value={rhymeQuery}
                        onChange={e => setRhymeQuery(e.target.value)}
                        placeholder={rhymeTab === 'rhymes' ? 'word to rhyme…' : 'word to expand…'}
                        aria-label={rhymeTab === 'rhymes' ? 'Word to find rhymes for' : 'Word to expand in the thesaurus'}
                        className="flex-1 bg-transparent text-zinc-300 text-xs outline-none placeholder:text-zinc-700"
                        data-testid="hemingway-rhyme-input"
                      />
                      <button
                        type="button"
                        onClick={() => { const w = wordAtCursor(); if (w) lookupWord(w); }}
                        className="text-[9px] text-zinc-500 hover:text-cyan-300 tracking-wider px-1.5 py-0.5 border border-white/[0.06] rounded"
                        title="Look up the word at your cursor"
                      >
                        @CARET
                      </button>
                      {rhymeLoading && <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />}
                    </form>
                  )}

                  <div className="flex-1 overflow-y-auto px-3 py-2">
                    {rhymeTab === 'rhymes' && (
                      <>
                        <RhymeGroup label="PERFECT" hits={rhymeHits} onPick={insertAtCursor} color="cyan" />
                        <RhymeGroup label="NEAR"    hits={nearHits}  onPick={insertAtCursor} color="amber" />
                        {!rhymeLoading && rhymeHits.length === 0 && nearHits.length === 0 && (
                          <p className="text-[10px] text-zinc-700 text-center py-4">
                            Type a word above (or place your cursor on one and tap @CARET).
                          </p>
                        )}
                      </>
                    )}
                    {rhymeTab === 'thesaurus' && (
                      <>
                        <RhymeGroup label="SYNONYMS"   hits={synHits} onPick={insertAtCursor} color="emerald" />
                        <RhymeGroup label="MEANS LIKE" hits={mlHits}  onPick={insertAtCursor} color="violet" />
                        <RhymeGroup label="ADJECTIVES" hits={adjHits} onPick={insertAtCursor} color="pink" />
                        {!rhymeLoading && synHits.length === 0 && mlHits.length === 0 && adjHits.length === 0 && (
                          <p className="text-[10px] text-zinc-700 text-center py-4">
                            Look up a word to see synonyms, related meanings, and adjectives that pair with it.
                          </p>
                        )}
                      </>
                    )}
                    {rhymeTab === 'tools' && (
                      <div className="space-y-3">
                        <ToolStat label="LINES"      value={lines.filter(l => l.trim()).length.toString()} />
                        <ToolStat label="SYLLABLES"  value={totalSyllables.toString()} />
                        <ToolStat label="BARS"       value={totalBars.toString()} />
                        <ToolStat label="EST. LENGTH" value={`${Math.floor(estSeconds / 60)}:${String(estSeconds % 60).padStart(2,'0')}`} />
                        <div className="border-t border-white/[0.04] pt-3">
                          <label className="text-[9px] text-zinc-600 tracking-widest uppercase block mb-1">TEMPO (BPM)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={40} max={200} value={bpm}
                              onChange={e => updateProject(p => ({ ...p, bpm: Number(e.target.value) }))}
                              className="flex-1 accent-cyan-400"
                            />
                            <input
                              type="number" min={40} max={200} value={bpm}
                              onChange={e => updateProject(p => ({ ...p, bpm: Math.max(40, Math.min(200, Number(e.target.value) || 90)) }))}
                              className="w-14 bg-black/40 border border-white/[0.06] rounded px-1.5 py-1 text-xs text-zinc-200 outline-none"
                              data-testid="hemingway-bpm-input"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] text-zinc-600 tracking-widest uppercase block mb-1">LINES PER BAR</label>
                          <div className="flex gap-1">
                            {[1,2,3,4,8].map(n => (
                              <button
                                key={n}
                                onClick={() => updateProject(p => ({ ...p, linesPerBar: n }))}
                                className={`flex-1 py-1 text-[10px] tracking-wider rounded border transition-colors ${
                                  linesPerBar === n
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                    : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400'
                                }`}
                              >{n}</button>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-white/[0.04] pt-3 space-y-1">
                          <p className="text-[9px] text-zinc-600 tracking-widest uppercase">LEGEND</p>
                          <p className="text-[10px] text-zinc-500"><span className="text-cyan-400/80">▸B#</span> bar marker · <span className="text-amber-300/70">#</span> syllables · <span className="text-pink-400/80">letters</span> alliteration on that letter</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI output panel */}
              {(streamText || showOutline) && (
                <div className="w-80 shrink-0 border-l border-white/[0.06] bg-white/[0.01] flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                    <span className="text-[9px] text-amber-400/60 tracking-widest uppercase">
                      {aiAction === 'outline' ? 'OUTLINE' : aiAction === 'critique' ? 'CRITIQUE' : 'PABLO OUTPUT'}
                    </span>
                    <button
                      onClick={() => { setStreamText(''); setShowOutline(false); }}
                      className="text-zinc-700 hover:text-zinc-400 transition-colors text-[9px]"
                    >
                      CLOSE
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 text-xs text-zinc-400 leading-6 whitespace-pre-wrap">
                    {streamText}
                  </div>
                  {streamText && !generating && aiAction !== 'continue' && aiAction !== 'rewrite' && (
                    <div className="px-3 py-2 border-t border-white/[0.04] flex gap-2">
                      <button
                        onClick={() => {
                          updateChapter(c => {
                            const sep = c.content.trim() ? '\n\n' : '';
                            const merged = c.content + sep + streamText;
                            return { ...c, content: merged, wordCount: wordCount(merged) };
                          });
                          setStreamText('');
                        }}
                        className="flex-1 text-[9px] tracking-wider text-amber-400 border border-amber-500/25 rounded py-1 hover:bg-amber-500/10 transition-colors"
                      >
                        INSERT INTO CHAPTER
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chapter notes bar */}
            <div className="border-t border-white/[0.06] px-6 py-2">
              <input
                value={chapter.notes}
                onChange={e => updateChapter(c => ({ ...c, notes: e.target.value }))}
                placeholder="Chapter notes (for Pablo's context — e.g. 'introduce the villain here', 'flashback scene')..."
                className="w-full bg-transparent text-[10px] text-zinc-600 outline-none placeholder:text-zinc-800 tracking-wider"
              />
            </div>

            {/* === BEAT DOCK ====================================================
                Persistent strip across the bottom of HEMINGWAY when toggled on.
                Upload an instrumental (mp3/wav), play/pause, set an A/B loop on
                a hook section, control the volume — and your novel writing
                gets a soundtrack just like a rapper's session. */}
            {showBeatDock && (
              <div
                className="border-t-2 border-pink-500/30 bg-gradient-to-b from-pink-500/[0.04] to-transparent px-4 py-2.5"
                data-testid="hemingway-beat-dock"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Music2 className="w-3.5 h-3.5 text-pink-400/70" />
                    <span className="text-[9px] text-pink-300/80 tracking-widest uppercase">BEAT</span>
                  </div>

                  {/* Upload from disk */}
                  <label className="flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-pink-300 border border-white/[0.06] hover:border-pink-500/30 rounded cursor-pointer transition-colors shrink-0">
                    <Upload className="w-3 h-3" /> {beatFileName ? 'CHANGE' : 'UPLOAD'}
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      data-testid="hemingway-beat-upload"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) loadBeatFile(f); e.currentTarget.value = ''; }}
                    />
                  </label>

                  {/* Pick from the Hummingbird library — saved tracks the
                      user already uploaded once, so they don't have to drop
                      an mp3 every time they sit down to write. */}
                  <button
                    type="button"
                    onClick={() => pickHumTrack(loadFromHummingbird)}
                    data-testid="hemingway-beat-humbird"
                    className="flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-purple-300 border border-white/[0.06] hover:border-purple-500/30 rounded transition-colors shrink-0"
                    title="Pick a beat from your Humming Bird library"
                  >
                    <HummingbirdIcon size={12} color="currentColor" /> HUMMING BIRD
                  </button>

                  {/* Hidden audio element drives playback. The native `loop`
                      attribute fires only when there's no A/B loop AND the
                      user picked repeat='one'. A/B loop (handled in the
                      timeupdate effect) takes precedence when set. */}
                  {beatUrl && (
                    <audio
                      ref={beatAudioRef}
                      src={beatUrl}
                      loop={loopB <= loopA && repeatMode === 'one'}
                      onLoadedMetadata={(e) => setBeatDur((e.target as HTMLAudioElement).duration || 0)}
                      onPause={() => setBeatPlaying(false)}
                      onPlay={() => setBeatPlaying(true)}
                      onEnded={() => { if (repeatMode === 'off') setBeatPlaying(false); }}
                      preload="auto"
                    />
                  )}

                  <button
                    onClick={playPauseBeat}
                    disabled={!beatUrl}
                    data-testid="hemingway-beat-play"
                    className="flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider text-zinc-500 hover:text-pink-300 border border-white/[0.06] hover:border-pink-500/30 rounded transition-colors disabled:opacity-30 shrink-0"
                  >
                    {beatPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {beatPlaying ? 'PAUSE' : 'PLAY'}
                  </button>

                  {/* File name + position display */}
                  {beatFileName && (
                    <span className="text-[10px] text-zinc-500 truncate max-w-[160px]">{beatFileName}</span>
                  )}
                  {beatDur > 0 && (
                    <span className="text-[10px] text-zinc-600 font-mono shrink-0">
                      {fmtTime(beatPos)} / {fmtTime(beatDur)}
                    </span>
                  )}

                  {/* Repeat mode toggle — explicit OFF / ONE so the writer
                      isn't surprised by implicit looping behavior. */}
                  {beatDur > 0 && (
                    <button
                      type="button"
                      onClick={() => setRepeatMode(m => m === 'off' ? 'one' : 'off')}
                      data-testid="hemingway-beat-repeat"
                      className={`flex items-center gap-1 px-2 py-1 text-[9px] tracking-wider rounded border shrink-0 transition-colors ${
                        repeatMode === 'one'
                          ? 'text-pink-300 border-pink-500/40 bg-pink-500/10'
                          : 'text-zinc-500 border-white/[0.06] hover:text-pink-300 hover:border-pink-500/30'
                      }`}
                      title={repeatMode === 'one' ? 'Loop the track end-to-end (click to disable)' : 'Play once and stop (click to loop)'}
                    >
                      <Repeat className="w-3 h-3" />
                      REPEAT {repeatMode === 'one' ? 'ON' : 'OFF'}
                    </button>
                  )}

                  {/* A/B loop controls — set start/end points for tight loops */}
                  {beatDur > 0 && (
                    <>
                      <div className="flex items-center gap-1 shrink-0">
                        <Repeat className="w-3 h-3 text-zinc-600" />
                        <button
                          onClick={() => setLoopA(beatAudioRef.current?.currentTime ?? 0)}
                          className="text-[9px] tracking-wider text-zinc-500 hover:text-pink-300 px-1.5 py-0.5 border border-white/[0.06] hover:border-pink-500/30 rounded"
                          title="Set the loop start point to the current position"
                        >
                          A {loopA > 0 && `(${fmtTime(loopA)})`}
                        </button>
                        <button
                          onClick={() => setLoopB(beatAudioRef.current?.currentTime ?? 0)}
                          className="text-[9px] tracking-wider text-zinc-500 hover:text-pink-300 px-1.5 py-0.5 border border-white/[0.06] hover:border-pink-500/30 rounded"
                          title="Set the loop end point to the current position"
                        >
                          B {loopB > 0 && `(${fmtTime(loopB)})`}
                        </button>
                        {(loopA > 0 || loopB > 0) && (
                          <button
                            onClick={() => { setLoopA(0); setLoopB(0); }}
                            className="text-[9px] tracking-wider text-zinc-600 hover:text-red-400 px-1.5 py-0.5"
                          >
                            CLR
                          </button>
                        )}
                      </div>
                      {/* Scrub bar */}
                      <input
                        type="range"
                        min={0}
                        max={beatDur}
                        step={0.01}
                        value={beatPos}
                        onChange={(e) => {
                          const t = Number(e.target.value);
                          if (beatAudioRef.current) beatAudioRef.current.currentTime = t;
                          setBeatPos(t);
                        }}
                        className="flex-1 min-w-[120px] accent-pink-400 max-w-[280px]"
                      />
                    </>
                  )}

                  {/* Volume */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Volume2 className="w-3 h-3 text-zinc-600" />
                    <input
                      type="range" min={0} max={1} step={0.01} value={beatVolume}
                      onChange={e => setBeatVolume(Number(e.target.value))}
                      className="w-16 accent-pink-400"
                    />
                  </div>

                  {/* Status / errors */}
                  {mixError && (
                    <span className="text-[10px] text-red-400 ml-auto" role="alert">{mixError}</span>
                  )}
                  {!beatUrl && !mixError && (
                    <span className="text-[10px] text-zinc-700 italic ml-auto">
                      drop an mp3/wav · or pick a saved beat from Humming Bird · then loop & write to it
                    </span>
                  )}
                  {humTrackInfo && !mixError && (
                    <span className="text-[9px] text-purple-300/70 italic ml-auto" title="Hummingbird streams aren't decoded locally, so MIX is upload-only">
                      streaming from Humming Bird · MIX disabled
                    </span>
                  )}
                </div>
                {humPicker}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <BookOpen className="w-16 h-16 text-amber-400/10 mx-auto" />
              <p className="text-zinc-600 text-xs tracking-widest uppercase">NO PROJECT SELECTED</p>
              <button
                onClick={handleCreateProject}
                className="flex items-center gap-1.5 px-4 py-2 text-[10px] tracking-widest uppercase text-amber-400 border border-amber-500/25 rounded hover:bg-amber-500/10 transition-colors mx-auto"
              >
                <Plus className="w-3 h-3" /> CREATE YOUR FIRST PROJECT
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TERRENCE live-assist drawer — only renders for owners; ownership is
          checked inside the component. We surface it everywhere in HEMINGWAY
          (not just music genres) since a novelist can also want sound advice. */}
      <TerrenceAssistDrawer
        surface="writer"
        getContext={() => ({
          genre: project?.genre ?? 'fiction',
          bpm: project?.bpm ?? 90,
          timeSignature: '4/4',
          lyricSnippet: chapter?.content ?? '',
        })}
      />
    </div>
  );
}

// === Helpers used by the rhyme book / beat dock UIs =====================
// Format seconds as M:SS — used in the beat dock scrub display.
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Color → tailwind class fragments for the rhyme/thesaurus chip groups.
const CHIP_COLORS: Record<string, { label: string; chip: string }> = {
  cyan:    { label: 'text-cyan-300/70',    chip: 'border-cyan-500/20    hover:border-cyan-400/60    hover:bg-cyan-500/10    text-zinc-300' },
  amber:   { label: 'text-amber-300/70',   chip: 'border-amber-500/20   hover:border-amber-400/60   hover:bg-amber-500/10   text-zinc-300' },
  emerald: { label: 'text-emerald-300/70', chip: 'border-emerald-500/20 hover:border-emerald-400/60 hover:bg-emerald-500/10 text-zinc-300' },
  violet:  { label: 'text-violet-300/70',  chip: 'border-violet-500/20  hover:border-violet-400/60  hover:bg-violet-500/10  text-zinc-300' },
  pink:    { label: 'text-pink-300/70',    chip: 'border-pink-500/20    hover:border-pink-400/60    hover:bg-pink-500/10    text-zinc-300' },
};

// One labeled section of clickable word chips inside the rhyme book.
// Tapping a chip drops the word at the user's caret in the editor.
function RhymeGroup({
  label, hits, onPick, color,
}: { label: string; hits: DatamuseHit[]; onPick: (w: string) => void; color: keyof typeof CHIP_COLORS }) {
  if (!hits || hits.length === 0) return null;
  const c = CHIP_COLORS[color] ?? CHIP_COLORS.cyan;
  return (
    <div className="mb-3">
      <p className={`text-[9px] tracking-widest uppercase mb-1 ${c.label}`}>{label} <span className="text-zinc-700">· {hits.length}</span></p>
      <div className="flex flex-wrap gap-1">
        {hits.slice(0, 60).map(h => (
          <button
            key={h.word}
            onClick={() => onPick(h.word)}
            className={`text-[11px] px-1.5 py-0.5 border rounded transition-colors ${c.chip}`}
            title={h.numSyllables ? `${h.numSyllables} syllable${h.numSyllables === 1 ? '' : 's'}` : undefined}
          >
            {h.word}
          </button>
        ))}
      </div>
    </div>
  );
}

// Big numeric stat for the TOOLS tab (lines / syllables / bars / length).
function ToolStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/[0.04] pb-2">
      <span className="text-[9px] text-zinc-600 tracking-widest uppercase">{label}</span>
      <span className="text-lg text-cyan-300/90 font-mono">{value}</span>
    </div>
  );
}

// FmtButton — compact icon button for the freewriting formatting toolbar.
function FmtButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center justify-center w-7 h-7 text-zinc-500 hover:text-amber-400 border border-white/[0.06] rounded hover:border-amber-500/25 hover:bg-amber-500/5 transition-colors shrink-0"
    >
      {children}
    </button>
  );
}

// =============================================================================
// VoicePickerInline — compact dropdown for the WriterStudio chapter header.
// Lists WRITER_VOICES grouped by category (signature / narrator / singer /
// character) so the writer can pick who reads the lyrics back. Persists via
// the parent. Styled to sit alongside A CAPPELLA / MIX without screaming.
// =============================================================================
function VoicePickerInline({
  value, onChange, label,
}: {
  value: string;
  onChange: (key: string) => void;
  label: string;
}) {
  const grouped = useMemo(() => {
    const order: WriterVoiceOption['category'][] = ['signature', 'narrator', 'singer', 'character'];
    const m = new Map<WriterVoiceOption['category'], WriterVoiceOption[]>();
    for (const v of WRITER_VOICES) {
      const arr = m.get(v.category) ?? [];
      arr.push(v); m.set(v.category, arr);
    }
    return order.filter(c => m.has(c)).map(c => ({ category: c, items: m.get(c)! }));
  }, []);
  return (
    <label
      className="flex items-center gap-1.5 px-2 py-1 text-[9px] tracking-wider rounded border border-white/[0.06] text-zinc-500 hover:text-cyan-300 hover:border-cyan-500/25 hover:bg-cyan-500/5 transition-colors shrink-0"
      title="Choose the performer who reads / sings the lyrics"
      data-testid="hemingway-voice-picker"
    >
      <Volume2 className="w-3 h-3" />
      <span className="text-cyan-300/80 font-mono uppercase truncate max-w-[7rem]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none border-0 text-[9px] tracking-wider text-cyan-300/80 cursor-pointer appearance-none w-3"
        aria-label="Performance voice"
      >
        {grouped.map(g => (
          <optgroup key={g.category} label={g.category.toUpperCase()}>
            {g.items.map(v => (
              <option key={v.key} value={v.key} className="bg-zinc-900 text-zinc-200">
                {v.label}{v.tag ? ` · ${v.tag}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
