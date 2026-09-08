import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Loader2, RefreshCw, ArrowUpRight, ArrowDownRight,
  Scale, CalendarClock, Wallet, AlertTriangle, Landmark,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface CashFlowRow { month: string; inflow: number; payroll: number; bills: number; expenses: number; outflow: number; net: number; balance: number; }
interface LedgerRow { date: string; refType: string; refId: number; memo: string; debit: number; credit: number; balance: number; }
interface TrialRow { account: string; debit: number; credit: number; grossDebit: number; grossCredit: number; }
interface AgingBuckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; }
interface AgingItem { id: number; ref: string; party: string; dueDate: string; amount: number; daysOverdue: number; bucket: string; }
interface AgingSide { buckets: AgingBuckets; items: AgingItem[]; }
interface TaxPaymentRow { id: number; period: string; cityId: string; netProfit: number; taxAmount: number; status: string; settledAt: string | null; createdAt: string; }
interface Accounting {
  asOf: string;
  summary: { totalRevenue: number; totalPayroll: number; totalBills: number; totalExpenses: number; totalTaxPayments: number; netProfit: number; cashBalance: number; arOutstanding: number; apOutstanding: number; };
  cashFlow: CashFlowRow[];
  cashLedger: LedgerRow[];
  trialBalance: TrialRow[];
  trialBalanceTotals: { debit: number; credit: number };
  aging: { receivables: AgingSide; payables: AgingSide };
  taxPayments: TaxPaymentRow[];
}

