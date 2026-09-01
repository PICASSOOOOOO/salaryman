import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Loader2, RefreshCw, DollarSign,
  ArrowUpRight, ArrowDownRight, Minus, Calendar,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface FinancialSummary {
  totalIncome: number;
  totalPayroll: number;
  totalBills: number;
  totalExpenses: number;
  invoicesPaid: number;
  invoicesTotal: number;
  billsPaid: number;
  billsTotal: number;
}

function fmt$(v: number) {
  const neg = v < 0;
  return `${neg ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(part: number, whole: number) {
  if (whole === 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default function ProfitLoss() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [period, setPeriod] = useState<'all' | 'ytd' | 'month'>('all');

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/enterprise/summary');
      if (r.ok) {
        const d = await r.json();
        setData({
          totalIncome: d.totalIncome ?? d.grossIncome ?? 0,
          totalPayroll: d.totalPayroll ?? 0,
          totalBills: d.totalBills ?? 0,
          totalExpenses: d.totalExpenses ?? 0,
          invoicesPaid: d.invoicesPaid ?? 0,
          invoicesTotal: d.invoicesTotal ?? d.invoiceCount ?? 0,
          billsPaid: d.billsPaid ?? 0,
          billsTotal: d.billsTotal ?? d.billCount ?? 0,
        });
      }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view P&L." />;

  const income = data?.totalIncome ?? 0;
  const payroll = data?.totalPayroll ?? 0;
  const bills = data?.totalBills ?? 0;
  const expenses = data?.totalExpenses ?? 0;
  const totalCost = payroll + bills + expenses;
  const netProfit = income - totalCost;
  const margin = income > 0 ? (netProfit / income) * 100 : 0;

  const rows = [
    { label: 'REVENUE / INCOME', amount: income, color: 'text-emerald-400', icon: ArrowUpRight, sub: `${data?.invoicesPaid ?? 0} paid invoices` },
    { label: 'PAYROLL', amount: -payroll, color: 'text-red-400', icon: ArrowDownRight, sub: 'Employee compensation' },
    { label: 'BILLS & AP', amount: -bills, color: 'text-red-400', icon: ArrowDownRight, sub: `${data?.billsPaid ?? 0} paid bills` },
    { label: 'EXPENSES', amount: -expenses, color: 'text-red-400', icon: ArrowDownRight, sub: 'Operational spending' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Profit & Loss' : 'P&L — INCOME STATEMENT'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Revenue minus costs — your bottom line.' : 'REVENUE, COSTS, GROSS MARGIN, NET PROFIT BREAKDOWN.'}
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
        ) : (
          <div className="space-y-6">
            <div className={`rounded-2xl border p-6 ${netProfit >= 0 ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent' : 'border-red-500/20 bg-gradient-to-br from-red-500/[0.04] to-transparent'}`}>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">NET PROFIT</div>
              <div className={`text-2xl sm:text-4xl font-bold mb-2 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt$(netProfit)}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-1">
                  {netProfit >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                  <span className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {margin.toFixed(1)}% MARGIN
                  </span>
                </div>
                <span className="text-[10px] text-zinc-600 font-mono">
                  REVENUE {fmt$(income)} − COSTS {fmt$(totalCost)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">REVENUE</div>
                <div className="text-xl font-bold text-emerald-400">{fmt$(income)}</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">PAYROLL</div>
                <div className="text-xl font-bold text-red-400">{fmt$(payroll)}</div>
                {income > 0 && <div className="text-[9px] text-zinc-600 mt-0.5">{pct(payroll, income)} of revenue</div>}
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-4">
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">BILLS</div>
                <div className="text-xl font-bold text-orange-400">{fmt$(bills)}</div>
                {income > 0 && <div className="text-[9px] text-zinc-600 mt-0.5">{pct(bills, income)} of revenue</div>}
              </div>
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-4">
                <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">EXPENSES</div>
                <div className="text-xl font-bold text-purple-400">{fmt$(expenses)}</div>
                {income > 0 && <div className="text-[9px] text-zinc-600 mt-0.5">{pct(expenses, income)} of revenue</div>}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="bg-zinc-900/50 px-5 py-3 border-b border-zinc-800">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">INCOME STATEMENT BREAKDOWN</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800/50 hover:bg-white/[0.01] transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.amount >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    <r.icon className={`w-4 h-4 ${r.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-foreground">{r.label}</div>
                    <div className="text-[10px] text-zinc-600">{r.sub}</div>
                  </div>
                  <div className={`text-sm font-bold font-mono ${r.color}`}>
                    {r.amount >= 0 ? '+' : ''}{fmt$(r.amount)}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 px-5 py-4 bg-zinc-900/30">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-800">
                  <Minus className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-foreground">TOTAL COSTS</div>
                </div>
                <div className="text-sm font-bold font-mono text-red-400">-{fmt$(totalCost)}</div>
              </div>
              <div className={`flex items-center gap-4 px-5 py-4 ${netProfit >= 0 ? 'bg-emerald-500/[0.03]' : 'bg-red-500/[0.03]'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${netProfit >= 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  <DollarSign className={`w-4 h-4 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-foreground">NET PROFIT / (LOSS)</div>
                  <div className="text-[10px] text-zinc-600">{margin.toFixed(1)}% profit margin</div>
                </div>
                <div className={`text-lg font-bold font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt$(netProfit)}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
