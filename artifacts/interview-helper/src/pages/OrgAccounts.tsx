import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LabelList,
} from 'recharts';
import {
  Landmark, ArrowRightLeft, Loader2, RefreshCw, TrendingUp,
  TrendingDown, ArrowUpRight, ArrowDownRight, CheckCircle,
  AlertCircle, Wallet, PiggyBank, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

interface OrgAccount {
  id: number;
  orgId: number;
  type: string;
  label: string;
  balanceFiat: number;
  apyBps: number;
  updatedAt: string;
}

interface OrgAccountTransaction {
  id: number;
  orgId: number;
  accountType: string;
  delta: number;
  balanceAfter: number;
  description: string;
  category: string;
  actorUserId: string | null;
  createdAt: string;
}

interface AccountsData {
  orgId: number;
  orgName: string;
  accounts: OrgAccount[];
  transactions: { checking: OrgAccountTransaction[]; savings: OrgAccountTransaction[] };
  pagination?: {
    checkingPage: number;
    savingsPage: number;
    perPage: number;
    checkingHasMore: boolean;
    savingsHasMore: boolean;
  };
}

interface RevenueFlowData {
  monthLabel: string;
  grossRevenue: number;
  totalOutflows: number;
  netPosition: number;
  incomeSources: { name: string; value: number; color: string }[];
  outflowCategories: { name: string; value: number; color: string }[];
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `ƒ${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `ƒ${(n / 1_000).toFixed(1)}k`
    : `ƒ${Math.round(n).toLocaleString()}`;

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] font-mono text-zinc-500 mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="text-xs font-mono" style={{ color: p.fill ?? '#38bdf8' }}>
          {p.name ?? p.dataKey}: <span className="text-zinc-200">ƒ{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function AccountCard({
  account,
  onTransfer,
  canManage,
}: {
  account: OrgAccount;
  onTransfer: () => void;
  canManage: boolean;
}) {
  const isChecking = account.type === 'checking';
  const accent = isChecking
    ? { text: 'text-sky-300', border: 'border-sky-500/25', glow: 'rgba(56,189,248,0.1)', bg: 'bg-sky-500/10', icon: Wallet }
    : { text: 'text-emerald-300', border: 'border-emerald-500/25', glow: 'rgba(52,211,153,0.1)', bg: 'bg-emerald-500/10', icon: PiggyBank };
  const Icon = accent.icon;
  const apy = (account.apyBps / 100).toFixed(2);

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${accent.border} bg-white/[0.02] p-6`}>
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none" style={{ background: accent.glow }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center`}>
              <Icon className={`w-4.5 h-4.5 ${accent.text}`} />
            </div>
            <div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{account.label}</div>
              {account.apyBps > 0 && (
                <div className="text-[9px] font-bold text-emerald-400 tracking-widest uppercase mt-0.5">
                  {apy}% APY
                </div>
              )}
            </div>
          </div>
          {canManage && (
            <button
              onClick={onTransfer}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest border transition-colors ${accent.bg} ${accent.border} ${accent.text} hover:opacity-80`}
            >
              <ArrowRightLeft className="w-3 h-3" />
              Transfer
            </button>
          )}
        </div>
        <div className={`text-4xl font-bold font-mono ${accent.text} leading-none tracking-tight`}>
          {fmt(account.balanceFiat)}
        </div>
        <div className="text-[10px] font-mono text-zinc-600 mt-1.5 uppercase tracking-widest">
          {isChecking ? 'Daily operations · invoices · payroll' : 'Interest-bearing reserve · 4.25% APY'}
        </div>
      </div>
    </div>
  );
}

function TxList({ transactions }: { transactions: OrgAccountTransaction[] }) {
  if (transactions.length === 0) {
    return <div className="text-center py-8 text-zinc-700 text-xs font-mono">NO TRANSACTIONS YET</div>;
  }
  return (
    <div className="space-y-px">
      {transactions.map((tx) => {
        const isCredit = tx.delta > 0;
        return (
          <div key={tx.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isCredit ? 'bg-sky-500/10' : 'bg-zinc-500/10'}`}>
              {isCredit
                ? <ArrowUpRight className="w-3 h-3 text-sky-400" />
                : <ArrowDownRight className="w-3 h-3 text-zinc-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-300 truncate">{tx.description}</div>
              <div className="text-[10px] text-zinc-600 font-mono">{fmtDate(tx.createdAt)} · <span className="text-zinc-500">{tx.category}</span></div>
            </div>
            <div className={`text-xs font-mono font-bold shrink-0 ${isCredit ? 'text-sky-400' : 'text-zinc-400'}`}>
              {isCredit ? '+' : ''}ƒ{Math.abs(tx.delta).toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RevenueFlowPanel({ orgId }: { orgId: number }) {
  const [data, setData] = useState<RevenueFlowData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/orgs/${orgId}/accounts/revenue-flow`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-6 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) return null;

  const hasData = data.grossRevenue > 0 || data.totalOutflows > 0;
  const netPositive = data.netPosition >= 0;

  const barData = [
    ...data.incomeSources.map((s) => ({ ...s, group: 'income' })),
    { name: 'Gross Revenue', value: data.grossRevenue, color: '#38bdf8', group: 'gross' },
    ...data.outflowCategories.map((s) => ({ ...s, group: 'outflow' })),
    { name: 'Net Position', value: Math.abs(data.netPosition), color: netPositive ? '#34d399' : '#fb7185', group: 'net' },
  ];

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Revenue Flow</div>
          <div className="text-xs font-mono text-zinc-400">{data.monthLabel}</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Gross</div>
            <div className="text-sm font-bold font-mono text-sky-400">{fmt(data.grossRevenue)}</div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Outflows</div>
            <div className="text-sm font-bold font-mono text-orange-400">{fmt(data.totalOutflows)}</div>
          </div>
          <div>
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">Net</div>
            <div className={`text-sm font-bold font-mono ${netPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netPositive ? '+' : '-'}{fmt(Math.abs(data.netPosition))}
            </div>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-zinc-700 text-xs font-mono">
          NO TRANSACTIONS THIS MONTH — RECORD INVOICES, PAYROLL, OR EXPENSES TO SEE FLOW
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: 'rgba(161,161,170,0.5)', fontSize: 8, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={42}
            />
            <YAxis
              tick={{ fill: 'rgba(161,161,170,0.4)', fontSize: 8, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            />
            <Tooltip content={<ModernTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell key={i} fill={entry.color} opacity={entry.group === 'gross' || entry.group === 'net' ? 1 : 0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {hasData && (
        <div className="mt-4 flex flex-wrap gap-3">
          {barData.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TransferModal({
  accounts,
  onClose,
  onSuccess,
  orgId,
}: {
  accounts: OrgAccount[];
  onClose: () => void;
  onSuccess: () => void;
  orgId: number;
}) {
  const checking = accounts.find((a) => a.type === 'checking');
  const savings = accounts.find((a) => a.type === 'savings');
  const [fromType, setFromType] = useState<'checking' | 'savings'>('checking');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toType = fromType === 'checking' ? 'savings' : 'checking';
  const fromAccount = accounts.find((a) => a.type === fromType);
  const amt = Math.round(Number(amount));
  const valid = Number.isFinite(amt) && amt > 0 && fromAccount && fromAccount.balanceFiat >= amt;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/orgs/${orgId}/accounts/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromType, toType, amount: amt, memo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Transfer failed');
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-widest">Transfer Funds</span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">From Account</div>
          <div className="grid grid-cols-2 gap-2">
            {(['checking', 'savings'] as const).map((t) => {
              const acc = accounts.find((a) => a.type === t);
              const active = fromType === t;
              return (
                <button
                  key={t}
                  onClick={() => setFromType(t)}
                  className={`p-3 rounded-xl border text-left transition-all ${active ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/8 bg-white/[0.02] hover:border-white/15'}`}
                >
                  <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-0.5">{t}</div>
                  <div className={`text-sm font-bold font-mono ${active ? 'text-sky-300' : 'text-zinc-300'}`}>
                    {fmt(acc?.balanceFiat ?? 0)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">TO: {toType}</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">Amount (ƒ)</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-lg font-mono text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 transition-colors"
          />
          {fromAccount && amt > 0 && fromAccount.balanceFiat < amt && (
            <div className="text-[10px] text-rose-400 font-mono mt-1">
              Insufficient funds (available: {fmt(fromAccount.balanceFiat)})
            </div>
          )}
        </div>

        <div className="mb-5">
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">Memo (optional)</div>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Reason for transfer…"
            maxLength={200}
            className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-sky-500/40 font-mono transition-colors"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-3 text-xs text-rose-400 font-mono">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!valid || saving || success}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 text-sm font-mono uppercase tracking-widest hover:bg-sky-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : success ? <CheckCircle className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
          {success ? 'Transferred!' : saving ? 'Processing…' : `Transfer ${amt > 0 ? fmt(amt) : ''}`}
        </button>
      </div>
    </div>
  );
}

export default function OrgAccounts() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const [data, setData] = useState<AccountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'checking' | 'savings'>('checking');
  const [showTransfer, setShowTransfer] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [checkingPage, setCheckingPage] = useState(1);
  const [savingsPage, setSavingsPage] = useState(1);

  const fetchData = useCallback(async (cPage = checkingPage, sPage = savingsPage) => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ checkingPage: String(cPage), savingsPage: String(sPage) });
      const r = await apiFetch(`/api/orgs/current/accounts?${params}`);
      if (r.status === 403) {
        setError("You need Manager+ access to view org accounts.");
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const d: AccountsData = await r.json();
      setData(d);

      const checkManage = await apiFetch('/api/orgs/current/accounts/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __probe: true }),
      });
      setCanManage(checkManage.status !== 403);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load org accounts');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, checkingPage, savingsPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goPage = (tab: 'checking' | 'savings', dir: 1 | -1) => {
    if (tab === 'checking') {
      const next = Math.max(1, checkingPage + dir);
      setCheckingPage(next);
      fetchData(next, savingsPage);
    } else {
      const next = Math.max(1, savingsPage + dir);
      setSavingsPage(next);
      fetchData(checkingPage, next);
    }
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view org accounts." />;

  const checking = data?.accounts.find((a) => a.type === 'checking');
  const savings = data?.accounts.find((a) => a.type === 'savings');
  const activeTxs = data?.transactions[activeTab] ?? [];
  const pagination = data?.pagination;
  const activePage = activeTab === 'checking' ? checkingPage : savingsPage;
  const activeHasMore = activeTab === 'checking' ? (pagination?.checkingHasMore ?? false) : (pagination?.savingsHasMore ?? false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-sky-500/4 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-sky-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Org Accounts' : 'ORG TREASURY'}
              </h2>
            </div>
            {data?.orgName && (
              <p className="text-sm text-muted-foreground ml-12 font-mono">
                {data.orgName.toUpperCase()} · CHECKING & SAVINGS
              </p>
            )}
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-6 text-xs font-mono text-red-400/80">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {checking && (
                <AccountCard
                  account={checking}
                  onTransfer={() => setShowTransfer(true)}
                  canManage={canManage}
                />
              )}
              {savings && (
                <AccountCard
                  account={savings}
                  onTransfer={() => setShowTransfer(true)}
                  canManage={canManage}
                />
              )}
            </div>

            <div className="mb-6">
              <RevenueFlowPanel orgId={data.orgId} />
            </div>

            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Transaction History</div>
                <div className="flex gap-1">
                  {(['checking', 'savings'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`px-3 py-1 rounded-full text-[9px] font-mono tracking-widest uppercase transition-colors border ${
                        activeTab === t ? 'bg-white/8 text-zinc-200 border-white/10' : 'text-zinc-600 border-white/[0.04] hover:text-zinc-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <TxList transactions={activeTxs} />
              {(activePage > 1 || activeHasMore) && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
                  <button
                    onClick={() => goPage(activeTab, -1)}
                    disabled={activePage <= 1 || loading}
                    className="px-3 py-1 rounded-lg text-[9px] font-mono tracking-widest uppercase border border-white/8 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-[9px] font-mono text-zinc-600">Page {activePage}</span>
                  <button
                    onClick={() => goPage(activeTab, 1)}
                    disabled={!activeHasMore || loading}
                    className="px-3 py-1 rounded-lg text-[9px] font-mono tracking-widest uppercase border border-white/8 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showTransfer && data && (
        <TransferModal
          accounts={data.accounts}
          orgId={data.orgId}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => fetchData()}
        />
      )}
    </div>
  );
}
