import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Loader2, Search, Building2, Mail, Phone,
  Briefcase, UserCheck, UserX, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface StaffMember {
  id: number;
  name: string;
  role: string;
  department: string;
  salary: number | null;
  status: string;
  startDate: string;
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

function fmt$(v: number | string | null) {
  const n = Number(v);
  return isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—';
}

export default function TeamDirectory() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const fetchAll = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const [staffRes, empRes] = await Promise.all([
        apiFetch('/api/tools/hiring/staff'),
        apiFetch('/api/enterprise/employees'),
      ]);
      if (staffRes.ok) { const d = await staffRes.json(); setStaff(d.staff || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to view your team." />;

  const combined = [
    ...staff.map(s => ({
      id: `staff-${s.id}`,
      name: s.name,
      role: s.role || 'Team Member',
      department: s.department || 'General',
      pay: s.salary ? fmt$(s.salary) : '—',
      status: s.status || 'active',
      source: 'HIRING',
      startDate: s.startDate || '',
    })),
    ...employees.filter(e => !staff.some(s => s.name.toLowerCase() === e.name.toLowerCase())).map(e => ({
      id: `emp-${e.id}`,
      name: e.name,
      role: e.role || 'Team Member',
      department: 'Payroll',
      pay: e.payRate ? `${fmt$(e.payRate)}/${e.payFrequency}` : '—',
      status: e.status || 'active',
      source: 'PAYROLL',
      startDate: '',
    })),
  ];

  const departments = ['all', ...new Set(combined.map(m => m.department))];
  const filtered = combined.filter(m => {
    if (deptFilter !== 'all' && m.department !== deptFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.role.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = combined.filter(m => m.status === 'active').length;
  const deptCount = new Set(combined.map(m => m.department)).size;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">
              {boomerMode ? 'Team Directory' : 'TEAM ROSTER — PERSONNEL'}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground ml-12">
            {boomerMode ? 'View your entire team with roles and departments.' : 'COMPLETE ORG VIEW — ROLES, DEPARTMENTS, COMPENSATION.'}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-6">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL MEMBERS</div>
            <div className="text-2xl font-bold text-indigo-400">{combined.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">ACTIVE</div>
            <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">DEPARTMENTS</div>
            <div className="text-2xl font-bold text-sky-400">{deptCount}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or role..."
              className="w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
          </div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors shrink-0">
            {departments.map(d => <option key={d} value={d}>{d === 'all' ? 'ALL DEPARTMENTS' : d.toUpperCase()}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
            <Users className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{combined.length === 0 ? (boomerMode ? 'No team members yet. Add staff in Hiring or employees in Payroll.' : 'NO PERSONNEL RECORDS. ADD STAFF VIA HIRING OR PAYROLL MODULE.') : 'No results match your search.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(m => (
              <div key={m.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-4 hover:border-indigo-500/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                    m.status === 'active' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}>
                    {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{m.name}</div>
                    <div className="text-xs text-zinc-400">{m.role}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-bold ${
                    m.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {m.status.toUpperCase()}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-800/50 space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <Building2 className="w-3 h-3" />
                    <span>{m.department}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <Briefcase className="w-3 h-3" />
                    <span>{m.pay}</span>
                  </div>
                  {m.startDate && (
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <UserCheck className="w-3 h-3" />
                      <span>Since {m.startDate}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-zinc-600 bg-zinc-800/50">{m.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
