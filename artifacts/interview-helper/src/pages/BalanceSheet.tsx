import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Loader2, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Users, Receipt, CreditCard, ArrowUpRight, ArrowDownRight, FileText,
  Banknote, Wallet, AlertTriangle, Link2, ExternalLink, Building2, Landmark,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface BalanceSummary {
  grossInvoiceIncome: number;
  payrollTotal: number;
  billsTotal: number;
  expensesTotal: number;
  totalOutgoings: number;
  netProfit: number;
}

interface LedgerRow {
  id: number;
  type: string;
  category: string;
  amount: string;
  description: string;
  txDate: string;
  createdAt: string;
  referenceType: string | null;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  issueDate: string;
}

interface BalanceSheetData {
  summary: BalanceSummary;
  ledger: LedgerRow[];
  invoices: InvoiceSummary[];
}

interface GustoStatus {
  connected: boolean;
  companyName?: string;
  employeeCount?: number;
  lastPayroll?: string;
  nextPayroll?: string;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.FC<{ className?: string }> }> = {
  income: { label: 'Income', color: 'text-sky-400', bg: 'bg-sky-500/10', icon: ArrowUpRight },
  payroll: { label: 'Payroll', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Users },
  bill: { label: 'Bill', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: Receipt },
  expense: { label: 'Expense', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: CreditCard },
};

