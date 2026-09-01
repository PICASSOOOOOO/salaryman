import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FolderOpen, BookOpen, Palette, Plus, Trash2, Edit2, Check,
  X, Loader2, ChevronRight, Code2, Search, Briefcase, Megaphone, FlaskConical,
  Lightbulb, Globe, Users, Brain, FileText, Save, ChevronDown, ChevronUp
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

// ── Types ────────────────────────────────────────────────────────────────────

type ProjectType = 'general' | 'job_search' | 'software' | 'research' | 'sales' | 'creative';
interface Project { id: number; name: string; type: ProjectType; description: string; createdAt: string; }
interface Note { id: number; title: string; content: string; category: string; projectId: number | null; updatedAt: string; }
interface BrandKit {
  companyName?: string; tagline?: string; mission?: string;
  primaryColor?: string; secondaryColor?: string; logoUrl?: string;
  website?: string; industry?: string; targetAudience?: string;
}

const PROJECT_TYPES: { value: ProjectType; label: string; icon: React.FC<any>; color: string }[] = [
  { value: 'general',    label: 'General',       icon: LayoutDashboard, color: 'text-slate-400'  },
  { value: 'job_search', label: 'Job Search',    icon: Briefcase,       color: 'text-blue-400'   },
  { value: 'software',   label: 'Software',      icon: Code2,           color: 'text-sky-400'},
  { value: 'research',   label: 'Research',      icon: FlaskConical,    color: 'text-violet-400' },
  { value: 'sales',      label: 'Sales / CRM',   icon: Megaphone,       color: 'text-orange-400' },
  { value: 'creative',   label: 'Creative',      icon: Lightbulb,       color: 'text-yellow-400' },
];

const NOTE_CATEGORIES = ['general', 'key facts', 'code', 'research', 'meeting notes', 'ideas'];

// ── Small helpers ─────────────────────────────────────────────────────────────

function typeIcon(type: ProjectType) {
  const t = PROJECT_TYPES.find(p => p.value === type) ?? PROJECT_TYPES[0];
  return <t.icon className={`w-4 h-4 ${t.color}`} />;
}

const BASE_URL = import.meta.env.BASE_URL;

