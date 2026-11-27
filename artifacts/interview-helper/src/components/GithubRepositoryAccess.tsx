import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api-client";
import type {
  GithubRepository,
  GithubRepositoryChange,
  GithubRepositoryChangeDetailsResponse,
  GithubRepositoryChangesResponse,
  GithubRepositoryConnectionStatus,
  GithubRepositoryListResponse,
} from "@workspace/api-client-react";
import { Check, ExternalLink, LoaderCircle, RefreshCw, Shield, X } from "lucide-react";

const panel = "rounded-xl border border-[#dfdbd1] bg-[#fffefa]";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function changeLabel(change: GithubRepositoryChange) {
  if (change.status === "opened") return "Draft PR opened";
  if (change.status === "rejected") return "Declined";
  if (change.status === "failed") return "Needs inspection";
  return "Waiting for review";
}

export default function GithubRepositoryAccess() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<GithubRepositoryConnectionStatus | null>(null);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [changes, setChanges] = useState<GithubRepositoryChange[]>([]);
  const [activeChange, setActiveChange] = useState<GithubRepositoryChangeDetailsResponse | null>(null);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStatus() {
    const result = await requestJson<GithubRepositoryConnectionStatus>("/api/github-repositories/status");
    setStatus(result);
    if (result.connected) {
      const repoList = await requestJson<GithubRepositoryListResponse>("/api/github-repositories/repos");
      setRepositories(repoList.items);
      setSelectedIds(repoList.selectedRepositories.map((repo) => repo.id));
    } else {
      setRepositories([]);
      setSelectedIds([]);
    }
    const changeList = await requestJson<GithubRepositoryChangesResponse>("/api/github-repositories/changes");
    setChanges(changeList.items);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github_repo_connected") === "1") {
      setNotice("GitHub repository access is connected. Select the repositories Pablo may use.");
    }
    const authError = params.get("github_repo_error");
    if (authError) {
      setError(authError === "not_configured"
        ? "The separate GitHub repository OAuth app is not configured yet."
        : "GitHub authorization did not complete. You can try again.");
    }
    const changeId = params.get("githubChange");
    if (changeId) {
      void requestJson<GithubRepositoryChangeDetailsResponse>(`/api/github-repositories/changes/${encodeURIComponent(changeId)}`)
        .then(setActiveChange)
        .catch((reason) => setError(errorMessage(reason)));
    }
    if (params.has("github_repo_connected") || params.has("github_repo_error")) {
      params.delete("github_repo_connected");
      params.delete("github_repo_error");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    void loadStatus()
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await loadStatus();
      setNotice("GitHub connection details refreshed.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveSelection() {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<GithubRepositoryListResponse>("/api/github-repositories/selection", {
        method: "PUT",
        body: JSON.stringify({ repositoryIds: selectedIds }),
      });
      setRepositories(result.items);
      setSelectedIds(result.selectedRepositories.map((repo) => repo.id));
      setNotice(`Saved ${result.selectedRepositories.length} selected repositories.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openChange(changeId: string) {
    setError("");
    setConfirmApproval(false);
    navigate(`/my-apps/connections?githubChange=${encodeURIComponent(changeId)}`);
    try {
      const result = await requestJson<GithubRepositoryChangeDetailsResponse>(
        `/api/github-repositories/changes/${encodeURIComponent(changeId)}`,
      );
      setActiveChange(result);
    } catch (reason) {
      setError(errorMessage(reason));
      setActiveChange(null);
    }
  }

  async function rejectChange() {
    if (!activeChange) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/github-repositories/changes/${encodeURIComponent(activeChange.change.id)}/reject`, { method: "POST" });
      setNotice("The proposed diff was declined. No GitHub changes were written.");
      setActiveChange(null);
      setConfirmApproval(false);
      navigate("/my-apps/connections");
      await loadStatus();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approveChange() {
    if (!activeChange || !confirmApproval) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ change: GithubRepositoryChange }>(
        `/api/github-repositories/changes/${encodeURIComponent(activeChange.change.id)}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ diffHash: activeChange.change.diffHash }),
        },
      );
      setNotice("A draft pull request was opened from the approved diff.");
      setActiveChange({ ...activeChange, change: result.change });
      setConfirmApproval(false);
      await loadStatus();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect GitHub from Pablo? This removes Pablo's saved token and closes pending proposals, but does not revoke the authorization in GitHub. Any pull requests already opened remain unchanged.")) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/github-repositories/disconnect", { method: "POST" });
      setActiveChange(null);
      setNotice("GitHub repository access was disconnected.");
      navigate("/my-apps/connections");
      await loadStatus();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const active = activeChange?.change;
  return <section className={`${panel} mt-5 p-4 sm:p-6`} aria-labelledby="github-repository-access-title">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#efede6] text-[#292923]"><Shield size={18}/></span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#817e73]">Pablo code access</p>
          <h2 id="github-repository-access-title" className="mt-1 font-display text-xl font-bold">GitHub repositories</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#716e64]">Connect separately from sign-in, then select repositories. Pablo only reads selected repos and can write only an approved diff to a new branch and draft PR.</p>
        </div>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading || busy} className={`${button} border border-[#dedacf] bg-white`}><RefreshCw size={15} className={busy ? "animate-spin" : ""}/>Refresh</button>
    </header>

    {error && <div role="alert" className="mt-4 rounded-lg border border-[#e5bcb4] bg-[#fff6f3] px-3 py-2.5 text-sm text-[#8f3e32]">{error}</div>}
    {notice && <div role="status" className="mt-4 rounded-lg border border-[#d8e3d0] bg-[#f1f6ed] px-3 py-2.5 text-sm text-[#43563a]">{notice}</div>}

    {loading ? <div className="flex min-h-24 items-center justify-center text-sm text-[#77746b]"><LoaderCircle size={17} className="mr-2 animate-spin"/>Loading GitHub access…</div> :
      !status?.connected && !status?.configured ? <div className="mt-5 rounded-lg border border-[#e2dfd7] bg-[#f7f5ef] p-4">
        <p className="text-sm font-semibold">GitHub repository access is not configured.</p>
        <p className="mt-1 text-sm text-[#716e64]">The project owner needs to configure the separate GitHub repository OAuth app before users can connect. Sign-in access is not reused for repository changes.</p>
      </div> :
      !status.connected ? <div className="mt-5 rounded-lg border border-[#e2dfd7] bg-[#f7f5ef] p-4">
        <p className="text-sm font-semibold">No GitHub repository account is connected.</p>
        <p className="mt-1 text-sm text-[#716e64]">GitHub will show the permissions requested by the separate repository app. You choose exactly which repositories Pablo may use here.</p>
        <button type="button" onClick={() => window.location.assign("/api/github-repositories/connect")} disabled={busy} className={`${button} mt-3 bg-[#24241f] text-white`}><ExternalLink size={15}/>Connect GitHub</button>
      </div> :
      <div className="mt-5">
        {!status.configured && <div className="mb-3 rounded-lg border border-[#e2dfd7] bg-[#f7f5ef] px-3 py-2 text-sm text-[#716e64]">Your existing repository connection still works, but reconnecting requires the separate OAuth app configuration.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e5dd] pb-3">
          <p className="text-sm text-[#45443d]">Connected as <strong>{status.login}</strong></p>
          <button type="button" onClick={() => void disconnect()} disabled={busy} className={`${button} border border-[#e2c7c1] bg-white text-[#9b5146]`}><X size={15}/>Disconnect from Pablo</button>
        </div>
        <p className="mt-2 text-xs text-[#817e73]">Disconnect removes Pablo’s saved token and pending proposals. It does not revoke the authorization in GitHub; revoke that separately in GitHub settings if needed.</p>
        <div className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="text-sm font-bold">Repositories Pablo can use</h3><p className="mt-1 text-xs text-[#817e73]">Only repositories with write access appear. Select up to 50.</p></div>
            <button type="button" onClick={() => void saveSelection()} disabled={busy} className={`${button} bg-[#25251f] text-white`}>{busy ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>}Save selection</button>
          </div>
          {repositories.length === 0 ? <p className="mt-3 rounded-lg bg-[#f7f5ef] px-3 py-4 text-sm text-[#716e64]">No repositories with write access were found.</p> :
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[#e5e1d8]">
              {repositories.map((repository) => <label key={repository.id} className="flex cursor-pointer items-start gap-3 border-b border-[#efede6] px-3 py-3 last:border-b-0 hover:bg-[#faf9f5]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#25251f]" checked={selectedIds.includes(repository.id)} disabled={!selectedIds.includes(repository.id) && selectedIds.length >= 50} onChange={(event) => {
                  if (event.target.checked && selectedIds.length >= 50) {
                    setError("Select up to 50 repositories.");
                    return;
                  }
                  setError("");
                  setSelectedIds((current) => event.target.checked ? [...current, repository.id] : current.filter((id) => id !== repository.id));
                }}/>
                <span className="min-w-0 flex-1"><span className="block break-all text-sm font-semibold">{repository.fullName}</span><span className="mt-0.5 block text-xs text-[#817e73]">{repository.private ? "Private" : "Public"} · default branch: {repository.defaultBranch}</span></span>
              </label>)}
            </div>}
        </div>
      </div>}

    <div className="mt-6 border-t border-[#e8e5dd] pt-4">
      <div className="flex items-end justify-between gap-3">
        <div><h3 className="text-sm font-bold">Proposed changes</h3><p className="mt-1 text-xs text-[#817e73]">No repository write occurs until you approve the exact diff.</p></div>
      </div>
      {!changes.length ? <p className="mt-3 rounded-lg bg-[#f7f5ef] px-3 py-4 text-sm text-[#716e64]">There are no proposed changes yet.</p> :
        <div className="mt-3 space-y-2">{changes.map((change) => <article key={change.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e5e1d8] bg-white px-3 py-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold">{change.title}</p><p className="mt-0.5 text-xs text-[#817e73]">{change.repositoryFullName} · {changeLabel(change)}</p></div>
          {change.status === "pending" ? <button type="button" onClick={() => void openChange(change.id)} className={`${button} border border-[#dedacf] bg-[#fffefa]`}>Review diff</button> :
            change.pullRequestUrl ? <a href={change.pullRequestUrl} target="_blank" rel="noreferrer" className={`${button} border border-[#dedacf] bg-[#fffefa]`}>Open PR <ExternalLink size={14}/></a> : null}
        </article>)}</div>}
    </div>

    {activeChange && <section className="mt-5 rounded-xl border border-[#bdb8aa] bg-[#fbfaf6] p-3 sm:p-5" aria-labelledby="github-diff-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#817e73]">Exact proposed diff · {active?.repositoryFullName}</p><h3 id="github-diff-title" className="mt-1 break-words font-display text-lg font-bold">{active?.title}</h3><p className="mt-1 text-sm text-[#716e64]">{active?.description || "No description provided."}</p></div>
        <button type="button" onClick={() => { setActiveChange(null); setConfirmApproval(false); navigate("/my-apps/connections"); }} className={`${button} border border-[#dedacf] bg-white`}><X size={15}/>Close</button>
      </div>
      <pre className="mt-4 max-h-[55vh] overflow-auto rounded-lg border border-[#d8d4ca] bg-[#1f211e] p-3 font-mono text-xs leading-5 text-[#f1f0e9]">{activeChange.diff}</pre>
      {active?.status === "pending" ? <div className="mt-4 rounded-lg border border-[#e5e1d8] bg-white p-3">
        <label className="flex items-start gap-2 text-sm text-[#45443d]"><input type="checkbox" checked={confirmApproval} onChange={(event) => setConfirmApproval(event.target.checked)} className="mt-1 h-4 w-4 accent-[#25251f]"/>I reviewed this exact diff and approve opening a draft pull request.</label>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => void rejectChange()} disabled={busy} className={`${button} border border-[#dedacf] bg-white`}>Decline diff</button>
          <button type="button" onClick={() => void approveChange()} disabled={busy || !confirmApproval} className={`${button} bg-[#25251f] text-white`}>{busy ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>}Approve & open draft PR</button>
        </div>
      </div> : active?.pullRequestUrl ? <a href={active.pullRequestUrl} target="_blank" rel="noreferrer" className={`${button} mt-3 bg-[#25251f] text-white`}>Open draft pull request <ExternalLink size={14}/></a> : <p className="mt-3 text-sm text-[#716e64]">This proposal is no longer pending.</p>}
    </section>}
  </section>;
}
