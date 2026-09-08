import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Gift, Mail, Smartphone, Loader2, Check, Clock, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface ReferralInviteRow {
  id: number;
  channel: 'email' | 'sms';
  recipient: string | null;
  status: 'sent' | 'accepted';
  note: string | null;
  createdAt: string;
  acceptedAt: string | null;
}

interface ReferralData {
  invites: ReferralInviteRow[];
  counts: { sent: number; accepted: number; rewardsEarned: number; fiatEarned: number };
  rewardPerReferral: number;
  welcomeReward: number;
}

export function ReferralPanel({ boomerMode = false }: { boomerMode?: boolean }) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/referrals/mine');
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(async () => {
    if (!recipient.trim() || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const r = await apiFetch('/api/referrals/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, recipient: recipient.trim(), note: note.trim() || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setFeedback({ kind: 'ok', msg: 'Invite sent! You both earn a reward when they join.' });
        setRecipient('');
        setNote('');
        load();
      } else {
        setFeedback({ kind: 'err', msg: d.error ?? 'Could not send invite.' });
      }
    } catch {
      setFeedback({ kind: 'err', msg: 'Network error — please try again.' });
    } finally {
      setSending(false);
    }
  }, [channel, recipient, note, sending, load]);

  const reward = data?.rewardPerReferral ?? 5000;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 }}
      className="bg-card border border-border rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <Gift className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {boomerMode ? 'Invite Friends' : 'INVITE FRIENDS · EARN ƒ'}
          </p>
          <p className="text-xs text-muted-foreground">
            You and your friend each get ƒ{reward.toLocaleString()} when they join.
          </p>
        </div>
      </div>

      {/* Reward summary */}
      {data && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-lg font-bold text-foreground">{data.counts.sent}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sent</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-lg font-bold text-emerald-400">{data.counts.accepted}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Joined</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-lg font-bold text-amber-400">ƒ{data.counts.fiatEarned.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Earned</div>
          </div>
        </div>
      )}

      {/* Channel toggle */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setChannel('email')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
            channel === 'email'
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-primary/30'
          }`}
        >
          <Mail className="w-3.5 h-3.5" /> Email
        </button>
        <button
          type="button"
          onClick={() => setChannel('sms')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
            channel === 'sms'
              ? 'border-primary/50 bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-primary/30'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" /> Text
        </button>
      </div>

      {/* Input */}
      <input
        type={channel === 'email' ? 'email' : 'tel'}
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder={channel === 'email' ? 'friend@example.com' : '+1 555 123 4567'}
        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 mb-2"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="Add a personal note (optional)"
        rows={2}
        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 mb-3 resize-none"
      />

      <button
        type="button"
        onClick={send}
        disabled={sending || !recipient.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? 'Sending…' : 'Send invite'}
      </button>

      {feedback && (
        <p className={`mt-2 text-xs ${feedback.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {feedback.msg}
        </p>
      )}

      {/* Sent invites list */}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : data && data.invites.length > 0 ? (
        <div className="mt-5 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Your invites</p>
          {data.invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border bg-muted/10"
            >
              <div className="flex items-center gap-2 min-w-0">
                {inv.channel === 'email' ? (
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs text-foreground truncate">{inv.recipient}</span>
              </div>
              {inv.status === 'accepted' ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                  <Check className="w-3 h-3" /> Joined
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  <Clock className="w-3 h-3" /> Pending
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}

export default ReferralPanel;
