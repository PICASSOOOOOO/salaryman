import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Plus, X, Trash2, Loader2, Pin, Edit2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface Announcement {
  id: number;
  authorName: string;
  title: string;
  content: string;
  category: string;
  pinned: boolean;
  createdAt: string;
}

const CATEGORIES = ['general', 'policy', 'event', 'hr', 'product', 'urgent'] as const;
const CAT_COLORS: Record<string, string> = {
  general: 'bg-zinc-500/15 text-zinc-400',
  policy: 'bg-sky-500/15 text-sky-400',
  event: 'bg-violet-500/15 text-violet-400',
  hr: 'bg-emerald-500/15 text-emerald-400',
  product: 'bg-amber-500/15 text-amber-400',
  urgent: 'bg-red-500/15 text-red-400',
};

const EMPTY = { title: '', content: '', category: 'general', pinned: false, authorName: '' };

export default function Announcements() {
  const { isAuthenticated, user } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Announcement | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/business/announcements');
      if (r.ok) { const d = await r.json(); setAnnouncements(d.announcements); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openForm = (item?: Announcement) => {
    if (item) {
      setEditItem(item);
      setForm({ title: item.title, content: item.content, category: item.category, pinned: item.pinned, authorName: item.authorName });
    } else {
      setEditItem(null);
      setForm({ ...EMPTY, authorName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Anonymous' : '' });
    }
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/business/announcements/${editItem.id}` : '/api/business/announcements';
      const method = editItem ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchData(); }
    } finally { setSaving(false); }
  };

  const togglePin = async (item: Announcement) => {
    await apiFetch(`/api/business/announcements/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !item.pinned }),
    });
    fetchData();
  };

  const del = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    await apiFetch(`/api/business/announcements/${id}`, { method: 'DELETE' });
    fetchData();
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view announcements." />;

  const timeAgo = (d: string) => {
    const ms = Date.now() - new Date(d).getTime();
    const h = Math.floor(ms / 3600000);
    if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-3xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-rose-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Announcements' : 'BROADCAST — ANNOUNCEMENTS'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Company-wide updates and announcements.' : 'COMPANY-WIDE UPDATES, POLICY CHANGES, AND TEAM BROADCASTS.'}
            </p>
          </div>
          <button onClick={() => openForm()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold hover:bg-primary/20 transition-colors shrink-0">
            <Plus className="w-4 h-4" /> POST
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
            <Megaphone className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{boomerMode ? 'No announcements yet.' : 'NO BROADCASTS IN QUEUE.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => (
              <div key={a.id} className={`rounded-xl border ${a.pinned ? 'border-amber-500/30 bg-amber-500/[0.02]' : 'border-zinc-800 bg-white/[0.015]'} p-5 hover:border-rose-500/20 transition-colors group`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                      <h3 className="text-sm font-bold text-foreground">{a.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${CAT_COLORS[a.category] || CAT_COLORS.general}`}>
                        {a.category.toUpperCase()}
                      </span>
                    </div>
                    {a.content && <p className="text-xs text-zinc-400 whitespace-pre-wrap mb-2">{a.content}</p>}
                    <div className="text-[10px] text-zinc-600 font-mono">
                      {a.authorName && `Posted by ${a.authorName} · `}{timeAgo(a.createdAt)}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => togglePin(a)} className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${a.pinned ? 'border-amber-500/30 text-amber-400' : 'border-zinc-700 text-zinc-600 hover:text-amber-400'}`}>
                      <Pin className="w-3 h-3" />
                    </button>
                    <button onClick={() => openForm(a)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-rose-400 transition-colors">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => del(a.id)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors">
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
                  <h3 className="text-lg font-bold text-foreground">{editItem ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">TITLE</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title"
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CONTENT</label>
                    <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} placeholder="What's the update?"
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CATEGORY</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">AUTHOR</label>
                      <input value={form.authorName} onChange={e => setForm(f => ({ ...f, authorName: e.target.value }))} placeholder="Your name"
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="rounded border-border bg-muted/30" />
                    <span className="text-xs text-muted-foreground">PIN TO TOP</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                  <button onClick={save} disabled={saving || !form.title.trim()}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editItem ? 'UPDATE' : 'POST'}
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
