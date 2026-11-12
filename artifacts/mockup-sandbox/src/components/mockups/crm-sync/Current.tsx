import './_group.css';
import { apiFetch } from "./mock-api";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Cloud, Loader2, RefreshCw, Trash2, X } from "lucide-react";

type CrmSource = {
  id: number;
  name: string;
  provider: "rest" | "google_sheets";
  direction: "pull" | "push" | "bidirectional";
  configJson: Record<string, unknown>;
  credential: unknown;
};

type CrmSyncConflict = {
  id: number;
  connectionId: number;
  leadId: number | null;
  sourceSnapshotJson: Record<string, unknown>;
  crmSnapshotJson: Record<string, unknown>;
  createdAt: string;
};

type CustomField = { fieldKey: string; label: string };

async function responseJson(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : fallback);
  return data;
}

function mappingFromText(value: string) {
  const mapping: Record<string, string> = {};
  for (const [index, rawLine] of value.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`Mapping line ${index + 1} must use CRM field=source column`);
    const field = line.slice(0, separator).trim();
    const external = line.slice(separator + 1).trim();
    if (!field || !external || Object.prototype.hasOwnProperty.call(mapping, field)) {
      throw new Error(`Mapping line ${index + 1} is empty or repeats a CRM field`);
    }
    mapping[field] = external;
  }
  return mapping;
}

function snapshotLabel(snapshot: Record<string, unknown>) {
  const identity = [snapshot.name, snapshot.email, snapshot.phone].filter(Boolean).join(" · ");
  return identity || "Mapped record values";
}

