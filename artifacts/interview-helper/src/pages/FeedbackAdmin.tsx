import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageSquare, RefreshCw, RotateCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { SignInPage } from "@/components/SignInPrompt";
import { useAuth } from "@/hooks/use-auth";

interface Report {
  id: number;
  userId: string | null;
  title: string;
  description: string;
  kind: string;
  category: string;
  status: string;
  appVersion: string | null;
  occurrenceCount: number;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubSyncStatus: string;
  githubSyncError: string | null;
  createdAt: string;
}

const STATUSES = ["all", "open", "acknowledged", "resolved"];
const KINDS = ["all", "feedback", "bug", "error_report"];

function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function FeedbackAdmin() {
  const { isAuthenticated } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const query = new URLSearchParams({ status, kind, limit: "100" });
      const response = await apiFetch(`/api/feedback?${query}`);
      if (response.status === 403) { setAccessDenied(true); return; }
      if (!response.ok) throw new Error("Could not load reports.");
      const body = await response.json();
      setReports(body.reports ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (id: number, nextStatus: string) => {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.ok) setReports((current) => current.map((report) => report.id === id ? { ...report, status: nextStatus } : report).filter((report) => status === "all" || report.status === status));
    } finally {
      setBusyId(null);
    }
  };

  const retryGithub = async (id: number) => {
    setBusyId(id);
    try {
      const response = await apiFetch(`/api/feedback/${id}/github-sync`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      setReports((current) => current.map((report) => report.id === id ? {
        ...report,
        githubSyncStatus: body.githubSync?.status ?? "failed",
        githubIssueNumber: body.githubSync?.issueNumber ?? report.githubIssueNumber,
        githubIssueUrl: body.githubSync?.issueUrl ?? report.githubIssueUrl,
        githubSyncError: body.githubSync?.error ?? null,
      } : report));
    } finally {
      setBusyId(null);
    }
  };

  if (!isAuthenticated) return <SignInPage context="Sign in to triage feedback." />;

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] px-4 py-8 text-black sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black pb-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5" />
            <div>
              <h1 className="font-mono text-lg font-bold uppercase tracking-[0.14em]">Feedback inbox</h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-black/55">SALARYMAN internal triage</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} className="flex items-center gap-2 border border-black px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-black/5">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="border border-black bg-transparent px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest">
            {STATUSES.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item}</option>)}
          </select>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="border border-black bg-transparent px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest">
            {KINDS.map((item) => <option key={item} value={item}>{item === "all" ? "All types" : item.replace("_", " ")}</option>)}
          </select>
        </div>

        {accessDenied ? (
          <div className="border border-black p-8 text-center">
            <p className="font-mono text-sm font-bold uppercase tracking-widest">Authorized viewer access required</p>
            <p className="mt-2 text-xs text-black/60">Admins and approved alpha triagers can view this inbox.</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : reports.length === 0 ? (
          <div className="border border-black p-8 text-center font-mono text-xs uppercase tracking-widest text-black/55">No reports in this view.</div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <article key={report.id} className="border border-black bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-widest">
                      <span className="border border-black px-1.5 py-0.5">{report.kind.replace("_", " ")}</span>
                      <span className="text-black/55">{report.category}</span>
                      <span className="text-black/45">{dateLabel(report.createdAt)}</span>
                      {report.occurrenceCount > 1 && <span className="text-black/55">×{report.occurrenceCount}</span>}
                    </div>
                    <h2 className="font-mono text-sm font-bold">{report.title}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-black/75">{report.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <select value={report.status} onChange={(event) => void updateStatus(report.id, event.target.value)} disabled={busyId === report.id} className="border border-black bg-transparent px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest">
                      {STATUSES.filter((item) => item !== "all").map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {report.githubIssueUrl ? (
                      <a href={report.githubIssueUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 border border-black px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest hover:bg-black/5">
                        <ExternalLink className="h-3 w-3" /> GitHub
                      </a>
                    ) : (
                      <button type="button" onClick={() => void retryGithub(report.id)} disabled={busyId === report.id} className="flex items-center gap-1 border border-black px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest hover:bg-black/5 disabled:opacity-50">
                        <RotateCw className="h-3 w-3" /> Retry GitHub
                      </button>
                    )}
                  </div>
                </div>
                {report.githubSyncStatus === "synced" && <p className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-black/55"><Check className="h-3 w-3" /> GitHub issue #{report.githubIssueNumber}</p>}
                {report.githubSyncError && <p className="mt-3 border-t border-black/15 pt-2 font-mono text-[10px] text-black/60">GitHub sync: {report.githubSyncError}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}