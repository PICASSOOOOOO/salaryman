import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { Loader2, Check, Unlink, AlertCircle } from 'lucide-react';

interface DiscordStatus {
  configured: boolean;
  linked: boolean;
  discordUsername?: string | null;
  linkedAt?: string | null;
}

function DiscordIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041q.36.698.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612" />
    </svg>
  );
}

const LINK_ERRORS: Record<string, string> = {
  already_linked: 'That Discord account is already linked to another SALARYMAN account.',
  session: 'Your session changed during the connect. Please try again.',
  login_required: 'Please sign in before connecting Discord.',
  unavailable: 'Discord sign-in is not configured right now.',
  discord_link_state: 'Connect failed (security check). Please try again.',
  failed: 'Could not connect your Discord account. Please try again.',
};

export default function DiscordLinkSection() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/auth/discord/status');
      if (!r.ok) throw new Error('Failed to load Discord link status');
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
    const linked = params.get('discord_linked');
    const linkError = params.get('discord_link_error');
    if (linked) setNotice('Discord account connected.');
    if (linkError) setError(LINK_ERRORS[linkError] ?? 'Could not connect your Discord account.');
    if (linked || linkError) {
      params.delete('discord_linked');
      params.delete('discord_link_error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  const connect = () => {
    const returnTo = window.location.pathname || '/profile';
    window.location.href = apiUrl(
      `/api/auth/discord/connect?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Discord from your account? You can still sign in with your other method.')) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await apiFetch('/api/auth/discord/disconnect', { method: 'POST' });
      if (!r.ok) throw new Error(`Disconnect failed (${r.status})`);
      setNotice('Discord account disconnected.');
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
      transition={{ delay: 0.21 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[#5865F2]/15 border border-border flex items-center justify-center text-[#5865F2]">
          <DiscordIcon size={16} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Discord Account</p>
          <p className="text-xs text-muted-foreground">Add Discord as another way to sign in to this account</p>
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
          Discord sign-in is not configured for this deployment.
        </div>
      )}

      {!loading && status?.configured && status.linked && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {status.discordUsername ? `@${status.discordUsername}` : 'Connected'}
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
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/30 hover:bg-[#5865F2]/20 text-foreground text-sm font-semibold transition-colors"
        >
          <DiscordIcon size={16} /> Connect Discord
        </button>
      )}
    </motion.section>
  );
}