export default function CrmSyncPanel({
  orgId = 12,
  customFields = [{ fieldKey: "priority", label: "Priority" }],
  onClose = () => {},
}: {
  orgId?: number | null;
  customFields?: CustomField[];
  onClose?: () => void;
} = {}) {
  const [sources, setSources] = useState<CrmSource[]>([]);
  const [conflicts, setConflicts] = useState<CrmSyncConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const [provider, setProvider] = useState<"rest" | "google_sheets">("rest");
  const [direction, setDirection] = useState<"pull" | "push" | "bidirectional">("pull");
  const [method, setMethod] = useState("GET");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [bearer, setBearer] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState("");
  const [keyField, setKeyField] = useState<"email" | "phone">("email");
  const [mappingText, setMappingText] = useState("name=Name\nemail=Email\nphone=Phone\ncompany=Company");

  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources]);

  const loadData = useCallback(async () => {
    if (!orgId) {
      setSources([]);
      setConflicts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [sourceResponse, conflictResponse] = await Promise.all([
        apiFetch("api/crm/sources"),
        apiFetch("api/crm/sync/conflicts"),
      ]);
      const [sourceData, conflictData] = await Promise.all([
        responseJson(sourceResponse, "Unable to load sources"),
        responseJson(conflictResponse, "Unable to load conflicts"),
      ]);
      setSources(Array.isArray(sourceData.sources) ? sourceData.sources : []);
      setConflicts(Array.isArray(conflictData.conflicts) ? conflictData.conflicts : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load CRM sync data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!orgId) {
        setSources([]);
        setConflicts([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [sourceResponse, conflictResponse] = await Promise.all([
          apiFetch("api/crm/sources"),
          apiFetch("api/crm/sync/conflicts"),
        ]);
        const [sourceData, conflictData] = await Promise.all([
          responseJson(sourceResponse, "Unable to load sources"),
          responseJson(conflictResponse, "Unable to load conflicts"),
        ]);
        if (active) {
          setSources(Array.isArray(sourceData.sources) ? sourceData.sources : []);
          setConflicts(Array.isArray(conflictData.conflicts) ? conflictData.conflicts : []);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load CRM sync data");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orgId]);

  const saveSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const mapping = mappingFromText(mappingText);
      if (!mapping[keyField]) throw new Error(`Map ${keyField} to a source column before saving`);
      const config = provider === "rest"
        ? { endpoint, method, mapping, keyField }
        : { spreadsheetId, range, mapping, keyField };
      const response = await apiFetch("api/crm/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          name: name.trim() || (provider === "rest" ? "REST source" : "Google Sheets source"),
          direction,
          config,
          ...(provider === "rest" && bearer.trim() ? { auth: { bearer: bearer.trim() } } : {}),
        }),
      });
      await responseJson(response, "Unable to save source");
      setBearer("");
      setName("");
      setNotice("Source saved. Connect Google Sheets or run a sync when ready.");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save source");
    } finally {
      setBusy("");
    }
  };

  const connectGoogle = async (sourceId: number) => {
    setBusy(`connect:${sourceId}`);
    setError("");
    try {
      const response = await apiFetch(`api/crm/google/connect?sourceId=${sourceId}`);
      const data = await responseJson(response, "Unable to start Google authorization");
      if (typeof data.authorizationUrl !== "string") throw new Error("Google authorization URL was not returned");
      window.location.assign(data.authorizationUrl);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to start Google authorization");
      setBusy("");
    }
  };

  const syncSource = async (sourceId: number) => {
    setBusy(`sync:${sourceId}`);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`api/crm/sources/${sourceId}/sync`, { method: "POST" });
      const result = await responseJson(response, "Sync failed");
      setNotice(`Sync complete · ${Number(result.created ?? 0)} created · ${Number(result.pulled ?? 0)} pulled · ${Number(result.pushed ?? 0)} pushed · ${Number(result.conflicts ?? 0)} conflicts`);
      await loadData();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
      await loadData();
    } finally {
      setBusy("");
    }
  };

  const deleteSource = async (source: CrmSource) => {
    if (!window.confirm(`Remove “${source.name}”? CRM leads and sync history are retained.`)) return;
    setBusy(`delete:${source.id}`);
    setError("");
    try {
      await responseJson(await apiFetch(`api/crm/sources/${source.id}`, { method: "DELETE" }), "Unable to remove source");
      setNotice("Source removed. Existing CRM leads and sync history were retained.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove source");
    } finally {
      setBusy("");
    }
  };

  const resolveConflict = async (conflictId: number, resolution: "crm" | "source") => {
    setBusy(`conflict:${conflictId}`);
    setError("");
    setNotice("");
    try {
      await responseJson(await apiFetch(`api/crm/sync/conflicts/${conflictId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      }), "Unable to resolve conflict");
      setNotice(resolution === "crm" ? "Kept the CRM version." : "Kept the source version.");
      await loadData();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Unable to resolve conflict");
      await loadData();
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="min-h-screen border-b border-black bg-white" data-testid="section-crm-sync">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">Organization data exchange</p>
            <h2 className="mt-1 text-lg font-bold">Sources and conflicts</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-black/55">Connect a REST endpoint or this organization’s Google Sheet. Imported contacts remain CRM leads; they never become employees.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[#f7f4ee]" aria-label="Close source settings"><X size={16} /></button>
        </div>

        {(error || notice) && <div className={`mb-4 border px-3 py-2 text-xs ${error ? "border-black bg-black text-white" : "border-black/15 bg-[#f7f4ee] text-black"}`} role={error ? "alert" : "status"}>{error || notice}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Connected sources</h3>
              <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex h-8 items-center gap-2 border border-black bg-white px-2 text-[10px] font-bold uppercase tracking-[0.1em] disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
            </div>
            <div className="divide-y divide-black/10 border-y border-black/10">
              {loading && sources.length === 0 && <p className="py-5 text-xs text-black/50">Loading sources…</p>}
              {!loading && sources.length === 0 && <p className="py-5 text-xs text-black/50">No external sources configured for this organization.</p>}
              {sources.map((source) => {
                const connected = Boolean(source.credential);
                return (
                  <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`row-crm-source-${source.id}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm">{source.name}</strong>
                        <span className="border border-black/15 bg-[#f7f4ee] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]">{source.provider === "google_sheets" ? "Google Sheets" : "REST"}</span>
                        <span className="text-[10px] uppercase tracking-[0.1em] text-black/45">{source.direction}</span>
                        {source.provider === "google_sheets" && <span className="text-[10px] text-black/45">{connected ? "Authorized" : "Needs authorization"}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {source.provider === "google_sheets" && !connected && <button type="button" onClick={() => void connectGoogle(source.id)} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 border border-black bg-white px-2 text-[10px] font-bold uppercase tracking-[0.08em] disabled:opacity-50"><ArrowUpRight size={12} /> Connect</button>}
                      <button type="button" onClick={() => void syncSource(source.id)} disabled={Boolean(busy) || (source.provider === "google_sheets" && !connected)} className="inline-flex h-8 items-center gap-1 bg-black px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-40">{busy === `sync:${source.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync</button>
                      <button type="button" onClick={() => void deleteSource(source)} disabled={Boolean(busy)} className="p-2 text-black/55 hover:bg-[#f7f4ee] disabled:opacity-40" aria-label={`Remove ${source.name}`}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.14em]">Open conflicts <span className="ml-1 text-black/45">{conflicts.length}</span></h3>
            <div className="space-y-3">
              {!loading && conflicts.length === 0 && <p className="border-y border-black/10 py-4 text-xs text-black/50">No conflicts need review.</p>}
              {conflicts.map((conflict) => (
                <article key={conflict.id} className="border border-black/15 bg-[#f7f4ee] p-3" data-testid={`row-crm-conflict-${conflict.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-xs font-bold">Conflict #{conflict.id} · {sourceNames.get(conflict.connectionId) ?? "Source"}</p><p className="mt-1 text-[10px] text-black/50">{snapshotLabel(conflict.sourceSnapshotJson)} vs {snapshotLabel(conflict.crmSnapshotJson)}</p></div>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-black/45">{conflict.createdAt ? new Date(conflict.createdAt).toLocaleDateString() : ""}</span>
                  </div>
                  <details className="mt-2 text-[10px]">
                    <summary className="cursor-pointer font-semibold uppercase tracking-[0.08em]">Review mapped values</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="min-w-0"><p className="font-bold uppercase tracking-[0.1em] text-black/50">Source</p><pre className="mt-1 max-h-28 overflow-auto border border-black/10 bg-white p-2 text-[10px]">{JSON.stringify(conflict.sourceSnapshotJson, null, 2)}</pre></div>
                      <div className="min-w-0"><p className="font-bold uppercase tracking-[0.1em] text-black/50">CRM</p><pre className="mt-1 max-h-28 overflow-auto border border-black/10 bg-white p-2 text-[10px]">{JSON.stringify(conflict.crmSnapshotJson, null, 2)}</pre></div>
                    </div>
                  </details>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void resolveConflict(conflict.id, "crm")} disabled={Boolean(busy)} className="h-8 border border-black bg-black px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-50">Keep CRM</button>
                    <button type="button" onClick={() => void resolveConflict(conflict.id, "source")} disabled={Boolean(busy)} className="h-8 border border-black bg-white px-3 text-[10px] font-bold uppercase tracking-[0.08em] disabled:opacity-50">Keep source</button>
                    {busy === `conflict:${conflict.id}` && <Loader2 size={14} className="animate-spin self-center" />}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form onSubmit={(event) => void saveSource(event)} className="border border-black/15 bg-[#f7f4ee] p-4" data-testid="form-crm-source">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Add a source</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55">Provider
                <select value={provider} onChange={(event) => setProvider(event.target.value as "rest" | "google_sheets")} className="mt-1 h-10 w-full border border-black bg-white px-2 text-xs text-black">
                  <option value="rest">HTTPS REST</option><option value="google_sheets">Google Sheets</option>
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55">Direction
                <select value={direction} onChange={(event) => { const next = event.target.value as typeof direction; setDirection(next); if (next !== "pull" && method === "GET") setMethod("POST"); }} className="mt-1 h-10 w-full border border-black bg-white px-2 text-xs text-black">
                  <option value="pull">Pull into CRM</option><option value="push">Push from CRM</option><option value="bidirectional">Two-way · review conflicts</option>
                </select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 sm:col-span-2">Source name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Sales contacts" className="mt-1 h-10 w-full border border-black bg-white px-3 text-sm text-black" />
              </label>
              {provider === "rest" ? <>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 sm:col-span-2">HTTPS endpoint
                  <input required type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://example.com/api/contacts" className="mt-1 h-10 w-full border border-black bg-white px-3 text-sm normal-case text-black" />
                </label>
                {direction !== "pull" && <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55">Push method
                  <select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 h-10 w-full border border-black bg-white px-2 text-xs text-black"><option>POST</option><option>PUT</option><option>PATCH</option></select>
                </label>}
                <label className={`text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 ${direction === "pull" ? "sm:col-span-2" : ""}`}>Bearer token · optional
                  <input type="password" autoComplete="new-password" value={bearer} onChange={(event) => setBearer(event.target.value)} maxLength={4096} className="mt-1 h-10 w-full border border-black bg-white px-3 text-sm text-black" />
                </label>
              </> : <>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 sm:col-span-2">Spreadsheet ID
                  <input required value={spreadsheetId} onChange={(event) => setSpreadsheetId(event.target.value)} placeholder="ID from the Google Sheets URL" className="mt-1 h-10 w-full border border-black bg-white px-3 text-sm text-black" />
                </label>
                <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 sm:col-span-2">A1 range including headers
                  <input required value={range} onChange={(event) => setRange(event.target.value)} placeholder="Contacts!A1:Z" className="mt-1 h-10 w-full border border-black bg-white px-3 text-sm text-black" />
                </label>
              </>}
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55">Match contacts by
                <select value={keyField} onChange={(event) => setKeyField(event.target.value as "email" | "phone")} className="mt-1 h-10 w-full border border-black bg-white px-2 text-xs text-black"><option value="email">Email</option><option value="phone">Phone</option></select>
              </label>
              <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/55 sm:col-span-2">Field mapping <span className="font-normal normal-case tracking-normal">CRM field=source column, one per line</span>
                <textarea required value={mappingText} onChange={(event) => setMappingText(event.target.value)} rows={5} className="mt-1 w-full border border-black bg-white p-2 font-mono text-xs text-black" />
              </label>
              <p className="text-[10px] leading-4 text-black/50 sm:col-span-2">Available CRM fields: name, email, phone, company, jobTitle, status{customFields.length ? `, ${customFields.map((field) => field.fieldKey).join(", ")}` : ""}. Mapping writes only these fields; protected IDs, ownership, call history, and telephony data stay in CRM.</p>
            </div>
            <button type="submit" disabled={Boolean(busy)} className="mt-3 inline-flex h-10 items-center gap-2 bg-black px-4 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50"><Cloud size={14} /> Save source</button>
            {busy === "save" && <Loader2 size={14} className="ml-2 inline animate-spin" />}
          </form>
        </div>
      </div>
    </section>
  );
}