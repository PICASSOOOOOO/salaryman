import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, X, Trash2, Loader2, Check, Play, ChevronDown, ChevronUp,
  DollarSign, AlertCircle, ArrowRightLeft,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

const FIAT_TO_USD = 0.012;

function fiatToUsd(fiat: number): string {
  return (fiat * FIAT_TO_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Employee {
  id: number;
  name: string;
  role: string;
  payRate: string;
  payFrequency: string;
  status: string;
  notes: string;
}

interface PayrollBreakdownItem {
  employeeId: number;
  employeeName: string;
  amount: number;
}

interface PayrollRun {
  id: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  runDate: string;
  totalAmount: string;
  breakdown: PayrollBreakdownItem[];
  notes: string;
  createdAt: string;
}

const PAY_FREQS = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'contract'];
const EMP_STATUSES = ['active', 'on leave', 'inactive', 'terminated'];

function Field({ label, value, onChange, type = 'text', textarea = false, options, prefix }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; textarea?: boolean; options?: string[]; prefix?: string;
}) {
  const cls = "bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors w-full";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls + " bg-muted/30"}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className={cls + " resize-none"} />
      ) : prefix ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-amber-400/60 font-mono">{prefix}</span>
          <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls + " pl-7"} />
        </div>
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

export default function Payroll() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'employees' | 'payroll'>('employees');

  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ name: '', role: '', payRate: '', payFrequency: 'monthly', status: 'active', notes: '' });
  const [savingEmp, setSavingEmp] = useState(false);

  const [showRunForm, setShowRunForm] = useState(false);
  const [runForm, setRunForm] = useState({
    payPeriodStart: '', payPeriodEnd: '', runDate: new Date().toISOString().slice(0, 10), notes: '',
  });
  const [runBreakdown, setRunBreakdown] = useState<PayrollBreakdownItem[]>([]);
  const [savingRun, setSavingRun] = useState(false);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [empRes, runRes] = await Promise.all([
        apiFetch('/api/enterprise/employees'),
        apiFetch('/api/enterprise/payroll'),
      ]);
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees); }
      if (runRes.ok) { const d = await runRes.json(); setPayrollRuns(d.payrollRuns); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEmpForm = (emp?: Employee) => {
    if (emp) {
      setEditEmp(emp);
      setEmpForm({ name: emp.name, role: emp.role, payRate: emp.payRate, payFrequency: emp.payFrequency, status: emp.status, notes: emp.notes });
    } else {
      setEditEmp(null);
      setEmpForm({ name: '', role: '', payRate: '', payFrequency: 'monthly', status: 'active', notes: '' });
    }
    setShowEmpForm(true);
  };

  const saveEmployee = async () => {
    if (!empForm.name.trim()) return;
    setSavingEmp(true);
    try {
      const url = editEmp ? `/api/enterprise/employees/${editEmp.id}` : '/api/enterprise/employees';
      const method = editEmp ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empForm) });
      if (r.ok) { setShowEmpForm(false); fetchAll(); }
    } finally { setSavingEmp(false); }
  };

  const deleteEmployee = async (id: number) => {
    if (!confirm('Delete this employee?')) return;
    await apiFetch(`/api/enterprise/employees/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const openRunForm = () => {
    const activeEmps = employees.filter(e => e.status === 'active');
    setRunBreakdown(activeEmps.map(e => ({ employeeId: e.id, employeeName: e.name, amount: Number(e.payRate) || 0 })));
    setRunForm({ payPeriodStart: '', payPeriodEnd: '', runDate: new Date().toISOString().slice(0, 10), notes: '' });
    setShowRunForm(true);
  };

  const savePayrollRun = async () => {
    if (!runForm.payPeriodStart || !runForm.payPeriodEnd) return;
    setSavingRun(true);
    try {
      const r = await apiFetch('/api/enterprise/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...runForm, breakdown: runBreakdown }),
      });
      if (r.ok) {
        import("@/soundEngine").then(m => m.sfxRealUsdDeposit?.()).catch(() => {});
        setShowRunForm(false);
        fetchAll();
      }
    } finally { setSavingRun(false); }
  };

  const deleteRun = async (id: number) => {
    if (!confirm('Delete this payroll run? This will also remove the ledger entry.')) return;
    await apiFetch(`/api/enterprise/payroll/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const runTotal = runBreakdown.reduce((s, b) => s + Number(b.amount), 0);

  const totalMonthlyPayroll = employees.filter(e => e.status === 'active').reduce((s, e) => s + Number(e.payRate), 0);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage payroll." />;

  return (
    <div className="payroll-page min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Payroll' : 'PAYMASTER-7'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Manage employees and run payroll.' : 'Employee registry and payroll disbursement module.'}
            </p>
          </div>
          {isAuthenticated && (
            <div className="flex gap-2">
              {tab === 'employees' ? (
                <button onClick={() => openEmpForm()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-semibold hover:bg-blue-500/30 transition-colors">
                  <Plus className="w-4 h-4" /> {boomerMode ? 'Add Employee' : 'ADD EMPLOYEE'}
                </button>
              ) : (
                <button onClick={openRunForm}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors">
                  <Play className="w-4 h-4" /> {boomerMode ? 'Run Payroll' : 'RUN PAYROLL'}
                </button>
              )}
            </div>
          )}
        </div>

        {isAuthenticated && !loading && employees.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-mono font-bold text-amber-400/60 uppercase tracking-[0.15em]">TOTAL PAYROLL (FIAT)</span>
              </div>
              <div className="font-mono text-lg font-bold text-amber-400">ƒ{totalMonthlyPayroll.toLocaleString()}</div>
              <div className="text-[10px] text-amber-400/40 font-mono mt-0.5">PER PAY PERIOD</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowRightLeft className="w-3 h-3 text-emerald-400/50" />
                <span className="text-[9px] font-mono font-bold text-emerald-400/60 uppercase tracking-[0.15em]">USD EQUIVALENT</span>
              </div>
              <div className="font-mono text-lg font-bold text-emerald-400">${fiatToUsd(totalMonthlyPayroll)}</div>
              <div className="text-[10px] text-emerald-400/40 font-mono mt-0.5">AVAILABLE TO WITHDRAW · 1 ƒ = ${FIAT_TO_USD} USD</div>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 mb-5">
          {(['employees', 'payroll'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-mono tracking-widest uppercase transition-colors border ${
                tab === t ? 'bg-primary/15 text-primary border-primary/25' : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
              }`}>
              {t === 'employees' ? (boomerMode ? 'Employees' : 'ROSTER') : (boomerMode ? 'Pay Runs' : 'PAYROLL RUNS')}
              <span className="ml-1.5 opacity-60 text-[9px]">
                ({t === 'employees' ? employees.length : payrollRuns.length})
              </span>
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && tab === 'employees' && (
          <div className="flex flex-col gap-2">
            {employees.length === 0 && (
              <div className="text-center py-16 text-muted-foreground/40 text-sm font-mono">
                {boomerMode ? 'No employees yet. Add your first employee.' : 'NO PERSONNEL ON FILE. ADD YOUR FIRST EMPLOYEE.'}
              </div>
            )}
            {employees.map(emp => {
              const rate = Number(emp.payRate);
              return (
                <div key={emp.id} className="bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{emp.name}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        emp.status === 'active' ? 'text-sky-400 border-sky-500/20 bg-sky-500/10' :
                        emp.status === 'on leave' ? 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10' :
                        'text-zinc-400 border-zinc-500/20 bg-zinc-500/10'
                      } uppercase tracking-wider`}>{emp.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {emp.role || 'No role'} · <span className="font-mono text-amber-400">ƒ{rate.toLocaleString()}</span>
                      <span className="text-zinc-600 mx-1">≈</span>
                      <span className="font-mono text-emerald-400/60">${fiatToUsd(rate)}</span>
                      <span className="text-zinc-600"> / {emp.payFrequency}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEmpForm(emp)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteEmployee(emp.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === 'payroll' && (
          <div className="flex flex-col gap-2">
            {payrollRuns.length === 0 && (
              <div className="text-center py-16 text-muted-foreground/40 text-sm font-mono">
                {boomerMode ? 'No payroll runs yet. Click "Run Payroll" to record a disbursement.' : 'NO DISBURSEMENTS ON RECORD. RUN PAYROLL TO BEGIN.'}
              </div>
            )}
            {payrollRuns.map(run => {
              const total = Number(run.totalAmount);
              return (
                <div key={run.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    className="w-full px-4 py-3 flex flex-wrap items-center gap-4 hover:bg-muted/20 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground text-sm">{boomerMode ? 'Payroll Run' : 'PAYROLL RUN'}</span>
                        <span className="text-xs text-muted-foreground font-mono">{run.payPeriodStart} → {run.payPeriodEnd}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{boomerMode ? 'Run date:' : 'RUN DATE:'} {run.runDate}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-400">ƒ{total.toLocaleString()}</div>
                      <div className="font-mono text-[10px] text-emerald-400/50">≈ ${fiatToUsd(total)}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{boomerMode ? 'total disbursed' : 'TOTAL DISBURSED'}</div>
                    </div>
                    {expandedRun === run.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <button onClick={e => { e.stopPropagation(); deleteRun(run.id); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                  {expandedRun === run.id && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">{boomerMode ? 'Breakdown' : 'BREAKDOWN'}</div>
                      {(run.breakdown as PayrollBreakdownItem[]).map((b, i) => {
                        const amt = Number(b.amount);
                        return (
                          <div key={i} className="flex justify-between text-xs py-1 border-b border-border/50 last:border-0">
                            <span className="text-foreground">{b.employeeName}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-amber-400">ƒ{amt.toLocaleString()}</span>
                              <span className="font-mono text-emerald-400/40 text-[10px]">≈ ${fiatToUsd(amt)}</span>
                            </div>
                          </div>
                        );
                      })}
                      {run.notes && <p className="text-xs text-muted-foreground mt-2">{run.notes}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {showEmpForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-foreground">{editEmp ? (boomerMode ? 'Edit Employee' : 'EDIT EMPLOYEE') : (boomerMode ? 'Add Employee' : 'ADD EMPLOYEE')}</h3>
                  <button onClick={() => setShowEmpForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <Field label="Full Name *" value={empForm.name} onChange={v => setEmpForm(f => ({ ...f, name: v }))} />
                  <Field label="Role / Title" value={empForm.role} onChange={v => setEmpForm(f => ({ ...f, role: v }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Pay Rate (ƒ FIAT)" value={empForm.payRate} onChange={v => setEmpForm(f => ({ ...f, payRate: v }))} type="number" prefix="ƒ" />
                    <Field label="Pay Frequency" value={empForm.payFrequency} onChange={v => setEmpForm(f => ({ ...f, payFrequency: v }))} options={PAY_FREQS} />
                  </div>
                  {empForm.payRate && Number(empForm.payRate) > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
                      <ArrowRightLeft className="w-3 h-3 text-emerald-400/50 flex-shrink-0" />
                      <span className="text-[10px] font-mono text-emerald-400/70">USD EQUIVALENT: ${fiatToUsd(Number(empForm.payRate))}</span>
                      <span className="text-[9px] text-emerald-400/30 ml-auto">1 ƒ = ${FIAT_TO_USD}</span>
                    </div>
                  )}
                  <Field label="Status" value={empForm.status} onChange={v => setEmpForm(f => ({ ...f, status: v }))} options={EMP_STATUSES} />
                  <Field label="Notes" value={empForm.notes} onChange={v => setEmpForm(f => ({ ...f, notes: v }))} textarea />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowEmpForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">{boomerMode ? 'Cancel' : 'CANCEL'}</button>
                  <button onClick={saveEmployee} disabled={savingEmp || !empForm.name.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-40">
                    {savingEmp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editEmp ? (boomerMode ? 'Update' : 'UPDATE') : (boomerMode ? 'Add Employee' : 'ADD EMPLOYEE')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showRunForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg my-auto shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-foreground">{boomerMode ? 'Run Payroll' : 'RUN PAYROLL'}</h3>
                  <button onClick={() => setShowRunForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <Field label="Period Start *" value={runForm.payPeriodStart} onChange={v => setRunForm(f => ({ ...f, payPeriodStart: v }))} type="date" />
                  <Field label="Period End *" value={runForm.payPeriodEnd} onChange={v => setRunForm(f => ({ ...f, payPeriodEnd: v }))} type="date" />
                  <Field label="Run Date" value={runForm.runDate} onChange={v => setRunForm(f => ({ ...f, runDate: v }))} type="date" />
                </div>
                <div className="mb-4">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{boomerMode ? 'Employee Breakdown' : 'EMPLOYEE BREAKDOWN'}</div>
                  {runBreakdown.length === 0 && (
                    <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                      {boomerMode ? 'No active employees found. Add employees first.' : 'NO ACTIVE PERSONNEL. ADD EMPLOYEES FIRST.'}
                    </div>
                  )}
                  {runBreakdown.map((b, idx) => (
                    <div key={b.employeeId} className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="flex-1 text-sm text-foreground">{b.employeeName}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-amber-400/50 font-mono">ƒ</span>
                        <input type="number" value={b.amount}
                          onChange={e => setRunBreakdown(prev => prev.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) || 0 } : x))}
                          className="w-full sm:w-32 bg-muted/30 border border-border rounded-lg pl-6 pr-3 py-2 text-base font-mono text-foreground outline-none focus:border-primary/50 transition-colors" />
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 border-t border-border pt-2 space-y-1">
                    <div className="text-right font-mono text-sm text-foreground">
                      Total: <strong className="text-amber-400">ƒ{runTotal.toLocaleString()}</strong>
                    </div>
                    <div className="text-right font-mono text-xs text-emerald-400/50">
                      USD Withdraw: <strong>${fiatToUsd(runTotal)}</strong>
                    </div>
                  </div>
                </div>
                <Field label="Notes" value={runForm.notes} onChange={v => setRunForm(f => ({ ...f, notes: v }))} textarea />
                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={() => setShowRunForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">{boomerMode ? 'Cancel' : 'CANCEL'}</button>
                  <button onClick={savePayrollRun} disabled={savingRun || !runForm.payPeriodStart || !runForm.payPeriodEnd}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                    {savingRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                    {boomerMode ? 'Disburse Payroll' : 'DISBURSE PAYROLL'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
