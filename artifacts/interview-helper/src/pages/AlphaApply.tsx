import { useState } from "react";
import { Link } from "wouter";
import { Loader2, ShieldCheck, FlaskConical, Code2, ArrowLeft, Clock, X, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAlpha, type AlphaRole, type AlphaApplication } from "@/hooks/use-alpha";

const ROLE_META: Record<AlphaRole, { name: string; icon: typeof FlaskConical; tagline: string; perks: string[]; accent: string }> = {
  alpha_tester: {
    name: "ALPHA TESTER",
    icon: FlaskConical,
    tagline: "Break things on purpose. Get paid in clout.",
    accent: "fuchsia",
    perks: [
      "Submit BUGS that auto-create dev tasks (no admin approval needed)",
      "Tester badge on your profile",
      "Early access to unreleased features",
      "Direct line to the dev team",
    ],
  },
  alpha_dev: {
    name: "ALPHA DEVELOPER",
    icon: Code2,
    tagline: "Help build SALARYMAN. Ship code with us.",
    accent: "cyan",
    perks: [
      "Everything an Alpha Tester gets",
      "Developer badge on your profile",
      "Access to dev tooling & internal endpoints",
      "Voice in roadmap decisions",
    ],
  },
};

function statusPill(status: AlphaApplication["status"]) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    rejected: "bg-red-500/10 text-red-300 border-red-500/25",
    revoked: "bg-zinc-700/30 text-zinc-400 border-zinc-600/40",
  };
  const labels: Record<string, string> = {
    pending: "AWAITING ADMIN",
    approved: "APPROVED",
    rejected: "REJECTED",
    revoked: "REVOKED",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] tracking-widest uppercase border ${styles[status]}`}>
      {status === "pending" ? <Clock className="w-3 h-3" /> : status === "approved" ? <CheckCircle2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {labels[status]}
    </span>
  );
}

function ApplyCard({ role, onSubmitted }: { role: AlphaRole; onSubmitted: () => void }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const [reason, setReason] = useState("");
  const [experience, setExperience] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) { setError("Tell us why you want in."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/alpha/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role, reason, experience }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }
      setReason("");
      setExperience("");
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const accentBg = meta.accent === "fuchsia" ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";
  const accentText = meta.accent === "fuchsia" ? "text-fuchsia-300" : "text-cyan-300";

  return (
    <div className="border border-white/10 bg-black/40 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md border ${accentBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className={`font-mono text-sm tracking-widest ${accentText}`}>{meta.name}</div>
            <div className="font-mono text-[11px] text-zinc-500">{meta.tagline}</div>
          </div>
        </div>
      </div>

      <ul className="font-mono text-[11px] text-zinc-400 space-y-1.5">
        {meta.perks.map(p => <li key={p} className="flex gap-2"><span className="text-zinc-600">›</span>{p}</li>)}
      </ul>

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Why you? *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="What drew you to SALARYMAN? What can you contribute?"
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/30 transition-colors resize-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] text-zinc-500 tracking-widest uppercase">Relevant experience (optional)</label>
        <textarea
          value={experience}
          onChange={e => setExperience(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={role === "alpha_dev" ? "Languages, frameworks, shipped projects..." : "QA experience, MMOs you've tested, bugs you've found..."}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/30 transition-colors resize-none"
        />
      </div>

      {error && <div className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      <button
        onClick={submit}
        disabled={submitting}
        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-mono text-[11px] tracking-widest uppercase border transition-colors disabled:opacity-50 ${accentBg} hover:brightness-125`}
      >
        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {submitting ? "Submitting..." : `Apply for ${meta.name}`}
      </button>
    </div>
  );
}

function StatusCard({ role, app, onReapply }: { role: AlphaRole; app: AlphaApplication; onReapply: () => void }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const accentText = meta.accent === "fuchsia" ? "text-fuchsia-300" : "text-cyan-300";
  return (
    <div className="border border-white/10 bg-black/40 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${accentText}`} />
          <div className={`font-mono text-sm tracking-widest ${accentText}`}>{meta.name}</div>
        </div>
        {statusPill(app.status)}
      </div>
      <div className="font-mono text-[11px] text-zinc-500">
        Applied {new Date(app.createdAt).toLocaleString()}
      </div>
      {app.reason && (
        <div className="font-mono text-[11px] text-zinc-400 bg-white/[0.02] border border-white/5 rounded p-2 whitespace-pre-wrap">
          {app.reason}
        </div>
      )}
      {app.decisionNote && (
        <div className="font-mono text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/15 rounded p-2 whitespace-pre-wrap">
          Admin note: {app.decisionNote}
        </div>
      )}
      {app.status === "approved" && (
        <div className="font-mono text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
          You're in. Bug reports you submit now skip admin review and become dev tasks immediately.
        </div>
      )}
      {(app.status === "rejected" || app.status === "revoked") && (
        <button
          onClick={onReapply}
          className="self-start px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10"
        >
          Re-apply
        </button>
      )}
    </div>
  );
}

export default function AlphaApply() {
  const alpha = useAlpha();
  const [reapplying, setReapplying] = useState<Record<AlphaRole, boolean>>({ alpha_tester: false, alpha_dev: false });

  if (alpha.loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-fuchsia-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-200">
      <div className="max-w-3xl mx-auto px-5 py-10 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link to="/profile" className="inline-flex items-center gap-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-300 tracking-widest uppercase">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          {alpha.isAdmin && (
            <Link to="/profile/admin/alpha" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/15">
              <ShieldCheck className="w-3 h-3" /> Admin Review
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-mono text-3xl tracking-widest text-fuchsia-300">ALPHA PROGRAM</h1>
          <p className="font-mono text-xs text-zinc-500 leading-relaxed">
            FEEDBACK is notes for the team — anyone can send those. BUGS go straight to the dev queue and require alpha approval. Apply once, get vetted by a Picasso admin, then ship as many bug reports as you want without further sign-off.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {(["alpha_tester", "alpha_dev"] as AlphaRole[]).map(role => {
            const app = role === "alpha_tester" ? alpha.tester : alpha.dev;
            const showApplyForm = !app || reapplying[role];
            return (
              <div key={role}>
                {!showApplyForm && app
                  ? <StatusCard role={role} app={app} onReapply={() => setReapplying(s => ({ ...s, [role]: true }))} />
                  : <ApplyCard role={role} onSubmitted={() => { setReapplying(s => ({ ...s, [role]: false })); alpha.refresh(); }} />}
              </div>
            );
          })}
        </div>

        <div className="border border-white/5 bg-white/[0.02] rounded-lg p-4 font-mono text-[11px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400">House rules.</span> Applications are reviewed by Picasso admins. Approval comes through your in-app notifications. Approved status can be revoked at any time if reports turn into noise.
        </div>
      </div>
    </div>
  );
}
