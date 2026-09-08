import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { Loader2, Check, ExternalLink, Unlink, ChevronDown, ChevronRight, AlertCircle, KeyRound } from 'lucide-react';

interface GoogleStatus {
  configured: boolean;
  linked: boolean;
  googleEmail?: string | null;
  scope?: string | null;
  linkedAt?: string | null;
  hasClientId?: boolean;
}

export default function GoogleLinkSection() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const redirectUri = `${window.location.origin}/api/google/callback`;

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/me/google');
      if (!r.ok) throw new Error('Failed to load Google link status');
      setStatus(await r.json());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'salaryman:google-linked') {
        void load();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [load]);

  const saveCreds = async () => {
    setSaving(true); setError(null);
    try {
      const r = await apiFetch('/api/me/google/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${r.status})`);
      }
      setClientId(''); setClientSecret('');
      setShowCredentialsForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const startAuth = async () => {
    setAuthorizing(true); setError(null);
    try {
      const r = await apiFetch('/api/me/google/auth-url');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Failed (${r.status})`);
      window.open(j.url, 'google-oauth', 'width=560,height=720');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start authorization');
    } finally {
      setAuthorizing(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Unlink your Google account and forget your OAuth credentials?')) return;
    setError(null);
    try {
      const r = await apiFetch('/api/me/google', { method: 'DELETE' });
      if (!r.ok) throw new Error(`Unlink failed (${r.status})`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Unlink failed');
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 16.3 4.5 9.6 8.7 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.2 16.2 43.5 24 43.5z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.4-.4-3.5z"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Your Google Calendar</p>
          <p className="text-xs text-muted-foreground">Each user connects their own Google account.</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-primary/50 animate-spin" />}
        {!loading && status?.linked && (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono tracking-wider">
            <Check className="w-3.5 h-3.5" /> LINKED
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && status?.linked && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
            <div>
              <p className="text-sm font-semibold text-foreground">{status.googleEmail ?? 'Connected'}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {status.linkedAt ? `Linked ${new Date(status.linkedAt).toLocaleDateString()}` : 'Connected'}
              </p>
            </div>
            <button
              onClick={unlink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs font-mono tracking-wider transition-colors"
            >
              <Unlink className="w-3 h-3" /> UNLINK
            </button>
          </div>
        </div>
      )}

      {!loading && !status?.linked && (
        <div className="space-y-3">
          <button
            onClick={() => setShowInstructions((s) => !s)}
            className="w-full flex items-center justify-between text-left text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {showInstructions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              How to get your Google OAuth credentials
            </span>
          </button>

          {showInstructions && (
            <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-2 text-xs text-muted-foreground">
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  Go to{' '}
                  <a className="text-primary underline inline-flex items-center gap-0.5" target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/apis/credentials">
                    Google Cloud Console → Credentials <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>Create (or pick) a project, then click <span className="text-foreground">Create Credentials → OAuth client ID</span></li>
                <li>Application type: <span className="text-foreground">Web application</span></li>
                <li>
                  Add this exact <span className="text-foreground">Authorized redirect URI</span>:
                  <div className="mt-1 p-2 rounded bg-background border border-border font-mono text-[11px] text-foreground break-all select-all">{redirectUri}</div>
                </li>
                <li>
                  Enable the APIs you want under <span className="text-foreground">APIs &amp; Services → Library</span> (e.g. Google Calendar API)
                </li>
                <li>Copy the resulting <span className="text-foreground">Client ID</span> and <span className="text-foreground">Client Secret</span> below — they stay private to your account</li>
              </ol>
            </div>
          )}

          {!status?.configured && !showCredentialsForm && (
            <button
              onClick={() => setShowCredentialsForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 hover:bg-primary/15 text-primary text-sm font-semibold transition-colors"
            >
              <KeyRound className="w-4 h-4" /> Add OAuth credentials
            </button>
          )}

          {(showCredentialsForm || status?.configured) && (
            <div className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border">
              {status?.configured && !showCredentialsForm && (
                <p className="text-[11px] text-muted-foreground">Credentials are saved. You can replace them or proceed to link.</p>
              )}
              {(showCredentialsForm || !status?.configured) && (
                <>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Client ID (xxxxxxx.apps.googleusercontent.com)"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground font-mono"
                  />
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Client Secret"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground font-mono"
                  />
                  <button
                    onClick={saveCreds}
                    disabled={saving || !clientId.trim() || !clientSecret.trim()}
                    className="w-full px-4 py-2 rounded-lg bg-primary/15 border border-primary/30 hover:bg-primary/25 text-primary text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save credentials
                  </button>
                </>
              )}
              {status?.configured && !showCredentialsForm && (
                <button
                  onClick={() => setShowCredentialsForm(true)}
                  className="w-full px-3 py-2 rounded-lg border border-border hover:border-primary/30 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Replace saved credentials
                </button>
              )}
            </div>
          )}

          {status?.configured && (
            <button
              onClick={startAuth}
              disabled={authorizing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 hover:bg-emerald-500/15 text-emerald-300 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {authorizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Authorize with Google
            </button>
          )}
        </div>
      )}
    </motion.section>
  );
}
