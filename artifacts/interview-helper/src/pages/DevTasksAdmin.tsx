import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { AlertTriangle, Loader2, RefreshCw, ClipboardList, ArrowUpCircle, ChevronDown } from 'lucide-react';

interface FeedbackReport {
  id: number;
  userId: string | null;
  title: string;
  description: string;
  category: string;
  screenshotUrl: string | null;
  status: string;
  appVersion: string | null;
  createdAt: string;
}

interface DevTask {
  id: number;
  feedbackReportId: number;
  title: string;
  priority: string;
  status: string;
  assignedToUserId: string | null;
  escalated: boolean;
  escalatedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  feedbackReport: FeedbackReport | null;
}

interface DevTaskNote {
  id: number;
  devTaskId: number;
  userId: string;
  body: string;
  createdAt: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  medium: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  critical: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-green-500/10 text-green-400 border-green-500/20',
  verified: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const CATEGORY_STYLES: Record<string, string> = {
  Bug: 'bg-red-500/10 text-red-300 border-red-500/20',
  'UI Issue': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  'Feature Request': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  Performance: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  Other: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const PRIORITIES = ['all', 'low', 'medium', 'high', 'critical'];
const STATUSES = ['all', 'open', 'in_progress', 'resolved', 'verified'];

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function TaskDetail({
  task,
  currentUserId,
  onUpdate,
  onBack,
}: {
  task: DevTask;
  currentUserId: string;
  onUpdate: (updated: DevTask) => void;
  onBack: () => void;
}) {
  const [localTask, setLocalTask] = useState(task);
  const [notes, setNotes] = useState<DevTaskNote[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [msg, setMsg] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);

  useEffect(() => {
    apiFetch(`/api/dev-tasks/${task.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.notes) setNotes(d.notes);
        if (d.task) setLocalTask(d.task);
      })
      .catch(console.error)
      .finally(() => setLoadingNotes(false));
  }, [task.id]);

  const patch = async (updates: Record<string, unknown>) => {
    setUpdating(true);
    try {
      const r = await apiFetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.task) {
        setLocalTask(d.task);
        onUpdate(d.task);
        setMsg('Updated.');
        setTimeout(() => setMsg(''), 2000);
      } else {
        setMsg(d.error ?? 'Error updating task');
      }
    } catch {
      setMsg('Network error');
    }
    setUpdating(false);
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setPosting(true);
    try {
      const r = await apiFetch(`/api/dev-tasks/${task.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody.trim() }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.note) {
        setNotes(prev => [...prev, d.note]);
        setNoteBody('');
      } else {
        setMsg(d.error ?? 'Error adding note');
      }
    } catch {
      setMsg('Network error');
    }
    setPosting(false);
  };

  const escalate = async () => {
    if (localTask.escalated) return;
    if (!confirm('Escalate this task? This will notify the senior engineer and send an email.')) return;
    setEscalating(true);
    try {
      const r = await apiFetch(`/api/dev-tasks/${task.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const d = await r.json();
      if (d.task) {
        setLocalTask(d.task);
        onUpdate(d.task);
        setMsg('Task escalated — senior engineer notified.');
      } else {
        setMsg(d.error ?? 'Error escalating task');
      }
    } catch {
      setMsg('Network error');
    }
    setEscalating(false);
  };

  const fb = localTask.feedbackReport;

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="font-mono text-[10px] tracking-widest uppercase text-zinc-500 border border-white/[0.08] px-3 py-1.5 rounded-md hover:text-zinc-300 hover:bg-white/4 transition-colors mb-5"
      >
        ← Back to List
      </button>

      <div className="bg-white/[0.02] border border-white/[0.08] rounded-lg p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Task #{localTask.id}</span>
              <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${PRIORITY_STYLES[localTask.priority] ?? ''}`}>
                {localTask.priority}
              </span>
              <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[localTask.status] ?? ''}`}>
                {localTask.status.replace('_', ' ')}
              </span>
              {localTask.escalated && (
                <span className="font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider bg-red-500/15 text-red-400 border-red-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Escalated
                </span>
              )}
            </div>
            <h2 className="font-mono text-base text-zinc-100">{localTask.title}</h2>
            <p className="font-mono text-[10px] text-zinc-600 mt-1">{fmt(localTask.createdAt)}</p>
          </div>

          {!localTask.escalated && (
            <button
              onClick={escalate}
              disabled={escalating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase border border-red-500/30 text-red-400 bg-red-500/8 hover:bg-red-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              {escalating ? 'Escalating...' : 'Escalate'}
            </button>
          )}
        </div>

        {msg && (
          <div className="font-mono text-[11px] text-sky-400 bg-sky-500/8 border border-sky-500/20 rounded px-3 py-2 mb-4">
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest block mb-1">Status</label>
            <select
              value={localTask.status}
              onChange={e => patch({ status: e.target.value })}
              disabled={updating}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="verified">Verified</option>
            </select>
          </div>
          <div>
            <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest block mb-1">Priority</label>
            <select
              value={localTask.priority}
              onChange={e => patch({ priority: e.target.value })}
              disabled={updating}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest block mb-1">Assigned To</label>
            <input
              type="text"
              value={localTask.assignedToUserId ?? ''}
              onBlur={e => patch({ assignedToUserId: e.target.value || null })}
              onChange={e => setLocalTask(prev => ({ ...prev, assignedToUserId: e.target.value || null }))}
              placeholder="User ID"
              disabled={updating}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            />
          </div>
        </div>

        {/* Original bug report */}
        {fb && (
          <div className="border-t border-white/[0.06] pt-4 mt-2">
            <div className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-3">Original Bug Report</div>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${CATEGORY_STYLES[fb.category] ?? CATEGORY_STYLES.Other}`}>
                {fb.category}
              </span>
              {fb.appVersion && (
                <span className="font-mono text-[9px] text-zinc-700">v{fb.appVersion}</span>
              )}
              <span className="font-mono text-[9px] text-zinc-600">{fmt(fb.createdAt)}</span>
            </div>
            <p className="font-mono text-sm text-zinc-200 mb-2">{fb.title}</p>
            <p className="font-mono text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed">{fb.description}</p>
            {fb.screenshotUrl && (() => {
              let safeUrl: string | null = null;
              try {
                const parsed = new URL(fb.screenshotUrl);
                if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeUrl = parsed.href;
              } catch {}
              return safeUrl ? (
                <div className="mt-2">
                  <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Screenshot</span>
                  <a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-[11px] text-sky-400 hover:underline mt-0.5 break-all"
                  >
                    {safeUrl}
                  </a>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {/* Notes thread */}
      <div className="bg-white/[0.01] border border-white/[0.06] rounded-lg p-5">
        <div className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-4">Notes Thread</div>

        {loadingNotes ? (
          <Loader2 className="w-4 h-4 text-zinc-600 animate-spin mb-4" />
        ) : notes.length === 0 ? (
          <p className="font-mono text-[11px] text-zinc-700 mb-4">No notes yet.</p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {notes.map(n => (
              <div key={n.id} className="bg-white/[0.02] border border-white/[0.06] rounded p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[9px] text-zinc-500">
                    {n.userId === currentUserId ? 'YOU' : n.userId.slice(0, 8)}
                  </span>
                  <span className="font-mono text-[9px] text-zinc-700">{fmt(n.createdAt)}</span>
                </div>
                <p className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <textarea
            value={noteBody}
            onChange={e => setNoteBody(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 font-mono text-[11px] text-zinc-300 outline-none resize-y"
          />
          <button
            onClick={addNote}
            disabled={posting || !noteBody.trim()}
            className="self-start flex items-center gap-1.5 px-4 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase border border-sky-500/25 text-sky-400 bg-sky-500/8 hover:bg-sky-500/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting...' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DevTasksAdmin() {
  const { user, isAuthenticated } = useAuth();
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEscalated, setFilterEscalated] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [selectedTask, setSelectedTask] = useState<DevTask | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const params = new URLSearchParams();
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterEscalated) params.set('escalated', 'true');
      if (filterAssignee !== 'all') params.set('assignee', filterAssignee);
      const res = await apiFetch(`/api/dev-tasks?${params.toString()}`, { credentials: 'include' });
      if (res.status === 403) { setAccessDenied(true); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterPriority, filterStatus, filterEscalated, filterAssignee]);

  useEffect(() => { load(); }, [load]);

  const handleTaskUpdate = (updated: DevTask) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  };

  if (selectedTask && user) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-6">
        <TaskDetail
          task={selectedTask}
          currentUserId={user.id}
          onUpdate={handleTaskUpdate}
          onBack={() => setSelectedTask(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-sky-400" />
            <div>
              <h1 className="font-mono text-lg text-zinc-100 tracking-widest uppercase">Dev Tasks</h1>
              <p className="font-mono text-[10px] text-zinc-600 tracking-wide">{total} total tasks</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[11px] tracking-widest uppercase text-zinc-500 border border-white/[0.08] hover:text-zinc-300 hover:bg-white/4 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Priority</label>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p === 'all' ? 'All Priorities' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('_', ' ').charAt(0).toUpperCase() + s.replace('_', ' ').slice(1)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Assignee</label>
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              <option value="all">All Assignees</option>
              <option value="me">Assigned to Me</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Escalated</label>
            <button
              onClick={() => setFilterEscalated(!filterEscalated)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase border transition-colors ${
                filterEscalated
                  ? 'border-red-500/30 text-red-400 bg-red-500/10'
                  : 'border-white/[0.08] text-zinc-500 bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {filterEscalated ? 'Only Escalated' : 'Show All'}
            </button>
          </div>
        </div>

        {/* Table */}
        {accessDenied ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ClipboardList className="w-8 h-8 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">Admin access required.</p>
            <p className="font-mono text-[10px] text-zinc-700">Only admin members can view dev tasks.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardList className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="font-mono text-sm text-zinc-600">No dev tasks found.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map(t => (
              <div key={t.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => setSelectedTask(t)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${PRIORITY_STYLES[t.priority] ?? ''}`}>
                        {t.priority}
                      </span>
                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[t.status] ?? ''}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      {t.escalated && (
                        <span className="font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider bg-red-500/15 text-red-400 border-red-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Escalated
                        </span>
                      )}
                      {t.feedbackReport && (
                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${CATEGORY_STYLES[t.feedbackReport.category] ?? CATEGORY_STYLES.Other}`}>
                          {t.feedbackReport.category}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-sm text-zinc-200 truncate">{t.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="font-mono text-[10px] text-zinc-600">{fmt(t.createdAt)}</p>
                      {t.assignedToUserId && (
                        <p className="font-mono text-[10px] text-zinc-600">→ {t.assignedToUserId.slice(0, 10)}</p>
                      )}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0 mt-1" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
