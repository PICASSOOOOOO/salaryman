import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, UserPlus, Users, Plus, X, Trash2, ChevronDown, ChevronUp,
  Loader2, ArrowRight, Edit2, Check, Mic2, Presentation, Building2,
  ClipboardList, MessageSquare, UserX, ChevronRight, StickyNote, MapPin, Monitor,
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { InterviewConductor } from '@/components/InterviewConductor';
import { SignInPage } from '@/components/SignInPrompt';
import { PresentationTool } from '@/components/PresentationTool';

type ActiveTab = 'jobs' | 'applicants' | 'staff' | 'depts' | 'conduct' | 'present';

interface Department {
  id: number;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

const OFFICE_PRESETS = [
  'Public Office', 'Executive Suite', 'Pixel Agents', 'Creative Studio',
  'Sales Floor', 'Engineering Bay', 'Conference Room', 'Reception', 'Remote',
];
const DESK_PRESETS = ['DESK A', 'DESK B', 'DESK C', 'DESK D', 'DESK E'];
const TERMINAL_PRESETS = ['TERMINAL 1', 'TERMINAL 2', 'TERMINAL 3', 'TERMINAL 4', 'TERMINAL 5', 'TERMINAL 6'];
const DEPT_COLOR_OPTIONS = ['sky', 'amber', 'purple', 'emerald', 'rose', 'blue', 'indigo'] as const;
const DEPT_COLOR_CLASSES: Record<string, string> = {
  sky: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rose: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

interface Job {
  id: number;
  title: string;
  description: string;
  requirements: string;
  salaryMin: number | null;
  salaryMax: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Applicant {
  id: number;
  jobId: number;
  name: string;
  email: string;
  resumeNotes: string;
  source: string;
  stage: string;
  stageUpdatedAt: string;
  createdAt: string;
}

interface StaffMember {
  id: number;
  applicantId: number | null;
  name: string;
  role: string;
  department: string;
  salary: number | null;
  status: string;
  startDate: string;
  endDate: string | null;
  offboardingNotes: string;
  assignedOffice: string;
  assignedDesk: string;
  assignedTerminal: string;
  email?: string;
  phone?: string;
  linkedUserId?: string | null;
  createdAt: string;
}

interface PerformanceNote {
  id: number;
  staffId: number;
  note: string;
  createdAt: string;
}

interface OnboardingItem {
  id: number;
  staffId: number;
  item: string;
  completed: boolean;
  completedAt: string | null;
  sortOrder: number;
}

interface Stats {
  openPositions: number;
  totalApplicants: number;
  activeStaff: number;
  filledThisMonth: number;
}

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  screening: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  interview: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  offer: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  hired: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};
const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  closed: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  filled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};
const STAFF_STATUS_COLORS: Record<string, string> = {
  active: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  'on leave': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  terminated: 'bg-red-500/20 text-red-300 border-red-500/30',
  departed: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
    </div>
  );
}

