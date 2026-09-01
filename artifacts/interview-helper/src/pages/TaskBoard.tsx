import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Plus, X, Trash2, Loader2, Check, Edit2,
  Flag, User, Calendar, Tag,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  dueDate: string | null;
  project: string;
  tags: string;
  completedAt: string | null;
  createdAt: string;
}

const STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
const STATUS_LABELS: Record<string, string> = { todo: 'TO DO', in_progress: 'IN PROGRESS', review: 'REVIEW', done: 'DONE' };
const STATUS_COLORS: Record<string, string> = {
  todo: 'border-zinc-600 bg-zinc-800/30',
  in_progress: 'border-sky-500/30 bg-sky-500/[0.05]',
  review: 'border-amber-500/30 bg-amber-500/[0.05]',
  done: 'border-emerald-500/30 bg-emerald-500/[0.05]',
};
const STATUS_DOT: Record<string, string> = { todo: 'bg-zinc-500', in_progress: 'bg-sky-400', review: 'bg-amber-400', done: 'bg-emerald-400' };
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const PRIORITY_COLORS: Record<string, string> = { low: 'text-zinc-500', medium: 'text-sky-400', high: 'text-amber-400', urgent: 'text-red-400' };

const EMPTY = { title: '', description: '', status: 'todo', priority: 'medium', assignee: '', dueDate: '', project: '', tags: '' };

function Field({ label, value, onChange, type = 'text', placeholder, textarea, options }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; textarea?: boolean; options?: { value: string; label: string }[];
}) {
  const cls = "bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors w-full";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls + " bg-muted/30"}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className={cls + " resize-none"} placeholder={placeholder} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} placeholder={placeholder} />
      )}
    </div>
  );
}

export default function TaskBoard() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'board' | 'list'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'list';
    return 'board';
  });

  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/business/tasks');
      if (r.ok) { const d = await r.json(); setTasks(d.tasks); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const openForm = (task?: Task) => {
    if (task) {
      setEditTask(task);
      setForm({ title: task.title, description: task.description, status: task.status, priority: task.priority, assignee: task.assignee, dueDate: task.dueDate || '', project: task.project, tags: task.tags });
    } else {
      setEditTask(null);
      setForm(EMPTY);
    }
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const url = editTask ? `/api/business/tasks/${editTask.id}` : '/api/business/tasks';
      const method = editTask ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchTasks(); }
    } finally { setSaving(false); }
  };

  const moveTask = async (id: number, status: string) => {
    await apiFetch(`/api/business/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    fetchTasks();
  };

  const del = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await apiFetch(`/api/business/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage tasks." />;

  const byStatus = (s: string) => tasks.filter(t => t.status === s);
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== 'done');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Task Board' : 'TASK COMMAND — OPS BOARD'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Manage tasks, assignments, and deadlines.' : 'TASK ASSIGNMENTS, PRIORITIES, DEADLINES, STATUS TRACKING.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setView('board')} className={`px-3 py-1.5 text-xs font-bold ${view === 'board' ? 'bg-violet-500/15 text-violet-400' : 'text-muted-foreground'}`}>BOARD</button>
              <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs font-bold ${view === 'list' ? 'bg-violet-500/15 text-violet-400' : 'text-muted-foreground'}`}>LIST</button>
            </div>
            <button onClick={() => openForm()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold hover:bg-primary/20 transition-colors shrink-0">
              <Plus className="w-4 h-4" /> NEW TASK
            </button>
          </div>
        </div>

        {overdue.length > 0 && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3 mb-4 flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-red-400">{overdue.length} OVERDUE TASK{overdue.length > 1 ? 'S' : ''}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : view === 'board' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map(s => (
              <div key={s} className="space-y-2">
                <div className={`rounded-lg border p-3 ${STATUS_COLORS[s]}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                    <span className="text-[10px] font-bold text-foreground tracking-wider">{STATUS_LABELS[s]}</span>
                    <span className="ml-auto text-[10px] text-zinc-600 font-mono">{byStatus(s).length}</span>
                  </div>
                </div>
                {byStatus(s).map(t => (
                  <div key={t.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-3 hover:border-violet-500/20 transition-colors group">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-bold text-foreground leading-tight">{t.title}</span>
                      <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openForm(t)} className="text-zinc-600 hover:text-violet-400"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => del(t.id)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {t.description && <p className="text-[10px] text-zinc-500 mb-2 line-clamp-2">{t.description}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-bold ${PRIORITY_COLORS[t.priority]}`}>{t.priority.toUpperCase()}</span>
                      {t.assignee && <span className="text-[9px] text-zinc-500 flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{t.assignee}</span>}
                      {t.dueDate && <span className={`text-[9px] flex items-center gap-0.5 ${t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== 'done' ? 'text-red-400' : 'text-zinc-600'}`}><Calendar className="w-2.5 h-2.5" />{t.dueDate}</span>}
                      {t.project && <span className="text-[9px] text-sky-400">{t.project}</span>}
                    </div>
                    {t.status !== 'done' && (
                      <div className="flex gap-1 mt-2 pt-2 border-t border-zinc-800/50">
                        {STATUSES.filter(ns => ns !== t.status).map(ns => (
                          <button key={ns} onClick={() => moveTask(t.id, ns)} className="text-[8px] font-mono text-zinc-600 hover:text-violet-400 transition-colors">
                            → {STATUS_LABELS[ns]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
                <ClipboardList className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">No tasks yet.</p>
              </div>
            ) : tasks.map(t => (
              <div key={t.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-4 flex items-center gap-4 hover:border-violet-500/20 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground">{t.title}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{STATUS_LABELS[t.status]} · {t.priority} {t.assignee && `· ${t.assignee}`} {t.dueDate && `· Due ${t.dueDate}`}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openForm(t)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-violet-400 transition-colors"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => del(t.id)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">{editTask ? 'EDIT TASK' : 'NEW TASK'}</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  <Field label="TITLE" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="What needs to be done?" />
                  <Field label="DESCRIPTION" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} textarea placeholder="Details..." />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="STATUS" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} />
                    <Field label="PRIORITY" value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITIES.map(p => ({ value: p, label: p.toUpperCase() }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ASSIGNEE" value={form.assignee} onChange={v => setForm(f => ({ ...f, assignee: v }))} placeholder="Who?" />
                    <Field label="DUE DATE" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} type="date" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="PROJECT" value={form.project} onChange={v => setForm(f => ({ ...f, project: v }))} placeholder="Project name" />
                    <Field label="TAGS" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder="Comma separated" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                  <button onClick={save} disabled={saving || !form.title.trim()}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editTask ? 'UPDATE' : 'CREATE'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
