import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import {
  Globe, Lock, ArrowLeft, ExternalLink, Loader2, CheckCircle2,
  AlertTriangle, Trash2, Power, Save, Copy, Check, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';

interface Site {
  id: number;
  orgId: number;
  slug: string;
  framerOrigin: string;
  title: string | null;
  status: 'active' | 'disabled';
}

interface WebsiteState {
  hasOrg: boolean;
  eligible: boolean;
  canManage: boolean;
  site: Site | null;
  publicPath: string | null;
}

export default function OrgWebsite() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<WebsiteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [framerOrigin, setFramerOrigin] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const publicUrl = state?.site ? `${window.location.origin}/sites/${state.site.slug}` : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/org-website');
      const data: WebsiteState = await r.json();
      setState(data);
      if (data.site) {
        setSlug(data.site.slug);
        setFramerOrigin(data.site.framerOrigin);
        setTitle(data.site.title ?? '');
      }
    } catch {
      setError('Could not load your website settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function submit(method: 'POST' | 'PUT') {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch('/api/org-website', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), framerOrigin: framerOrigin.trim(), title: title.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.message || 'Something went wrong.');
        return;
      }
      setNotice(method === 'POST' ? 'Website connected.' : 'Website updated.');
      setPreviewKey((k) => k + 1);
      await load();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!state?.site) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = state.site.status === 'active' ? 'disabled' : 'active';
      const r = await apiFetch('/api/org-website', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data?.message || 'Could not update status.'); return; }
      setNotice(next === 'active' ? 'Website is now live.' : 'Website taken offline.');
      await load();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this website? The public URL will stop working.')) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch('/api/org-website', { method: 'DELETE' });
      if (!r.ok) { setError('Could not disconnect.'); return; }
      setSlug(''); setFramerOrigin(''); setTitle('');
      setNotice('Website disconnected.');
      await load();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (authLoading) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>;
  }
  if (!isAuthenticated) return <SignInPage />;

  return (
    <div className="min-h-screen bg-black text-zinc-100 px-4 py-8 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/business" className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 hover:text-zinc-300 mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Business Hub
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide">PUBLIC WEBSITE</h1>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Host your published Framer site on SALARYMAN</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        ) : !state?.hasOrg ? (
          <Locked title="No organization" body="Create or join an organization to connect a public website." />
        ) : !state.eligible ? (
          <Locked
            title="Registered businesses only"
            body="Connecting a public website is available to registered businesses. Complete your business registration to unlock this."
          />
        ) : !state.canManage ? (
          <Locked title="No permission" body="You don't have permission to manage this organization's website. Ask an admin to grant the Manage public website permission." />
        ) : (
          <div className="space-y-6 mt-6">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> <span>{notice}</span>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4">
              <Field label="Published Framer URL" hint="The https:// URL of your published Framer site (e.g. https://your-site.framer.app).">
                <input
                  type="url"
                  value={framerOrigin}
                  onChange={(e) => setFramerOrigin(e.target.value)}
                  placeholder="https://your-site.framer.app"
                  className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </Field>

              <Field label="Public URL slug" hint="2–40 lowercase letters, numbers or hyphens. This becomes your public address.">
                <div className="flex items-center gap-0 bg-black border border-zinc-700 rounded-lg overflow-hidden focus-within:border-blue-500">
                  <span className="px-3 py-2 text-sm text-zinc-500 border-r border-zinc-800 whitespace-nowrap">/sites/</span>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    placeholder="acme"
                    className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </Field>

              <Field label="Title (optional)" hint="A label for your reference.">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Acme Corp marketing site"
                  className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </Field>

              <div className="flex flex-wrap gap-2 pt-1">
                {state.site ? (
                  <button onClick={() => submit('PUT')} disabled={busy} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
                  </button>
                ) : (
                  <button onClick={() => submit('POST')} disabled={busy || !slug || !framerOrigin} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Connect website
                  </button>
                )}
                {state.site && (
                  <>
                    <button onClick={toggleStatus} disabled={busy} className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-sm rounded-lg px-4 py-2">
                      <Power className="w-4 h-4" /> {state.site.status === 'active' ? 'Take offline' : 'Bring online'}
                    </button>
                    <button onClick={disconnect} disabled={busy} className="inline-flex items-center gap-2 border border-red-500/30 text-red-300 hover:border-red-500/60 text-sm rounded-lg px-4 py-2">
                      <Trash2 className="w-4 h-4" /> Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>

            {state.site && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full ${state.site.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <code className="text-sm text-blue-300 truncate">{publicUrl}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={copyUrl} className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 rounded-md px-2.5 py-1.5">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
                    </button>
                    <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 rounded-md px-2.5 py-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </a>
                    <button onClick={() => setPreviewKey((k) => k + 1)} className="inline-flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 rounded-md px-2.5 py-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Reload
                    </button>
                  </div>
                </div>
                {state.site.status === 'active' ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg overflow-hidden border border-zinc-800 bg-black">
                    <iframe
                      key={previewKey}
                      src={`/sites/${state.site.slug}/`}
                      title="Website preview"
                      className="w-full h-[480px] bg-white"
                    />
                  </motion.div>
                ) : (
                  <div className="text-sm text-zinc-500 py-8 text-center">Website is offline. Bring it online to preview.</div>
                )}
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Note: your Framer site is reverse-proxied under a sub-path. Initial page loads and assets work, but Framer's
                  in-page navigation may not follow the sub-path on every link. For full fidelity, point a Framer custom domain
                  at this URL or keep the site to a single page.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-600 mt-1">{hint}</span>}
    </label>
  );
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-5 h-5 text-zinc-500" />
      </div>
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <p className="text-sm text-zinc-500 max-w-sm mx-auto">{body}</p>
    </div>
  );
}
