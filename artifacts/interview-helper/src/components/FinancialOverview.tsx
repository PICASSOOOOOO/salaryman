import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { Landmark, RefreshCw, Trash2, Plus, ShieldCheck, Wallet, TrendingUp, Eye, KeyRound, ExternalLink, Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface BankAccountView {
  accountId: string;
  name: string;
  mask?: string | null;
  subtype?: string | null;
  currency: string;
  balanceCurrent: number | null;
  balanceFormatted: string | null;
  balanceHome: number;
}
interface BankView {
  id: number;
  institutionName: string | null;
  status: string;
  lastSyncAt: string | null;
  accounts: BankAccountView[];
  totalHome: number;
}
interface BrokerageView {
  botId: number;
  botName: string | null;
  broker: string;
  currency: string;
  isPaperMode: boolean;
  equityFormatted: string;
  equityHome: number;
}
interface OverviewResponse {
  homeCurrency: string;
  configured: boolean;
  banks: BankView[];
  brokerages: BrokerageView[];
  totals: {
    bankHome: number;
    brokerageHome: number;
    combinedHome: number;
    bankFormatted: string;
    brokerageFormatted: string;
    combinedFormatted: string;
  };
  currencies: string[];
}

const mono = { fontFamily: "var(--font-sans)" } as const;

function PlaidLinkButton({ linkToken, onSuccess, boomer }: { linkToken: string; onSuccess: (publicToken: string) => void; boomer: boolean }) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => onSuccess(publicToken),
  });
  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors disabled:opacity-50"
      style={boomer ? {} : mono}
    >
      <Plus className="w-3.5 h-3.5" />
      {boomer ? 'Continue to your bank' : 'CONTINUE TO BANK'}
    </button>
  );
}

function CredentialsForm({ boomer, envHint, onSaved }: { boomer: boolean; envHint: string | null; onSaved: () => void }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [env, setEnv] = useState(envHint || 'sandbox');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!clientId.trim() || !secret.trim()) {
      setErr(boomer ? 'Please enter both your Client ID and Secret.' : 'CLIENT ID + SECRET REQUIRED');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch('/api/banking/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), secret: secret.trim(), env }),
      });
      if (res.ok) {
        setClientId('');
        setSecret('');
        onSaved();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || (boomer ? 'Could not save your credentials.' : 'SAVE FAILED'));
      }
    } catch {
      setErr(boomer ? 'Could not save your credentials.' : 'SAVE FAILED');
    }
    setSaving(false);
  };

  const inputCls = 'w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-green-500/40 focus:outline-none';

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-green-400" />
        <span className="text-sm font-bold text-foreground" style={boomer ? {} : mono}>
          {boomer ? 'Connect with your own Plaid account' : 'YOUR PLAID CREDENTIALS'}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed" style={boomer ? {} : mono}>
        {boomer
          ? 'You use your own free Plaid account to link your banks. Create one, then paste your Client ID and Secret below. Your keys are encrypted and only ever used for your own accounts.'
          : 'BRING YOUR OWN PLAID KEYS \u00b7 CREATE A FREE ACCOUNT \u00b7 PASTE CLIENT ID + SECRET \u00b7 ENCRYPTED AT REST'}
      </p>
      <a
        href="https://dashboard.plaid.com/signup"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
        style={boomer ? {} : mono}
      >
        <ExternalLink className="w-3 h-3" /> {boomer ? 'Get free Plaid keys at dashboard.plaid.com' : 'GET KEYS \u2192 dashboard.plaid.com'}
      </a>
      <div className="space-y-2">
        <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={boomer ? 'Plaid Client ID' : 'PLAID CLIENT ID'} className={inputCls} style={boomer ? {} : mono} autoComplete="off" />
        <input value={secret} onChange={e => setSecret(e.target.value)} type="password" placeholder={boomer ? 'Plaid Secret' : 'PLAID SECRET'} className={inputCls} style={boomer ? {} : mono} autoComplete="off" />
        <select value={env} onChange={e => setEnv(e.target.value)} className={inputCls} style={boomer ? {} : mono}>
          <option value="sandbox">{boomer ? 'Sandbox (test, free)' : 'SANDBOX (TEST)'}</option>
          <option value="development">{boomer ? 'Development (real banks)' : 'DEVELOPMENT'}</option>
          <option value="production">{boomer ? 'Production (live)' : 'PRODUCTION'}</option>
        </select>
      </div>
      {err && <p className="text-[11px] text-amber-400" style={boomer ? {} : mono}>{err}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors disabled:opacity-50"
        style={boomer ? {} : mono}
      >
        <Lock className="w-3.5 h-3.5" />
        {saving ? (boomer ? 'Verifying...' : 'VERIFYING...') : (boomer ? 'Save & verify' : 'SAVE & VERIFY')}
      </button>
    </div>
  );
}

