import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, UserPlus, Users, Plus, X, Trash2, ChevronDown, ChevronUp, Loader2, ArrowRight, Edit2, Check } from 'lucide-react';

import { useAuth } from '@workspace/replit-auth-web';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';

type ActiveTab = 'jobs' | 'applicants' | 'staff';

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
  salary: number | null;
  status: string;
  startDate: string;
  createdAt: string;
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
  offer: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  hired: 'bg-green-500/20 text-green-300 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};
const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  closed: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  filled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};
const STAFF_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'on leave': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  terminated: 'bg-red-500/20 text-red-300 border-red-500/30',
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
  const { isPro, loading: planLoading } = usePlan();
  const [tab, setTab] = useState<ActiveTab>('jobs');
  const [loading, setLoading] = useState(true);

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

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const [statsRes, jobsRes, applicantsRes, staffRes] = await Promise.all([
        fetch('/api/tools/hiring/stats'),
        fetch('/api/tools/hiring/jobs'),
        fetch('/api/tools/hiring/applicants'),
        fetch('/api/tools/hiring/staff'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (jobsRes.ok) { const d = await jobsRes.json(); setJobs(d.jobs ?? []); }
      if (applicantsRes.ok) { const d = await applicantsRes.json(); setApplicants(d.applicants ?? []); }
      if (staffRes.ok) { const d = await staffRes.json(); setStaff(d.staff ?? []); }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
      const res = await fetch(`/api/tools/hiring/jobs/${editingJob.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const d = await res.json(); setJobs(prev => prev.map(j => j.id === editingJob.id ? d.job : j)); }
    } else {
      const res = await fetch('/api/tools/hiring/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { const d = await res.json(); setJobs(prev => [d.job, ...prev]); }
    }
    setJobForm({ title: '', description: '', requirements: '', salaryMin: '', salaryMax: '', status: 'open' });
    setShowJobForm(false);
    setEditingJob(null);
    loadAll();
  };

  const deleteJob = async (id: number) => {
    const res = await fetch(`/api/tools/hiring/jobs/${id}`, { method: 'DELETE' });
    if (res.ok) { setJobs(prev => prev.filter(j => j.id !== id)); setApplicants(prev => prev.filter(a => a.jobId !== id)); loadAll(); }
  };

  const saveApplicant = async () => {
    if (!applicantForm.name.trim() || !applicantForm.jobId) return;
    const res = await fetch('/api/tools/hiring/applicants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applicantForm),
    });
    if (res.ok) { const d = await res.json(); setApplicants(prev => [d.applicant, ...prev]); }
    setApplicantForm({ jobId: '', name: '', email: '', resumeNotes: '', source: '' });
    setShowApplicantForm(false);
    loadAll();
  };

  const updateApplicantStage = async (id: number, stage: string) => {
    const res = await fetch(`/api/tools/hiring/applicants/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (res.ok) { const d = await res.json(); setApplicants(prev => prev.map(a => a.id === id ? d.applicant : a)); }
    if (stage === 'hired') loadAll();
  };

  const deleteApplicant = async (id: number) => {
    const res = await fetch(`/api/tools/hiring/applicants/${id}`, { method: 'DELETE' });
    if (res.ok) { setApplicants(prev => prev.filter(a => a.id !== id)); loadAll(); }
  };

  const updateStaffStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/tools/hiring/staff/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { const d = await res.json(); setStaff(prev => prev.map(s => s.id === id ? d.staff : s)); loadAll(); }
  };

  const startEditJob = (job: Job) => {
    setEditingJob(job);
    setJobForm({
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      salaryMin: job.salaryMin?.toString() ?? '',
      salaryMax: job.salaryMax?.toString() ?? '',
      status: job.status,
    });
    setShowJobForm(true);
  };

  const filteredApplicants = selectedJobFilter
    ? applicants.filter(a => a.jobId === selectedJobFilter)
    : applicants;

  const getJobTitle = (jobId: number) => jobs.find(j => j.id === jobId)?.title ?? 'Unknown Position';

  if (!planLoading && !isPro) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <ProGate feature={PABLO_PRODUCTS.HIRING.name} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-accent/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full relative z-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-teal-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{PABLO_PRODUCTS.HIRING.short}</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-12 mb-6">Post positions, track candidates, manage your roster.</p>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Open Positions', value: stats.openPositions, color: 'text-emerald-400' },
            { label: 'Total Applicants', value: stats.totalApplicants, color: 'text-blue-400' },
            { label: 'Active Staff', value: stats.activeStaff, color: 'text-purple-400' },
            { label: 'Filled This Month', value: stats.filledThisMonth, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 mb-6 bg-muted/20 rounded-xl p-1 w-fit border border-border">
          {([
            { id: 'jobs' as const, label: 'Job Board', icon: Briefcase },
            { id: 'applicants' as const, label: 'Applicants', icon: UserPlus },
            { id: 'staff' as const, label: 'Staff', icon: Users },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                ${tab === id ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && !isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">Sign in to manage your hiring pipeline</p>
          </div>
        )}

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
                  <div className="grid grid-cols-2 gap-4 mb-4">
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
                      placeholder="Describe the role, responsibilities, and what a typical day looks like..."
                      rows={3} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex flex-col gap-1 mb-5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Requirements</label>
                    <textarea value={jobForm.requirements} onChange={e => setJobForm(p => ({ ...p, requirements: e.target.value }))}
                      placeholder="Skills, experience, qualifications needed..."
                      rows={2} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
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
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <Briefcase className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No positions yet — create your first job listing above</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">{jobs.length} position{jobs.length !== 1 ? 's' : ''}</p>
                {jobs.map(job => (
                  <motion.div key={job.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500/30 to-emerald-500/30 border border-border flex items-center justify-center text-sm font-bold text-foreground">
                          {job.title.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{job.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${JOB_STATUS_COLORS[job.status] ?? JOB_STATUS_COLORS.open} uppercase font-bold`}>
                              {job.status}
                            </span>
                            {(job.salaryMin || job.salaryMax) && (
                              <span className="text-[10px] text-muted-foreground">
                                {job.salaryMin ? `$${(job.salaryMin / 1000).toFixed(0)}k` : ''}
                                {job.salaryMin && job.salaryMax ? ' - ' : ''}
                                {job.salaryMax ? `$${(job.salaryMax / 1000).toFixed(0)}k` : ''}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40">
                              {applicants.filter(a => a.jobId === job.id).length} applicant{applicants.filter(a => a.jobId === job.id).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/40">{new Date(job.createdAt).toLocaleDateString()}</span>
                        <button onClick={e => { e.stopPropagation(); startEditJob(job); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteJob(job.id); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {expandedJob === job.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <AnimatePresence>
                      {expandedJob === job.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="border-t border-border px-5 pb-4 pt-3 overflow-hidden">
                          {job.description && (
                            <div className="mb-3">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</span>
                              <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{job.description}</p>
                            </div>
                          )}
                          {job.requirements && (
                            <div>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Requirements</span>
                              <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{job.requirements}</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

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
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-foreground">New Applicant</h3>
                    <button onClick={() => setShowApplicantForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
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
                      placeholder="Key qualifications, experience, skills..."
                      rows={3} className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowApplicantForm(false)}
                      className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
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
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <UserPlus className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No applicants yet — add one manually above</p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">{filteredApplicants.length} applicant{filteredApplicants.length !== 1 ? 's' : ''} in pipeline</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
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
                                <button onClick={() => deleteApplicant(app.id)}
                                  className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors">
                                  <X className="w-3 h-3" />
                                </button>
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
                  <div className="grid grid-cols-2 gap-3">
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
                                  {stage === 'hired' && <Check className="w-3 h-3 text-green-400" />}
                                  <button onClick={() => deleteApplicant(app.id)}
                                    className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors">
                                    <X className="w-3 h-3" />
                                  </button>
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

        {!loading && isAuthenticated && tab === 'staff' && (
          <div>
            {staff.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No staff yet — hire an applicant to add them to your roster</p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">{staff.length} team member{staff.length !== 1 ? 's' : ''}</p>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border bg-muted/10">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Name</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Role</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Salary</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Start Date</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</span>
                  </div>
                  {staff.map(member => (
                    <div key={member.id} className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/10 transition-colors items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-xs font-bold text-foreground">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{member.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{member.role || '—'}</p>
                      <p className="text-sm text-muted-foreground w-20 text-right">
                        {member.salary ? `$${(member.salary / 1000).toFixed(0)}k` : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground/60 w-24 text-right">
                        {new Date(member.startDate).toLocaleDateString()}
                      </p>
                      <div className="w-28">
                        <select value={member.status} onChange={e => updateStaffStatus(member.id, e.target.value)}
                          className={`text-[10px] px-2 py-1 rounded border font-bold uppercase ${STAFF_STATUS_COLORS[member.status] ?? STAFF_STATUS_COLORS.active} bg-transparent outline-none cursor-pointer`}>
                          <option value="active" className="bg-card text-foreground">Active</option>
                          <option value="on leave" className="bg-card text-foreground">On Leave</option>
                          <option value="terminated" className="bg-card text-foreground">Terminated</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
