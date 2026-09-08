/**
 * BancoOmbraHub — command-desk financial hub in MyOffice.
 *
 * Five sub-tabs:
 *   Accounts       — checking / savings / vault balances + quick transfer
 *   Transactions   — paginated ledger across all accounts
 *   World Economy  — ƒ circulation, richest/poorest, player credit + debt
 *   Markets        — live forex / estimated indices + commodities, 60s refresh
 *   Debt & Plans   — payment plan status + Pay Now shortcut
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { FIAT_PER_GOLD } from '@/gameSystems';
import { getActiveCityName } from '@/lib/city-defs';
import {
  Landmark, ArrowLeftRight, TrendingUp, TrendingDown, Globe,
  Coins, Gem, CreditCard, AlertTriangle, Trophy, RefreshCw,
  Activity, ArrowUp, ArrowDown, Minus, Loader2,
} from 'lucide-react';

// ── Shared types ──────────────────────────────────────────────────────────────
type Account = { id: number; kind: string; label: string; balance: number; apyBps: number };
type Tx = { id: number; accountId: number; kind: string; description: string; amount: number; balanceAfter: number; createdAt: string };
type EconomyStats = {
  totalCirculation: number; accountCount: number; userCount: number;
  richest: { name: string; total: number }[];
  poorest: { name: string; total: number }[];
  asOf: number;
};
type Wallet = {
  bank?: { fiatTotal?: number; earnedFiat?: number };
  debt?: number; creditScore?: number;
  rates?: { fiatPerUsd?: number; goldOzPerUsd?: number };
};
type ForexRate  = { pair: string; base: string; rate: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };
type IndexRate  = { ticker: string; name: string; value: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };
type CommodityRate = { name: string; unit: string; value: number; change24h: number | null; fiatImpact: string; isEstimated: boolean };
type MarketData = { forex: ForexRate[]; indices: IndexRate[]; commodities: CommodityRate[]; liveAt: number; isEstimated: boolean };
type PlanView = {
  active: boolean;
  balance?: number; principal?: number; installment?: number; term?: number;
  paid?: number; missed?: number; nextDueAt?: string | null; overdue?: boolean;
  debt?: number; score?: number; aprBps?: number; apr?: number;
  quotes?: { term: number; installment: number; total: number; apr: number }[];
};

// ── Formatting helpers ────────────────────────────────────────────────────────
const fiat = (n: number | undefined | null) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000_000) return `ƒ${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000)     return `ƒ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)         return `ƒ${(v / 1_000).toFixed(1)}K`;
  return `ƒ${v.toLocaleString()}`;
};
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const fmtDt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const num = (n: number | undefined | null) => Number(n || 0).toLocaleString();

const TX_TONE: Record<string, string> = {
  deposit: 'text-emerald-400', withdraw: 'text-rose-400', transfer: 'text-cyan-400',
  fee: 'text-amber-400', interest: 'text-emerald-400', payroll: 'text-emerald-400',
  gold_cashout: 'text-amber-400',
};

const KIND_ICON: Record<string, string> = {
  checking: '🏦', savings: '🐖', vault: '🔒',
};

// ── Reusable card shell ───────────────────────────────────────────────────────
function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
function Section({ title, icon, right, children }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest text-zinc-300">
          {icon && <span className="text-sky-400">{icon}</span>}{title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-zinc-600">{text}</div>;
}

function Spinner() {
  return <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-zinc-600" size={20} /></div>;
}

// ── Sub-tab bar ───────────────────────────────────────────────────────────────
type SubTab = 'accounts' | 'transactions' | 'world-economy' | 'markets' | 'debt';
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'accounts',      label: 'ACCOUNTS'      },
  { id: 'transactions',  label: 'TRANSACTIONS'  },
  { id: 'world-economy', label: 'WORLD ECONOMY' },
  { id: 'markets',       label: 'MARKETS'       },
  { id: 'debt',          label: 'DEBT & PLANS'  },
];

// ── Transfer modal ────────────────────────────────────────────────────────────
function TransferModal({
  accounts, onClose, onDone,
}: { accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const [fromId, setFromId] = useState<string>(String(accounts[0]?.id ?? ''));
  const [toId,   setToId]   = useState<string>(String(accounts[1]?.id ?? ''));
  const [amount, setAmount] = useState('');
  const [memo,   setMemo]   = useState('');
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState('');

  const submit = async () => {
    const amt = Math.round(Number(amount));
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (fromId === toId)  { setErr('From and To must differ.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/api/economy/bank/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: Number(fromId), toId: Number(toId), amount: amt, memo: memo || 'TRANSFER' }),
      });
      if (!r.ok) { const d = await r.json(); setErr(d?.error || 'Transfer failed.'); return; }
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="mb-5 font-mono text-sm uppercase tracking-widest text-zinc-300">Internal Transfer</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-zinc-500">From</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)}
              className="w-full rounded border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label} — {fiat(a.balance)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-zinc-500">To</label>
            <select value={toId} onChange={e => setToId(e.target.value)}
              className="w-full rounded border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none">
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label} — {fiat(a.balance)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Amount (ƒ)</label>
            <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Memo (optional)</label>
            <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="e.g. monthly transfer"
              className="w-full rounded border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none" />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/25 disabled:opacity-50">
            {busy && <Loader2 className="animate-spin" size={13} />} Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Accounts sub-tab ──────────────────────────────────────────────────────────
function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/economy/bank/accounts');
      if (r.ok) { const d = await r.json(); setAccounts(d.accounts ?? []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  return (
    <Panel>
      <Section title="Your Banco Ombra Accounts" icon={<Landmark size={14} />}
        right={
          <button onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-sky-300 hover:bg-sky-500/20">
            <ArrowLeftRight size={11} /> Transfer
          </button>
        }>
        {accounts.length === 0
          ? <Empty text="No accounts found." />
          : <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {accounts.map(a => (
                <div key={a.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    <span>{KIND_ICON[a.kind] ?? '🏦'}</span>
                    <span>{a.label}</span>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-bold text-zinc-50">{fiat(a.balance)}</div>
                  {a.apyBps > 0
                    ? <div className="mt-1 text-[11px] text-emerald-400">{pct(a.apyBps)} APY</div>
                    : <div className="mt-1 text-[11px] text-zinc-600">No interest</div>}
                  <div className="mt-2 font-mono text-[9px] uppercase tracking-widest text-zinc-700">
                    {a.kind === 'vault' ? `GLD-V${a.id}` : `Acct ••${String(a.id).padStart(4, '0').slice(-4)}`}
                  </div>
                </div>
              ))}
            </div>
        }
      </Section>
      <div className="rounded-lg border border-white/5 bg-white/[0.01] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
        Banco Ombra · All deposits insured by PABLO CORP Financial Division · Transfer fee: none
      </div>
      {showTransfer && accounts.length >= 2 && (
        <TransferModal
          accounts={accounts}
          onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); load(); }}
        />
      )}
    </Panel>
  );
}

// ── Transactions sub-tab ──────────────────────────────────────────────────────
const TX_PAGE = 25;

function TransactionsTab() {
  const [txs,     setTxs]     = useState<Tx[]>([]);
  const [page,    setPage]    = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiFetch('/api/economy/bank/transactions?limit=200').then(async r => {
      if (!alive) return;
      if (r.ok) { const d = await r.json(); setTxs(d.transactions ?? []); }
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <Spinner />;

  const pages = Math.max(1, Math.ceil(txs.length / TX_PAGE));
  const slice = txs.slice(page * TX_PAGE, page * TX_PAGE + TX_PAGE);

  return (
    <Panel>
      <Section title="Transaction Ledger" icon={<Activity size={14} />}
        right={
          <span className="font-mono text-[10px] text-zinc-600">{txs.length} records</span>
        }>
        {txs.length === 0
          ? <Empty text="No transactions yet. Your ledger is clean." />
          : <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Date', 'Description', 'Amount', 'Balance After'].map(h => (
                        <th key={h} className="pb-2 pr-4 text-left font-mono text-[9px] uppercase tracking-widest text-zinc-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map(tx => (
                      <tr key={tx.id} className="border-b border-white/5 last:border-0">
                        <td className="py-2 pr-4 font-mono text-[11px] text-zinc-500 whitespace-nowrap">{fmtDt(tx.createdAt)}</td>
                        <td className="py-2 pr-4 text-xs text-zinc-300 max-w-[200px] truncate">{tx.description || tx.kind}</td>
                        <td className={`py-2 pr-4 font-mono text-[11px] whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'} ${TX_TONE[tx.kind] || ''}`}>
                          {tx.amount >= 0 ? '+' : ''}{fiat(tx.amount)}
                        </td>
                        <td className="py-2 font-mono text-[11px] text-zinc-400 whitespace-nowrap">{fiat(tx.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="rounded border border-white/10 px-3 py-1 text-[11px] font-mono text-zinc-400 disabled:opacity-30 hover:bg-white/5">← Prev</button>
                  <span className="font-mono text-[11px] text-zinc-600">{page + 1} / {pages}</span>
                  <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                    className="rounded border border-white/10 px-3 py-1 text-[11px] font-mono text-zinc-400 disabled:opacity-30 hover:bg-white/5">Next →</button>
                </div>
              )}
            </>
        }
      </Section>
    </Panel>
  );
}

// ── World Economy sub-tab ─────────────────────────────────────────────────────
function WorldEconomyTab({ econ, wallet }: { econ: EconomyStats | null; wallet: Wallet | null }) {
  return (
    <Panel>
      <Section title="ƒ in Circulation" icon={<Coins size={14} />}
        right={econ ? <span className="font-mono text-[10px] text-zinc-600">updated {new Date(econ.asOf).toLocaleTimeString()}</span> : null}>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Circulation', value: fiat(econ?.totalCirculation), accent: 'text-emerald-400' },
            { label: 'Bank Accounts',     value: num(econ?.accountCount),      accent: 'text-sky-400'     },
            { label: 'Players',           value: num(econ?.userCount),          accent: 'text-fuchsia-400' },
            { label: 'ƒ per Gold Bar',    value: fiat(FIAT_PER_GOLD),           accent: 'text-amber-400'   },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{label}</div>
              <div className={`mt-1 font-mono text-lg font-bold ${accent}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
              <Trophy size={13} /> Richest in {getActiveCityName()}
            </div>
            <ol className="space-y-1.5">
              {(econ?.richest ?? []).map((p, i) => (
                <li key={`r${i}`} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-zinc-600">#{i + 1}</span>
                    <span className="text-zinc-200">{p.name}</span>
                  </span>
                  <span className="flex items-center gap-1 font-mono text-emerald-400"><TrendingUp size={12} />{fiat(p.total)}</span>
                </li>
              ))}
              {(!econ?.richest || econ.richest.length === 0) && <li className="text-xs text-zinc-600">No data yet.</li>}
            </ol>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-red-400">
              <TrendingDown size={13} /> Down & Out
            </div>
            <ol className="space-y-1.5">
              {(econ?.poorest ?? []).map((p, i) => (
                <li key={`p${i}`} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="text-zinc-200">{p.name}</span>
                  <span className="font-mono text-red-400">{fiat(p.total)}</span>
                </li>
              ))}
              {(!econ?.poorest || econ.poorest.length === 0) && <li className="text-xs text-zinc-600">No data yet.</li>}
            </ol>
          </div>
        </div>
      </Section>

      <Section title="Your Rates" icon={<Gem size={14} />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'ƒ per USD', value: wallet?.rates?.fiatPerUsd ? num(wallet.rates.fiatPerUsd) : '—', accent: 'text-amber-400' },
            { label: 'Gold oz / USD', value: wallet?.rates?.goldOzPerUsd != null ? String(wallet.rates.goldOzPerUsd) : '—', accent: 'text-amber-400' },
            { label: 'Credit Score', value: wallet?.creditScore != null ? num(wallet.creditScore) : '—', accent: 'text-sky-400' },
            { label: 'Debt', value: fiat(wallet?.debt), accent: wallet?.debt ? 'text-red-400' : 'text-zinc-400' },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{label}</div>
              <div className={`mt-1 font-mono text-xl font-bold ${accent}`}>{value}</div>
            </div>
          ))}
        </div>
      </Section>
    </Panel>
  );
}

// ── Markets sub-tab ───────────────────────────────────────────────────────────
function ChangeArrow({ change }: { change: number | null }) {
  if (change === null) return <Minus size={12} className="text-zinc-600" />;
  if (change > 0)  return <ArrowUp  size={12} className="text-emerald-400" />;
  if (change < 0)  return <ArrowDown size={12} className="text-rose-400" />;
  return <Minus size={12} className="text-zinc-600" />;
}
function changeColor(change: number | null) {
  if (change === null) return 'text-zinc-500';
  if (change > 0)  return 'text-emerald-400';
  if (change < 0)  return 'text-rose-400';
  return 'text-zinc-500';
}

function LiveBadge({ isEstimated }: { isEstimated: boolean }) {
  return isEstimated
    ? <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-400">ESTIMATED</span>
    : <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400">LIVE</span>;
}

function MarketsTab() {
  const [data,     setData]    = useState<MarketData | null>(null);
  const [loading,  setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/economy/markets');
      if (r.ok) { const d = await r.json(); setData(d); setLastFetch(Date.now()); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) return <Spinner />;

  const age = lastFetch ? Math.floor((Date.now() - lastFetch) / 1000) : null;

  return (
    <Panel>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Real-world rates · every rate maps to an in-game ƒ value
        </div>
        <div className="flex items-center gap-2">
          {age !== null && <span className="font-mono text-[10px] text-zinc-700">{age}s ago</span>}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:bg-white/5 disabled:opacity-40">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Forex */}
      <Section title="Forex" icon={<Globe size={14} />}
        right={<LiveBadge isEstimated={data?.isEstimated ?? true} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(data?.forex ?? []).map(f => (
            <div key={f.pair} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-zinc-100">{f.pair}</span>
                <LiveBadge isEstimated={f.isEstimated} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-xl font-bold text-sky-300">{f.rate.toFixed(4)}</span>
                <span className="flex items-center gap-0.5 font-mono text-[11px]">
                  <ChangeArrow change={f.change24h} />
                  <span className={changeColor(f.change24h)}>{f.change24h !== null ? `${f.change24h > 0 ? '+' : ''}${f.change24h.toFixed(2)}%` : '—'}</span>
                </span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-500">{f.fiatImpact}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Stock Indices */}
      <Section title="Stock Indices" icon={<TrendingUp size={14} />}
        right={<LiveBadge isEstimated={true} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(data?.indices ?? []).map(idx => (
            <div key={idx.ticker} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{idx.ticker}</span>
                <LiveBadge isEstimated={idx.isEstimated} />
              </div>
              <div className="mt-1 font-mono text-xs text-zinc-300">{idx.name}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-xl font-bold text-fuchsia-300">{idx.value.toLocaleString()}</span>
                <span className="flex items-center gap-0.5 font-mono text-[11px]">
                  <ChangeArrow change={idx.change24h} />
                  <span className={changeColor(idx.change24h)}>{idx.change24h !== null ? `${idx.change24h > 0 ? '+' : ''}${idx.change24h.toFixed(2)}%` : '—'}</span>
                </span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-500">{idx.fiatImpact}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Commodities */}
      <Section title="Commodities" icon={<Gem size={14} />}
        right={<LiveBadge isEstimated={true} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(data?.commodities ?? []).map(c => (
            <div key={c.name} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-zinc-100">{c.name}</span>
                <LiveBadge isEstimated={c.isEstimated} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-xl font-bold text-amber-300">${c.value.toLocaleString()}/{c.unit}</span>
                <span className="flex items-center gap-0.5 font-mono text-[11px]">
                  <ChangeArrow change={c.change24h} />
                  <span className={changeColor(c.change24h)}>{c.change24h !== null ? `${c.change24h > 0 ? '+' : ''}${c.change24h.toFixed(2)}%` : '—'}</span>
                </span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-500">{c.fiatImpact}</div>
            </div>
          ))}
        </div>
      </Section>

      <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3 text-[10px] text-zinc-500">
        <span className="text-amber-400 font-mono uppercase tracking-widest">Note · </span>
        Real market moves shift your daily ƒ exchange rate. Indices and commodities are reference values.
        Forex rates are live from public feeds; all other figures are estimated.
      </div>
    </Panel>
  );
}

// ── Debt & Plans sub-tab ──────────────────────────────────────────────────────
function DebtTab({ wallet }: { wallet: Wallet | null }) {
  const [plan,    setPlan]    = useState<PlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/credit/plan');
      if (r.ok) { const d = await r.json(); setPlan(d); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const payNow = async () => {
    if (!plan?.active) return;
    setPaying(true); setErr(''); setToast('');
    try {
      const r = await apiFetch('/api/credit/plan/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet?.bank?.fiatTotal ?? 0 }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d?.error || 'Payment failed.'); return; }
      setToast(d.done ? 'Plan paid off!' : `Installment paid · ƒ${Number(d.paid || 0).toLocaleString()}`);
      load();
    } finally { setPaying(false); }
  };

  if (loading) return <Spinner />;

  return (
    <Panel>
      {toast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">{toast}</div>
      )}
      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{err}</div>
      )}

      {/* Outstanding debt summary */}
      <Section title="Debt Overview" icon={<AlertTriangle size={14} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Outstanding Debt</div>
            <div className={`mt-1 font-mono text-2xl font-bold ${plan?.debt ? 'text-red-400' : 'text-emerald-400'}`}>
              {plan?.active ? fiat(plan.balance) : fiat(plan?.debt)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Credit Score</div>
            <div className="mt-1 font-mono text-2xl font-bold text-sky-400">{plan?.score != null ? num(plan.score) : '—'}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">APR</div>
            <div className="mt-1 font-mono text-2xl font-bold text-amber-400">
              {plan?.aprBps != null ? pct(plan.aprBps) : '—'}
            </div>
          </div>
        </div>
      </Section>

      {/* Active payment plan */}
      {plan?.active ? (
        <Section title="Active Payment Plan" icon={<CreditCard size={14} />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Remaining Balance', value: fiat(plan.balance) },
                { label: 'Installment',       value: fiat(plan.installment) },
                { label: 'Payments Made',     value: String(plan.paid ?? 0) },
                { label: 'Term',              value: `${plan.term ?? 0} installments` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{label}</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-zinc-100">{value}</div>
                </div>
              ))}
            </div>

            {plan.nextDueAt && (
              <div className={`rounded-lg border px-4 py-2 text-sm ${plan.overdue ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-sky-500/20 bg-sky-500/5 text-sky-300'}`}>
                {plan.overdue ? '⚠ OVERDUE — ' : ''}Next payment due: {new Date(plan.nextDueAt).toLocaleDateString()}
              </div>
            )}

            {plan.missed != null && plan.missed > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-300">
                {plan.missed} missed installment{plan.missed !== 1 ? 's' : ''} — late fee may apply.
              </div>
            )}

            <button onClick={payNow} disabled={paying}
              className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 font-mono text-sm text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50">
              {paying && <Loader2 className="animate-spin" size={14} />}
              Pay One Installment — {fiat(plan.installment)}
            </button>
          </div>
        </Section>
      ) : (
        /* No active plan */
        plan?.debt && plan.debt > 0 ? (
          <Section title="No Active Plan" icon={<CreditCard size={14} />}>
            <p className="mb-4 text-sm text-zinc-400">
              You have <span className="text-red-400 font-semibold">{fiat(plan.debt)}</span> in outstanding debt.
              Enroll in a payment plan at Banco Ombra to restructure at a fixed interest rate and stand down the collectors.
            </p>
            {(plan.quotes ?? []).length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Available Plans</div>
                {plan.quotes!.map(q => (
                  <div key={q.term} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.02] px-4 py-2">
                    <span className="text-sm text-zinc-300">{q.term} installments</span>
                    <span className="font-mono text-sm text-zinc-100">{fiat(q.installment)}/installment</span>
                    <span className="font-mono text-[11px] text-zinc-600">total {fiat(q.total)}</span>
                  </div>
                ))}
                <p className="text-[11px] text-zinc-600 mt-2">Enroll at any Banco Ombra branch in the city.</p>
              </div>
            )}
          </Section>
        ) : (
          <Section title="Debt Status" icon={<CreditCard size={14} />}>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-6 text-center">
              <div className="font-mono text-2xl text-emerald-400 mb-1">✓ CLEAR</div>
              <div className="text-sm text-zinc-400">No outstanding debt. The collectors are at ease.</div>
            </div>
          </Section>
        )
      )}
    </Panel>
  );
}

// ── Main Hub ──────────────────────────────────────────────────────────────────
export interface BancoOmbraHubProps {
  wallet: Wallet | null;
  econ:   EconomyStats | null;
}

export function BancoOmbraHub({ wallet, econ }: BancoOmbraHubProps) {
  const [active, setActive] = useState<SubTab>('accounts');

  return (
    <div className="space-y-5">
      {/* Brand header */}
      <div className="flex items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-5 py-3">
        <Landmark size={18} className="text-sky-400 flex-shrink-0" />
        <div>
          <div className="font-mono text-sm font-bold uppercase tracking-widest text-sky-300">BANCO OMBRA</div>
          <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">Command Desk · Full Economy Hub · All accounts insured by PABLO CORP</div>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide rounded-lg border border-white/5 bg-zinc-900/30 p-1">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`shrink-0 whitespace-nowrap rounded px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              active === t.id
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {active === 'accounts'      && <AccountsTab />}
      {active === 'transactions'  && <TransactionsTab />}
      {active === 'world-economy' && <WorldEconomyTab econ={econ} wallet={wallet} />}
      {active === 'markets'       && <MarketsTab />}
      {active === 'debt'          && <DebtTab wallet={wallet} />}
    </div>
  );
}