export default function Hiring() {
  const { isAuthenticated } = useAuth();
  usePlan();
  const [tab, setTab] = useState<ActiveTab>(() => {
    try {
      const raw = localStorage.getItem('devdocs_action_prefill');
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>;
        const age = Date.now() - ((p._ts as number) || 0);
        if (age < 30000 && (p.tab === 'conduct' || p.tab === 'present')) return p.tab as ActiveTab;
      }
    } catch {}
    return 'jobs';
  });
  const [loading, setLoading] = useState(true);
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const [stats, setStats] = useState<Stats>({ openPositions: 0, totalApplicants: 0, activeStaff: 0, filledThisMonth: 0 });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [jobForm, setJobForm] = useState({ title: '', description: '', requirements: '', salaryMin: '', salaryMax: '', status: 'open' });

  const [showApplicantForm, setShowApplicantForm] = useState(false);
  const [applicantForm, setApplicantForm] = useState({ jobId: '', name: '', email: '', resumeNotes: '', source: '' });
  const [selectedJobFilter, setSelectedJobFilter] = useState<number | null>(null);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  // Staff panel state
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffPanel, setStaffPanel] = useState<'directory' | 'perf' | 'onboarding' | 'offboard'>('directory');
  const [performanceNotes, setPerformanceNotes] = useState<PerformanceNote[]>([]);
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([]);
  const [perfNoteInput, setPerfNoteInput] = useState('');
  const [onboardingInput, setOnboardingInput] = useState('');
  const [staffDeptFilter, setStaffDeptFilter] = useState('');
  const [offboardNotes, setOffboardNotes] = useState('');
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', role: '', department: '', salary: '', email: '', phone: '' });

  // Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: '', description: '', color: 'sky' });

  // Workspace assignment edit state (per selectedStaff)
  const [workspaceEdit, setWorkspaceEdit] = useState({ assignedOffice: '', assignedDesk: '', assignedTerminal: '' });
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const [statsRes, jobsRes, applicantsRes, staffRes, deptsRes] = await Promise.all([
        apiFetch('/api/tools/hiring/stats'),
        apiFetch('/api/tools/hiring/jobs'),
        apiFetch('/api/tools/hiring/applicants'),
        apiFetch('/api/tools/hiring/staff'),
        apiFetch('/api/tools/hiring/departments'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (jobsRes.ok) { const d = await jobsRes.json(); setJobs(d.jobs ?? []); }
      if (applicantsRes.ok) { const d = await applicantsRes.json(); setApplicants(d.applicants ?? []); }
      if (staffRes.ok) { const d = await staffRes.json(); setStaff(d.staff ?? []); }
      if (deptsRes.ok) { const d = await deptsRes.json(); setDepartments(d.departments ?? []); }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reset workspace edit fields when selected staff changes
  useEffect(() => {
    if (selectedStaff) {
      setWorkspaceEdit({
        assignedOffice: selectedStaff.assignedOffice ?? '',
        assignedDesk: selectedStaff.assignedDesk ?? '',
        assignedTerminal: selectedStaff.assignedTerminal ?? '',
      });
    }
  }, [selectedStaff?.id, selectedStaff?.assignedOffice, selectedStaff?.assignedDesk, selectedStaff?.assignedTerminal]);

  const saveDept = async () => {
    if (!deptForm.name.trim()) return;
    const url = editingDept
      ? `/api/tools/hiring/departments/${editingDept.id}`
      : '/api/tools/hiring/departments';
    const res = await apiFetch(url, {
      method: editingDept ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deptForm),
    });
    if (!res.ok) return;
    const d = await res.json();
    if (editingDept) {
      setDepartments(prev => prev.map(x => x.id === editingDept.id ? d.department : x));
      // If renamed, propagate to local staff list (server already updated DB)
      if (editingDept.name !== d.department.name) {
        setStaff(prev => prev.map(s => s.department === editingDept.name ? { ...s, department: d.department.name } : s));
      }
    } else {
      setDepartments(prev => [...prev, d.department].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setShowDeptForm(false);
    setEditingDept(null);
    setDeptForm({ name: '', description: '', color: 'sky' });
  };

  const deleteDept = async (id: number) => {
    const dept = departments.find(d => d.id === id);
    if (!dept) return;
    if (!confirm(`Delete department "${dept.name}"? Staff in this department will be unassigned.`)) return;
    const res = await apiFetch(`/api/tools/hiring/departments/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setDepartments(prev => prev.filter(d => d.id !== id));
    setStaff(prev => prev.map(s => s.department === dept.name ? { ...s, department: '' } : s));
  };

  const saveWorkspace = async () => {
    if (!selectedStaff) return;
    setWorkspaceSaving(true);
    try {
      const res = await apiFetch(`/api/tools/hiring/staff/${selectedStaff.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspaceEdit),
      });
      if (res.ok) {
        const d = await res.json();
        setStaff(prev => prev.map(s => s.id === selectedStaff.id ? d.staff : s));
        setSelectedStaff(d.staff);
      }
    } finally {
      setWorkspaceSaving(false);
    }
  };

  useEffect(() => {
    const onPabloAction = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail;
      if (!detail) return;
      const age = Date.now() - ((detail._ts as number) || 0);
      if (age > 30000) return;
      if (detail.tab === 'conduct' || detail.tab === 'present') setTab(detail.tab as ActiveTab);
    };
    window.addEventListener('pablo-action', onPabloAction);
    return () => window.removeEventListener('pablo-action', onPabloAction);
  }, []);

  const saveJob = async () => {
    if (!jobForm.title.trim()) return;
    const body = {
      title: jobForm.title,
      description: jobForm.description,
      requirements: jobForm.requirements,
      salaryMin: jobForm.salaryMin ? Number(jobForm.salaryMin) : null,
      salaryMax: jobForm.salaryMax ? Number(jobForm.salaryMax) : null,
      status: jobForm.status,
    };
    if (editingJob) {
      const res = await apiFetch(`/api/tools/hiring/jobs/${editingJob.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const d = await res.json(); setJobs(prev => prev.map(j => j.id === editingJob.id ? d.job : j)); }
    } else {
      const res = await apiFetch('/api/tools/hiring/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const d = await res.json(); setJobs(prev => [d.job, ...prev]); }
    }
    setJobForm({ title: '', description: '', requirements: '', salaryMin: '', salaryMax: '', status: 'open' });
    setShowJobForm(false); setEditingJob(null);
    loadAll();
  };

  const deleteJob = async (id: number) => {
    const res = await apiFetch(`/api/tools/hiring/jobs/${id}`, { method: 'DELETE' });
    if (res.ok) { setJobs(prev => prev.filter(j => j.id !== id)); setApplicants(prev => prev.filter(a => a.jobId !== id)); loadAll(); }
  };

  const saveApplicant = async () => {
    if (!applicantForm.name.trim() || !applicantForm.jobId) return;
    const res = await apiFetch('/api/tools/hiring/applicants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applicantForm),
    });
    if (res.ok) { const d = await res.json(); setApplicants(prev => [d.applicant, ...prev]); }
    setApplicantForm({ jobId: '', name: '', email: '', resumeNotes: '', source: '' });
    setShowApplicantForm(false);
    loadAll();
  };

  const updateApplicantStage = async (id: number, stage: string) => {
    const res = await apiFetch(`/api/tools/hiring/applicants/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) { const d = await res.json(); setApplicants(prev => prev.map(a => a.id === id ? d.applicant : a)); }
    if (stage === 'hired') loadAll();
  };

  const deleteApplicant = async (id: number) => {
    const res = await apiFetch(`/api/tools/hiring/applicants/${id}`, { method: 'DELETE' });
    if (res.ok) { setApplicants(prev => prev.filter(a => a.id !== id)); loadAll(); }
  };

  const updateStaffStatus = async (id: number, status: string) => {
    const res = await apiFetch(`/api/tools/hiring/staff/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { const d = await res.json(); setStaff(prev => prev.map(s => s.id === id ? d.staff : s)); loadAll(); }
  };

  const startEditJob = (job: Job) => {
    setEditingJob(job);
    setJobForm({
      title: job.title, description: job.description, requirements: job.requirements,
      salaryMin: job.salaryMin?.toString() ?? '', salaryMax: job.salaryMax?.toString() ?? '', status: job.status,
    });
    setShowJobForm(true);
  };

  const openStaffDetail = async (member: StaffMember) => {
    setSelectedStaff(member);
    setStaffPanel('directory');
    setPerformanceNotes([]);
    setOnboardingItems([]);
    setOffboardNotes(member.offboardingNotes ?? '');
    setShowOffboardConfirm(false);
    await Promise.all([
      apiFetch(`/api/tools/hiring/staff/${member.id}/performance-notes`).then(r => r.ok ? r.json() : null).then(d => { if (d) setPerformanceNotes(d.notes ?? []); }),
      apiFetch(`/api/tools/hiring/staff/${member.id}/onboarding`).then(r => r.ok ? r.json() : null).then(d => { if (d) setOnboardingItems(d.items ?? []); }),
    ]);
  };

  const addPerfNote = async () => {
    if (!selectedStaff || !perfNoteInput.trim()) return;
    const res = await apiFetch(`/api/tools/hiring/staff/${selectedStaff.id}/performance-notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: perfNoteInput.trim() }),
    });
    if (res.ok) { const d = await res.json(); setPerformanceNotes(prev => [d.note, ...prev]); setPerfNoteInput(''); }
  };

  const deletePerfNote = async (noteId: number) => {
    const res = await apiFetch(`/api/tools/hiring/performance-notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) setPerformanceNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const toggleOnboardingItem = async (item: OnboardingItem) => {
    const res = await apiFetch(`/api/tools/hiring/onboarding/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !item.completed }),
    });
    if (res.ok) { const d = await res.json(); setOnboardingItems(prev => prev.map(i => i.id === item.id ? d.item : i)); }
  };

  const addOnboardingItem = async () => {
    if (!selectedStaff || !onboardingInput.trim()) return;
    const res = await apiFetch(`/api/tools/hiring/staff/${selectedStaff.id}/onboarding`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: onboardingInput.trim() }),
    });
    if (res.ok) { const d = await res.json(); setOnboardingItems(prev => [...prev, d.item]); setOnboardingInput(''); }
  };

  const handleOffboard = async () => {
    if (!selectedStaff) return;
    const res = await apiFetch(`/api/tools/hiring/staff/${selectedStaff.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'departed', endDate: new Date().toISOString(), offboardingNotes: offboardNotes }),
    });
    if (res.ok) {
      const d = await res.json();
      setStaff(prev => prev.map(s => s.id === selectedStaff.id ? d.staff : s));
      setSelectedStaff(d.staff);
      setShowOffboardConfirm(false);
      loadAll();
    }
  };

  const saveStaff = async () => {
    if (!staffForm.name.trim()) return;
    const res = await apiFetch('/api/tools/hiring/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: staffForm.name,
        role: staffForm.role,
        department: staffForm.department,
        salary: staffForm.salary ? Number(staffForm.salary) : null,
        email: staffForm.email,
        phone: staffForm.phone,
      }),
    });
    if (res.ok) {
      setStaffForm({ name: '', role: '', department: '', salary: '', email: '', phone: '' });
      setShowStaffForm(false);
      loadAll();
    }
  };

  const deleteStaff = async (id: number) => {
    const res = await apiFetch(`/api/tools/hiring/staff/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setStaff(prev => prev.filter(s => s.id !== id));
      if (selectedStaff?.id === id) setSelectedStaff(null);
      loadAll();
    }
  };

  const filteredApplicants = selectedJobFilter ? applicants.filter(a => a.jobId === selectedJobFilter) : applicants;
  const getJobTitle = (jobId: number) => jobs.find(j => j.id === jobId)?.title ?? 'Unknown Position';
  const staffDeptNames = [...new Set(staff.map(s => s.department).filter(Boolean))];
  const filteredStaff = staffDeptFilter ? staff.filter(s => s.department === staffDeptFilter) : staff;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-accent/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-teal-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'Hiring & HR' : PABLO_PRODUCTS.HIRING.short}</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-12 mb-6">
          {boomerMode ? 'Post jobs, track applicants, manage your team and HR records.' : 'Post positions, track candidates, manage your roster.'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: boomerMode ? 'Open Jobs' : 'Open Positions', value: stats.openPositions, color: 'text-sky-400' },
            { label: 'Applicants', value: stats.totalApplicants, color: 'text-blue-400' },
            { label: boomerMode ? 'Active Employees' : 'Active Staff', value: stats.activeStaff, color: 'text-purple-400' },
            { label: 'Filled This Month', value: stats.filledThisMonth, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 mb-6 bg-muted/20 rounded-xl p-1 max-w-full overflow-x-auto scrollbar-hide border border-border">
          {([
            { id: 'jobs' as const, label: 'Job Board', boomerLabel: 'JOB BOARD', icon: Briefcase },
            { id: 'applicants' as const, label: 'Applicants', boomerLabel: 'APPLICANTS', icon: UserPlus },
            { id: 'staff' as const, label: 'Staff', boomerLabel: 'EMPLOYEES', icon: Users },
            { id: 'depts' as const, label: 'Departments', boomerLabel: 'DEPARTMENTS', icon: Building2 },
            { id: 'conduct' as const, label: 'Interview Conductor', boomerLabel: 'INTERVIEW CONDUCTOR', icon: Mic2 },
            { id: 'present' as const, label: 'Presentation', boomerLabel: 'PRESENTATION', icon: Presentation },
          ]).map(({ id, label, boomerLabel, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                ${tab === id ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-4 h-4" /> {boomerMode ? boomerLabel : label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && !isAuthenticated && (
          <SignInPage context="Sign in to manage your hiring pipeline." />
        )}

        {/* ── Jobs Tab ── */}
        {!loading && isAuthenticated && tab === 'jobs' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setEditingJob(null); setJobForm({ title: '', description: '', requirements: '', salaryMin: '', salaryMax: '', status: 'open' }); setShowJobForm(v => !v); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors">
                <Plus className="w-4 h-4" /> New Position
              </button>
            </div>

            <AnimatePresence>
              {showJobForm && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-foreground">{editingJob ? 'Edit Position' : 'New Position'}</h3>
                    <button onClick={() => { setShowJobForm(false); setEditingJob(null); }} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <Field label="Job Title *" name="title" value={jobForm.title} onChange={v => setJobForm(p => ({ ...p, title: v }))} placeholder="Senior Software Engineer" />
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</label>
                      <select value={jobForm.status} onChange={e => setJobForm(p => ({ ...p, status: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        <option value="open" className="bg-card">Open</option>
                        <option value="closed" className="bg-card">Closed</option>
                        <option value="filled" className="bg-card">Filled</option>
                      </select>
                    </div>
                    <Field label="Min Salary" name="salaryMin" value={jobForm.salaryMin} onChange={v => setJobForm(p => ({ ...p, salaryMin: v }))} type="number" placeholder="50000" />
                    <Field label="Max Salary" name="salaryMax" value={jobForm.salaryMax} onChange={v => setJobForm(p => ({ ...p, salaryMax: v }))} type="number" placeholder="80000" />
                  </div>
                  <div className="flex flex-col gap-1 mb-4">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                    <textarea value={jobForm.description} onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Describe the role..." rows={3}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex flex-col gap-1 mb-5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Requirements</label>
                    <textarea value={jobForm.requirements} onChange={e => setJobForm(p => ({ ...p, requirements: e.target.value }))}
                      placeholder="Skills, experience, qualifications..." rows={2}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => { setShowJobForm(false); setEditingJob(null); }}
                      className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button onClick={saveJob} disabled={!jobForm.title.trim()}
                      className="px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {editingJob ? 'Update Position' : 'Create Position'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center"><Briefcase className="w-8 h-8 text-muted-foreground/30" /></div>
                <p className="text-muted-foreground text-sm">No positions yet — create your first job listing above</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">{jobs.length} position{jobs.length !== 1 ? 's' : ''}</p>
                {jobs.map(job => (
                  <motion.div key={job.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500/30 to-sky-500/30 border border-border flex items-center justify-center text-sm font-bold text-foreground">
                          {job.title.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{job.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${JOB_STATUS_COLORS[job.status] ?? JOB_STATUS_COLORS.open} uppercase font-bold`}>{job.status}</span>
                            {(job.salaryMin || job.salaryMax) && (
                              <span className="text-[10px] text-muted-foreground">
                                {job.salaryMin ? `$${(job.salaryMin / 1000).toFixed(0)}k` : ''}
                                {job.salaryMin && job.salaryMax ? ' - ' : ''}
                                {job.salaryMax ? `$${(job.salaryMax / 1000).toFixed(0)}k` : ''}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40">{applicants.filter(a => a.jobId === job.id).length} applicant{applicants.filter(a => a.jobId === job.id).length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/40">{new Date(job.createdAt).toLocaleDateString()}</span>
                        <button onClick={e => { e.stopPropagation(); startEditJob(job); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); deleteJob(job.id); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        {expandedJob === job.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedJob === job.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border px-5 pb-4 pt-3 overflow-hidden">
                          {job.description && <div className="mb-3"><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</span><p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{job.description}</p></div>}
                          {job.requirements && <div><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Requirements</span><p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{job.requirements}</p></div>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Applicants Tab ── */}
        {!loading && isAuthenticated && tab === 'applicants' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <select value={selectedJobFilter ?? ''} onChange={e => setSelectedJobFilter(e.target.value ? Number(e.target.value) : null)}
                  className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                  <option value="" className="bg-card">All Positions</option>
                  {jobs.map(j => <option key={j.id} value={j.id} className="bg-card">{j.title}</option>)}
                </select>
              </div>
              <button onClick={() => { setApplicantForm({ jobId: jobs[0]?.id?.toString() ?? '', name: '', email: '', resumeNotes: '', source: '' }); setShowApplicantForm(v => !v); }}
                disabled={jobs.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors disabled:opacity-40">
                <Plus className="w-4 h-4" /> Add Applicant
              </button>
            </div>

            <AnimatePresence>
              {showApplicantForm && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-foreground">New Applicant</h3>
                    <button onClick={() => setShowApplicantForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Position *</label>
                      <select value={applicantForm.jobId} onChange={e => setApplicantForm(p => ({ ...p, jobId: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        {jobs.map(j => <option key={j.id} value={j.id} className="bg-card">{j.title}</option>)}
                      </select>
                    </div>
                    <Field label="Full Name *" name="name" value={applicantForm.name} onChange={v => setApplicantForm(p => ({ ...p, name: v }))} placeholder="Alex Johnson" />
                    <Field label="Email" name="email" value={applicantForm.email} onChange={v => setApplicantForm(p => ({ ...p, email: v }))} type="email" placeholder="alex@example.com" />
                    <Field label="Source" name="source" value={applicantForm.source} onChange={v => setApplicantForm(p => ({ ...p, source: v }))} placeholder="LinkedIn, Referral, etc." />
                  </div>
                  <div className="flex flex-col gap-1 mb-5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Resume / Notes</label>
                    <textarea value={applicantForm.resumeNotes} onChange={e => setApplicantForm(p => ({ ...p, resumeNotes: e.target.value }))}
                      placeholder="Key qualifications, experience, skills..." rows={3}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowApplicantForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                    <button onClick={saveApplicant} disabled={!applicantForm.name.trim() || !applicantForm.jobId}
                      className="px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      Add Applicant
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {filteredApplicants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center"><UserPlus className="w-8 h-8 text-muted-foreground/30" /></div>
                <p className="text-muted-foreground text-sm">No applicants yet — add one manually above</p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">{filteredApplicants.length} applicant{filteredApplicants.length !== 1 ? 's' : ''} in pipeline</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {STAGES.filter(s => s !== 'hired' && s !== 'rejected').map(stage => {
                    const stageApps = filteredApplicants.filter(a => a.stage === stage);
                    return (
                      <div key={stage} className="bg-card border border-border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded border ${STAGE_COLORS[stage]} uppercase font-bold`}>{stage}</span>
                          <span className="text-[10px] text-muted-foreground">{stageApps.length}</span>
                        </div>
                        <div className="space-y-2">
                          {stageApps.map(app => (
                            <div key={app.id} className="bg-muted/20 border border-border/50 rounded-lg p-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-semibold text-foreground">{app.name}</p>
                                <button onClick={() => deleteApplicant(app.id)} className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
                              </div>
                              <p className="text-[10px] text-muted-foreground mb-1.5">{getJobTitle(app.jobId)}</p>
                              {app.source && <p className="text-[10px] text-muted-foreground/60 mb-1.5">via {app.source}</p>}
                              <div className="flex gap-1 flex-wrap">
                                {STAGES.filter(s => s !== stage).map(s => (
                                  <button key={s} onClick={() => updateApplicantStage(app.id, s)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border ${STAGE_COLORS[s]} hover:opacity-80 transition-opacity flex items-center gap-0.5`}>
                                    <ArrowRight className="w-2 h-2" /> {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(filteredApplicants.some(a => a.stage === 'hired') || filteredApplicants.some(a => a.stage === 'rejected')) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {['hired', 'rejected'].map(stage => {
                      const stageApps = filteredApplicants.filter(a => a.stage === stage);
                      if (stageApps.length === 0) return null;
                      return (
                        <div key={stage} className="bg-card border border-border rounded-xl p-3">
                          <div className="flex items-center justify-between mb-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${STAGE_COLORS[stage]} uppercase font-bold`}>{stage}</span>
                            <span className="text-[10px] text-muted-foreground">{stageApps.length}</span>
                          </div>
                          <div className="space-y-2">
                            {stageApps.map(app => (
                              <div key={app.id} className="bg-muted/20 border border-border/50 rounded-lg p-2.5 flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-semibold text-foreground">{app.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{getJobTitle(app.jobId)}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {stage === 'hired' && <Check className="w-3 h-3 text-sky-400" />}
                                  <button onClick={() => deleteApplicant(app.id)} className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Staff / HR Tab ── */}
        {!loading && isAuthenticated && tab === 'staff' && (
          <div className="flex flex-col gap-4">
            {/* Add Staff button + form */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(staffDeptNames.length > 0 || departments.length > 0) && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <select value={staffDeptFilter} onChange={e => setStaffDeptFilter(e.target.value)}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                      <option value="">All Departments</option>
                      {[...new Set([...departments.map(d => d.name), ...staffDeptNames])].sort().map(d => (
                        <option key={d} value={d} className="bg-card">{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button onClick={() => setShowStaffForm(!showStaffForm)}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/30 rounded-xl text-sm font-semibold text-primary hover:bg-primary/20 transition-colors">
                {showStaffForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {showStaffForm ? 'CANCEL' : (boomerMode ? 'Add Employee' : 'ADD STAFF')}
              </button>
            </div>

            <AnimatePresence>
              {showStaffForm && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
                      {boomerMode ? 'New Employee' : 'DIRECT HIRE — ADD STAFF MEMBER'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Full Name" name="name" value={staffForm.name} onChange={v => setStaffForm(p => ({ ...p, name: v }))} placeholder="e.g. Jane Smith" />
                      <Field label="Role / Title" name="role" value={staffForm.role} onChange={v => setStaffForm(p => ({ ...p, role: v }))} placeholder="e.g. Sr. Developer" />
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Department</label>
                        <input list="hiring-staff-dept-presets" value={staffForm.department}
                          onChange={e => setStaffForm(p => ({ ...p, department: e.target.value }))}
                          placeholder={departments.length > 0 ? 'Pick or type a department' : 'e.g. Engineering'}
                          className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                        <datalist id="hiring-staff-dept-presets">
                          {departments.map(d => <option key={d.id} value={d.name} />)}
                        </datalist>
                        {departments.length === 0 && (
                          <button type="button" onClick={() => setTab('depts')}
                            className="text-[10px] text-primary/70 hover:text-primary text-left mt-0.5">
                            + Manage departments
                          </button>
                        )}
                      </div>
                      <Field label="Annual Salary ($)" name="salary" value={staffForm.salary} onChange={v => setStaffForm(p => ({ ...p, salary: v }))} type="number" placeholder="e.g. 85000" />
                      <Field label="Work Email" name="email" value={staffForm.email} onChange={v => setStaffForm(p => ({ ...p, email: v }))} type="email" placeholder="jane@company.com" />
                      <Field label="Phone" name="phone" value={staffForm.phone} onChange={v => setStaffForm(p => ({ ...p, phone: v }))} placeholder="+1 555 123 4567" />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">
                      If the email matches an existing user account, the staff member is auto-linked.
                    </p>
                    <div className="flex justify-end gap-2 mt-4">
                      <button onClick={() => { setShowStaffForm(false); setStaffForm({ name: '', role: '', department: '', salary: '', email: '', phone: '' }); }}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                      <button onClick={saveStaff} disabled={!staffForm.name.trim()}
                        className="flex items-center gap-1.5 px-5 py-2 bg-primary/20 border border-primary/30 rounded-xl text-sm font-semibold text-primary hover:bg-primary/30 transition-colors disabled:opacity-40">
                        <Check className="w-4 h-4" /> {boomerMode ? 'Add Employee' : 'ADD TO ROSTER'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex gap-4">
            {/* Left: directory list */}
            <div className={`${selectedStaff ? 'w-64 flex-shrink-0' : 'flex-1'}`}>
              {filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center"><Users className="w-8 h-8 text-muted-foreground/30" /></div>
                  <p className="text-muted-foreground text-sm text-center">
                    {boomerMode ? 'No employees yet.' : 'NO STAFF ON ROSTER.'}<br/>
                    <span className="text-muted-foreground/60 text-xs">Use ADD STAFF above for direct hires, or move an applicant to "Hired" stage.</span>
                  </p>
                  <button onClick={() => setShowStaffForm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/30 rounded-xl text-sm font-semibold text-primary hover:bg-primary/20 transition-colors">
                    <UserPlus className="w-4 h-4" /> {boomerMode ? 'Add First Employee' : 'ADD YOUR FIRST HIRE'}
                  </button>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {!selectedStaff && (
                    <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/10">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Name</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Role / Dept</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Start Date</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</span>
                      <span></span>
                    </div>
                  )}
                  {filteredStaff.map(member => (
                    <div key={member.id}
                      className={`flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/10 transition-colors cursor-pointer ${selectedStaff?.id === member.id ? 'bg-muted/20' : ''}`}
                      onClick={() => openStaffDetail(member)}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{member.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{member.role}{member.department ? ` · ${member.department}` : ''}</p>
                        </div>
                      </div>
                      {!selectedStaff && (
                        <>
                          <p className="text-xs text-muted-foreground/60 w-24 text-right flex-shrink-0">{new Date(member.startDate).toLocaleDateString()}</p>
                          <div className="w-28 flex-shrink-0 mx-4">
                            <span className={`text-[10px] px-2 py-1 rounded border font-bold uppercase ${STAFF_STATUS_COLORS[member.status] ?? STAFF_STATUS_COLORS.active}`}>{member.status}</span>
                          </div>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedStaff && (
              <div className="flex-1 min-w-0">
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Detail Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-sm font-bold text-foreground">
                        {selectedStaff.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{selectedStaff.name}</p>
                        <p className="text-sm text-muted-foreground">{selectedStaff.role}{selectedStaff.department ? ` · ${selectedStaff.department}` : ''}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${STAFF_STATUS_COLORS[selectedStaff.status] ?? STAFF_STATUS_COLORS.active}`}>{selectedStaff.status}</span>
                          {selectedStaff.salary && <span className="text-[10px] text-sky-400">${(selectedStaff.salary / 1000).toFixed(0)}k</span>}
                          {selectedStaff.linkedUserId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold uppercase tracking-wider">
                              ✓ Linked Account
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/40">Since {new Date(selectedStaff.startDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedStaff(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/5">
                    {([
                      { id: 'directory' as const, label: 'Details', icon: Users },
                      { id: 'perf' as const, label: boomerMode ? 'Performance' : 'Notes', icon: StickyNote },
                      { id: 'onboarding' as const, label: 'Onboarding', icon: ClipboardList },
                      { id: 'offboard' as const, label: 'Offboarding', icon: UserX },
                    ]).map(({ id, label, icon: Icon }) => (
                      <button key={id} onClick={() => setStaffPanel(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${staffPanel === id ? 'bg-card border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {/* Details sub-tab */}
                    {staffPanel === 'directory' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Role</label>
                            <p className="text-sm text-foreground mt-0.5">{selectedStaff.role || '—'}</p>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Department</label>
                            <p className="text-sm text-foreground mt-0.5">{selectedStaff.department || '—'}</p>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Start Date</label>
                            <p className="text-sm text-foreground mt-0.5">{new Date(selectedStaff.startDate).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Salary</label>
                            <p className="text-sm text-foreground mt-0.5">{selectedStaff.salary ? `$${selectedStaff.salary.toLocaleString()}` : '—'}</p>
                          </div>
                        </div>
                        <div className="pt-2">
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</label>
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            {(['active', 'on leave', 'terminated'] as const).map(s => (
                              <button key={s} onClick={() => { updateStaffStatus(selectedStaff.id, s); setSelectedStaff(prev => prev ? { ...prev, status: s } : prev); }}
                                className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase transition-colors ${selectedStaff.status === s ? STAFF_STATUS_COLORS[s] : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Workspace Assignment */}
                        <div className="pt-4 mt-4 border-t border-border/50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{boomerMode ? 'Workspace' : 'Workspace Assignment'}</h4>
                            </div>
                            {(workspaceEdit.assignedOffice !== (selectedStaff.assignedOffice ?? '') ||
                              workspaceEdit.assignedDesk !== (selectedStaff.assignedDesk ?? '') ||
                              workspaceEdit.assignedTerminal !== (selectedStaff.assignedTerminal ?? '')) && (
                              <button onClick={saveWorkspace} disabled={workspaceSaving}
                                className="flex items-center gap-1 bg-primary text-primary-foreground px-2.5 py-1 rounded-md text-[11px] font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">
                                {workspaceSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Building2 className="w-3 h-3" /> Office</label>
                              <input list="hiring-office-presets" value={workspaceEdit.assignedOffice}
                                onChange={e => setWorkspaceEdit(p => ({ ...p, assignedOffice: e.target.value }))}
                                placeholder="Public Office"
                                className="w-full mt-1 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Desk</label>
                              <input list="hiring-desk-presets" value={workspaceEdit.assignedDesk}
                                onChange={e => setWorkspaceEdit(p => ({ ...p, assignedDesk: e.target.value }))}
                                placeholder="DESK A"
                                className="w-full mt-1 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Monitor className="w-3 h-3" /> Terminal</label>
                              <input list="hiring-terminal-presets" value={workspaceEdit.assignedTerminal}
                                onChange={e => setWorkspaceEdit(p => ({ ...p, assignedTerminal: e.target.value }))}
                                placeholder="TERMINAL 1"
                                className="w-full mt-1 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                            </div>
                          </div>
                          <datalist id="hiring-office-presets">
                            {OFFICE_PRESETS.map(o => <option key={o} value={o} />)}
                          </datalist>
                          <datalist id="hiring-desk-presets">
                            {DESK_PRESETS.map(o => <option key={o} value={o} />)}
                          </datalist>
                          <datalist id="hiring-terminal-presets">
                            {TERMINAL_PRESETS.map(o => <option key={o} value={o} />)}
                          </datalist>
                          <p className="text-[10px] text-muted-foreground/60 mt-2">Free-text or pick a preset. Empty = unassigned.</p>
                        </div>
                      </div>
                    )}

                    {/* Performance notes sub-tab */}
                    {staffPanel === 'perf' && (
                      <div>
                        <div className="flex gap-2 mb-4">
                          <input value={perfNoteInput} onChange={e => setPerfNoteInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addPerfNote(); }}
                            placeholder="Log a performance note..."
                            className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                          <button onClick={addPerfNote} disabled={!perfNoteInput.trim()}
                            className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {performanceNotes.length === 0 ? (
                            <p className="text-sm text-muted-foreground/50 text-center py-8">No performance notes yet</p>
                          ) : performanceNotes.map(n => (
                            <div key={n.id} className="flex items-start gap-3 group bg-muted/20 border border-border/50 rounded-xl p-3">
                              <StickyNote className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground">{n.note}</p>
                                <p className="text-[10px] text-muted-foreground/40 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                              </div>
                              <button onClick={() => deletePerfNote(n.id)} className="p-0.5 rounded text-muted-foreground/20 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Onboarding checklist sub-tab */}
                    {staffPanel === 'onboarding' && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Onboarding Checklist</p>
                            <p className="text-xs text-muted-foreground">{onboardingItems.filter(i => i.completed).length} / {onboardingItems.length} completed</p>
                          </div>
                          {onboardingItems.length > 0 && (
                            <div className="w-24 bg-muted/30 rounded-full h-1.5">
                              <div className="bg-sky-500 rounded-full h-1.5 transition-all" style={{ width: `${(onboardingItems.filter(i => i.completed).length / onboardingItems.length) * 100}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 mb-4 max-h-60 overflow-y-auto">
                          {onboardingItems.map(item => (
                            <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/20 transition-colors cursor-pointer group" onClick={() => toggleOnboardingItem(item)}>
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.completed ? 'bg-sky-500/20 border-sky-500/50' : 'border-border hover:border-sky-500/50'}`}>
                                {item.completed && <Check className="w-3 h-3 text-sky-400" />}
                              </div>
                              <span className={`text-sm flex-1 transition-colors ${item.completed ? 'line-through text-muted-foreground/50' : 'text-foreground'}`}>{item.item}</span>
                              {item.completedAt && <span className="text-[10px] text-muted-foreground/40">{new Date(item.completedAt).toLocaleDateString()}</span>}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input value={onboardingInput} onChange={e => setOnboardingInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addOnboardingItem(); }}
                            placeholder="Add custom checklist item..."
                            className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                          <button onClick={addOnboardingItem} disabled={!onboardingInput.trim()}
                            className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Offboarding sub-tab */}
                    {staffPanel === 'offboard' && (
                      <div>
                        {selectedStaff.status === 'departed' ? (
                          <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <UserX className="w-4 h-4 text-gray-400" />
                              <p className="text-sm font-semibold text-gray-300">{boomerMode ? 'Employee Departed' : 'Offboarded'}</p>
                            </div>
                            {selectedStaff.endDate && <p className="text-xs text-muted-foreground mb-2">Departed: {new Date(selectedStaff.endDate).toLocaleDateString()}</p>}
                            {selectedStaff.offboardingNotes && <p className="text-sm text-muted-foreground">{selectedStaff.offboardingNotes}</p>}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              {boomerMode
                                ? 'Mark this employee as departed and archive their records.'
                                : 'Offboard this staff member — their records will be archived.'}
                            </p>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Offboarding Notes</label>
                              <textarea value={offboardNotes} onChange={e => setOffboardNotes(e.target.value)}
                                placeholder="Reason for departure, notes for records, transition info..."
                                rows={3}
                                className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                            </div>
                            {!showOffboardConfirm ? (
                              <button onClick={() => setShowOffboardConfirm(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm font-semibold hover:bg-red-500/25 transition-colors">
                                <UserX className="w-4 h-4" /> Mark as Departed
                              </button>
                            ) : (
                              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                <p className="text-sm text-red-300 font-semibold mb-3">Confirm offboarding {selectedStaff.name}?</p>
                                <div className="flex gap-2">
                                  <button onClick={handleOffboard}
                                    className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-bold hover:bg-red-500/30 transition-colors">
                                    Confirm Departure
                                  </button>
                                  <button onClick={() => setShowOffboardConfirm(false)}
                                    className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* ── Departments tab ── */}
        {!loading && isAuthenticated && tab === 'depts' && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">{boomerMode ? 'DEPARTMENTS' : 'Departments'}</h2>
                <p className="text-xs text-muted-foreground">Organize your staff into departments. Renaming or deleting updates all assigned staff.</p>
              </div>
              <button
                onClick={() => { setEditingDept(null); setDeptForm({ name: '', description: '', color: 'sky' }); setShowDeptForm(true); }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" /> {boomerMode ? 'NEW DEPT' : 'New Department'}
              </button>
            </div>

            <AnimatePresence>
              {showDeptForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mb-4 bg-muted/20 border border-border rounded-xl p-4 overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <Field label="Name" name="name" value={deptForm.name} onChange={v => setDeptForm({ ...deptForm, name: v })} placeholder="Engineering" />
                    <Field label="Description" name="description" value={deptForm.description} onChange={v => setDeptForm({ ...deptForm, description: v })} placeholder="Optional" />
                  </div>
                  <div className="mb-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Color</label>
                    <div className="flex gap-2 flex-wrap">
                      {DEPT_COLOR_OPTIONS.map(c => (
                        <button key={c} type="button" onClick={() => setDeptForm({ ...deptForm, color: c })}
                          className={`px-3 py-1 rounded-md text-xs font-bold border ${DEPT_COLOR_CLASSES[c]} ${deptForm.color === c ? 'ring-2 ring-foreground/40' : 'opacity-60 hover:opacity-100'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setShowDeptForm(false); setEditingDept(null); }}
                      className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                    <button onClick={saveDept} disabled={!deptForm.name.trim()}
                      className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40">
                      {editingDept ? 'Save' : 'Create'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {departments.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground/60">
                No departments yet. Create one to organize your staff.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {departments.map(d => {
                  const memberCount = staff.filter(s => s.department === d.name).length;
                  return (
                    <div key={d.id} className="border border-border rounded-xl p-4 bg-muted/10 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase mb-1 ${DEPT_COLOR_CLASSES[d.color] ?? DEPT_COLOR_CLASSES.sky}`}>{d.color}</span>
                          <p className="font-bold text-foreground truncate">{d.name}</p>
                          {d.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.description}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => { setEditingDept(d); setDeptForm({ name: d.name, description: d.description, color: d.color }); setShowDeptForm(true); }}
                            className="p-1.5 hover:bg-muted/40 rounded text-muted-foreground hover:text-foreground" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteDept(d.id)}
                            className="p-1.5 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                        <Users className="w-3 h-3" /> {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Interview Conductor tab ── */}
        {tab === 'conduct' && <div className="flex-1"><InterviewConductor /></div>}

        {/* ── Presentation tab ── */}
        {tab === 'present' && <div className="flex-1"><PresentationTool /></div>}

      </main>
    </div>
  );
}
