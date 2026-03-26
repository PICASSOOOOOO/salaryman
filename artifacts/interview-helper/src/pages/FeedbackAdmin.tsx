import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Bug, Loader2, RefreshCw, ChevronDown } from 'lucide-react';

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
  updatedAt: string;
}

const CATEGORIES = ["all", "Bug", "UI Issue", "Feature Request", "Performance", "Other"];
const STATUSES = ["all", "open", "acknowledged", "resolved"];

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-500/15 text-red-400 border-red-500/25',
  acknowledged: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  resolved: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
};

const CATEGORY_STYLES: Record<string, string> = {
  Bug: 'bg-red-500/10 text-red-300 border-red-500/20',
  'UI Issue': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  'Feature Request': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  Performance: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  Other: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export default function FeedbackAdmin() {
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      params.set('limit', '100');
      const res = await apiFetch(`/api/feedback?${params.toString()}`, { credentials: 'include' });
      if (res.status === 403) { setAccessDenied(true); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      const res = await apiFetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bug className="w-5 h-5 text-sky-400" />
            <div>
              <h1 className="font-mono text-lg text-zinc-100 tracking-widest uppercase">Feedback Reports</h1>
              <p className="font-mono text-[10px] text-zinc-600 tracking-wide">{total} total submissions</p>
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
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Category</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[9px] text-zinc-600 tracking-widest uppercase">Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 outline-none"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        {accessDenied ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Bug className="w-8 h-8 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">Admin access required.</p>
            <p className="font-mono text-[10px] text-zinc-700">Only dev team members can view feedback reports.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20">
            <Bug className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="font-mono text-sm text-zinc-600">No reports found.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map(r => (
              <div key={r.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
                {/* Row */}
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${CATEGORY_STYLES[r.category] ?? CATEGORY_STYLES.Other}`}>
                        {r.category}
                      </span>
                      <span className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_STYLES[r.status] ?? 'bg-zinc-500/10 text-zinc-400'}`}>
                        {r.status}
                      </span>
                      {r.appVersion && (
                        <span className="font-mono text-[9px] text-zinc-700">v{r.appVersion}</span>
                      )}
                    </div>
                    <p className="font-mono text-sm text-zinc-200 truncate">{r.title}</p>
                    <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{fmt(r.createdAt)}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-600 shrink-0 mt-1 transition-transform ${expandedId === r.id ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded details */}
                {expandedId === r.id && (
                  <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 flex flex-col gap-3">
                    {r.userId && (
                      <div>
                        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">User ID</span>
                        <p className="font-mono text-[11px] text-zinc-400 mt-0.5 break-all">{r.userId}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Description</span>
                      <p className="font-mono text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{r.description}</p>
                    </div>
                    {r.screenshotUrl && (() => {
                      let safeUrl: string | null = null;
                      try {
                        const parsed = new URL(r.screenshotUrl);
                        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                          safeUrl = parsed.href;
                        }
                      } catch { /* ignore */ }
                      return (
                        <div>
                          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Screenshot</span>
                          {safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block font-mono text-[11px] text-sky-400 hover:underline mt-0.5 break-all"
                            >
                              {safeUrl}
                            </a>
                          ) : (
                            <p className="font-mono text-[11px] text-zinc-600 mt-0.5 break-all">{r.screenshotUrl}</p>
                          )}
                        </div>
                      );
                    })()}
                    {/* Status update */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Update Status:</span>
                      {["open", "acknowledged", "resolved"].map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(r.id, s)}
                          disabled={r.status === s || updatingId === r.id}
                          className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            r.status === s
                              ? STATUS_STYLES[s]
                              : 'text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                      {updatingId === r.id && <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
