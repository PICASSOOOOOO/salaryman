import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Plus, X, Trash2, Loader2, Check, Play, Square,
  Calendar, DollarSign, Timer, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface TimeEntry {
  id: number;
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  hoursWorked: string;
  hourlyRate: string;
  project: string;
  description: string;
  billable: boolean;
  status: string;
}

const EMPTY = { employeeName: '', date: new Date().toISOString().slice(0, 10), clockIn: '', clockOut: '', hoursWorked: '', hourlyRate: '', project: '', description: '', billable: true };

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
    </div>
  );
}

function calcHours(clockIn: string, clockOut: string): string {
  if (!clockIn || !clockOut) return '0';
  const [h1, m1] = clockIn.split(':').map(Number);
  const [h2, m2] = clockOut.split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 ? (diff / 60).toFixed(2) : '0';
}

function fmt$(v: string | number) {
  const n = Number(v);
  return isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
}

export default function TimeTracking() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const fetchEntries = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/business/time-entries');
      if (r.ok) { const d = await r.json(); setEntries(d.entries); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const save = async () => {
    if (!form.employeeName.trim() || !form.clockIn) return;
    setSaving(true);
    const hours = form.clockOut ? calcHours(form.clockIn, form.clockOut) : '0';
    try {
      const r = await apiFetch('/api/business/time-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hoursWorked: hours }),
      });
      if (r.ok) { setShowForm(false); setForm(EMPTY); fetchEntries(); }
    } finally { setSaving(false); }
  };

  const clockOut = async (entry: TimeEntry) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const hours = calcHours(entry.clockIn, time);
    await apiFetch(`/api/business/time-entries/${entry.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clockOut: time, hoursWorked: hours, status: 'completed' }),
    });
    fetchEntries();
  };

  const del = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    await apiFetch(`/api/business/time-entries/${id}`, { method: 'DELETE' });
    fetchEntries();
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to track time." />;

  const filtered = entries.filter(e => filter === 'all' || e.status === filter);
  const totalHours = filtered.reduce((s, e) => s + Number(e.hoursWorked), 0);
  const totalBillable = filtered.filter(e => e.billable).reduce((s, e) => s + Number(e.hoursWorked) * Number(e.hourlyRate), 0);
  const activeCount = entries.filter(e => e.status === 'active').length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Time Tracking' : 'CHRONOS — TIME TRACKER'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Track hours, timesheets, and billable time.' : 'CLOCK IN/OUT, TIMESHEETS, BILLABLE HOURS, RATE TRACKING.'}
            </p>
          </div>
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold hover:bg-primary/20 transition-colors shrink-0">
            <Plus className="w-4 h-4" /> LOG TIME
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL HOURS</div>
            <div className="text-2xl font-bold text-cyan-400">{totalHours.toFixed(1)}h</div>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">BILLABLE AMOUNT</div>
            <div className="text-2xl font-bold text-green-400">{fmt$(totalBillable)}</div>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">ACTIVE CLOCKS</div>
            <div className="text-2xl font-bold text-amber-400">{activeCount}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {(['all', 'active', 'completed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter === f ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' : 'bg-card text-muted-foreground border-border hover:border-cyan-500/20'}`}>
              {f.toUpperCase()}
            </button>
          ))}
          <span className="ml-auto text-[10px] font-mono text-zinc-600">{filtered.length} ENTRIES</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
            <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{boomerMode ? 'No time entries yet.' : 'NO TIME RECORDS IN CHRONOS.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(e => (
              <div key={e.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-4 hover:border-cyan-500/20 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${e.status === 'active' ? 'bg-green-500/15 border border-green-500/30' : 'bg-zinc-800/50 border border-zinc-700'}`}>
                    {e.status === 'active' ? <Play className="w-3.5 h-3.5 text-green-400" /> : <Check className="w-3.5 h-3.5 text-zinc-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-foreground">{e.employeeName}</span>
                      {e.project && <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-sky-500/15 text-sky-400">{e.project}</span>}
                      {e.billable && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-green-500/15 text-green-400">$</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {e.date} · {e.clockIn}{e.clockOut ? ` → ${e.clockOut}` : ' → IN PROGRESS'}
                      {e.description && ` · ${e.description}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-cyan-400">{Number(e.hoursWorked).toFixed(1)}h</div>
                    {e.billable && Number(e.hourlyRate) > 0 && (
                      <div className="text-[10px] text-green-400 font-mono">{fmt$(Number(e.hoursWorked) * Number(e.hourlyRate))}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {e.status === 'active' && (
                      <button onClick={() => clockOut(e)} className="w-7 h-7 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors">
                        <Square className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => del(e.id)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:border-red-500/30 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
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
                  <h3 className="text-lg font-bold text-foreground">LOG TIME</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  <Field label="EMPLOYEE NAME" value={form.employeeName} onChange={v => setForm(f => ({ ...f, employeeName: v }))} placeholder="Who worked?" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="DATE" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} type="date" />
                    <Field label="CLOCK IN" value={form.clockIn} onChange={v => setForm(f => ({ ...f, clockIn: v }))} type="time" />
                    <Field label="CLOCK OUT" value={form.clockOut} onChange={v => setForm(f => ({ ...f, clockOut: v }))} type="time" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="HOURLY RATE ($)" value={form.hourlyRate} onChange={v => setForm(f => ({ ...f, hourlyRate: v }))} type="number" />
                    <Field label="PROJECT" value={form.project} onChange={v => setForm(f => ({ ...f, project: v }))} placeholder="Project name" />
                  </div>
                  <Field label="DESCRIPTION" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="What was done?" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))}
                      className="rounded border-border bg-muted/30" />
                    <span className="text-xs text-muted-foreground">BILLABLE</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                  <button onClick={save} disabled={saving || !form.employeeName.trim() || !form.clockIn}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SAVE'}
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