function fmt$(v: number) {
  const neg = v < 0;
  return `${neg ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type Tab = 'cashflow' | 'ledger' | 'trial' | 'aging' | 'tax';

export default function Accounting() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Accounting | null>(null);
  const [tab, setTab] = useState<Tab>('cashflow');

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/enterprise/accounting');
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view the accounting books." />;

  const s = data?.summary;
  const tabs: { id: Tab; label: string; boomer: string; icon: typeof BookOpen }[] = [
    { id: 'cashflow', label: 'CASH FLOW', boomer: 'Cash Flow', icon: CalendarClock },
    { id: 'ledger', label: 'GENERAL LEDGER', boomer: 'Ledger', icon: BookOpen },
    { id: 'trial', label: 'TRIAL BALANCE', boomer: 'Trial Balance', icon: Scale },
    { id: 'aging', label: 'AR / AP AGING', boomer: 'Aging', icon: CalendarClock },
    { id: 'tax', label: 'CITY TAX', boomer: 'City Tax', icon: Landmark },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Accounting' : 'ACCOUNTING — THE BOOKS'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Full financial statements for your business.' : 'CASH FLOW · GENERAL LEDGER · TRIAL BALANCE · AGING'}
            </p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50 shrink-0">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : !data ? (
          <div className="text-center py-20 text-sm text-muted-foreground">No accounting data available.</div>
        ) : (
          <div className="space-y-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="REVENUE" value={fmt$(s!.totalRevenue)} tone="emerald" />
              <KpiCard label="NET PROFIT" value={fmt$(s!.netProfit)} tone={s!.netProfit >= 0 ? 'emerald' : 'red'} />
              <KpiCard label="A/R OUTSTANDING" value={fmt$(s!.arOutstanding)} tone="amber" sub="owed to you" />
              <KpiCard label="A/P OUTSTANDING" value={fmt$(s!.apOutstanding)} tone="red" sub="you owe" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {tabs.map((t) => {
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} data-testid={`acct-tab-${t.id}`}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-colors border ${active ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300'}`}>
                    <t.icon className="w-3 h-3" />
                    {boomerMode ? t.boomer : t.label}
                  </button>
                );
              })}
            </div>

            {tab === 'cashflow' && <CashFlowSheet rows={data.cashFlow} />}
            {tab === 'ledger' && <LedgerSheet rows={data.cashLedger} />}
            {tab === 'trial' && <TrialBalanceSheet rows={data.trialBalance} totals={data.trialBalanceTotals} />}
            {tab === 'aging' && <AgingSheet ar={data.aging.receivables} ap={data.aging.payables} />}
            {tab === 'tax' && <TaxPaymentsSheet rows={data.taxPayments ?? []} total={s?.totalTaxPayments ?? 0} />}

            <div className="text-[10px] text-zinc-600 font-mono text-center">
              Books computed live from invoices &amp; ledger · as of {data.asOf}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function KpiCard({ label, value, tone, sub }: { label: string; value: string; tone: 'emerald' | 'red' | 'amber' | 'cyan'; sub?: string }) {
  const map = {
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-400',
    red: 'border-red-500/20 bg-red-500/[0.03] text-red-400',
    amber: 'border-amber-500/20 bg-amber-500/[0.03] text-amber-400',
    cyan: 'border-cyan-500/20 bg-cyan-500/[0.03] text-cyan-400',
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${map}`}>
      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-lg sm:text-xl font-bold">{value}</div>
      {sub && <div className="text-[9px] text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function SheetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return <div className="px-5 py-10 text-center text-xs text-zinc-600">{msg}</div>;
}

function CashFlowSheet({ rows }: { rows: CashFlowRow[] }) {
  if (!rows.length) return <SheetShell title="STATEMENT OF CASH FLOWS — MONTHLY"><EmptyRow msg="No cash activity yet. Mark invoices paid and log bills/expenses to populate." /></SheetShell>;
  return (
    <SheetShell title="STATEMENT OF CASH FLOWS — MONTHLY">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
              <th className="text-left px-4 py-2.5">Period</th>
              <th className="text-right px-4 py-2.5">Inflow</th>
              <th className="text-right px-4 py-2.5">Payroll</th>
              <th className="text-right px-4 py-2.5">Bills</th>
              <th className="text-right px-4 py-2.5">Expenses</th>
              <th className="text-right px-4 py-2.5">Net</th>
              <th className="text-right px-4 py-2.5">Cash Bal.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-zinc-800/50 hover:bg-white/[0.01] font-mono">
                <td className="px-4 py-2.5 text-foreground font-bold">{monthLabel(r.month)}</td>
                <td className="px-4 py-2.5 text-right text-emerald-400">{fmt$(r.inflow)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{r.payroll ? `(${fmt$(r.payroll)})` : '—'}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{r.bills ? `(${fmt$(r.bills)})` : '—'}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{r.expenses ? `(${fmt$(r.expenses)})` : '—'}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${r.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt$(r.net)}</td>
                <td className={`px-4 py-2.5 text-right ${r.balance >= 0 ? 'text-cyan-300' : 'text-red-400'}`}>{fmt$(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SheetShell>
  );
}

function LedgerSheet({ rows }: { rows: LedgerRow[] }) {
  if (!rows.length) return <SheetShell title="GENERAL LEDGER — CASH ACCOUNT (1000)"><EmptyRow msg="No journal entries yet." /></SheetShell>;
  return (
    <SheetShell title="GENERAL LEDGER — CASH ACCOUNT (1000)">
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Memo</th>
              <th className="text-right px-4 py-2.5">Debit</th>
              <th className="text-right px-4 py-2.5">Credit</th>
              <th className="text-right px-4 py-2.5">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.refType}-${r.refId}-${i}`} className="border-b border-zinc-800/50 hover:bg-white/[0.01] font-mono">
                <td className="px-4 py-2.5 text-zinc-500 whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-2.5 text-foreground max-w-[260px] truncate" title={r.memo}>{r.memo}</td>
                <td className="px-4 py-2.5 text-right text-emerald-400">{r.debit ? fmt$(r.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-red-400">{r.credit ? fmt$(r.credit) : '—'}</td>
                <td className={`px-4 py-2.5 text-right font-bold ${r.balance >= 0 ? 'text-cyan-300' : 'text-red-400'}`}>{fmt$(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SheetShell>
  );
}

function TrialBalanceSheet({ rows, totals }: { rows: TrialRow[]; totals: { debit: number; credit: number } }) {
  if (!rows.length) return <SheetShell title="TRIAL BALANCE — CHART OF ACCOUNTS"><EmptyRow msg="No posted accounts yet." /></SheetShell>;
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01;
  return (
    <SheetShell title="TRIAL BALANCE — CHART OF ACCOUNTS">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
              <th className="text-left px-4 py-2.5">Account</th>
              <th className="text-right px-4 py-2.5">Debit</th>
              <th className="text-right px-4 py-2.5">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account} className="border-b border-zinc-800/50 hover:bg-white/[0.01] font-mono">
                <td className="px-4 py-2.5 text-foreground">{r.account}</td>
                <td className="px-4 py-2.5 text-right text-emerald-400">{r.debit ? fmt$(r.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-red-400">{r.credit ? fmt$(r.credit) : '—'}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-700 bg-zinc-900/40 font-mono font-bold">
              <td className="px-4 py-3 text-foreground">TOTALS</td>
              <td className="px-4 py-3 text-right text-emerald-400">{fmt$(totals.debit)}</td>
              <td className="px-4 py-3 text-right text-red-400">{fmt$(totals.credit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={`px-5 py-2.5 text-[10px] font-mono flex items-center gap-1.5 ${balanced ? 'text-emerald-400' : 'text-amber-400'}`}>
        {balanced ? <Scale className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
        {balanced ? 'IN BALANCE — debits equal credits' : 'OUT OF BALANCE — review entries'}
      </div>
    </SheetShell>
  );
}

const BUCKET_COLS: { key: keyof AgingBuckets; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1–30' },
  { key: 'd31_60', label: '31–60' },
  { key: 'd61_90', label: '61–90' },
  { key: 'd90_plus', label: '90+' },
];

function AgingTable({ title, icon: Icon, side, partyLabel, accent }: { title: string; icon: typeof Wallet; side: AgingSide; partyLabel: string; accent: string }) {
  return (
    <SheetShell title={title}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
              {BUCKET_COLS.map((c) => <th key={c.key} className="text-right px-3 py-2.5">{c.label}</th>)}
              <th className="text-right px-3 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-800 font-mono font-bold">
              {BUCKET_COLS.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 text-right ${c.key === 'd90_plus' && side.buckets[c.key] > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
                  {side.buckets[c.key] ? fmt$(side.buckets[c.key]) : '—'}
                </td>
              ))}
              <td className={`px-3 py-2.5 text-right ${accent}`}>{fmt$(side.buckets.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {side.items.length === 0 ? (
        <EmptyRow msg="Nothing outstanding — all settled." />
      ) : (
        <div className="max-h-[40vh] overflow-y-auto border-t border-zinc-800/60">
          {side.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/40 hover:bg-white/[0.01] font-mono text-xs">
              <Icon className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-foreground truncate">{it.party}</div>
                <div className="text-[9px] text-zinc-600">{partyLabel} {it.ref} · due {it.dueDate}</div>
              </div>
              {it.daysOverdue > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${it.daysOverdue > 90 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {it.daysOverdue}d overdue
                </span>
              )}
              <div className={`text-right ${accent} shrink-0`}>{fmt$(it.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </SheetShell>
  );
}

function AgingSheet({ ar, ap }: { ar: AgingSide; ap: AgingSide }) {
  return (
    <div className="space-y-6">
      <AgingTable title="ACCOUNTS RECEIVABLE AGING — OWED TO YOU" icon={ArrowUpRight} side={ar} partyLabel="INV" accent="text-emerald-400" />
      <AgingTable title="ACCOUNTS PAYABLE AGING — YOU OWE" icon={ArrowDownRight} side={ap} partyLabel="" accent="text-red-400" />
    </div>
  );
}

const TAX_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-400',
  debt: 'bg-red-500/15 text-red-400',
  owed: 'bg-amber-500/15 text-amber-400',
};

function cityLabel(cityId: string): string {
  const map: Record<string, string> = {
    minx_city: 'Minx City',
    huda_city: 'Huda City',
  };
  return map[cityId] ?? cityId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function TaxPaymentsSheet({ rows, total }: { rows: TaxPaymentRow[]; total: number }) {
  return (
    <div className="space-y-4">
      <SheetShell title="CITY BUSINESS TAX — 50% OF NET PROFIT PER PERIOD">
        {rows.length === 0 ? (
          <EmptyRow msg="No city business tax charges yet. Tax is assessed monthly on net business profit." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border-b border-zinc-800">
                    <th className="text-left px-4 py-2.5">Period</th>
                    <th className="text-left px-4 py-2.5">City</th>
                    <th className="text-right px-4 py-2.5">Net Profit</th>
                    <th className="text-right px-4 py-2.5">Tax (50%)</th>
                    <th className="text-center px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-white/[0.01] font-mono">
                      <td className="px-4 py-2.5 text-foreground font-bold whitespace-nowrap">
                        City Business Tax ({r.period})
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{cityLabel(r.cityId)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{fmt$(r.netProfit)}</td>
                      <td className="px-4 py-2.5 text-right text-red-400 font-bold">({fmt$(r.taxAmount)})</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${TAX_STATUS_STYLE[r.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 text-[10px]">
                        {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-700 bg-zinc-900/40 font-mono font-bold">
                    <td colSpan={3} className="px-4 py-3 text-foreground">TOTAL TAX ASSESSED</td>
                    <td className="px-4 py-3 text-right text-red-400">({fmt$(total)})</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-2.5 text-[10px] font-mono text-zinc-600 flex items-center gap-1.5">
              <Landmark className="w-3 h-3 text-zinc-700" />
              Tax is assessed at 50% of monthly net profit. <span className="text-amber-500">OWED</span> = pending · <span className="text-red-400">DEBT</span> = added to Banco Ombra · <span className="text-emerald-400">PAID</span> = settled
            </div>
          </>
        )}
      </SheetShell>
    </div>
  );
}