function CurrencyCard({ label, symbol, value, icon: Icon, color, borderColor, sub, isDebt }: {
  label: string; symbol: string; value: number; icon: React.FC<{ className?: string }>;
  color: string; borderColor: string; sub: string; isDebt?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div className={`bg-white/[0.025] border rounded-2xl p-5 relative overflow-hidden ${isNeg ? 'border-red-500/30' : borderColor}`}>
      {isNeg && (
        <div className="absolute top-2 right-2">
          <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isNeg ? 'bg-red-500/10' : color.replace('text-', 'bg-').replace('400', '500/10')}`}>
          <Icon className={`w-4 h-4 ${isNeg ? 'text-red-400' : color}`} />
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className={`text-3xl font-bold leading-none ${isNeg ? 'text-red-400' : color}`}>
        {isNeg ? '-' : ''}{symbol}{Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="text-[10px] font-mono text-zinc-600 tracking-wide mt-2">{sub}</div>
      {isNeg && isDebt && (
        <div className="mt-3 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 w-fit">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">DEBT</span>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, prefix = '$', sub }: {
  label: string; value: number; icon: React.FC<{ className?: string }>;
  color: string; prefix?: string; sub?: string;
}) {
  const isNeg = value < 0;
  return (
    <div className="bg-white/[0.025] border border-white/8 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-bold leading-none ${isNeg ? 'text-red-400' : color}`}>
        {isNeg ? '-' : ''}{prefix}{Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {sub && <div className="text-[10px] font-mono text-zinc-700 tracking-wide mt-1">{sub}</div>}
    </div>
  );
}

export default function BalanceSheet() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ledgerType, setLedgerType] = useState<string>('all');

  const [fiatBalance, setFiatBalance] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);

  const [gustoStatus, setGustoStatus] = useState<GustoStatus>({ connected: false });

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch('/api/enterprise/balance-sheet');
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      d.summary.grossInvoiceIncome = Number(d.summary.grossInvoiceIncome);
      d.summary.payrollTotal = Number(d.summary.payrollTotal);
      d.summary.billsTotal = Number(d.summary.billsTotal);
      d.summary.expensesTotal = Number(d.summary.expensesTotal);
      d.summary.totalOutgoings = Number(d.summary.totalOutgoings);
      d.summary.netProfit = Number(d.summary.netProfit);
      setData(d);

      setAvailableBalance(d.summary.netProfit);

      try {
        const fRes = await apiFetch('/api/enterprise/fiat-balance');
        if (fRes.ok) {
          const fData = await fRes.json();
          setFiatBalance(fData.fiatBalance ?? 0);
        }
      } catch {}

      try {
        const gRes = await apiFetch('/api/enterprise/gusto-status');
        if (gRes.ok) {
          const gData = await gRes.json();
          setGustoStatus(gData);
        }
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load balance sheet');
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view the balance sheet." />;

  const filteredLedger = !data ? [] : (ledgerType === 'all' ? data.ledger : data.ledger.filter(r => r.type === ledgerType));

  const s = data?.summary;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-sky-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Balance Sheet' : 'NETWORTH-X'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'FIAT (game) vs AVAILABLE (real money) — full financial overview.' : 'DUAL CURRENCY LEDGER — FIAT ƒ VS AVAILABLE $ — DEBT TRACKING ENABLED.'}
            </p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-6 text-xs font-mono text-red-400/70">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {s && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <CurrencyCard
                label="FIAT BALANCE"
                symbol="ƒ"
                value={fiatBalance}
                icon={Banknote}
                color="text-amber-400"
                borderColor="border-amber-500/20"
                sub="IN-GAME CURRENCY — EARNED THROUGH GAMEPLAY"
                isDebt={fiatBalance < 0}
              />
              <CurrencyCard
                label="AVAILABLE TO WITHDRAW"
                symbol="$"
                value={availableBalance}
                icon={Wallet}
                color="text-emerald-400"
                borderColor="border-emerald-500/20"
                sub="REAL USD — BANK / STRIPE / GUSTO"
                isDebt={availableBalance < 0}
              />
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-white/[0.015] p-5 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-[0.15em]">INTEGRATIONS</span>
                <div className="flex-1 h-px bg-blue-500/10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`rounded-xl border p-4 ${gustoStatus.connected ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-zinc-800 bg-white/[0.01]'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-400 tracking-wider">GUSTO PAYROLL</span>
                  </div>
                  {gustoStatus.connected ? (
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-300">{gustoStatus.companyName}</div>
                      <div className="text-[10px] text-zinc-600 font-mono">{gustoStatus.employeeCount} employees</div>
                      {gustoStatus.lastPayroll && <div className="text-[10px] text-zinc-600 font-mono">Last run: {gustoStatus.lastPayroll}</div>}
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> CONNECTED
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] text-zinc-600 mb-2">Connect Gusto for payroll, W-2, 1099 import. ATMs sync real payroll data.</p>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-600">
                        <Link2 className="w-3 h-3" /> NOT CONNECTED
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-white/[0.01] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4 text-sky-400" />
                    <span className="text-[10px] font-bold text-sky-400 tracking-wider">BANK (PLAID)</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mb-2">Auto-import transactions from checking, savings, credit. Real-time reconciliation.</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-600">
                    <Link2 className="w-3 h-3" /> NOT CONNECTED
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-white/[0.01] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ExternalLink className="w-4 h-4 text-green-400" />
                    <span className="text-[10px] font-bold text-green-400 tracking-wider">GOOGLE SHEETS</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mb-2">Sync accounting data to live spreadsheets. Auto-generate P&L, budgets, reports.</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-600">
                    <Link2 className="w-3 h-3" /> NOT CONNECTED
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">REAL MONEY — FINANCIAL SUMMARY</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <SummaryCard label="Invoice Income" value={s.grossInvoiceIncome} icon={FileText} color="text-sky-400" sub="Paid invoices" />
                <SummaryCard label="Payroll Costs" value={s.payrollTotal} icon={Users} color="text-blue-400" sub="All pay runs" />
                <SummaryCard label="Bills Paid" value={s.billsTotal} icon={Receipt} color="text-orange-400" sub="Recorded payments" />
                <SummaryCard label="Expenses" value={s.expensesTotal} icon={CreditCard} color="text-purple-400" sub="All categories" />
                <SummaryCard label="Total Outgoings" value={s.totalOutgoings} icon={ArrowDownRight} color="text-red-400" sub="Payroll + bills + expenses" />
                <div className={`bg-white/[0.025] border rounded-xl p-4 ${s.netProfit >= 0 ? 'border-sky-500/20' : 'border-red-500/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {s.netProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-sky-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Net Profit</span>
                  </div>
                  <div className={`text-2xl font-bold leading-none ${s.netProfit >= 0 ? 'text-sky-400' : 'text-red-400'}`}>
                    {s.netProfit < 0 ? '-' : ''}${Math.abs(s.netProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] font-mono text-zinc-700 tracking-wide mt-1">
                    {s.netProfit < 0 ? 'YOU ARE IN DEBT' : 'Income minus all outgoings'}
                  </div>
                </div>
              </div>

              {s.grossInvoiceIncome > 0 && (
                <div className="bg-white/[0.025] border border-white/8 rounded-xl p-4">
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">Breakdown</div>
                  <div className="space-y-2">
                    {[
                      { label: 'Invoice Income', value: s.grossInvoiceIncome, color: 'bg-sky-500' },
                      { label: 'Payroll', value: -s.payrollTotal, color: 'bg-blue-500' },
                      { label: 'Bills', value: -s.billsTotal, color: 'bg-orange-500' },
                      { label: 'Expenses', value: -s.expensesTotal, color: 'bg-purple-500' },
                    ].map(item => {
                      const pct = s.grossInvoiceIncome > 0 ? Math.abs(item.value) / s.grossInvoiceIncome * 100 : 0;
                      return (
                        <div key={item.label} className="flex items-center gap-3">
                          <div className="w-20 text-[10px] text-zinc-600 font-mono uppercase tracking-wider shrink-0">{item.label}</div>
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${item.color} opacity-70`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <div className={`text-xs font-mono ${item.value >= 0 ? 'text-sky-400' : 'text-zinc-400'} shrink-0`}>
                            {item.value < 0 ? '-' : '+'}${Math.abs(item.value).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Transaction Ledger</div>
                <div className="flex gap-1">
                  {(['all', 'income', 'payroll', 'bill', 'expense'] as const).map(t => (
                    <button key={t} onClick={() => setLedgerType(t)}
                      className={`px-2.5 py-1 rounded-full text-[9px] font-mono tracking-widest uppercase transition-colors border ${
                        ledgerType === t ? 'bg-white/8 text-zinc-200 border-white/10' : 'text-zinc-600 border-white/[0.04] hover:text-zinc-400'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {filteredLedger.length === 0 && (
                <div className="text-center py-10 text-zinc-700 text-xs font-mono">
                  {data?.ledger.length === 0 ? 'No transactions yet. Record payroll, pay a bill, or log an expense.' : 'No transactions of this type.'}
                </div>
              )}

              <div className="space-y-1">
                {filteredLedger.map(row => {
                  const meta = TYPE_META[row.type] ?? TYPE_META.expense;
                  const Icon = meta.icon;
                  const amt = Number(row.amount);
                  return (
                    <div key={row.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-300 truncate">{row.description}</div>
                        <div className="text-[10px] text-zinc-600 font-mono">{row.txDate} · <span className={meta.color}>{meta.label}</span> · {row.category}</div>
                      </div>
                      <div className={`text-xs font-mono font-bold shrink-0 ${row.type === 'income' ? 'text-sky-400' : amt < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                        {row.type === 'income' ? '+' : '-'}${Math.abs(amt).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {data && data.invoices.length > 0 && (
                <div className="mt-6">
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3">Paid Invoices (Income Source)</div>
                  <div className="space-y-1">
                    {data.invoices.map(inv => (
                      <div key={inv.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-sky-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-zinc-300">{inv.clientName}</div>
                          <div className="text-[10px] text-zinc-600 font-mono">{inv.issueDate} · Invoice #{inv.invoiceNumber}</div>
                        </div>
                        <div className="text-xs font-mono font-bold text-sky-400 shrink-0">
                          +${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
