import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  Landmark, Users, DollarSign, Loader2, RefreshCw, Check, AlertTriangle,
  Building2, Calendar, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  ArrowLeft, Briefcase, CreditCard, Receipt, Clock,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';
import { useLocation } from 'wouter';

interface GustoCompany {
  name: string;
  ein: string;
  entityType: string;
  companyStatus: string;
  employeeCount: number;
  totalEmployees: number;
  locationCount: number;
  lastPayrollDate: string | null;
  lastPayrollGross: string | null;
  lastPayrollNet: string | null;
  payFrequency: string;
}

interface GustoEmployee {
  id: string | number;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  jobTitle: string;
  status: string;
  payRate: string;
  payFrequency: string;
}

interface GustoPayrollRun {
  id: string | number;
  payPeriodStart: string;
  payPeriodEnd: string;
  checkDate: string;
  processed: boolean;
  totalGrossPay: string;
  totalNetPay: string;
  totalTaxes: string;
  totalDeductions: string;
  employeeCount: number;
}

type Tab = 'overview' | 'employees' | 'payrolls';

function fmt(v: string | number | null) {
  const n = Number(v);
  if (!isFinite(n)) return '$0.00';
  const neg = n < 0;
  return `${neg ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, icon: Icon, color, bg, border, sub }: {
  label: string; value: string; icon: React.FC<{ className?: string }>;
  color: string; bg: string; border: string; sub?: string;
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function GustoPayroll() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [, navigate] = useLocation();

  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [company, setCompany] = useState<GustoCompany | null>(null);
  const [employees, setEmployees] = useState<GustoEmployee[]>([]);
  const [payrolls, setPayrolls] = useState<GustoPayrollRun[]>([]);
  const [expandedPayroll, setExpandedPayroll] = useState<string | number | null>(null);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);

  const fetchCompany = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/enterprise/gusto/company');
      if (r.ok) {
        const d = await r.json();
        setConnected(d.connected);
        if (d.company) setCompany(d.company);
      }
    } catch {} finally { setLoading(false); }
  }, [isAuthenticated]);

  const fetchEmployees = useCallback(async () => {
    setLoadingEmps(true);
    try {
      const r = await apiFetch('/api/enterprise/gusto/employees');
      if (r.ok) {
        const d = await r.json();
        if (d.employees) setEmployees(d.employees);
      }
    } catch {} finally { setLoadingEmps(false); }
  }, []);

  const fetchPayrolls = useCallback(async () => {
    setLoadingPay(true);
    try {
      const r = await apiFetch('/api/enterprise/gusto/payrolls');
      if (r.ok) {
        const d = await r.json();
        if (d.payrolls) setPayrolls(d.payrolls);
      }
    } catch {} finally { setLoadingPay(false); }
  }, []);

  useEffect(() => { fetchCompany(); }, [fetchCompany]);

  useEffect(() => {
    if (connected && tab === 'employees' && employees.length === 0) fetchEmployees();
    if (connected && tab === 'payrolls' && payrolls.length === 0) fetchPayrolls();
  }, [connected, tab, employees.length, payrolls.length, fetchEmployees, fetchPayrolls]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to access Gusto Payroll." />;

  const totalGross = payrolls.reduce((s, p) => s + Number(p.totalGrossPay), 0);
  const totalNet = payrolls.reduce((s, p) => s + Number(p.totalNetPay), 0);
  const totalTaxes = payrolls.reduce((s, p) => s + Number(p.totalTaxes), 0);
  const totalDeductions = payrolls.reduce((s, p) => s + Number(p.totalDeductions), 0);
  const activeEmps = employees.filter(e => e.status === 'active');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => navigate('/business')} className="w-8 h-8 rounded-lg border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Gusto Payroll' : 'GUSTO — PAYROLL TERMINAL'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-20">
              {boomerMode ? 'Live payroll data from Gusto — employees, pay runs, taxes, deductions.' : 'LIVE FEED — EMPLOYEE COMPENSATION, PAYROLL RUNS, TAX OBLIGATIONS, DEDUCTIONS.'}
            </p>
          </div>
          <button onClick={() => { fetchCompany(); if (tab === 'employees') fetchEmployees(); if (tab === 'payrolls') fetchPayrolls(); }} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/8 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>

        {loading && !company && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && !connected && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">GUSTO NOT CONNECTED</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {boomerMode
                ? 'No Gusto API key found. Add your Gusto API token in settings to connect payroll data.'
                : 'GUSTO_API_KEY NOT DETECTED. PROVIDE ACCESS TOKEN TO ESTABLISH PAYROLL DATA LINK.'}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-[10px] font-mono text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              DISCONNECTED
            </div>
          </div>
        )}

        {!loading && connected && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {([
                { key: 'overview' as const, label: 'OVERVIEW', icon: Building2 },
                { key: 'employees' as const, label: 'EMPLOYEES', icon: Users },
                { key: 'payrolls' as const, label: 'PAYROLL RUNS', icon: DollarSign },
              ]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    tab === t.key ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-card text-muted-foreground border-border hover:border-emerald-500/20'
                  }`}>
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
              <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider">GUSTO CONNECTED</span>
              </div>
            </div>

            {tab === 'overview' && company && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                      <Building2 className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-foreground mb-1">{company.name}</h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        {company.entityType && <span className="text-[10px] font-mono text-zinc-500 uppercase">{company.entityType}</span>}
                        {company.ein && <span className="text-[10px] font-mono text-zinc-600">EIN: {company.ein}</span>}
                        {company.payFrequency && <span className="text-[10px] font-mono text-zinc-500 uppercase">{company.payFrequency} PAY</span>}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="ACTIVE EMPLOYEES" value={String(company.employeeCount)} icon={Users} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" sub={`${company.totalEmployees} total`} />
                    <StatCard label="LOCATIONS" value={String(company.locationCount)} icon={Building2} color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/20" />
                    <StatCard label="LAST PAYROLL" value={company.lastPayrollDate ?? 'NONE'} icon={Calendar} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20" sub={company.lastPayrollGross ? `Gross: ${fmt(company.lastPayrollGross)}` : undefined} />
                    <StatCard label="LAST NET PAY" value={company.lastPayrollNet ? fmt(company.lastPayrollNet) : '$0.00'} icon={DollarSign} color="text-green-400" bg="bg-green-500/10" border="border-green-500/20" sub="Available to employees" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button onClick={() => setTab('employees')} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-5 text-left hover:border-emerald-500/20 transition-colors group">
                    <Users className="w-6 h-6 text-emerald-400 mb-3" />
                    <div className="text-sm font-bold text-foreground mb-1">EMPLOYEE ROSTER</div>
                    <div className="text-[10px] text-zinc-500">{company.employeeCount} active employees with pay rates, titles, departments</div>
                  </button>
                  <button onClick={() => setTab('payrolls')} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-5 text-left hover:border-emerald-500/20 transition-colors group">
                    <DollarSign className="w-6 h-6 text-green-400 mb-3" />
                    <div className="text-sm font-bold text-foreground mb-1">PAYROLL RUNS</div>
                    <div className="text-[10px] text-zinc-500">View processed payrolls with gross pay, taxes, deductions, net pay</div>
                  </button>
                  <button onClick={() => navigate('/business/payroll')} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-5 text-left hover:border-sky-500/20 transition-colors group">
                    <Receipt className="w-6 h-6 text-sky-400 mb-3" />
                    <div className="text-sm font-bold text-foreground mb-1">MANUAL PAYROLL</div>
                    <div className="text-[10px] text-zinc-500">Internal payroll tracker for custom entries and non-Gusto employees</div>
                  </button>
                </div>
              </div>
            )}

            {tab === 'employees' && (
              <div className="space-y-4">
                {loadingEmps ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
                ) : employees.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
                    <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">No employees found in Gusto.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{activeEmps.length} ACTIVE / {employees.length} TOTAL</span>
                      <button onClick={fetchEmployees} className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors">REFRESH</button>
                    </div>
                    <div className="rounded-xl border border-zinc-800 overflow-x-auto">
                      <div className="grid min-w-[720px] grid-cols-[1fr_1fr_1fr_100px_80px] gap-0 bg-zinc-900/50 px-4 py-2 border-b border-zinc-800">
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">NAME</span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">TITLE</span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">EMAIL</span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">PAY RATE</span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">STATUS</span>
                      </div>
                      {employees.map(emp => (
                        <div key={emp.id} className="grid min-w-[720px] grid-cols-[1fr_1fr_1fr_100px_80px] gap-0 px-4 py-3 border-b border-zinc-800/50 hover:bg-white/[0.02] transition-colors items-center">
                          <div>
                            <div className="text-sm font-bold text-foreground">{emp.firstName} {emp.lastName}</div>
                            {emp.department && <div className="text-[10px] text-zinc-600 font-mono">{emp.department}</div>}
                          </div>
                          <div className="text-xs text-zinc-400">{emp.jobTitle || '—'}</div>
                          <div className="text-xs text-zinc-500 font-mono truncate">{emp.email || '—'}</div>
                          <div className="text-xs font-mono text-emerald-400">
                            {emp.payRate ? `$${Number(emp.payRate).toLocaleString()}` : '—'}
                            {emp.payFrequency && <span className="text-[9px] text-zinc-600 ml-1">/{emp.payFrequency.replace('Per ', '').toLowerCase()}</span>}
                          </div>
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              emp.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                              <span className={`w-1 h-1 rounded-full ${emp.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              {emp.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'payrolls' && (
              <div className="space-y-4">
                {loadingPay ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
                ) : payrolls.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
                    <DollarSign className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">No processed payrolls found in Gusto.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <StatCard label="TOTAL GROSS PAY" value={fmt(totalGross)} icon={DollarSign} color="text-sky-400" bg="bg-sky-500/10" border="border-sky-500/20" sub={`${payrolls.length} payroll runs`} />
                      <StatCard label="TOTAL NET PAY" value={fmt(totalNet)} icon={TrendingUp} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" sub="After taxes & deductions" />
                      <StatCard label="TOTAL TAXES" value={fmt(totalTaxes)} icon={Receipt} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20" sub="Employee taxes withheld" />
                      <StatCard label="TOTAL DEDUCTIONS" value={fmt(totalDeductions)} icon={TrendingDown} color="text-red-400" bg="bg-red-500/10" border="border-red-500/20" sub="Benefits & withholdings" />
                    </div>

                    <div className="space-y-2">
                      {payrolls.map(p => {
                        const isExpanded = expandedPayroll === p.id;
                        return (
                          <div key={p.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] overflow-hidden">
                            <button onClick={() => setExpandedPayroll(isExpanded ? null : p.id)}
                              className="w-full flex flex-wrap items-center gap-4 px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
                              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Calendar className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-bold text-foreground">
                                    {p.payPeriodStart} → {p.payPeriodEnd}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-500/15 text-emerald-400">
                                    {p.processed ? 'PROCESSED' : 'PENDING'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-500 font-mono">
                                  Check Date: {p.checkDate} · {p.employeeCount} employees
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold text-emerald-400">{fmt(p.totalNetPay)}</div>
                                <div className="text-[10px] text-zinc-600 font-mono">NET</div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                            </button>
                            {isExpanded && (
                              <div className="px-5 pb-4 border-t border-zinc-800/50 pt-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="rounded-lg border border-zinc-800 p-3">
                                    <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">GROSS PAY</div>
                                    <div className="text-lg font-bold text-sky-400">{fmt(p.totalGrossPay)}</div>
                                  </div>
                                  <div className="rounded-lg border border-zinc-800 p-3">
                                    <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">TAXES</div>
                                    <div className="text-lg font-bold text-amber-400">{fmt(p.totalTaxes)}</div>
                                  </div>
                                  <div className="rounded-lg border border-zinc-800 p-3">
                                    <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">DEDUCTIONS</div>
                                    <div className="text-lg font-bold text-red-400">{fmt(p.totalDeductions)}</div>
                                  </div>
                                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                                    <div className="text-[9px] font-mono text-emerald-500/50 uppercase tracking-wider mb-1">NET PAY</div>
                                    <div className="text-lg font-bold text-emerald-400">{fmt(p.totalNetPay)}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
