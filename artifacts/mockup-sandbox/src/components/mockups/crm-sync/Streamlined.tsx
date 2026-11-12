import "./_group.css";
import { apiFetch } from "./mock-api";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Cloud, Loader2, RefreshCw, Trash2, X } from "lucide-react";

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

function directionLabel(direction: CrmSource["direction"]) {
  if (direction === "bidirectional") return "Two-way";
  return direction === "pull" ? "Pull to CRM" : "Push from CRM";
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-black/55">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "h-10 w-full min-w-0 rounded-none border border-black/20 bg-white px-3 text-[13px] text-[#171714] outline-none transition-colors placeholder:text-black/35 focus:border-black";
const selectClass = `${inputClass} appearance-none`;
const smallButton = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-none border border-black/20 bg-white px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-45";

export default function Streamlined({
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
    <section className="min-h-screen bg-[#f7f4ee] font-['DM_Sans'] text-[#171714]" data-testid="section-crm-sync">
      <div className="mx-auto max-w-[1280px] px-4 pb-10 pt-4 sm:px-6 sm:pt-7">
        <header className="flex items-start justify-between gap-3 border-b border-black/15 pb-4">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/45">SALARYMAN CRM <span className="px-1.5 text-black/25">/</span> Organization workspace</p>
            <h1 className="mt-2 text-[21px] font-semibold leading-tight tracking-[-0.04em] sm:text-[25px]">Sources &amp; conflicts</h1>
            <p className="mt-1.5 max-w-xl text-[12px] leading-[1.55] text-black/60">Imports stay leads in this organization. Review changes before either version is kept.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center text-black/55 transition-colors hover:bg-black/5 hover:text-black" aria-label="Close source settings"><X size={16} /></button>
        </header>

        {(error || notice) && (
          <div className={`mt-4 flex items-start gap-2.5 border-l-2 px-3 py-2.5 text-[12px] leading-5 ${error ? "border-black bg-black/[0.04]" : "border-[#77715f] bg-white/65"}`} role={error ? "alert" : "status"}>
            {error ? <span className="font-semibold">Could not complete.</span> : <Check size={14} className="mt-0.5 shrink-0" />}
            <span className="min-w-0">{error || notice}</span>
            {error && <button type="button" onClick={() => void loadData()} className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] underline underline-offset-2">Retry</button>}
          </div>
        )}

        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.82fr)] lg:gap-12">
          <div className="min-w-0">
            <section aria-labelledby="connected-heading">
              <div className="flex min-h-9 items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 id="connected-heading" className="text-[13px] font-semibold tracking-[-0.02em]">Connected sources</h2>
                  {!loading && <span className="text-[11px] tabular-nums text-black/45">{sources.length}</span>}
                </div>
                <button type="button" onClick={() => void loadData()} disabled={loading} className={`${smallButton} h-8 min-h-8 px-2.5`}>
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
              </div>
              <div className="mt-1 border-y border-black/15">
                {loading && sources.length === 0 && (
                  <div className="space-y-3 py-4" aria-label="Loading sources">
                    <div className="h-3 w-2/5 animate-pulse bg-black/10" />
                    <div className="h-3 w-3/5 animate-pulse bg-black/[0.07]" />
                    <div className="h-3 w-1/2 animate-pulse bg-black/[0.07]" />
                  </div>
                )}
                {!loading && sources.length === 0 && (
                  <div className="py-5">
                    <p className="text-[13px] font-medium">No sources yet</p>
                    <p className="mt-1 text-[11px] text-black/55">Add a REST endpoint or this organization’s Google Sheet.</p>
                  </div>
                )}
                {sources.map((source) => {
                  const connected = Boolean(source.credential);
                  const isBusy = busy === `sync:${source.id}` || busy === `connect:${source.id}` || busy === `delete:${source.id}`;
                  return (
                    <article key={source.id} className="border-b border-black/10 py-3.5 last:border-b-0" data-testid={`row-crm-source-${source.id}`}>
                      <div className="flex min-w-0 items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[13px] font-semibold">{source.name}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-black/55">
                            <span className="font-medium text-black/75">{source.provider === "google_sheets" ? "Google Sheets" : "REST"}</span>
                            <span aria-hidden="true">·</span>
                            <span>{directionLabel(source.direction)}</span>
                            {source.provider === "google_sheets" && <><span aria-hidden="true">·</span><span>{connected ? "Authorized" : "Needs authorization"}</span></>}
                          </div>
                        </div>
                        <button type="button" onClick={() => void deleteSource(source)} disabled={Boolean(busy)} className="grid h-8 w-8 shrink-0 place-items-center text-black/40 transition-colors hover:bg-black/5 hover:text-black disabled:opacity-40" aria-label={`Remove ${source.name}`}>
                          {busy === `delete:${source.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {source.provider === "google_sheets" && !connected && (
                          <button type="button" onClick={() => void connectGoogle(source.id)} disabled={Boolean(busy)} className={smallButton}>
                            {busy === `connect:${source.id}` ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpRight size={12} />} Connect
                          </button>
                        )}
                        <button type="button" onClick={() => void syncSource(source.id)} disabled={Boolean(busy) || (source.provider === "google_sheets" && !connected)} className="inline-flex min-h-9 items-center justify-center gap-1.5 bg-[#171714] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-35">
                          {busy === `sync:${source.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {isBusy && busy === `sync:${source.id}` ? "Syncing" : "Sync"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-7" aria-labelledby="conflicts-heading">
              <div className="flex items-baseline gap-2">
                <h2 id="conflicts-heading" className="text-[13px] font-semibold tracking-[-0.02em]">Needs a decision</h2>
                <span className="text-[11px] tabular-nums text-black/45">{conflicts.length}</span>
              </div>
              {!loading && conflicts.length === 0 && (
                <p className="mt-2 border-y border-black/15 py-4 text-[12px] text-black/55">No conflicts to review.</p>
              )}
              <div className="mt-2 space-y-3">
                {conflicts.map((conflict) => (
                  <article key={conflict.id} className="border border-black/15 bg-white/55 p-3.5 sm:p-4" data-testid={`row-crm-conflict-${conflict.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/55">{sourceNames.get(conflict.connectionId) ?? "Source"} <span className="px-1 text-black/30">/</span> #{conflict.id}</p>
                        <p className="mt-1.5 break-words text-[13px] font-medium leading-5">{snapshotLabel(conflict.sourceSnapshotJson)}</p>
                      </div>
                      <time className="shrink-0 pt-0.5 text-[10px] tabular-nums text-black/45">{conflict.createdAt ? new Date(conflict.createdAt).toLocaleDateString() : ""}</time>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="min-w-0 border-l-2 border-black/20 pl-2">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-black/45">Source</span>
                        <p className="mt-0.5 break-words text-[11px] leading-4">{snapshotLabel(conflict.sourceSnapshotJson)}</p>
                      </div>
                      <div className="min-w-0 border-l-2 border-black pl-2">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-black/45">CRM</span>
                        <p className="mt-0.5 break-words text-[11px] leading-4">{snapshotLabel(conflict.crmSnapshotJson)}</p>
                      </div>
                    </div>
                    <details className="mt-3 border-t border-black/10 pt-2.5">
                      <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.08em] text-black/55 marker:hidden focus-visible:outline focus-visible:outline-1 focus-visible:outline-black">
                        <span className="inline-flex items-center gap-1.5">Review mapped values <span aria-hidden="true">+</span></span>
                      </summary>
                      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-black/50">Source</p>
                          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all border border-black/10 bg-white p-2 font-mono text-[10px] leading-4">{JSON.stringify(conflict.sourceSnapshotJson, null, 2)}</pre>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-black/50">CRM</p>
                          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all border border-black/10 bg-white p-2 font-mono text-[10px] leading-4">{JSON.stringify(conflict.crmSnapshotJson, null, 2)}</pre>
                        </div>
                      </div>
                    </details>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => void resolveConflict(conflict.id, "crm")} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center justify-center gap-1.5 bg-[#171714] px-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-white transition-colors hover:bg-black/75 disabled:opacity-45">
                        {busy === `conflict:${conflict.id}` ? <Loader2 size={12} className="animate-spin" /> : null} Keep CRM
                      </button>
                      <button type="button" onClick={() => void resolveConflict(conflict.id, "source")} disabled={Boolean(busy)} className="min-h-10 border border-black/25 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.07em] transition-colors hover:border-black disabled:opacity-45">Keep source</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <form onSubmit={(event) => void saveSource(event)} className="min-w-0 border-t border-black/20 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" data-testid="form-crm-source">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/45">Setup</p>
                <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.03em]">Add a source</h2>
              </div>
              <Cloud size={16} className="mt-1 text-black/45" />
            </div>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <Field label="Provider">
                <select value={provider} onChange={(event) => setProvider(event.target.value as "rest" | "google_sheets")} className={selectClass}>
                  <option value="rest">HTTPS REST</option><option value="google_sheets">Google Sheets</option>
                </select>
              </Field>
              <Field label="Direction">
                <select value={direction} onChange={(event) => { const next = event.target.value as typeof direction; setDirection(next); if (next !== "pull" && method === "GET") setMethod("POST"); }} className={selectClass}>
                  <option value="pull">Pull into CRM</option><option value="push">Push from CRM</option><option value="bidirectional">Two-way · review conflicts</option>
                </select>
              </Field>
              <Field label="Source name" className="sm:col-span-2">
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Sales contacts" className={inputClass} />
              </Field>
              {provider === "rest" ? <>
                <Field label="HTTPS endpoint" className="sm:col-span-2">
                  <input required type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://example.com/api/contacts" className={`${inputClass} text-[12px]`} />
                </Field>
                {direction !== "pull" && (
                  <Field label="Push method">
                    <select value={method} onChange={(event) => setMethod(event.target.value)} className={selectClass}><option>POST</option><option>PUT</option><option>PATCH</option></select>
                  </Field>
                )}
                <Field label="Bearer token · optional" className={direction === "pull" ? "sm:col-span-2" : ""}>
                  <input type="password" autoComplete="new-password" value={bearer} onChange={(event) => setBearer(event.target.value)} maxLength={4096} className={inputClass} />
                </Field>
              </> : <>
                <Field label="Spreadsheet ID" className="sm:col-span-2">
                  <input required value={spreadsheetId} onChange={(event) => setSpreadsheetId(event.target.value)} placeholder="ID from the Google Sheets URL" className={inputClass} />
                </Field>
                <Field label="A1 range including headers" className="sm:col-span-2">
                  <input required value={range} onChange={(event) => setRange(event.target.value)} placeholder="Contacts!A1:Z" className={inputClass} />
                </Field>
              </>}
              <Field label="Match contacts by">
                <select value={keyField} onChange={(event) => setKeyField(event.target.value as "email" | "phone")} className={selectClass}><option value="email">Email</option><option value="phone">Phone</option></select>
              </Field>
              <div className="hidden sm:block" />
              <Field label="Field mapping · CRM field=source column" className="sm:col-span-2">
                <textarea required value={mappingText} onChange={(event) => setMappingText(event.target.value)} rows={5} spellCheck={false} className="min-h-[116px] w-full resize-y border border-black/20 bg-white p-3 font-mono text-[11px] leading-[1.7] text-[#171714] outline-none focus:border-black" />
              </Field>
              <p className="text-[10px] leading-[1.55] text-black/50 sm:col-span-2">Available CRM fields: name, email, phone, company, jobTitle, status{customFields.length ? `, ${customFields.map((field) => field.fieldKey).join(", ")}` : ""}. Protected IDs, ownership, call history, and telephony data stay in CRM.</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
              <button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#171714] px-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-black/75 disabled:cursor-not-allowed disabled:opacity-45">
                {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />} Save source
              </button>
              <span className="text-[10px] leading-4 text-black/45">You can connect or sync after saving.</span>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}