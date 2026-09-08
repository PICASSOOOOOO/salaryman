import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, X, Trash2, Edit2, Loader2, Check, ChevronDown, ChevronUp, Flag,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

interface Milestone {
  id: number;
  goalId: number;
  text: string;
  completed: boolean;
  completedAt: string | null;
  sortOrder: number;
}

interface Goal {
  id: number;
  title: string;
  description: string;
  period: string;
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  deadline: string | null;
  status: string;
  createdAt: string;
  milestones?: Milestone[];
}

const PERIODS = ['Monthly', 'Quarterly', 'Yearly', 'Custom'] as const;
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  paused: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  abandoned: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const EMPTY_FORM = {
  title: '', description: '', period: 'Quarterly', targetMetric: '',
  currentValue: '0', targetValue: '100', unit: '%', deadline: '',
};

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors w-full" />
    </div>
  );
}

export default function Goals() {
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [milestoneInputs, setMilestoneInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadGoals = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await apiFetch('/api/tools/goals');
      if (res.ok) { const d = await res.json(); setGoals(d.goals ?? []); }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage your goals.' : 'Salaryman credentials required. OBJECTIVE TRACKER access locked.'} />;
  }

  const loadMilestones = async (goalId: number) => {
    const existing = goals.find(g => g.id === goalId);
    if (existing?.milestones) return;
    try {
      const res = await apiFetch(`/api/tools/goals/${goalId}/milestones`);
      if (res.ok) {
        const d = await res.json();
        setGoals(prev => prev.map(g => g.id === goalId ? { ...g, milestones: d.milestones ?? [] } : g));
      }
    } catch {}
  };

  const handleExpand = (id: number) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) loadMilestones(next);
  };

  const handleSave = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description,
        period: form.period,
        targetMetric: form.targetMetric,
        currentValue: Number(form.currentValue) || 0,
        targetValue: Number(form.targetValue) || 100,
        unit: form.unit,
        deadline: form.deadline || null,
      };
      const url = editingId ? `/api/tools/goals/${editingId}` : '/api/tools/goals';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        if (editingId) {
          setGoals(prev => prev.map(g => g.id === editingId ? { ...g, ...data.goal } : g));
        } else {
          setGoals(prev => [data.goal, ...prev]);
        }
        setForm({ ...EMPTY_FORM });
        setShowForm(false);
        setEditingId(null);
      }
    } catch {}
    setSaving(false);
  };

  const handleEdit = (goal: Goal) => {
    setForm({
      title: goal.title,
      description: goal.description,
      period: goal.period,
      targetMetric: goal.targetMetric,
      currentValue: String(goal.currentValue),
      targetValue: String(goal.targetValue),
      unit: goal.unit,
      deadline: goal.deadline ?? '',
    });
    setEditingId(goal.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await apiFetch(`/api/tools/goals/${id}`, { method: 'DELETE' });
      if (res.ok) setGoals(prev => prev.filter(g => g.id !== id));
    } catch {}
  };

  const handleUpdateProgress = async (goal: Goal, value: number) => {
    try {
      const res = await apiFetch(`/api/tools/goals/${goal.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, ...data.goal } : g));
      }
    } catch {}
  };

  const handleAddMilestone = async (goalId: number) => {
    const text = milestoneInputs[goalId]?.trim();
    if (!text) return;
    try {
      const res = await apiFetch(`/api/tools/goals/${goalId}/milestones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(prev => prev.map(g => g.id === goalId ? { ...g, milestones: [...(g.milestones ?? []), data.milestone] } : g));
        setMilestoneInputs(prev => ({ ...prev, [goalId]: '' }));
      }
    } catch {}
  };

  const handleToggleMilestone = async (goalId: number, milestone: Milestone) => {
    try {
      const res = await apiFetch(`/api/tools/goals/milestones/${milestone.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !milestone.completed }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoals(prev => prev.map(g => g.id === goalId ? {
          ...g,
          milestones: (g.milestones ?? []).map(m => m.id === milestone.id ? data.milestone : m),
        } : g));
      }
    } catch {}
  };

  const handleDeleteMilestone = async (goalId: number, milestoneId: number) => {
    try {
      const res = await apiFetch(`/api/tools/goals/milestones/${milestoneId}`, { method: 'DELETE' });
      if (res.ok) setGoals(prev => prev.map(g => g.id === goalId ? {
        ...g, milestones: (g.milestones ?? []).filter(m => m.id !== milestoneId),
      } : g));
    } catch {}
  };

  const f = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const getProgress = (goal: Goal) => {
    if (goal.targetValue === 0) return 0;
    return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Goals' : 'OBJECTIVE-7'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Track business goals with progress bars and milestones.' : 'Mission objective tracker. Set targets, log progress, mark milestones complete.'}
            </p>
          </div>
          {isAuthenticated && (
            <button
              onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(v => !v); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Goal
            </button>
          )}
        </div>

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-foreground">{editingId ? 'Edit Goal' : 'New Goal'}</h3>
                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="sm:col-span-2">
                  <Field label="Goal Title *" value={form.title} onChange={f('title')} placeholder="e.g. Reach $100K ARR" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Period</label>
                  <select value={form.period} onChange={e => f('period')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    {PERIODS.map(p => <option key={p} value={p} className="bg-card">{p}</option>)}
                  </select>
                </div>
                <Field label="Deadline" value={form.deadline} onChange={f('deadline')} type="date" />
                <Field label="Target Metric" value={form.targetMetric} onChange={f('targetMetric')} placeholder="e.g. ARR, customers, units sold" />
                <Field label="Unit" value={form.unit} onChange={f('unit')} placeholder="e.g. $, %, users" />
                <Field label="Current Value" value={form.currentValue} onChange={f('currentValue')} type="number" placeholder="0" />
                <Field label="Target Value" value={form.targetValue} onChange={f('targetValue')} type="number" placeholder="100" />
                <div className="sm:col-span-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                    <textarea value={form.description} onChange={e => f('description')(e.target.value)} rows={2} placeholder="Additional context or strategy..."
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={!form.title.trim() || saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingId ? 'Update Goal' : 'Create Goal'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isAuthenticated && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <Target className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">Sign in to track your goals</p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && isAuthenticated && goals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <Target className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">No goals yet — create your first one above</p>
          </div>
        )}

        {!loading && isAuthenticated && (
          <div className="space-y-4">
            {goals.map(goal => {
              const progress = getProgress(goal);
              const isExpanded = expandedId === goal.id;
              const milestones = goal.milestones ?? [];
              const completedMilestones = milestones.filter(m => m.completed).length;
              return (
                <motion.div key={goal.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all">
                  <div
                    className="px-5 py-4 cursor-pointer hover:bg-muted/10 transition-colors"
                    onClick={() => handleExpand(goal.id)}
                  >
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                          <Target className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{goal.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[goal.status] ?? STATUS_COLORS.active}`}>
                              {goal.status}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{goal.period}</span>
                            {goal.deadline && <span className="text-[10px] text-muted-foreground">· {goal.deadline}</span>}
                            {milestones.length > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Flag className="w-2.5 h-2.5" /> {completedMilestones}/{milestones.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={e => { e.stopPropagation(); handleEdit(goal); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(goal.id); }}
                          className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            progress >= 100 ? 'bg-sky-500' : progress >= 60 ? 'bg-primary' : progress >= 30 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-foreground shrink-0 w-12 text-right">
                        {progress}%
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {goal.currentValue}{goal.unit} / {goal.targetValue}{goal.unit}
                      </span>
                    </div>
                  </div>

                  {/* Expanded: milestones + progress update */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-border">
                        <div className="px-5 py-4 space-y-4">
                          {/* Update progress */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Update Progress</p>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                defaultValue={goal.currentValue}
                                key={goal.id}
                                onBlur={e => handleUpdateProgress(goal, Number(e.target.value))}
                                className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground w-28 outline-none focus:border-primary/50 transition-colors"
                                placeholder="Current value"
                              />
                              <span className="text-sm text-muted-foreground self-center">/ {goal.targetValue} {goal.unit}</span>
                            </div>
                          </div>

                          {/* Description */}
                          {goal.description && (
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                              <p className="text-sm text-muted-foreground">{goal.description}</p>
                            </div>
                          )}

                          {/* Milestones */}
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                              Milestones {milestones.length > 0 ? `(${completedMilestones}/${milestones.length})` : ''}
                            </p>
                            <div className="space-y-1.5 mb-3">
                              {milestones.map(m => (
                                <div key={m.id} className="flex items-center gap-2 group/m">
                                  <button onClick={() => handleToggleMilestone(goal.id, m)}
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      m.completed
                                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                                        : 'border-border hover:border-primary/50'
                                    }`}>
                                    {m.completed && <Check className="w-2.5 h-2.5" />}
                                  </button>
                                  <span className={`text-sm flex-1 ${m.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                    {m.text}
                                  </span>
                                  <button onClick={() => handleDeleteMilestone(goal.id, m.id)}
                                    className="opacity-0 group-hover/m:opacity-100 p-0.5 text-muted-foreground hover:text-red-400 transition-all">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={milestoneInputs[goal.id] ?? ''}
                                onChange={e => setMilestoneInputs(prev => ({ ...prev, [goal.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddMilestone(goal.id); }}
                                placeholder="Add a milestone..."
                                className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
                              />
                              <button onClick={() => handleAddMilestone(goal.id)}
                                className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm hover:bg-primary/30 transition-colors">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