function api(path: string, opts?: RequestInit) {
  const fullPath = path.startsWith('/api/') ? `${BASE_URL}${path.slice(1)}` : path;
  return apiFetch(fullPath, { headers: { 'Content-Type': 'application/json' }, ...opts });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NoteCard({ note, onSave, onDelete }: { note: Note; onSave: (n: Note) => void; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await api(`/api/workspace/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ title, content, category }) });
    const updated = await r.json();
    onSave(updated);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div className="bg-muted/20 border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium text-foreground truncate">{note.title}</span>
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider hidden sm:block">{note.category}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40" />
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={5}
            placeholder="Write anything — code, ideas, notes, facts..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 resize-none font-mono" />
          <div className="flex items-center gap-2 flex-wrap">
            {NOTE_CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${category === c ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onDelete(note.id)}
              className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={save} disabled={saving}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary/15 border border-primary/25 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROJECTS TAB ─────────────────────────────────────────────────────────────

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, Note[]>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProjectType>('general');
  const [newDesc, setNewDesc] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState('general');

  useEffect(() => {
    api('/api/workspace/projects').then(r => r.json()).then(setProjects).finally(() => setLoading(false));
  }, []);

  const loadNotes = async (pid: number) => {
    if (notes[pid]) return;
    const r = await api(`/api/workspace/projects/${pid}/notes`);
    const data = await r.json();
    setNotes(prev => ({ ...prev, [pid]: data }));
  };

  const openProject = (pid: number) => {
    if (activeProject === pid) { setActiveProject(null); return; }
    setActiveProject(pid);
    loadNotes(pid);
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    const r = await api('/api/workspace/projects', { method: 'POST', body: JSON.stringify({ name: newName, type: newType, description: newDesc }) });
    const p = await r.json();
    setProjects(prev => [p, ...prev]);
    setCreating(false); setNewName(''); setNewType('general'); setNewDesc('');
  };

  const deleteProject = async (id: number) => {
    await api(`/api/workspace/projects/${id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject === id) setActiveProject(null);
  };

  const createNote = async (pid: number) => {
    if (!noteTitle.trim()) return;
    const r = await api('/api/workspace/notes', { method: 'POST', body: JSON.stringify({ projectId: pid, title: noteTitle, content: noteContent, category: noteCategory }) });
    const note = await r.json();
    setNotes(prev => ({ ...prev, [pid]: [note, ...(prev[pid] ?? [])] }));
    setAddingNote(false); setNoteTitle(''); setNoteContent(''); setNoteCategory('general');
  };

  const updateNote = (pid: number, updated: Note) => setNotes(prev => ({ ...prev, [pid]: (prev[pid] ?? []).map(n => n.id === updated.id ? updated : n) }));
  const deleteNote = async (pid: number, nid: number) => {
    await api(`/api/workspace/notes/${nid}`, { method: 'DELETE' });
    setNotes(prev => ({ ...prev, [pid]: (prev[pid] ?? []).filter(n => n.id !== nid) }));
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>;

  return (
    <div className="space-y-4">
      {/* Create project */}
      {creating ? (
        <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-3">
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name..."
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/40" />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} placeholder="What is this project about? (optional)"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/40 resize-none" />
          <div className="flex gap-2 flex-wrap">
            {PROJECT_TYPES.map(t => (
              <button key={t.value} onClick={() => setNewType(t.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${newType === t.value ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent'}`}>
                <t.icon className={`w-3.5 h-3.5 ${newType === t.value ? '' : t.color}`} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted/30 transition-colors">Cancel</button>
            <button onClick={createProject} className="px-4 py-2 rounded-xl bg-primary/15 border border-primary/25 text-primary text-sm font-semibold hover:bg-primary/25 transition-colors">Create</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-primary text-sm">
          <Plus className="w-4 h-4" /> New project
        </button>
      )}

      {projects.length === 0 && !creating && (
        <div className="text-center py-12 text-muted-foreground/40">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No projects yet — create your first one above</p>
        </div>
      )}

      {projects.map(p => (
        <div key={p.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <button onClick={() => openProject(p.id)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/20 transition-colors">
            <div className="w-8 h-8 rounded-xl bg-muted/30 border border-border flex items-center justify-center">{typeIcon(p.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
            </div>
            <span className="text-xs text-muted-foreground/40 hidden sm:block">{PROJECT_TYPES.find(t => t.value === p.type)?.label}</span>
            {activeProject === p.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>

          {activeProject === p.id && (
            <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
              {/* Add note */}
              {addingNote ? (
                <div className="bg-muted/20 border border-primary/20 rounded-xl p-4 space-y-3">
                  <input autoFocus value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Note title..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40" />
                  <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4}
                    placeholder="Write anything — code, ideas, research, meeting notes..."
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 resize-none font-mono" />
                  <div className="flex gap-2 flex-wrap">
                    {NOTE_CATEGORIES.map(c => (
                      <button key={c} onClick={() => setNoteCategory(c)}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${noteCategory === c ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}>{c}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAddingNote(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button onClick={() => createNote(p.id)} className="ml-auto px-4 py-1.5 rounded-xl bg-primary/15 border border-primary/25 text-primary text-xs font-semibold">Add Note</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingNote(true)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors px-1">
                  <Plus className="w-3.5 h-3.5" /> Add note
                </button>
              )}

              {(notes[p.id] ?? []).map(note => (
                <NoteCard key={note.id} note={note}
                  onSave={updated => updateNote(p.id, updated)}
                  onDelete={nid => deleteNote(p.id, nid)} />
              ))}

              {(notes[p.id] ?? []).length === 0 && !addingNote && (
                <p className="text-xs text-muted-foreground/40 text-center py-4">No notes yet — add your first one above</p>
              )}

              <div className="pt-2 border-t border-border flex justify-end">
                <button onClick={() => deleteProject(p.id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-500/5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete project
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── KNOWLEDGE BASE TAB ────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');

  useEffect(() => {
    api('/api/workspace/knowledge').then(r => r.json()).then(setNotes).finally(() => setLoading(false));
  }, []);

  const createNote = async () => {
    if (!title.trim()) return;
    const r = await api('/api/workspace/notes', { method: 'POST', body: JSON.stringify({ projectId: null, title, content, category }) });
    const note = await r.json();
    setNotes(prev => [note, ...prev]);
    setAdding(false); setTitle(''); setContent(''); setCategory('general');
  };

  const updateNote = (updated: Note) => setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  const deleteNote = async (id: number) => {
    await api(`/api/workspace/notes/${id}`, { method: 'DELETE' });
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>;

  const CATS = ['general', 'key facts', 'code', 'research', 'meeting notes', 'ideas'];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <Brain className="w-4 h-4 text-sky-400" />
          <p className="text-sm font-semibold text-foreground">Your Knowledge Vault</p>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Store facts about your company, research findings, key information, code snippets — anything PABLO should know about you.
          Organize by category so it's easy to find later.
        </p>

        {adding ? (
          <div className="space-y-3 border-t border-border pt-4">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What's this about? (title)"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/40" />
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={5}
              placeholder="Write anything — code, facts, meeting notes, research, ideas..."
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/40 resize-none font-mono" />
            <div className="flex gap-2 flex-wrap">
              {CATS.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${category === c ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={createNote} className="ml-auto px-4 py-2 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300 text-sm font-semibold">Save to vault</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors text-muted-foreground hover:text-sky-300 text-sm w-full">
            <Plus className="w-4 h-4" /> Add to knowledge vault
          </button>
        )}
      </div>

      {notes.length === 0 && !adding && (
        <div className="text-center py-12 text-muted-foreground/40">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Your vault is empty — start adding facts, notes, and code snippets above</p>
        </div>
      )}

      {notes.map(note => (
        <NoteCard key={note.id} note={note} onSave={updateNote} onDelete={deleteNote} />
      ))}
    </div>
  );
}

// ── CREATIVE KIT TAB ──────────────────────────────────────────────────────────

function CreativeTab() {
  const [kit, setKit] = useState<BrandKit>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/api/workspace/brand-kit').then(r => r.json()).then(setKit).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const r = await api('/api/workspace/brand-kit', { method: 'PUT', body: JSON.stringify(kit) });
    const updated = await r.json();
    setKit(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setSaving(false);
  };

  const field = (key: keyof BrandKit, label: string, placeholder: string, multiline = false) => (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
      {multiline ? (
        <textarea value={(kit[key] as string) ?? ''} onChange={e => setKit(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder} rows={3}
          className="w-full bg-muted/20 border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/40 resize-none" />
      ) : (
        <input value={(kit[key] as string) ?? ''} onChange={e => setKit(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full bg-muted/20 border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/40" />
      )}
    </div>
  );

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" /></div>;

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Palette className="w-4 h-4 text-yellow-400" />
          <p className="text-sm font-bold text-foreground">Brand Kit</p>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Store your company identity here. PABLO uses this to help you pitch, write content, and stay on-brand.
          Great for startups, freelancers, and anyone building something new.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('companyName', 'Company / Project Name', 'e.g. Salaryman by Picasso AI')}
            {field('industry', 'Industry', 'e.g. AI, SaaS, Creative Agency')}
          </div>
          {field('tagline', 'Tagline', 'One sentence that says it all')}
          {field('mission', 'Mission Statement', 'What problem are you solving and for whom?', true)}
          {field('targetAudience', 'Target Audience', 'Who are your users or customers?', true)}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('website', 'Website', 'https://...')}
            {field('logoUrl', 'Logo URL', 'https://... (link to your logo image)')}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={kit.primaryColor ?? '#6366f1'} onChange={e => setKit(prev => ({ ...prev, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-xl border border-border bg-transparent cursor-pointer p-1" />
                <input value={kit.primaryColor ?? '#6366f1'} onChange={e => setKit(prev => ({ ...prev, primaryColor: e.target.value }))}
                  className="flex-1 bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={kit.secondaryColor ?? '#8b5cf6'} onChange={e => setKit(prev => ({ ...prev, secondaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-xl border border-border bg-transparent cursor-pointer p-1" />
                <input value={kit.secondaryColor ?? '#8b5cf6'} onChange={e => setKit(prev => ({ ...prev, secondaryColor: e.target.value }))}
                  className="flex-1 bg-muted/20 border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 font-mono" />
              </div>
            </div>
          </div>

          {kit.logoUrl && (
            <div className="p-4 bg-muted/20 border border-border rounded-xl flex items-center gap-4">
              <img src={kit.logoUrl} alt="Logo preview" className="w-12 h-12 rounded-xl object-contain border border-border bg-muted/30" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div>
                <p className="text-xs font-semibold text-foreground">{kit.companyName || 'Your Company'}</p>
                {kit.tagline && <p className="text-xs text-muted-foreground">{kit.tagline}</p>}
              </div>
              <div className="ml-auto flex gap-2">
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: kit.primaryColor ?? '#6366f1' }} />
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: kit.secondaryColor ?? '#8b5cf6' }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/25 text-yellow-300 text-sm font-semibold hover:bg-yellow-500/25 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Brand Kit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD PAGE ───────────────────────────────────────────────────────

type Tab = 'projects' | 'knowledge' | 'creative';

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  usePlan();
  const [tab, setTab] = useState<Tab>('projects');
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const tabs: { id: Tab; label: string; boomerLabel: string; icon: React.FC<any> }[] = [
    { id: 'projects',  label: 'Projects',       boomerLabel: 'PROJECTS',       icon: FolderOpen },
    { id: 'knowledge', label: 'Knowledge Base',  boomerLabel: 'MY NOTES',       icon: BookOpen   },
    { id: 'creative',  label: 'Creative Kit',    boomerLabel: 'BRAND SETTINGS', icon: Palette    },
  ];

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access your workspace." />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full relative z-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'My Workspace' : PABLO_PRODUCTS.WORKSPACE.short}</h2>
            <p className="text-sm text-muted-foreground">{boomerMode ? 'Projects, notes, and brand settings — all in one place' : 'Projects, knowledge base, and brand kit — all in one place'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/20 border border-border rounded-xl p-1 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-card text-foreground border border-border shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{boomerMode ? t.boomerLabel : t.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {tab === 'projects'  && <ProjectsTab />}
            {tab === 'knowledge' && <KnowledgeTab />}
            {tab === 'creative'  && <CreativeTab />}
          </motion.div>
        </AnimatePresence>

      </main>
    </div>
  );
}
