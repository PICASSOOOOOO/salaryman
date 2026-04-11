import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase, Users, CalendarDays, Archive, FileText, TrendingUp,
  DollarSign, Receipt, CreditCard, Scale, Shield, Code2, Loader2,
  ArrowRight, Building2, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { Link } from 'wouter';

interface OrgData {
  org: { id: number; name: string; industry: string | null; size: string | null } | null;
  member: { role: string; title: string | null; salary: string | null } | null;
  members: { userId: string; role: string; status: string; title: string | null }[];
}

interface Summary {
  employees: { active: number };
  bills: { total: number; pending: number; overdue: number };
  expenses: { total: number; amount: number };
  invoices: { total: number; paid: number; open: number; overdue: number };
  payroll: { runs: number; total: number };
  financials: { grossIncome: number; payrollTotal: number; billsTotal: number; expensesTotal: number; netProfit: number };
}

const SECTIONS = [
  {
    title: 'PEOPLE & OPERATIONS',
    items: [
      { path: '/business/contacts', label: 'CONTACTS', boomer: 'CONTACTS', desc: 'MANAGE YOUR CONTACT DATABASE AND COMPANY RELATIONSHIPS', icon: Users, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/hiring', label: 'HIRING', boomer: 'HIRING & HR', desc: 'POST JOBS, TRACK APPLICANTS, AND MANAGE YOUR STAFF DIRECTORY', icon: Briefcase, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
      { path: '/business/interview', label: 'INTERVIEW OFFICE', boomer: 'INTERVIEW OFFICE', desc: 'CONDUCT AI-POWERED INTERVIEWS AND ASSESSMENTS', icon: Code2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
      { path: '/business/calendar', label: 'CALENDAR', boomer: 'CALENDAR', desc: 'SCHEDULE MEETINGS, DEADLINES, AND EVENTS', icon: CalendarDays, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
      { path: '/business/documents', label: 'DOCUMENTS', boomer: 'DOCUMENTS', desc: 'STORE AND ORGANIZE YOUR BUSINESS FILES', icon: Archive, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    ],
  },
  {
    title: 'SALES & REVENUE',
    items: [
      { path: '/business/deals', label: 'DEALS', boomer: 'DEALS', desc: 'TRACK YOUR SALES PIPELINE FROM LEAD TO CLOSE', icon: TrendingUp, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
      { path: '/business/invoices', label: 'INVOICES', boomer: 'INVOICES', desc: 'CREATE AND MANAGE CLIENT BILLING', icon: FileText, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    ],
  },
  {
    title: 'FINANCIALS',
    items: [
      { path: '/business/payroll', label: 'PAYROLL', boomer: 'PAYROLL', desc: 'RUN PAYROLL AND MANAGE EMPLOYEE COMPENSATION', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
      { path: '/business/bills', label: 'BILLS', boomer: 'BILLS', desc: 'TRACK AND PAY YOUR ACCOUNTS PAYABLE', icon: Receipt, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
      { path: '/business/expenses', label: 'EXPENSES', boomer: 'EXPENSES', desc: 'LOG AND CATEGORIZE BUSINESS SPENDING', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
      { path: '/business/balance-sheet', label: 'BALANCE SHEET', boomer: 'BALANCE SHEET', desc: 'VIEW YOUR COMPLETE FINANCIAL OVERVIEW', icon: Scale, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { path: '/insurance', label: 'INSURANCE API', boomer: 'INSURANCE API', desc: 'SEARCH AND COMPARE INSURANCE CARRIERS', icon: Shield, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    ],
  },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function BusinessHub() {
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [orgRes, sumRes] = await Promise.all([
        apiFetch('/api/orgs/me'),
        apiFetch('/api/enterprise/summary'),
      ]);
      if (orgRes.ok) setOrgData(await orgRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAuthenticated) return <SignInPage />;

  const hasOrg = orgData?.org;
  const netProfit = summary?.financials?.netProfit ?? 0;
  const isPositive = netProfit >= 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider uppercase">{boomerMode ? 'BUSINESS MANAGEMENT' : 'OPS-CORE // COMMAND'}</h1>
            <p className="text-xs text-muted-foreground tracking-wider uppercase">
              {hasOrg ? orgData.org!.name : 'YOUR BUSINESS HEADQUARTERS'}
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          REFRESH
        </button>
      </motion.div>

      {hasOrg && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-card/50 border border-border/50 p-4 flex items-center gap-4 flex-wrap"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-bold tracking-wider uppercase">{orgData!.org!.name}</div>
            <div className="text-xs text-muted-foreground tracking-wider uppercase">
              {orgData!.org!.industry || 'NO INDUSTRY SET'} {orgData!.org!.size ? `· ${orgData!.org!.size}` : ''}
            </div>
          </div>
          {orgData!.member && (
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-primary">{orgData!.member!.role}</div>
              {orgData!.member!.title && <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{orgData!.member!.title}</div>}
            </div>
          )}
          {orgData!.members && orgData!.members.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">{orgData!.members.filter(m => m.status === 'active').length} MEMBERS</span>
            </div>
          )}
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              <StatCard
                label="NET PROFIT"
                value={fmt(Math.abs(netProfit))}
                prefix={isPositive ? '+' : '-'}
                icon={isPositive ? ArrowUpRight : ArrowDownRight}
                color={isPositive ? 'text-emerald-400' : 'text-red-400'}
                bg={isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}
              />
              <StatCard
                label="GROSS INCOME"
                value={fmt(summary.financials.grossIncome)}
                icon={DollarSign}
                color="text-sky-400"
                bg="bg-sky-500/10"
              />
              <StatCard
                label="INVOICES"
                value={String(summary.invoices.total)}
                sub={summary.invoices.open > 0 ? `${summary.invoices.open} OPEN` : summary.invoices.overdue > 0 ? `${summary.invoices.overdue} OVERDUE` : undefined}
                subColor={summary.invoices.overdue > 0 ? 'text-red-400' : undefined}
                icon={FileText}
                color="text-emerald-400"
                bg="bg-emerald-500/10"
              />
              <StatCard
                label="BILLS"
                value={String(summary.bills.total)}
                sub={summary.bills.overdue > 0 ? `${summary.bills.overdue} OVERDUE` : undefined}
                subColor={summary.bills.overdue > 0 ? 'text-red-400' : undefined}
                icon={Receipt}
                color="text-orange-400"
                bg="bg-orange-500/10"
              />
              <StatCard
                label="EMPLOYEES"
                value={String(summary.employees.active)}
                icon={Users}
                color="text-violet-400"
                bg="bg-violet-500/10"
              />
              <StatCard
                label="PAYROLL"
                value={fmt(summary.payroll.total)}
                sub={`${summary.payroll.runs} RUNS`}
                icon={DollarSign}
                color="text-blue-400"
                bg="bg-blue-500/10"
              />
              <StatCard
                label="EXPENSES"
                value={fmt(summary.expenses.amount)}
                sub={`${summary.expenses.total} ENTRIES`}
                icon={CreditCard}
                color="text-purple-400"
                bg="bg-purple-500/10"
              />
              <StatCard
                label="OUTGOINGS"
                value={fmt(summary.financials.payrollTotal + summary.financials.billsTotal + summary.financials.expensesTotal)}
                icon={ArrowDownRight}
                color="text-amber-400"
                bg="bg-amber-500/10"
              />
            </motion.div>
          )}

          {summary && (summary.bills.overdue > 0 || summary.invoices.overdue > 0 || summary.invoices.open > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">ACTION REQUIRED</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {summary.bills.overdue > 0 && (
                  <Link href="/business/bills" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <Receipt className="w-3.5 h-3.5" />
                    {summary.bills.overdue} OVERDUE {summary.bills.overdue === 1 ? 'BILL' : 'BILLS'}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
                {summary.invoices.overdue > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition-colors">
                    <FileText className="w-3.5 h-3.5" />
                    {summary.invoices.overdue} OVERDUE {summary.invoices.overdue === 1 ? 'INVOICE' : 'INVOICES'}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
                {summary.invoices.open > 0 && (
                  <Link href="/business/invoices" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition-colors">
                    <FileText className="w-3.5 h-3.5" />
                    {summary.invoices.open} OPEN {summary.invoices.open === 1 ? 'INVOICE' : 'INVOICES'}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          {SECTIONS.map((section, si) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + si * 0.05 }}
              className="space-y-3"
            >
              <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] pl-1">{section.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className="group rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 p-4 flex items-start gap-3 transition-all hover:bg-card/80"
                    >
                      <div className={`w-9 h-9 rounded-lg ${item.bg} border ${item.border} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4.5 h-4.5 ${item.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold uppercase tracking-wider">{boomerMode ? item.boomer : item.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          ))}

          {!hasOrg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl bg-primary/5 border border-primary/20 p-6 text-center space-y-3"
            >
              <Building2 className="w-10 h-10 text-primary/60 mx-auto" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider">NO ORGANIZATION YET</h3>
                <p className="text-xs text-muted-foreground tracking-wider mt-1 uppercase">
                  CREATE OR JOIN AN ORGANIZATION TO UNLOCK TEAM MANAGEMENT, SHARED BILLING, AND COLLABORATIVE FEATURES.
                </p>
              </div>
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                GO TO PROFILE
              </Link>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, prefix, sub, subColor, icon: Icon, color, bg }: {
  label: string;
  value: string;
  prefix?: string;
  sub?: string;
  subColor?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl bg-card/50 border border-border/50 p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <div className={`text-lg font-bold tracking-wider ${color}`}>
        {prefix}{value}
      </div>
      {sub && <div className={`text-[10px] font-bold uppercase tracking-wider ${subColor || 'text-muted-foreground'}`}>{sub}</div>}
    </div>
  );
}
