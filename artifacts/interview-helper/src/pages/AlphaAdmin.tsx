import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Loader2, ShieldCheck, ArrowLeft, Check, X, RotateCcw, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface Applicant {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}
interface Application {
  id: number;
  userId: string;
  role: "alpha_tester" | "alpha_dev";
  status: "pending" | "approved" | "rejected" | "revoked";
  reason: string;
  experience: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  applicant: Applicant | null;
}

const STATUS_FILTERS = ["pending", "approved", "rejected", "revoked", "all"] as const;

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  revoked: "bg-zinc-700/30 text-zinc-400 border-zinc-600/40",
};

const ROLE_LABEL: Record<string, string> = {
  alpha_tester: "TESTER",
  alpha_dev: "DEVELOPER",
};

export default function AlphaAdmin() {
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>("pending");
  const [apps, setApps] = useState<Application[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [capacity, setCapacity] = useState<{ active: number; max: number; remaining: number; full: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const [res, capRes] = await Promise.all([
        apiFetch(`/api/alpha/applications?status=${filter}`, { credentials: "include" }),
        apiFetch(`/api/alpha/capacity`, { credentials: "include" }),
      ]);
      if (res.status === 403) { setAccessDenied(true); return; }
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setApps(data.applications ?? []);
      setPendingCount(data.pendingCount ?? 0);
      if (capRes.ok) setCapacity(await capRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, decision: "approve" | "reject" | "revoke") => {
    setActingId(id);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/alpha/applications/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision, note: noteDraft[id] || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed");
      }
      setNoteDraft(s => { const c = { ...s }; delete c[id]; return c; });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActingId(null);
    }
  };

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="font-mono text-sm text-red-400">Picasso admin access required.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-200">
      <div className="max-w-4xl mx-auto px-5 py-10 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link to="/profile/admin" className="inline-flex items-center gap-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-300 tracking-widest uppercase">
            <ArrowLeft className="w-3.5 h-3.5" /> Admin
          </Link>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase text-zinc-400 border border-white/10 hover:bg-white/5">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <ShieldCheck className="w-6 h-6 text-fuchsia-400" />
          <h1 className="font-mono text-2xl tracking-widest text-fuchsia-300">ALPHA APPLICATIONS</h1>
          {pendingCount > 0 && (
            <span className="font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {pendingCount} PENDING
            </span>
          )}
          {capacity && (
            <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${capacity.full ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"}`}>
              {capacity.active}/{capacity.max} TESTERS{capacity.full ? " · FULL" : ` · ${capacity.remaining} OPEN`}
            </span>
          )}
        </div>

        {actionError && (
          <div className="font-mono text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
            {actionError}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase border ${
                filter === s ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" : "text-zinc-400 border-white/10 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" /></div>
        ) : apps.length === 0 ? (
          <div className="font-mono text-xs text-zinc-600 text-center py-12">No applications in this bucket.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {apps.map(app => {
              const name = app.applicant?.firstName || app.applicant?.lastName
                ? `${app.applicant?.firstName ?? ""} ${app.applicant?.lastName ?? ""}`.trim()
                : null;
              return (
                <div key={app.id} className="border border-white/10 bg-black/40 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="font-mono text-sm text-zinc-100">
                        {name ?? <span className="text-zinc-500">no name</span>}
                        <span className="ml-2 text-zinc-500">{app.applicant?.email ?? `(user ${app.userId.slice(0, 8)})`}</span>
                      </div>
                      <div className="font-mono text-[10px] text-zinc-600 tracking-wide">
                        Applied {new Date(app.createdAt).toLocaleString()}
                        {app.decidedAt && ` · Decided ${new Date(app.decidedAt).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded border border-white/15 bg-white/5 text-zinc-300">
                        {ROLE_LABEL[app.role]}
                      </span>
                      <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded border ${STATUS_PILL[app.status]}`}>
                        {app.status}
                      </span>
                    </div>
                  </div>

                  {app.reason && (
                    <div className="font-mono text-[11px] text-zinc-400 bg-white/[0.02] border border-white/5 rounded p-2 whitespace-pre-wrap">
                      <span className="text-zinc-500">Why: </span>{app.reason}
                    </div>
                  )}
                  {app.experience && (
                    <div className="font-mono text-[11px] text-zinc-400 bg-white/[0.02] border border-white/5 rounded p-2 whitespace-pre-wrap">
                      <span className="text-zinc-500">Experience: </span>{app.experience}
                    </div>
                  )}
                  {app.decisionNote && (
                    <div className="font-mono text-[11px] text-amber-300 bg-amber-500/5 border border-amber-500/15 rounded p-2 whitespace-pre-wrap">
                      Admin note: {app.decisionNote}
                    </div>
                  )}

                  {(app.status === "pending" || app.status === "approved") && (
                    <div className="flex flex-col gap-2 pt-1">
                      <input
                        value={noteDraft[app.id] ?? ""}
                        onChange={e => setNoteDraft(s => ({ ...s, [app.id]: e.target.value }))}
                        placeholder="Optional note for the applicant..."
                        className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/30"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {app.status === "pending" && (
                          <>
                            <button
                              disabled={actingId === app.id}
                              onClick={() => decide(app.id, "approve")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {actingId === app.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                            </button>
                            <button
                              disabled={actingId === app.id}
                              onClick={() => decide(app.id, "reject")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </>
                        )}
                        {app.status === "approved" && (
                          <button
                            disabled={actingId === app.id}
                            onClick={() => decide(app.id, "revoke")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase bg-zinc-700/30 text-zinc-300 border border-zinc-600/40 hover:bg-zinc-700/50 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" /> Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