export default function FinancialOverview({ boomer }: { boomer: boolean }) {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [banks, setBanks] = useState<BankView[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [credEnv, setCredEnv] = useState<string | null>(null);
  const [credHint, setCredHint] = useState<string | null>(null);
  const [editingCreds, setEditingCreds] = useState(false);
  const [homeCurrency, setHomeCurrency] = useState('USD');
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (currency: string) => {
    setLoading(true);
    try {
      const [ovRes, connRes, credRes] = await Promise.all([
        apiFetch(`/api/banking/overview?currency=${encodeURIComponent(currency)}`),
        apiFetch('/api/banking/connections'),
        apiFetch('/api/banking/credentials'),
      ]);
      if (ovRes.ok) {
        const d: OverviewResponse = await ovRes.json();
        setOverview(d);
      }
      if (connRes.ok) {
        const d = await connRes.json();
        setBanks(d.connections ?? []);
      }
      if (credRes.ok) {
        const d = await credRes.json();
        setConfigured(Boolean(d.configured));
        setCredEnv(d.env ?? null);
        setCredHint(d.clientIdHint ?? null);
      }
    } catch {
      setError('Could not load your financial overview.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(homeCurrency); }, [load, homeCurrency]);

  const startLink = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/banking/link-token', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setLinkToken(d.linkToken);
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.code === 'NEEDS_CREDENTIALS') { setConfigured(false); setEditingCreds(true); }
        setError(d.error || 'Bank linking is unavailable right now.');
      }
    } catch {
      setError('Bank linking is unavailable right now.');
    }
    setStarting(false);
  };

  const onLinkSuccess = async (publicToken: string) => {
    setLinkToken(null);
    setStarting(true);
    try {
      const res = await apiFetch('/api/banking/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken }),
      });
      if (res.ok) await load(homeCurrency);
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to link bank account.');
      }
    } catch {
      setError('Failed to link bank account.');
    }
    setStarting(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await apiFetch('/api/banking/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await load(homeCurrency);
    } catch {}
    setRefreshing(false);
  };

  const disconnect = async (id: number) => {
    try {
      const res = await apiFetch(`/api/banking/connections/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBanks(prev => prev.filter(b => b.id !== id));
        await load(homeCurrency);
      }
    } catch {}
  };

  const removeCreds = async () => {
    try {
      const res = await apiFetch('/api/banking/credentials', { method: 'DELETE' });
      if (res.ok) { setConfigured(false); setCredHint(null); setCredEnv(null); }
    } catch {}
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="w-5 h-5 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin mr-3" />
        <span className="text-sm" style={boomer ? {} : mono}>{boomer ? 'Loading your finances...' : 'LOADING FINANCES...'}</span>
      </div>
    );
  }

  const totals = overview?.totals;
  const brokerages = overview?.brokerages ?? [];
  const currencies = overview?.currencies ?? ['USD', 'EUR', 'GBP', 'JPY'];

  return (
    <div className="space-y-4">
      {/* View-only notice */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
        <Eye className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed" style={boomer ? {} : mono}>
          {boomer
            ? 'View-only. You connect through your own Plaid account and your bank\u2019s official login. We never see your bank password and can never move your money.'
            : 'VIEW-ONLY \u00b7 YOUR OWN PLAID ACCOUNT \u00b7 BANK\u2019S SECURE LOGIN \u00b7 NO BANK PASSWORD STORED \u00b7 NO MONEY MOVEMENT'}
        </p>
      </div>

      {/* Combined net total */}
      <div className="rounded-xl border border-green-500/25 bg-gradient-to-br from-green-500/10 to-transparent p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground tracking-wide" style={boomer ? {} : mono}>
            {boomer ? 'TOTAL NET BALANCE' : 'COMBINED NET \u2014 BANK + BROKERAGE'}
          </span>
          <select
            value={homeCurrency}
            onChange={(e) => setHomeCurrency(e.target.value)}
            className="bg-muted/30 border border-border rounded px-2 py-0.5 text-[10px] text-foreground"
            style={boomer ? {} : mono}
          >
            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="text-3xl font-bold text-green-400">{totals?.combinedFormatted ?? '\u2014'}</div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-lg bg-muted/20 border border-border p-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1" style={boomer ? {} : mono}>
              <Wallet className="w-3 h-3" /> {boomer ? 'Bank accounts' : 'BANKS'}
            </span>
            <span className="text-base font-bold text-foreground">{totals?.bankFormatted ?? '\u2014'}</span>
          </div>
          <div className="rounded-lg bg-muted/20 border border-border p-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1" style={boomer ? {} : mono}>
              <TrendingUp className="w-3 h-3" /> {boomer ? 'Brokerage' : 'BROKERAGE'}
            </span>
            <span className="text-base font-bold text-foreground">{totals?.brokerageFormatted ?? '\u2014'}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-400" style={boomer ? {} : mono}>
          {error}
        </div>
      )}

      {/* Credentials: setup form when not configured (or editing), else compact status */}
      {(!configured || editingCreds) ? (
        <CredentialsForm
          boomer={boomer}
          envHint={credEnv}
          onSaved={async () => { setEditingCreds(false); await load(homeCurrency); }}
        />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 p-3">
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground" style={boomer ? {} : mono}>
            <KeyRound className="w-3.5 h-3.5 text-green-400" />
            {boomer ? 'Your Plaid account is connected' : 'PLAID KEYS SET'}
            {credHint ? <span className="text-muted-foreground/60">{credHint}</span> : null}
            {credEnv ? <span className="text-muted-foreground/40 uppercase">{credEnv}</span> : null}
          </span>
          <div className="flex items-center gap-3">
            <button onClick={() => setEditingCreds(true)} className="text-[11px] text-sky-400 hover:text-sky-300" style={boomer ? {} : mono}>{boomer ? 'Update' : 'EDIT'}</button>
            <button onClick={removeCreds} className="text-[11px] text-muted-foreground hover:text-red-400" style={boomer ? {} : mono}>{boomer ? 'Remove' : 'CLEAR'}</button>
          </div>
        </div>
      )}

      {/* Connect / refresh controls (only when credentials are present) */}
      {configured && !editingCreds && (
        <div className="flex items-center gap-2 flex-wrap">
          {linkToken ? (
            <PlaidLinkButton linkToken={linkToken} onSuccess={onLinkSuccess} boomer={boomer} />
          ) : (
            <button
              onClick={startLink}
              disabled={starting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors disabled:opacity-50"
              style={boomer ? {} : mono}
            >
              <Plus className="w-3.5 h-3.5" />
              {starting ? (boomer ? 'Preparing...' : 'PREPARING...') : (boomer ? 'Link a bank account' : 'LINK BANK ACCOUNT')}
            </button>
          )}
          {banks.length > 0 && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-muted/20 text-muted-foreground border border-border hover:border-green-500/30 transition-colors disabled:opacity-50"
              style={boomer ? {} : mono}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {boomer ? 'Refresh balances' : 'REFRESH'}
            </button>
          )}
        </div>
      )}

      {/* Linked banks */}
      <div className="space-y-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" style={boomer ? {} : mono}>
          <Landmark className="w-3.5 h-3.5" /> {boomer ? 'Linked bank accounts' : 'LINKED BANKS'}
        </span>
        {banks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground" style={boomer ? {} : mono}>
            {boomer ? 'No bank accounts linked yet.' : 'NO BANKS LINKED'}
          </div>
        ) : (
          banks.map(bank => (
            <div key={bank.id} className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${bank.status === 'error' ? 'text-amber-400' : 'text-green-400'}`} />
                  <span className="text-sm font-bold text-foreground">{bank.institutionName || (boomer ? 'Bank' : 'INSTITUTION')}</span>
                  {bank.status === 'error' && (
                    <span className="text-[9px] text-amber-400" style={boomer ? {} : mono}>{boomer ? 'needs attention' : 'RECONNECT'}</span>
                  )}
                </div>
                <button onClick={() => disconnect(bank.id)} title="Disconnect" className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {bank.accounts.map(acc => (
                  <div key={acc.accountId} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {acc.name}{acc.mask ? ` \u00b7\u00b7${acc.mask}` : ''} {acc.subtype ? <span className="text-muted-foreground/50">({acc.subtype})</span> : null}
                    </span>
                    <span className="font-bold text-foreground" style={boomer ? {} : mono}>{acc.balanceFormatted ?? '\u2014'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Brokerage balances (from the trading system) */}
      {brokerages.length > 0 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" style={boomer ? {} : mono}>
            <TrendingUp className="w-3.5 h-3.5" /> {boomer ? 'Brokerage accounts' : 'BROKERAGE'}
          </span>
          {brokerages.map((b, i) => (
            <div key={`${b.botId}-${b.broker}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-muted/10 p-3 text-xs">
              <span className="text-muted-foreground">
                {b.broker.toUpperCase()} {b.botName ? <span className="text-muted-foreground/50">· {b.botName}</span> : null} {b.isPaperMode ? <span className="text-amber-400/70">{boomer ? '(paper)' : 'PAPER'}</span> : null}
              </span>
              <span className="font-bold text-foreground" style={boomer ? {} : mono}>{b.equityFormatted}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
