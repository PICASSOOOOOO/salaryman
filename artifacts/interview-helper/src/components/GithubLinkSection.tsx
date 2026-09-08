import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { Loader2, Check, Unlink, AlertCircle } from 'lucide-react';

interface GithubStatus {
  configured: boolean;
  linked: boolean;
  githubLogin?: string | null;
  linkedAt?: string | null;
}

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const LINK_ERRORS: Record<string, string> = {
  already_linked: 'That GitHub account is already linked to another SALARYMAN account.',
  session: 'Your session changed during the connect. Please try again.',
  login_required: 'Please sign in before connecting GitHub.',
  unavailable: 'GitHub sign-in is not configured right now.',
  github_link_state: 'Connect failed (security check). Please try again.',
  failed: 'Could not connect your GitHub account. Please try again.',
};

export default function GithubLinkSection() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/auth/github/status');
      if (!r.ok) throw new Error('Failed to load GitHub link status');
      setStatus(await r.json());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Surface the result of a connect redirect, then strip the query params so a
  // refresh doesn't replay the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('github_linked');
    const linkError = params.get('github_link_error');
    if (linked) setNotice('GitHub account connected.');
    if (linkError) setError(LINK_ERRORS[linkError] ?? 'Could not connect your GitHub account.');
    if (linked || linkError) {
      params.delete('github_linked');
      params.delete('github_link_error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  const connect = () => {
    const returnTo = window.location.pathname || '/profile';
    window.location.href = apiUrl(
      `/api/auth/github/connect?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  const disconnect = async () => {
    if (!confirm('Disconnect GitHub from your account? You can still sign in with your other method.')) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await apiFetch('/api/auth/github/disconnect', { method: 'POST' });
      if (!r.ok) throw new Error(`Disconnect failed (${r.status})`);
      setNotice('GitHub account disconnected.');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.19 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-foreground/10 border border-border flex items-center justify-center text-foreground">
          <GithubIcon size={16} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">GitHub Account</p>
          <p className="text-xs text-muted-foreground">Add GitHub as another way to sign in to this account</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-primary/50 animate-spin" />}
        {!loading && status?.linked && (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-mono tracking-wider">
            <Check className="w-3.5 h-3.5" /> LINKED
          </span>
        )}
      </div>

      {notice && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs">
          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !status?.configured && (
        <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
          GitHub sign-in is not configured for this deployment.
        </div>
      )}

      {!loading && status?.configured && status.linked && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {status.githubLogin ? `@${status.githubLogin}` : 'Connected'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {status.linkedAt ? `Connected ${new Date(status.linkedAt).toLocaleDateString()}` : 'Connected'}
            </p>
          </div>
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 text-xs font-mono tracking-wider transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />} DISCONNECT
          </button>
        </div>
      )}

      {!loading && status?.configured && !status.linked && (
        <button
          onClick={connect}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-foreground/5 border border-border hover:bg-foreground/10 text-foreground text-sm font-semibold transition-colors"
        >
          <GithubIcon size={16} /> Connect GitHub
        </button>
      )}
    </motion.section>
  );
}
