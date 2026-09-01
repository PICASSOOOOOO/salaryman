import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Loader2, ShieldCheck, FlaskConical, Code2, ArrowLeft, Clock, X, CheckCircle2, AlertTriangle, Users, Gavel, Bug, Map, Coins, MessageSquare, Smartphone, FileText } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useAlpha, type AlphaRole, type AlphaApplication } from "@/hooks/use-alpha";

const DISCORD_BANNER_DISMISS_KEY = "salaryman_discord_banner_dismissed";

interface AlphaCapacity {
  max: number;
  active: number;
  remaining: number;
  full: boolean;
  inactivityDays: number;
  discordInviteUrl: string | null;
}

function DiscordGlyph({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

const ROLE_META: Record<AlphaRole, { name: string; icon: typeof FlaskConical; tagline: string; perks: string[]; accent: string }> = {
  alpha_tester: {
    name: "ALPHA TESTER",
    icon: FlaskConical,
    tagline: "Break things on purpose. Get paid in clout.",
    accent: "fuchsia",
    perks: [
      "Submit BUGS that auto-create dev tasks (no admin approval needed)",
      "Auto-promoted to Discord MODERATOR",
      "Tester badge on your profile",
      "Early access to unreleased features",
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

function DiscordBanner({ inviteUrl }: { inviteUrl: string | null }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISCORD_BANNER_DISMISS_KEY) === "1"; } catch { return false; }
  });
  if (dismissed || !inviteUrl) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISCORD_BANNER_DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-indigo-500/15 p-4 sm:p-5">
      <div className="flex items-center gap-4 pr-8">
        <div className="shrink-0 grid place-items-center w-11 h-11 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200">
          <DiscordGlyph className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm tracking-widest text-indigo-100">JOIN THE SALARYMAN DISCORD</div>
          <div className="font-mono text-[11px] text-indigo-200/70 leading-relaxed">
            Testers are <span className="text-indigo-100">required</span> to be in the server. It's where bugs, builds, and the dev team live.
          </div>
        </div>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] tracking-widest uppercase bg-indigo-500/30 text-indigo-50 border border-indigo-400/40 hover:bg-indigo-500/45 transition-colors"
        >
          <DiscordGlyph className="w-4 h-4" /> Join now
        </a>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 p-1 rounded text-indigo-200/60 hover:text-indigo-100 hover:bg-white/10"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

const FOCUS_AREAS: { icon: typeof Bug; title: string; text: string }[] = [
  { icon: Map, title: "ROAM THE CITY", text: "Walk every office, building, and subway stop. Flag soft-locks, broken doors, collision traps, and anything you can't get out of." },
  { icon: Coins, title: "STRESS THE ECONOMY", text: "Bank, pledge, earn, and spend. Hunt for exploits, negative balances, free money, or prices that don't add up." },
  { icon: MessageSquare, title: "PUSH PABLO", text: "Talk to the AI assistant like a real player would. Report replies that break character, stall, or come back wrong." },
  { icon: Smartphone, title: "BREAK IT ON MOBILE", text: "Play on phones and different browsers. Touch controls, tiny screens, and odd resolutions are where bugs hide." },
  { icon: Bug, title: "FIND THE CRASHES", text: "Chase the rough edges — freezes, frame drops, visual glitches, anything that smells unfinished." },
  { icon: FileText, title: "WRITE IT UP", text: "A good report = steps to reproduce, what you expected, what happened, and a screenshot. Clear beats clever." },
];

function WhatWeNeed() {
  return (
    <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-fuchsia-300" />
          <h2 className="font-mono text-[11px] tracking-widest uppercase text-fuchsia-200">What we need from you</h2>
        </div>
        <p className="font-mono text-[11px] text-zinc-500 leading-relaxed">
          SALARYMAN is still being built. We need players who poke the unfinished corners on purpose and tell us what broke. Here's where to aim:
        </p>
      </div>
      <ul className="grid sm:grid-cols-2 gap-3">
        {FOCUS_AREAS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-black/30 p-3">
            <div className="shrink-0 grid place-items-center w-8 h-8 rounded-md bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-300">
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-mono text-[11px] tracking-widest text-zinc-200">{title}</span>
              <span className="font-mono text-[11px] text-zinc-500 leading-relaxed">{text}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] text-zinc-600 leading-relaxed border-t border-white/5 pt-3">
        <span className="text-zinc-400">The ideal tester:</span> curious, persistent, plays regularly, and talks to the team in Discord. You don't need QA experience — you need to care enough to file the bug instead of shrugging it off.
      </p>
    </div>
  );
}

function TesterRules({ capacity }: { capacity: AlphaCapacity | null }) {
  const max = capacity?.max ?? 20;
  const active = capacity?.active ?? 0;
  const remaining = capacity?.remaining ?? max;
  const days = capacity?.inactivityDays ?? 3;
  const full = capacity?.full ?? false;
  const rules = [
    { icon: Users, text: `Only ${max} testers at a time. Right now ${active}/${max} slots are filled${full ? " — applications are queued until one frees up." : ` (${remaining} open).`}` },
    { icon: ShieldCheck, text: "Every application is reviewed by hand. You'll wait for admin approval — watch your in-app notifications." },
    { icon: DiscordGlyph, text: "You must join the Discord. Approved testers are auto-promoted to moderator there." },
    { icon: Clock, text: `Log into SALARYMAN at least once every ${days} days. Go dark for ${days} days and your tester access is revoked and your slot is freed.` },
  ];
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-300" />
        <span className="font-mono text-[11px] tracking-widest uppercase text-amber-200">Read before you apply</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rules.map((r, i) => {
          const Icon = r.icon;
          return (
            <li key={i} className="flex items-start gap-2.5 font-mono text-[11px] text-amber-100/85 leading-relaxed">
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300/80" />
              <span>{r.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ApplyCard({ role, capacity, onSubmitted }: { role: AlphaRole; capacity: AlphaCapacity | null; onSubmitted: () => void }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const [reason, setReason] = useState("");
  const [experience, setExperience] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTester = role === "alpha_tester";

  const submit = async () => {
    if (!reason.trim()) { setError("Tell us why you want in."); return; }
    if (isTester && !acknowledged) { setError("Please confirm you've read the tester rules."); return; }
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
      setAcknowledged(false);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const accentBg = meta.accent === "fuchsia" ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";
  const accentText = meta.accent === "fuchsia" ? "text-fuchsia-300" : "text-cyan-300";
  const disabled = submitting || (isTester && !acknowledged);

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
        {isTester && capacity && (
          <span className={`shrink-0 font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${capacity.full ? "bg-red-500/10 text-red-300 border-red-500/25" : "bg-white/5 text-zinc-300 border-white/15"}`}>
            {capacity.active}/{capacity.max} slots
          </span>
        )}
      </div>

      {isTester && capacity?.full && (
        <div className="font-mono text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          All {capacity.max} tester slots are taken. You can still apply — you'll be queued and approved when a slot frees up.
        </div>
      )}

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

      {isTester && (
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-fuchsia-500"
          />
          <span className="font-mono text-[11px] text-zinc-400 leading-relaxed">
            I understand: max {capacity?.max ?? 20} testers, admin approval is required, I must join the Discord, and {capacity?.inactivityDays ?? 3} days without logging in releases my slot.
          </span>
        </label>
      )}

      {error && <div className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

      <button
        onClick={submit}
        disabled={disabled}
        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-mono text-[11px] tracking-widest uppercase border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${accentBg} hover:brightness-125`}
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
          You're in. Bug reports you submit now skip admin review and become dev tasks immediately. Keep logging in — 3 days dark and your slot is released.
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

function RolePreviewCard({ role, capacity }: { role: AlphaRole; capacity: AlphaCapacity | null }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const isFuchsia = meta.accent === "fuchsia";
  const iconCls = isFuchsia ? "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";
  const nameCls = isFuchsia ? "text-fuchsia-300" : "text-cyan-300";
  return (
    <div className="border border-white/10 bg-black/40 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md border ${iconCls}`}><Icon className="w-5 h-5" /></div>
          <div>
            <div className={`font-mono text-sm tracking-widest ${nameCls}`}>{meta.name}</div>
            <div className="font-mono text-[11px] text-zinc-500">{meta.tagline}</div>
          </div>
        </div>
        {role === "alpha_tester" && capacity && (
          <span className={`shrink-0 font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${capacity.full ? "bg-red-500/10 text-red-300 border-red-500/25" : "bg-white/5 text-zinc-300 border-white/15"}`}>
            {capacity.active}/{capacity.max} slots
          </span>
        )}
      </div>
      <ul className="font-mono text-[11px] text-zinc-400 space-y-1.5">
        {meta.perks.map(p => (
          <li key={p} className="flex gap-2"><span className="text-zinc-600">›</span>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AlphaApply() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const alpha = useAlpha();
  const [reapplying, setReapplying] = useState<Record<AlphaRole, boolean>>({ alpha_tester: false, alpha_dev: false });
  const [capacity, setCapacity] = useState<AlphaCapacity | null>(null);

  const loadCapacity = useCallback(async () => {
    try {
      const res = await apiFetch("/api/alpha/capacity", { credentials: "include" });
      if (!res.ok) return;
      setCapacity(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadCapacity(); }, [loadCapacity]);

  if (authLoading || alpha.loading) {
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

        <WhatWeNeed />

        <DiscordBanner inviteUrl={capacity?.discordInviteUrl ?? null} />

        <TesterRules capacity={capacity} />

        {isAuthenticated ? (
          <div className="grid md:grid-cols-2 gap-4">
            {(["alpha_tester", "alpha_dev"] as AlphaRole[]).map(role => {
              const app = role === "alpha_tester" ? alpha.tester : alpha.dev;
              const showApplyForm = !app || reapplying[role];
              return (
                <div key={role}>
                  {!showApplyForm && app
                    ? <StatusCard role={role} app={app} onReapply={() => setReapplying(s => ({ ...s, [role]: true }))} />
                    : <ApplyCard role={role} capacity={capacity} onSubmitted={() => { setReapplying(s => ({ ...s, [role]: false })); alpha.refresh(); loadCapacity(); }} />}
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {(["alpha_tester", "alpha_dev"] as AlphaRole[]).map(role => (
                <RolePreviewCard key={role} role={role} capacity={capacity} />
              ))}
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] overflow-hidden">
              <SignInPrompt inline context="Sign in to apply as an Alpha Tester or Developer — it only takes a minute and your application is saved to your account." />
            </div>
          </>
        )}

        <div className="border border-white/5 bg-white/[0.02] rounded-lg p-4 font-mono text-[11px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400">House rules.</span> Applications are reviewed by Picasso admins. Approval comes through your in-app notifications. Approved status can be revoked at any time if reports turn into noise — or automatically if you stop logging in.
        </div>
      </div>
    </div>
  );
}
