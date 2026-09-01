import { useState } from 'react';
import { Link } from 'wouter';
import { X, Bug, MessageSquareText, Loader2, CheckCircle2, ShieldCheck, FlaskConical } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useAlpha } from '@/hooks/use-alpha';

const CATEGORIES = ["Bug", "UI Issue", "Feature Request", "Performance", "Other"] as const;
type Category = typeof CATEGORIES[number];
type Kind = "bug" | "feedback";

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
  const alpha = useAlpha();
  const canSubmitBugs = alpha.canSubmitBugs;
  const [kind, setKind] = useState<Kind>(canSubmitBugs ? "bug" : "feedback");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ kind: Kind } | null>(null);
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
          category: kind === "bug" ? form.category : "Other",
          kind,
          screenshotUrl: form.screenshotUrl || undefined,
          appVersion: typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit');
      }
      setSuccess({ kind });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const headerIcon = kind === "bug" ? Bug : MessageSquareText;
  const HeaderIcon = headerIcon;
  const accent = kind === "bug" ? "text-red-400" : "text-cyan-400";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md bg-[#0f0f11] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <HeaderIcon className={`w-4 h-4 ${accent}`} />
            <span className="font-mono text-sm text-zinc-100 tracking-widest uppercase">
              {kind === "bug" ? "Report a Bug" : "Send Feedback"}
            </span>
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
            <CheckCircle2 className={`w-10 h-10 ${success.kind === "bug" ? "text-red-400" : "text-cyan-400"}`} />
            <p className="font-mono text-sm text-zinc-200 text-center tracking-wide">
              {success.kind === "bug"
                ? "Bug filed. A dev task was created automatically."
                : "Feedback received. The team sees these as notes."}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Kind toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setKind("feedback")}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] tracking-widest uppercase transition-colors ${
                  kind === "feedback" ? "bg-cyan-500/15 text-cyan-300" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <MessageSquareText className="w-3 h-3" /> Feedback
              </button>
              <button
                type="button"
                onClick={() => setKind("bug")}
                disabled={!canSubmitBugs && !alpha.loading}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] tracking-widest uppercase transition-colors ${
                  kind === "bug"
                    ? "bg-red-500/15 text-red-300"
                    : canSubmitBugs
                      ? "text-zinc-500 hover:text-zinc-300"
                      : "text-zinc-700 cursor-not-allowed"
                }`}
                title={canSubmitBugs ? "" : "Approved alpha testers only"}
              >
                <Bug className="w-3 h-3" /> Bug Report
                {!canSubmitBugs && <span className="ml-1">·</span>}
              </button>
            </div>

            <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
              {kind === "bug"
                ? "Bugs auto-create dev tasks for the engineering team. Be specific — title, repro, what you expected vs what happened."
                : "Feedback is a note for the team — ideas, opinions, things you noticed. Anyone can send these."}
            </p>

            {!canSubmitBugs && !alpha.loading && (
              <div className="font-mono text-[10px] text-fuchsia-300 bg-fuchsia-500/[0.06] border border-fuchsia-500/20 rounded-lg p-2.5 leading-relaxed flex items-start gap-2">
                <FlaskConical className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="text-fuchsia-200 mb-0.5">Want to file BUGS?</div>
                  Apply to be an Alpha Tester or Alpha Dev — approved alphas can submit bugs that auto-create dev tasks.
                  <Link to="/alpha" onClick={onClose} className="block mt-1 text-fuchsia-300 underline underline-offset-2">
                    Apply to the Alpha Program →
                  </Link>
                </div>
              </div>
            )}

            {canSubmitBugs && (
              <div className="font-mono text-[10px] text-emerald-300 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg p-2 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" />
                {alpha.isAdmin
                  ? "Picasso admin — full access."
                  : alpha.isApprovedDev
                    ? "Approved Alpha Developer."
                    : "Approved Alpha Tester."}
              </div>
            )}

            {user && (
              <p className="font-mono text-[10px] text-zinc-600 tracking-wide">
                Submitting as {user.firstName ?? user.email ?? 'you'}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Title *</label>
              <input
                value={form.title}
                onChange={e => set('title')(e.target.value)}
                placeholder={kind === "bug" ? "What broke, in one line" : "Short summary of your note"}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-cyan-500/30 transition-colors"
              />
            </div>

            {kind === "bug" && (
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Category</label>
                <select
                  value={form.category}
                  onChange={e => set('category')(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 outline-none focus:border-cyan-500/30 transition-colors"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">
                {kind === "bug" ? "Description / Repro *" : "Your note *"}
              </label>
              <textarea
                value={form.description}
                onChange={e => set('description')(e.target.value)}
                placeholder={kind === "bug" ? "Steps to reproduce, expected vs actual..." : "Tell us what's on your mind..."}
                rows={4}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-cyan-500/30 transition-colors resize-none"
              />
            </div>

            {kind === "bug" && (
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Screenshot URL (optional)</label>
                <input
                  value={form.screenshotUrl}
                  onChange={e => set('screenshotUrl')(e.target.value)}
                  placeholder="https://..."
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-cyan-500/30 transition-colors"
                />
              </div>
            )}

            {error && (
              <p className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submit}
                disabled={saving || (kind === "bug" && !canSubmitBugs)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  kind === "bug"
                    ? "bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/15"
                    : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/15"
                }`}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? 'Submitting...' : kind === "bug" ? 'File Bug' : 'Send Feedback'}
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
