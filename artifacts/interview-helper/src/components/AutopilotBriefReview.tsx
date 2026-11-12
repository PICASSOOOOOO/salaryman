import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type OutcomeCounts = { success: number; noop: number; blocked: number; error: number; skipped: number };
type Brief = {
  generatedAt: string;
  windowStart: string;
  newLeads: number;
  activeLeads: number;
  calls: { total: number; inbound: number; outbound: number };
  pendingApprovals: number;
  automationRuns: OutcomeCounts;
  recentCalls: Array<{
    id: number;
    leadName: string;
    startedAt: string;
    summary: string;
    hasProposal: boolean;
    proposalStatus: string | null;
  }>;
};
type ReviewItem = {
  id: number;
  callHistoryId: number;
  sourceLeadId: number | null;
  sourceLeadName: string;
  sourceCallAt: string;
  sourceSummary: string;
  taskTitle: string;
  taskDescription: string;
  status: "pending" | "approved" | "dismissed";
  createdAt: string;
};

const countClass = "border border-black/15 bg-white px-3 py-2";
const labelClass = "text-[9px] font-bold uppercase tracking-[0.1em] text-black/45";

export function AutopilotBriefReview() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [briefResponse, queueResponse] = await Promise.all([
        apiFetch("api/autopilot/brief"),
        apiFetch("api/autopilot/approval-queue"),
      ]);
      if (!briefResponse.ok || !queueResponse.ok) throw new Error("Couldn't load the daily brief and review queue.");
      const [briefData, queueData] = await Promise.all([briefResponse.json(), queueResponse.json()]);
      setBrief(briefData);
      setItems(Array.isArray(queueData.items) ? queueData.items : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't load Autopilot review.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const decide = async (item: ReviewItem, decision: "approved" | "dismissed") => {
    setSavingId(item.id);
    setError("");
    try {
      const response = await apiFetch(`api/autopilot/approval-queue/${item.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't save this decision.");
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setBrief((current) => current
        ? { ...current, pendingApprovals: Math.max(0, current.pendingApprovals - 1) }
        : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save this decision.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="mb-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]" aria-label="Daily business brief and approval queue">
      <div className="border border-black/15 bg-[#f7f4ee] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]">24-hour business brief</h2>
            <p className="mt-1 text-[10px] text-black/50">Organization activity only · refreshed every minute</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="border border-black/20 bg-white px-2 py-1 text-[10px] font-bold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error && <p role="alert" className="mt-3 border border-red-700/20 bg-red-50 px-2 py-1.5 text-[10px] text-red-800">{error}</p>}

        {brief ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className={countClass}><div className={labelClass}>New leads</div><div className="mt-1 text-lg font-bold">{brief.newLeads}</div></div>
              <div className={countClass}><div className={labelClass}>Active leads</div><div className="mt-1 text-lg font-bold">{brief.activeLeads}</div></div>
              <div className={countClass}><div className={labelClass}>Calls</div><div className="mt-1 text-lg font-bold">{brief.calls.total}</div></div>
              <div className={countClass}><div className={labelClass}>Needs review</div><div className="mt-1 text-lg font-bold">{brief.pendingApprovals}</div></div>
            </div>
            <p className="mt-2 text-[10px] text-black/50">
              Calls: {brief.calls.inbound} inbound · {brief.calls.outbound} outbound
              <span className="px-1.5">|</span>
              Automation: {brief.automationRuns.success} successful, {brief.automationRuns.blocked} blocked
            </p>
            {brief.recentCalls.length > 0 && (
              <div className="mt-3 border-t border-black/10 pt-2">
                <h3 className={labelClass}>Recent completed calls</h3>
                <ul className="mt-1 space-y-1">
                  {brief.recentCalls.slice(0, 4).map((call) => (
                    <li key={call.id} className="flex items-start justify-between gap-2 text-[10px]">
                      <span className="min-w-0"><strong>{call.leadName}</strong> · {call.summary}</span>
                      <span className="shrink-0 text-black/40">{call.proposalStatus ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : !loading && !error ? (
          <p className="mt-3 text-xs text-black/50">No brief data available.</p>
        ) : null}
      </div>

      <div className="border border-black/15 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]">Approval queue</h2>
            <p className="mt-1 text-[10px] text-black/50">Approving creates an internal task. Dismissing creates nothing.</p>
          </div>
          <span className="min-w-7 border border-black/15 bg-[#f7f4ee] px-2 py-1 text-center text-xs font-bold">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="mt-4 text-xs text-black/50">{loading ? "Loading review items…" : "No follow-up suggestions need review."}</p>
        ) : (
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <article key={item.id} className="border border-black/10 bg-[#f7f4ee] p-2.5">
                <h3 className="text-xs font-bold">{item.taskTitle}</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-black/65">{item.taskDescription}</p>
                <p className="mt-1 text-[9px] text-black/40">
                  {item.sourceLeadName} · {new Date(item.sourceCallAt).toLocaleString()}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(item, "approved")}
                    disabled={savingId !== null}
                    className="border border-black bg-black px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    {savingId === item.id ? "Saving…" : "Approve task"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(item, "dismissed")}
                    disabled={savingId !== null}
                    className="border border-black/20 bg-white px-2.5 py-1 text-[10px] font-bold disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
