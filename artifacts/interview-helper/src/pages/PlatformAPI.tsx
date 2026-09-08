import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Key, Webhook, Plug, FileText, Copy, Trash2, Plus, Check, AlertCircle,
  Loader2, ExternalLink, RefreshCw, Shield, Zap, Globe, ChevronRight,
  Search, X, Lock, Settings2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string) => `${BASE}api${path}`;

type Tab = "overview" | "keys" | "webhooks" | "endpoints" | "apps";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "OVERVIEW", icon: Plug },
  { id: "keys", label: "API KEYS", icon: Key },
  { id: "apps", label: "CONNECTIONS", icon: Globe },
  { id: "webhooks", label: "WEBHOOKS", icon: Webhook },
  { id: "endpoints", label: "ENDPOINTS", icon: FileText },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-zinc-700 transition-colors"
      title="COPY"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
    </button>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-6">
      <div className="border border-cyan-500/20 rounded-lg p-6 bg-gradient-to-br from-cyan-500/5 to-blue-500/5">
        <h2 className="text-lg font-bold text-cyan-400 tracking-wider mb-3">SALARYMAN PLATFORM API</h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
          THE SALARYMAN PLATFORM API CONNECTS YOUR TOOLS INTO ONE UNIFIED SYSTEM.
          SYNC DATA BETWEEN SALARYMAN AND YOUR FAVORITE APPS — CRM, MESSAGING, PAYMENTS, E-COMMERCE, AND MORE.
          USE API KEYS FOR AUTHENTICATION, WEBHOOKS FOR REAL-TIME EVENTS, AND THE REST API FOR EVERYTHING ELSE.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          {[
            { icon: Key, label: "API KEYS", desc: "AUTHENTICATE REQUESTS WITH SCOPED API KEYS", color: "text-amber-400" },
            { icon: Webhook, label: "WEBHOOKS", desc: "RECEIVE REAL-TIME EVENTS WHEN DATA CHANGES", color: "text-purple-400" },
            { icon: Globe, label: "CONNECTED APPS", desc: "CONNECT THIRD-PARTY TOOLS FOR CROSS-APP WORKFLOWS", color: "text-emerald-400" },
          ].map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-800/30">
              <Icon className={`w-6 h-6 ${color} mb-2`} />
              <div className="text-xs font-bold text-zinc-300 tracking-wider mb-1">{label}</div>
              <div className="text-xs text-zinc-500">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-zinc-700/50 rounded-lg p-6 bg-zinc-800/20">
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider mb-3">QUICK START</h3>
        <div className="space-y-3">
          {[
            { step: "01", text: "GENERATE AN API KEY IN THE API KEYS TAB" },
            { step: "02", text: "ADD YOUR KEY TO THE AUTHORIZATION HEADER: Bearer psk_live_..." },
            { step: "03", text: "MAKE REQUESTS TO ANY ENDPOINT LISTED IN THE ENDPOINTS TAB" },
            { step: "04", text: "SET UP WEBHOOKS TO RECEIVE REAL-TIME EVENT NOTIFICATIONS" },
            { step: "05", text: "CONNECT SALARYMAN APPS FOR CROSS-APP DATA SYNC" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="text-cyan-400 font-mono text-xs font-bold shrink-0">{step}</span>
              <span className="text-zinc-400 text-xs">{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-zinc-700/50 rounded-lg p-6 bg-zinc-800/20">
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider mb-3">EXAMPLE REQUEST</h3>
        <div className="bg-zinc-900 rounded-lg p-4 font-mono text-xs text-zinc-400 overflow-x-auto">
          <div className="text-emerald-400">{"// LIST ALL CONTACTS"}</div>
          <div className="mt-1">
            <span className="text-amber-400">curl</span>{" "}
            <span className="text-cyan-400">-H</span>{" "}
            <span className="text-zinc-300">"Authorization: Bearer psk_live_..."</span>{" "}
            \
          </div>
          <div className="pl-4">
            <span className="text-zinc-300">https://api.salaryman.app/api/contacts</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(api("/platform/api-keys"), { credentials: "include" });
    if (r.ok) setKeys(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    const r = await apiFetch(api("/platform/api-keys"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newKeyName, scopes: ["*"] }),
    });
    if (r.ok) {
      const data = await r.json();
      setNewKeyResult(data.key);
      setNewKeyName("");
      load();
    }
    setCreating(false);
  };

  const revokeKey = async (id: number) => {
    await apiFetch(api(`/platform/api-keys/${id}`), { method: "DELETE", credentials: "include" });
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {newKeyResult && (
        <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 tracking-wider">COPY YOUR API KEY NOW — IT WON'T BE SHOWN AGAIN</span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900 rounded p-3 font-mono text-xs text-emerald-400 break-all">
            <span className="flex-1">{newKeyResult}</span>
            <CopyButton text={newKeyResult} />
          </div>
          <button onClick={() => setNewKeyResult(null)} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">DISMISS</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider">API KEYS ({keys.filter(k => k.active).length})</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-wider hover:bg-cyan-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> NEW KEY
        </button>
      </div>

      {showCreate && (
        <div className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-800/30 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 mb-1 block">KEY NAME</label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="E.G. PRODUCTION, STAGING, PUBLISHING SYNC..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:border-cyan-500/50 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
          </div>
          <button
            onClick={createKey}
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 rounded-md bg-cyan-500 text-black text-xs font-bold tracking-wider hover:bg-cyan-400 disabled:opacity-40 transition-colors"
          >
            {creating ? "CREATING..." : "CREATE"}
          </button>
        </div>
      )}

      {keys.filter(k => k.active).length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">NO API KEYS YET. CREATE ONE TO GET STARTED.</div>
      ) : (
        <div className="space-y-2">
          {keys.filter(k => k.active).map((key) => (
            <div key={key.id} className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-800/20 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-zinc-300">{key.name}</div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-xs text-zinc-500">{key.keyPrefix}</span>
                  <span className="text-xs text-zinc-600">CREATED {new Date(key.createdAt).toLocaleDateString()}</span>
                  {key.lastUsedAt && <span className="text-xs text-zinc-600">LAST USED {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <button
                onClick={() => revokeKey(key.id)}
                className="p-2 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                title="REVOKE"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(api("/platform/webhooks"), { credentials: "include" });
    if (r.ok) setWebhooks(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !url.trim()) return;
    setCreating(true);
    const r = await apiFetch(api("/platform/webhooks"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, url, events: ["*"] }),
    });
    if (r.ok) {
      setName(""); setUrl(""); setShowCreate(false);
      load();
    }
    setCreating(false);
  };

  const remove = async (id: number) => {
    await apiFetch(api(`/platform/webhooks/${id}`), { method: "DELETE", credentials: "include" });
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider">WEBHOOKS ({webhooks.filter(w => w.active).length})</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-500/10 text-purple-400 text-xs font-bold tracking-wider hover:bg-purple-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> NEW WEBHOOK
        </button>
      </div>

      {showCreate && (
        <div className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-800/30 space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">NAME</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="E.G. PUBLISHING SYNC, CRM UPDATES..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">ENDPOINT URL</label>
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-app.com/webhook"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:border-purple-500/50 focus:outline-none"
            />
          </div>
          <button
            onClick={create}
            disabled={creating || !name.trim() || !url.trim()}
            className="px-4 py-2 rounded-md bg-purple-500 text-white text-xs font-bold tracking-wider hover:bg-purple-400 disabled:opacity-40 transition-colors"
          >
            {creating ? "CREATING..." : "CREATE WEBHOOK"}
          </button>
        </div>
      )}

      {webhooks.filter(w => w.active).length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">NO WEBHOOKS CONFIGURED. ADD ONE TO RECEIVE REAL-TIME EVENTS.</div>
      ) : (
        <div className="space-y-2">
          {webhooks.filter(w => w.active).map((wh) => (
            <div key={wh.id} className="border border-zinc-700/50 rounded-lg p-4 bg-zinc-800/20 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-sm font-bold text-zinc-300">{wh.name}</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">{wh.url}</div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-zinc-600">SECRET: {wh.secret}</span>
                  {wh.lastTriggeredAt && <span className="text-xs text-zinc-600">LAST FIRED: {new Date(wh.lastTriggeredAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <button onClick={() => remove(wh.id)} className="p-2 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EndpointsTab() {
  const [data, setData] = useState<{ endpoints: any[]; webhookEvents: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(api("/platform/endpoints"), { credentials: "include" })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;

  const methodColor: Record<string, string> = {
    GET: "text-emerald-400 bg-emerald-400/10",
    POST: "text-amber-400 bg-amber-400/10",
    PUT: "text-blue-400 bg-blue-400/10",
    DELETE: "text-red-400 bg-red-400/10",
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider mb-3">REST ENDPOINTS ({data.endpoints.length})</h3>
        <div className="space-y-1">
          {data.endpoints.map((ep, i) => (
            <div key={i} className="border border-zinc-700/30 rounded-lg px-4 py-3 bg-zinc-800/20 flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${methodColor[ep.method] ?? "text-zinc-400 bg-zinc-700/30"} tracking-wider w-16 text-center`}>
                {ep.method}
              </span>
              <span className="font-mono text-xs text-zinc-400 flex-1">{ep.path}</span>
              <span className="text-xs text-zinc-500 hidden sm:block">{ep.description}</span>
              <span className="text-xs text-zinc-600 font-mono hidden md:block">{ep.scope}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-zinc-300 tracking-wider mb-3">WEBHOOK EVENTS ({data.webhookEvents.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {data.webhookEvents.map((ev, i) => (
            <div key={i} className="border border-zinc-700/30 rounded-lg px-4 py-3 bg-zinc-800/20 flex items-center gap-3">
              <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="font-mono text-xs text-purple-300">{ev.event}</span>
              <span className="text-xs text-zinc-500 hidden sm:block">{ev.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type CredentialSummary = {
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  login: string | null;
  hasPassword: boolean;
  baseUrl: string | null;
  hasNotes: boolean;
};

type ConnectedApp = {
  slug: string;
  name: string;
  description: string;
  status: string;
  category: string;
  connected: boolean;
  connectionId: number | null;
  lastSyncAt: string | null;
  credentials: CredentialSummary | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  picasso: "PICASSO PLATFORM",
  communication: "COMMUNICATION",
  social: "SOCIAL MEDIA",
  music: "MUSIC",
  media: "MEDIA & STREAMING",
  crm: "CRM & SALES",
  productivity: "PRODUCTIVITY",
  storage: "STORAGE & FILES",
  design: "DESIGN & CREATIVE",
  finance: "FINANCE & PAYMENTS",
  commerce: "E-COMMERCE",
  automation: "AUTOMATION",
  marketing: "MARKETING & SOCIAL",
  development: "DEVELOPMENT",
  cloud: "CLOUD INFRASTRUCTURE",
  ai: "AI & MODELS",
  hr: "HR & OPERATIONS",
  support: "SUPPORT",
  other: "OTHER",
};

const CATEGORY_ORDER = ["picasso", "communication", "social", "music", "media", "crm", "productivity", "storage", "design", "finance", "commerce", "automation", "marketing", "development", "cloud", "ai", "hr", "support", "other"];

const STATUS_STYLE: Record<string, { border: string; badge: string; badgeText: string }> = {
  core: { border: "border-cyan-500/30", badge: "bg-cyan-500/10 text-cyan-400", badgeText: "CORE" },
  available: { border: "border-zinc-700/50", badge: "bg-zinc-700/30 text-zinc-400", badgeText: "AVAILABLE" },
  coming_soon: { border: "border-zinc-700/30", badge: "bg-zinc-800/50 text-zinc-600", badgeText: "COMING SOON" },
};

type CredForm = { apiKey: string; login: string; password: string; baseUrl: string; notes: string };
const EMPTY_FORM: CredForm = { apiKey: "", login: "", password: "", baseUrl: "", notes: "" };

function ConnectModal({ app, onClose, onSaved }: { app: ConnectedApp; onClose: () => void; onSaved: () => void }) {
  const summary = app.credentials;
  const [form, setForm] = useState<CredForm>({
    ...EMPTY_FORM,
    login: summary?.login ?? "",
    baseUrl: summary?.baseUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof CredForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    await apiFetch(api("/platform/apps/connect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ appSlug: app.slug, appName: app.name, credentials: form }),
    });
    setSaving(false);
    onSaved();
  };

  const field = "w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-cyan-500/50 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-700 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100 tracking-wider">{app.connected ? "MANAGE" : "CONNECT"} {app.name}</h3>
              {app.connected && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 tracking-wider font-bold">CONNECTED</span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1 pr-4">{app.description}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {app.connected && summary && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-zinc-400 space-y-0.5">
              <div className="text-emerald-400 font-bold tracking-wider mb-1">SALARYMAN REMEMBERS</div>
              {summary.hasApiKey && <div>API KEY •••• {summary.apiKeyLast4}</div>}
              {summary.login && <div>LOGIN: {summary.login}</div>}
              {summary.hasPassword && <div>PASSWORD •••• STORED</div>}
              {summary.baseUrl && <div>URL: {summary.baseUrl}</div>}
              {!summary.hasApiKey && !summary.login && !summary.hasPassword && <div>No credentials stored yet.</div>}
            </div>
          )}

          <div>
            <label className="text-[10px] text-zinc-500 tracking-wider mb-1 block">API KEY {app.connected && summary?.hasApiKey ? "(LEAVE BLANK TO KEEP)" : ""}</label>
            <input type="password" autoComplete="off" value={form.apiKey} onChange={set("apiKey")} placeholder={`Paste your ${app.name} API key`} className={field} />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 tracking-wider mb-1 block">LOGIN / EMAIL</label>
            <input value={form.login} onChange={set("login")} placeholder="username or email" className={field} />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 tracking-wider mb-1 block">PASSWORD / SECRET {app.connected && summary?.hasPassword ? "(LEAVE BLANK TO KEEP)" : ""}</label>
            <input type="password" autoComplete="off" value={form.password} onChange={set("password")} placeholder="account password or secret" className={field} />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 tracking-wider mb-1 block">BASE URL <span className="text-zinc-600">(OPTIONAL)</span></label>
            <input value={form.baseUrl} onChange={set("baseUrl")} placeholder="https://api.example.com" className={field} />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 tracking-wider mb-1 block">NOTES <span className="text-zinc-600">(OPTIONAL)</span></label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="account / workspace details" className={`${field} resize-none`} />
          </div>

          <div className="flex items-start gap-2 text-[10px] text-zinc-500 pt-1">
            <Lock className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-px" />
            <span>Stored privately so SALARYMAN can coordinate this account. Secrets are write-only — they're never shown again after saving.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-bold tracking-wider text-zinc-400 hover:text-zinc-200">CANCEL</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500 text-black text-xs font-bold tracking-wider hover:bg-emerald-400 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {app.connected ? "SAVE CHANGES" : "SAVE CONNECTION"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRow({ app, onConnect, onManage, onDisconnect, disconnecting }: {
  app: ConnectedApp;
  onConnect: (app: ConnectedApp) => void;
  onManage: (app: ConnectedApp) => void;
  onDisconnect: (app: ConnectedApp) => void;
  disconnecting: boolean;
}) {
  const style = STATUS_STYLE[app.status] ?? STATUS_STYLE.available;
  const c = app.credentials;
  const credBits = c
    ? [c.hasApiKey ? `KEY ••${c.apiKeyLast4 ?? ""}` : null, c.login ? c.login : null, c.hasPassword ? "PWD ••••" : null].filter(Boolean)
    : [];
  return (
    <div className={`border ${app.connected ? "border-emerald-500/25" : style.border} rounded-lg p-4 bg-zinc-800/20 flex items-center justify-between gap-3`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-bold text-zinc-200 tracking-wider">{app.name}</span>
          {!app.connected && <span className={`text-[10px] px-2 py-0.5 rounded ${style.badge} tracking-wider font-bold`}>{style.badgeText}</span>}
          {app.connected && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 tracking-wider font-bold flex items-center gap-1">
              <Check className="w-3 h-3" /> CONNECTED
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">{app.description}</p>
        {credBits.length > 0 && (
          <p className="text-[10px] text-zinc-600 mt-1 font-mono truncate">{credBits.join("  •  ")}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {app.status === "core" && <Shield className="w-5 h-5 text-cyan-400/50" />}
        {app.connected && (
          <>
            <button
              onClick={() => onManage(app)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-zinc-700/40 text-zinc-300 text-xs font-bold tracking-wider hover:bg-zinc-700/70 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" /> MANAGE
            </button>
            <button
              onClick={() => onDisconnect(app)}
              disabled={disconnecting}
              className="p-2 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 disabled:opacity-40 transition-colors"
              title="DISCONNECT"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </>
        )}
        {app.status === "available" && !app.connected && (
          <button
            onClick={() => onConnect(app)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-bold tracking-wider hover:bg-emerald-500/20 transition-colors"
          >
            <Plug className="w-3.5 h-3.5" /> CONNECT
          </button>
        )}
      </div>
    </div>
  );
}

function AppsTab() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modalApp, setModalApp] = useState<ConnectedApp | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch(api("/platform/apps"), { credentials: "include" });
    if (r.ok) setApps(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async (app: ConnectedApp) => {
    if (!confirm(`Disconnect ${app.name}? Stored credentials will be removed.`)) return;
    setDisconnecting(app.slug);
    await apiFetch(api("/platform/apps/disconnect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ appSlug: app.slug }),
    });
    await load();
    setDisconnecting(null);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>;

  const q = query.trim().toLowerCase();
  const matches = (app: ConnectedApp) =>
    !q || app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q) || (CATEGORY_LABELS[app.category] ?? "").toLowerCase().includes(q);

  const connectedApps = apps.filter(a => a.connected).filter(matches);
  const browseApps = apps.filter(matches);

  const grouped = browseApps.reduce<Record<string, ConnectedApp[]>>((acc, app) => {
    const cat = app.category || "other";
    (acc[cat] ||= []).push(app);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {modalApp && (
        <ConnectModal
          app={modalApp}
          onClose={() => setModalApp(null)}
          onSaved={() => { setModalApp(null); load(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-300 tracking-wider">CONNECTIONS</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Connect any tool with its API key + login — SALARYMAN remembers them and coordinates your business across apps.</p>
        </div>
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH CONNECTIONS..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-cyan-500/50 focus:outline-none tracking-wider"
          />
        </div>
      </div>

      {connectedApps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-emerald-400 tracking-widest">YOUR CONNECTIONS ({connectedApps.length})</span>
            <div className="h-px flex-1 bg-emerald-500/15" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {connectedApps.map(app => (
              <AppRow key={app.slug} app={app} onConnect={setModalApp} onManage={setModalApp} onDisconnect={disconnect} disconnecting={disconnecting === app.slug} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest">BROWSE ALL ({browseApps.length})</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {browseApps.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">NO CONNECTIONS MATCH "{query}".</div>
      ) : (
        CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-[10px] font-mono text-zinc-500 tracking-widest">{CATEGORY_LABELS[cat] || cat.toUpperCase()}</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              {grouped[cat].map(app => (
                <AppRow key={app.slug} app={app} onConnect={setModalApp} onManage={setModalApp} onDisconnect={disconnect} disconnecting={disconnecting === app.slug} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function PlatformAPI() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab;
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    } else {
      setActiveTab("overview");
    }
  }, []);

  const setTab = (tab: Tab) => {
    setActiveTab(tab);
    const basePath = window.location.pathname.includes('/profile/') ? '/profile/platform' : '/platform';
    const newUrl = tab === "overview" ? basePath : `${basePath}?tab=${tab}`;
    window.history.replaceState(null, "", `${import.meta.env.BASE_URL.replace(/\/$/, "")}${newUrl}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Plug className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider">SALARYMAN PLATFORM API</h1>
            <p className="text-xs text-zinc-500 tracking-wider">CONNECT ALL SALARYMAN APPS TOGETHER</p>
          </div>
        </div>

        <div className="flex gap-1 border-b border-zinc-800 mb-6 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold tracking-wider transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "text-cyan-400 border-b-2 border-cyan-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "keys" && <ApiKeysTab />}
        {activeTab === "webhooks" && <WebhooksTab />}
        {activeTab === "endpoints" && <EndpointsTab />}
        {activeTab === "apps" && <AppsTab />}
      </div>
    </div>
  );
}
