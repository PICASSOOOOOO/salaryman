import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import {
  BookOpen, Plus, Trash2, ChevronDown, ChevronUp,
  Wand2, Save, Download, Loader2, RotateCcw,
  FileText, Sparkles, ArrowRight, GripVertical,
  Lightbulb, PenTool,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '').replace(/^\//, '');
function apiUrl(path: string) {
  return `/${BASE ? BASE + '/' : ''}api/${path}`.replace(/\/+/g, '/');
}

type Genre = 'fiction' | 'nonfiction' | 'screenplay' | 'poetry' | 'essay' | 'memoir' | 'journalism' | 'technical';
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

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
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
  const [aiAction, setAiAction] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const project = projects.find(p => p.id === activeProjectId) ?? null;
  const chapter = project?.chapters[activeChapterIdx] ?? null;

  const persist = useCallback((updated: Project[]) => {
    setProjects(updated);
    saveProjects(updated);
  }, []);

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    persist(projects.map(p => p.id === activeProjectId ? fn({ ...p, updatedAt: Date.now() }) : p));
  }, [projects, activeProjectId, persist]);

  const updateChapter = useCallback((fn: (c: Chapter) => Chapter) => {
    updateProject(p => ({
      ...p,
      chapters: p.chapters.map((c, i) => i === activeChapterIdx ? fn({ ...c }) : c),
    }));
  }, [updateProject, activeChapterIdx]);

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

    abortRef.current = new AbortController();

    try {
      const res = await fetch(apiUrl('studio/writer'), {
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

  const totalWords = project?.chapters.reduce((sum, c) => sum + c.wordCount, 0) ?? 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-4">
          <BookOpen className="w-12 h-12 text-amber-400/40 mx-auto" />
          <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest">ACCESS RESTRICTED</p>
          <p className="text-zinc-600 font-mono text-xs">SIGN IN TO ACCESS THE WRITER'S STUDIO</p>
          <button onClick={login} className="px-6 py-2 border border-amber-500/30 text-amber-400 font-mono text-xs uppercase tracking-widest hover:bg-amber-500/10 transition-colors">SIGN IN</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PenTool className="w-4 h-4 text-amber-400/60" />
          <span className="text-amber-400/80 text-xs tracking-[0.2em] uppercase">PABLO — THE WRITER</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-600 tracking-wider">
          <span>{totalWords.toLocaleString()} WORDS</span>
          <span>·</span>
          <span>{project?.chapters.length ?? 0} CHAPTERS</span>
          {project && (
            <>
              <span>·</span>
              <button onClick={handleExport} className="text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1">
                <Download className="w-3 h-3" /> EXPORT
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col bg-white/[0.01] overflow-y-auto">
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
                <button onClick={handleAddChapter} className="text-zinc-600 hover:text-amber-400 transition-colors">
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

            {/* Editor + AI output */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <textarea
                  ref={editorRef}
                  value={chapter.content}
                  onChange={e => {
                    const val = e.target.value;
                    updateChapter(c => ({ ...c, content: val, wordCount: wordCount(val) }));
                  }}
                  placeholder="Start writing, or use the toolbar above to let Pablo write for you..."
                  className="flex-1 bg-transparent text-zinc-300 text-sm leading-7 px-8 py-6 outline-none resize-none placeholder:text-zinc-800"
                  style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '15px', lineHeight: '1.85' }}
                />
              </div>

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
    </div>
  );
}
