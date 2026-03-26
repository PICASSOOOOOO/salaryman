import { useState } from 'react';
import { X, Bug, Loader2, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@workspace/replit-auth-web';

const CATEGORIES = ["Bug", "UI Issue", "Feature Request", "Performance", "Other"] as const;
type Category = typeof CATEGORIES[number];

interface Props {
  onClose: () => void;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'Bug' as Category,
  screenshotUrl: '',
};

export function FeedbackModal({ onClose }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { setError('Please enter a title.'); return; }
    if (!form.description.trim()) { setError('Please enter a description.'); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: form.category,
          screenshotUrl: form.screenshotUrl || undefined,
          appVersion: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit');
      }
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md bg-[#0f0f11] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <Bug className="w-4 h-4 text-sky-400" />
            <span className="font-mono text-sm text-zinc-100 tracking-widest uppercase">Report an Issue</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded-md hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-12">
            <CheckCircle2 className="w-10 h-10 text-sky-400" />
            <p className="font-mono text-sm text-zinc-200 text-center tracking-wide">
              Report submitted. Thanks for the feedback.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/15 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            {user && (
              <p className="font-mono text-[10px] text-zinc-600 tracking-wide">
                Submitting as {user.firstName ?? user.email ?? 'you'}
              </p>
            )}

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Title *</label>
              <input
                value={form.title}
                onChange={e => set('title')(e.target.value)}
                placeholder="Short summary of the issue"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/30 transition-colors"
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Category</label>
              <select
                value={form.category}
                onChange={e => set('category')(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 outline-none focus:border-sky-500/30 transition-colors"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Description *</label>
              <textarea
                value={form.description}
                onChange={e => set('description')(e.target.value)}
                placeholder="Describe what happened and steps to reproduce..."
                rows={4}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/30 transition-colors resize-none"
              />
            </div>

            {/* Screenshot URL */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Screenshot URL (optional)</label>
              <input
                value={form.screenshotUrl}
                onChange={e => set('screenshotUrl')(e.target.value)}
                placeholder="https://..."
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/30 transition-colors"
              />
            </div>

            {error && (
              <p className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? 'Submitting...' : 'Submit Report'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
