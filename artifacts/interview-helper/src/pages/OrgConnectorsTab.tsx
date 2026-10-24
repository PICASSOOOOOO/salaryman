import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Check, Copy, Loader2, Plug, RefreshCw, Shield, Trash2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string) => `${BASE}api${path}`;

const SCOPE_LABELS: Record<string, string> = {
  "crm:read": "Read CRM",
  "crm:write": "Write CRM",
  "calls:read": "Read call activity",
  "calls:write": "Start call actions",
  "documents:read": "Read documents/files",
  "documents:write": "Write documents/files",
};

type ConnectorApp = {
  id: number;
  clientId: string;
  name: string;
  description: string;
  requestedScopes: string[];
  active: boolean;
  createdAt: string;
};

type ConnectorConnection = {
  id: number;
  clientId: string;
  appName: string;
  appDescription: string;
  appActive: boolean;
  grantedScopes: string[];
  status: string;
  tokenPrefix: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  revokedAt: string | null;
};

type ConnectorActivity = {
  id: number;
  connectionId: number;
  eventType: string;
  resourceType: string | null;
  summary: string;
  createdAt: string;
};

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body.error === "string" ? body.error : "Request failed";
  } catch {
    return "Request failed";
  }
}

function ScopeList({
  selected,
  onChange,
  available,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  available: string[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {available.map((scope) => (
        <label key={scope} className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={selected.includes(scope)}
            onChange={(event) => onChange(
              event.target.checked ? [...selected, scope] : selected.filter((item) => item !== scope),
            )}
            className="accent-cyan-500"
          />
          {SCOPE_LABELS[scope] ?? scope}
        </label>
      ))}
    </div>
  );
}

export default function OrgConnectorsTab() {
  const [apps, setApps] = useState<ConnectorApp[]>([]);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [activity, setActivity] = useState<ConnectorActivity[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [appScopes, setAppScopes] = useState<string[]>(["crm:read"]);
  const [clientIdInput, setClientIdInput] = useState("");
  const [appPreview, setAppPreview] = useState<ConnectorApp | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [oneTimeToken, setOneTimeToken] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [appsResponse, orgResponse] = await Promise.all([
      apiFetch(api("/platform/connectors/apps/mine"), { credentials: "include" }),
      apiFetch(api("/platform/connectors/organization"), { credentials: "include" }),
    ]);
    if (appsResponse.ok) {
      const data = await appsResponse.json();
      setApps(data.apps ?? []);
    } else {
      setError(await responseError(appsResponse));
    }
    if (orgResponse.ok) {
      const data = await orgResponse.json();
      setConnections(data.connections ?? []);
      setActivity(data.activity ?? []);
      setCanManage(data.canManage === true);
    } else if (orgResponse.status !== 404) {
      setError(await responseError(orgResponse));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const registerApp = async () => {
    setSaving(true);
    setError("");
    const response = await apiFetch(api("/platform/connectors/apps"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: appName,
        description: appDescription,
        requestedScopes: appScopes,
      }),
    });
    if (!response.ok) {
      setError(await responseError(response));
    } else {
      const data = await response.json();
      setApps((current) => [data.app, ...current]);
      setAppName("");
      setAppDescription("");
    }
    setSaving(false);
  };

  const inspectApp = async () => {
    setError("");
    setAppPreview(null);
    const response = await apiFetch(
      api(`/platform/connectors/apps/${encodeURIComponent(clientIdInput.trim())}`),
      { credentials: "include" },
    );
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    const data = await response.json();
    setAppPreview(data.app);
    setGrantedScopes(data.app.requestedScopes ?? []);
  };

  const connectApp = async () => {
    if (!appPreview) return;
    setSaving(true);
    setError("");
    const response = await apiFetch(
      api(`/platform/connectors/apps/${encodeURIComponent(appPreview.clientId)}/connect`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scopes: grantedScopes }),
      },
    );
    if (!response.ok) {
      setError(await responseError(response));
    } else {
      const data = await response.json();
      setOneTimeToken(data.accessToken);
      setClientIdInput("");
      setAppPreview(null);
      await load();
    }
    setSaving(false);
  };

  const manageConnection = async (connection: ConnectorConnection, action: "rotate" | "revoke") => {
    if (!canManage) return;
    if (action === "rotate" && !confirm("Rotate this token? The current token will stop working immediately.")) return;
    if (action === "revoke" && !confirm("Revoke this organization’s connection to the app?")) return;
    setError("");
    const response = await apiFetch(
      api(`/platform/connectors/connections/${connection.id}/${action}`),
      { method: "POST", credentials: "include" },
    );
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    if (action === "rotate") {
      const data = await response.json();
      setOneTimeToken(data.accessToken);
    }
    await load();
  };

  const copyToken = async () => {
    await navigator.clipboard.writeText(oneTimeToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>;
  }

  return (
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>}

      {oneTimeToken && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-xs font-bold tracking-wider text-amber-300">COPY THE ORGANIZATION TOKEN NOW</h3>
          <p className="mt-1 text-xs text-zinc-400">Paste this bearer token into the registered app’s secure settings. SALARYMAN stores only a hash and cannot show it again.</p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-zinc-950 p-3 text-xs text-emerald-300">{oneTimeToken}</code>
            <button onClick={() => void copyToken()} className="shrink-0 rounded border border-zinc-700 px-3 text-xs text-zinc-300">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={() => setOneTimeToken("")} className="mt-2 text-[10px] tracking-wider text-zinc-500">DISMISS</button>
        </section>
      )}

      <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield size={15} className="text-cyan-400" />
          <h3 className="text-xs font-bold tracking-wider text-zinc-200">REGISTER AN APP YOU OWN</h3>
        </div>
        <p className="mb-3 text-xs text-zinc-500">Register the app-side connector and its requested access. Organization owners approve each connection separately. CRM scopes cover organization lead list/detail/create/update and custom-field metadata. Calls:read exposes call metadata only; call actions and file routes are not enabled.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={appName} onChange={(event) => setAppName(event.target.value)} maxLength={120} placeholder="App name" className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200" />
          <input value={appDescription} onChange={(event) => setAppDescription(event.target.value)} maxLength={500} placeholder="What does this app connect?" className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200" />
        </div>
        <div className="my-3"><ScopeList selected={appScopes} onChange={setAppScopes} available={Object.keys(SCOPE_LABELS)} /></div>
        <button disabled={saving || !appName.trim() || !appScopes.length} onClick={() => void registerApp()} className="rounded bg-cyan-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">
          {saving ? "REGISTERING..." : "REGISTER APP"}
        </button>
        {apps.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] tracking-widest text-zinc-500">YOUR REGISTERED APPS</div>
            {apps.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-700/40 p-3">
                <div>
                  <div className="text-xs font-bold text-zinc-200">{app.name}</div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">{app.clientId}</div>
                  <div className="mt-1 text-[10px] text-zinc-500">{app.requestedScopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(" · ")}</div>
                </div>
                <button onClick={() => { void navigator.clipboard.writeText(app.clientId); }} className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">COPY APP ID</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {canManage && (
        <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plug size={15} className="text-emerald-400" />
            <h3 className="text-xs font-bold tracking-wider text-zinc-200">CONNECT AN APP TO THIS ORGANIZATION</h3>
          </div>
          <div className="flex gap-2">
            <input value={clientIdInput} onChange={(event) => setClientIdInput(event.target.value)} placeholder="Paste the app ID from its owner" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200" />
            <button onClick={() => void inspectApp()} disabled={!clientIdInput.trim()} className="rounded border border-zinc-600 px-3 text-xs text-zinc-300 disabled:opacity-40">REVIEW</button>
          </div>
          {appPreview && (
            <div className="mt-3 rounded border border-zinc-700/50 p-3">
              <div className="text-sm font-bold text-zinc-200">{appPreview.name}</div>
              <p className="mt-1 text-xs text-zinc-500">{appPreview.description || "No description provided."}</p>
              <div className="my-3"><ScopeList selected={grantedScopes} onChange={setGrantedScopes} available={appPreview.requestedScopes} /></div>
              <button disabled={saving || !grantedScopes.length} onClick={() => void connectApp()} className="rounded bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-40">
                {saving ? "CONNECTING..." : "APPROVE SELECTED SCOPES"}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wider text-zinc-200">ORGANIZATION CONNECTIONS</h3>
          <button onClick={() => void load()} className="rounded p-1 text-zinc-500 hover:text-zinc-200" aria-label="Refresh connections"><RefreshCw size={14} /></button>
        </div>
        {connections.length === 0 ? (
          <p className="text-xs text-zinc-500">No apps are connected to the active organization yet.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((connection) => (
              <article key={connection.id} className="rounded border border-zinc-700/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-200">{connection.appName}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">{connection.status.toUpperCase()} · {connection.tokenPrefix ?? "NO ACTIVE TOKEN"}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {connection.grantedScopes.map((scope) => <span key={scope} className="rounded bg-zinc-700/50 px-2 py-1 text-[10px] text-zinc-400">{SCOPE_LABELS[scope] ?? scope}</span>)}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-600">Last activity: {connection.lastActivityAt ? new Date(connection.lastActivityAt).toLocaleString() : "Not used yet"}</div>
                  </div>
                  {canManage && connection.status === "connected" && (
                    <div className="flex gap-2">
                      <button onClick={() => void manageConnection(connection, "rotate")} className="rounded border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">ROTATE TOKEN</button>
                      <button onClick={() => void manageConnection(connection, "revoke")} className="rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-300"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-700/50 bg-zinc-800/20 p-4">
        <h3 className="mb-3 text-xs font-bold tracking-wider text-zinc-200">RECENT CONNECTOR ACTIVITY</h3>
        {activity.length === 0 ? (
          <p className="text-xs text-zinc-500">Connection approvals, token changes, and app authentication checks will appear here. Data payloads and credentials are not logged.</p>
        ) : (
          <div className="space-y-2">
            {activity.map((event) => (
              <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-800 pb-2 text-xs">
                <span className="text-zinc-300">{event.summary}</span>
                <time className="text-[10px] text-zinc-600">{new Date(event.createdAt).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
