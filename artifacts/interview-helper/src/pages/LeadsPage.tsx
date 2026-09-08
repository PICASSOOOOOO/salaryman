import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Download, Trash2, Plus, X, Mail, Loader2, Check,
  Search, ChevronDown, ChevronUp, Edit2, Upload,
  Phone, Building2, Clock, StickyNote, Shield, ShieldAlert,
  FileText, UserPlus, Filter, Lock,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useBoomerMode } from '@/hooks/use-mobile';
import CrmRoutingPanel from '@/components/CrmRoutingPanel';

interface LeadRecord {
  id: number;
  orgId: number;
  importId: number | null;
  isLocked: boolean;
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
  source: string;
  status: string;
  assignedUserId: string | null;
  pabloNotesJson: string | null;
  lastCalledAt: string | null;
  callCount: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadNote {
  id: number;
  leadId: number;
  userId: string;
  userName: string | null;
  note: string;
  createdAt: string;
}

interface CallRecord {
  id: number;
  callerName: string | null;
  recipientNumber: string;
  status: string;
  direction: string;
  callType: string;
  durationSeconds: number;
  transcript: string | null;
  summary: string | null;
  startedAt: string;
}

interface CrmActivity {
  id: number;
  userId: string;
  channel: 'call' | 'voicemail' | 'sms' | 'comms';
  direction: string;
  phone: string;
  contactName: string | null;
  body: string | null;
  summary: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  status: string | null;
  occurredAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { call: 'CALL', voicemail: 'VOICEMAIL', sms: 'SMS', comms: 'COMMS' };
const CHANNEL_COLOR: Record<string, string> = {
  call: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  voicemail: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  sms: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  comms: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

const STATUSES = [
  { value: 'new', label: 'NEW', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  { value: 'contacted', label: 'CONTACTED', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'qualified', label: 'QUALIFIED', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  { value: 'proposal', label: 'PROPOSAL', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'closed_won', label: 'CLOSED WON', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'closed_lost', label: 'CLOSED LOST', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
];

function statusColor(s: string) {
  return STATUSES.find(st => st.value === s)?.color || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
}
function statusLabel(s: string) {
  return STATUSES.find(st => st.value === s)?.label || s.toUpperCase();
}

export default function LeadsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [boomerMode] = useBoomerMode();
  const userId = user?.id ?? '';

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [role, setRole] = useState<string>('employee');
  const [orgId, setOrgId] = useState<number | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [leadCalls, setLeadCalls] = useState<CallRecord[]>([]);
  const [leadActivities, setLeadActivities] = useState<CrmActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', company: '', jobTitle: '' });
  const [saving, setSaving] = useState(false);

  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', company: '', jobTitle: '', status: '', assignedUserId: '' });

  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; errorDetails: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const admin = role === 'owner' || role === 'manager';

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const q = params.toString();
      const r = await apiFetch(`api/leads${q ? `?${q}` : ''}`);
      if (r.ok) {
        const d = await r.json();
        setLeads(d.leads);
        setRole(d.role);
        if (d.orgId) setOrgId(d.orgId);
        if (d.members) setMemberMap(d.members);
      }
    } catch {}
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    if (isAuthenticated) fetchLeads();
  }, [isAuthenticated, fetchLeads]);

  useEffect(() => {
    if (!isAuthenticated || !user || !orgId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const uid = (user as unknown as Record<string, string>).id ?? '';
    const params = new URLSearchParams({ userId: uid, userName: 'leads-listener', profileImageUrl: '', orgId: String(orgId) });
    const wsUrl = `${proto}//${host}${base}/ws/chat?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg._channel === 'leads') {
          fetchLeads();
        }
      } catch {}
    };
    const interval = setInterval(fetchLeads, 30000);
    return () => { ws.close(); clearInterval(interval); };
  }, [isAuthenticated, user, orgId, fetchLeads]);

  const openDetail = async (lead: LeadRecord) => {
    setSelectedLead(lead);
    setDetailLoading(true);
    setLeadActivities([]);
    try {
      const [r, ra] = await Promise.all([
        apiFetch(`api/leads/${lead.id}`),
        apiFetch(`api/crm/leads/${lead.id}/timeline`),
      ]);
      if (r.ok) {
        const d = await r.json();
        setLeadNotes(d.notes || []);
        setLeadCalls(d.callHistory || []);
      }
      if (ra.ok) {
        const da = await ra.json();
        setLeadActivities(da.activities || []);
      }
    } catch {}
    setDetailLoading(false);
  };

  const addNote = async () => {
    if (!selectedLead || !newNote.trim()) return;
    try {
      const r = await apiFetch(`api/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setLeadNotes(prev => [d.note, ...prev]);
        setNewNote('');
      }
    } catch {}
  };

  const updateStatus = async (leadId: number, status: string) => {
    try {
      const r = await apiFetch(`api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        const d = await r.json();
        setLeads(prev => prev.map(l => l.id === leadId ? d.lead : l));
        if (selectedLead?.id === leadId) setSelectedLead(d.lead);
      }
    } catch {}
  };

  const createLead = async () => {
    if (!addForm.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const r = await apiFetch('api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (r.ok) {
        setShowAddForm(false);
        setAddForm({ name: '', phone: '', email: '', company: '', jobTitle: '' });
        fetchLeads();
      } else {
        const d = await r.json();
        setError(d.error || 'Failed to create lead');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const saveLead = async () => {
    if (!editingLead) return;
    setSaving(true);
    try {
      const r = await apiFetch(`api/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (r.ok) {
        setEditingLead(null);
        fetchLeads();
      } else {
        const d = await r.json();
        setError(d.error || 'Failed to update');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const deleteLead = async (id: number) => {
    try {
      const r = await apiFetch(`api/leads/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
        if (selectedLead?.id === id) setSelectedLead(null);
      } else {
        const d = await r.json();
        setError(d.error || 'Failed to delete');
      }
    } catch {}
  };

  const exportCSV = async () => {
    try {
      const r = await apiFetch('api/leads/export/csv');
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-export-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Always use the multipart endpoint — it handles CSV, XLSX, and XLS via
      // the same SheetJS-backed parser, so users can drop in whatever they
      // exported from Excel/Numbers/Google Sheets without conversion.
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiFetch('api/leads/import-file', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) {
        setImportResult({ success: d.success, errors: d.errors, errorDetails: d.errorDetails || [] });
        fetchLeads();
      } else {
        setError(d.error || 'Import failed');
      }
    } catch { setError('Failed to read file'); }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Stream the Excel export as a binary blob so the browser saves the .xlsx
  // file directly. Same column order as the CSV export → guaranteed round-trip.
  const exportXLSX = async () => {
    try {
      const r = await apiFetch('api/leads/export/xlsx');
      if (!r.ok) { setError('Export failed'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${Date.now()}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { setError('Export failed'); }
  };

  useEffect(() => {
    if (admin) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [admin]);

  const preventCopy = !admin ? {
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
    style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
  } : {};

  if (!isAuthenticated && !authLoading) {
    return <SignInPage context="Sign in to access the lead database." />;
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" {...preventCopy}>
      {!admin && (
        <style>{`
          .leads-data * { user-select: none !important; -webkit-user-select: none !important; }
          .leads-data a[href^="tel:"], .leads-data a[href^="mailto:"] { pointer-events: auto; }
        `}</style>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider">LEAD DATABASE</h1>
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase bg-background text-black border border-black rounded">
              {admin ? <Shield className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              {admin ? 'MANAGER' : 'MEMBER'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <>
              {admin && (
                <>
                <button onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold uppercase bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> IMPORT CSV / XLSX
                </button>
                <button onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold uppercase bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors">
                  <Download className="w-3.5 h-3.5" /> EXPORT CSV
                </button>
                <button onClick={exportXLSX}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold uppercase bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors">
                  <Download className="w-3.5 h-3.5" /> EXPORT XLSX
                </button>
                </>
              )}
              <button onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold uppercase bg-background border-2 border-black text-black transition-colors">
                <Plus className="w-3.5 h-3.5" /> ADD LEAD
              </button>
            </>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-4 p-3 bg-red-500/20 border border-red-500/30 text-red-300 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH LEADS..."
              className="w-full pl-10 pr-4 py-2 bg-card border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 uppercase"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-card border border-border text-sm focus:outline-none focus:border-primary/50 uppercase"
          >
            <option value="">ALL STATUSES</option>
            {STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className={`flex-1 ${selectedLead ? 'sm:max-w-[55%]' : ''}`}>
            <div className="bg-card border border-border">
              <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-0 border-b border-border px-4 py-2 text-xs font-bold uppercase text-muted-foreground">
                <span>NAME</span>
                <span>COMPANY</span>
                <span>CONTACT</span>
                <span>STATUS</span>
                <span className="w-20 text-right">CALLS</span>
              </div>
              <div className="leads-data">
                {leads.length === 0 && (
                  <div className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {search || statusFilter ? 'NO LEADS MATCH YOUR FILTERS' : 'NO LEADS YET. ADD YOUR FIRST LEAD.'}
                  </div>
                )}
                {leads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => openDetail(lead)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors ${selectedLead?.id === lead.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                  >
                    <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-0 px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {lead.isLocked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                        <span className="font-medium truncate text-sm">{lead.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                        {lead.company && <Building2 className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{lead.company || '-'}</span>
                      </div>
                      <div className="flex flex-col text-xs text-muted-foreground truncate">
                        {lead.phone && <span className="truncate">{lead.phone}</span>}
                        {lead.email && <span className="truncate">{lead.email}</span>}
                        {!lead.phone && !lead.email && <span>-</span>}
                      </div>
                      <div className="w-24 text-xs text-muted-foreground truncate">
                        {lead.assignedUserId ? (memberMap[lead.assignedUserId] || 'ASSIGNED') : <span className="text-muted-foreground/40">UNASSIGNED</span>}
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${statusColor(lead.status)}`}>
                          {statusLabel(lead.status)}
                        </span>
                      </div>
                      <div className="w-20 text-right text-xs text-muted-foreground">
                        {lead.callCount > 0 ? `${lead.callCount} CALL${lead.callCount !== 1 ? 'S' : ''}` : '-'}
                      </div>
                    </div>
                    <div className="sm:hidden px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {lead.isLocked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                          <span className="font-medium truncate text-sm">{lead.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border shrink-0 ${statusColor(lead.status)}`}>
                          {statusLabel(lead.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        {lead.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{lead.company}</span>}
                        {lead.phone && <span>{lead.phone}</span>}
                        {lead.callCount > 0 && <span>{lead.callCount} CALL{lead.callCount !== 1 ? 'S' : ''}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground text-right">
              {leads.length} LEAD{leads.length !== 1 ? 'S' : ''}
            </div>
          </div>

          <AnimatePresence>
            {selectedLead && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="w-full sm:w-[45%] bg-card border border-border max-h-[80vh] overflow-y-auto"
              >
                <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm uppercase">{selectedLead.name}</h2>
                    {selectedLead.isLocked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                  </div>
                  <div className="flex items-center gap-1">
                    {admin && (
                      <>
                        <button onClick={() => { setEditingLead(selectedLead); setEditForm({ name: selectedLead.name, phone: selectedLead.phone, email: selectedLead.email, company: selectedLead.company, jobTitle: selectedLead.jobTitle, status: selectedLead.status, assignedUserId: selectedLead.assignedUserId || '' }); }}
                          className="p-1.5 hover:bg-muted/20 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteLead(selectedLead.id)}
                          className="p-1.5 hover:bg-red-500/20 transition-colors text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                    <button onClick={() => setSelectedLead(null)}
                      className="p-1.5 hover:bg-muted/20 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">PHONE</span>
                      <p className="font-mono">{selectedLead.phone || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">EMAIL</span>
                      <p>{selectedLead.email || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">COMPANY</span>
                      <p>{selectedLead.company || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">JOB TITLE</span>
                      <p>{selectedLead.jobTitle || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">SOURCE</span>
                      <p className="uppercase text-xs">{selectedLead.source}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">ASSIGNED TO</span>
                      <p className="text-xs">{selectedLead.assignedUserId ? (memberMap[selectedLead.assignedUserId] || 'ASSIGNED') : <span className="text-muted-foreground/50">UNASSIGNED</span>}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground">CALLS</span>
                      <p>{selectedLead.callCount}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block mb-1">STATUS</span>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map(s => (
                        <button
                          key={s.value}
                          onClick={() => updateStatus(selectedLead.id, s.value)}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase border transition-all ${selectedLead.status === s.value ? s.color + ' ring-1 ring-white/20' : 'bg-muted/10 text-muted-foreground border-border hover:bg-muted/20'}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedLead.pabloNotesJson && (
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block mb-1">PABLO NOTES</span>
                      <div className="bg-muted/10 border border-border p-2 text-xs whitespace-pre-wrap">
                        {(() => { try { const notes = JSON.parse(selectedLead.pabloNotesJson); return Array.isArray(notes) ? notes.join('\n') : String(notes); } catch { return selectedLead.pabloNotesJson; } })()}
                      </div>
                    </div>
                  )}

                  <CrmRoutingPanel
                    leadId={selectedLead.id}
                    leadName={selectedLead.name}
                    leadPhone={selectedLead.phone}
                    assignedUserId={selectedLead.assignedUserId}
                    canEdit={admin}
                    onUpdated={() => { void openDetail(selectedLead); }}
                  />

                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground block mb-2">NOTES ({leadNotes.length})</span>
                    <div className="flex gap-2 mb-2">
                      <input
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addNote()}
                        placeholder="ADD A NOTE..."
                        className="flex-1 px-3 py-1.5 bg-muted/10 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 uppercase"
                      />
                      <button onClick={addNote} disabled={!newNote.trim()}
                        className="px-3 py-1.5 bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                        <StickyNote className="w-4 h-4" />
                      </button>
                    </div>
                    {detailLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" /></div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {leadNotes.map(n => (
                          <div key={n.id} className="bg-muted/5 border border-border/50 p-2 text-xs">
                            <div className="flex items-center justify-between mb-1 text-muted-foreground">
                              <span className="font-bold uppercase">{n.userName || 'UNKNOWN'}</span>
                              <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p>{n.note}</p>
                          </div>
                        ))}
                        {leadNotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">NO NOTES YET</p>}
                      </div>
                    )}
                  </div>

                  {leadCalls.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block mb-2">CALL HISTORY ({leadCalls.length})</span>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {leadCalls.map(c => (
                          <div key={c.id} className="bg-muted/5 border border-border/50 p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold uppercase">{c.direction} - {c.callType}</span>
                              <span className="text-muted-foreground">{new Date(c.startedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{c.status.toUpperCase()}</span>
                              {c.durationSeconds > 0 && <span>{Math.floor(c.durationSeconds / 60)}:{String(c.durationSeconds % 60).padStart(2, '0')}</span>}
                            </div>
                            {c.summary && <p className="mt-1 text-muted-foreground">{c.summary}</p>}
                            {c.transcript && (
                              <details className="mt-1">
                                <summary className="text-[10px] uppercase text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">TRANSCRIPT</summary>
                                <p className="mt-1 text-muted-foreground/80 whitespace-pre-wrap text-[11px] max-h-32 overflow-y-auto">{c.transcript}</p>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {leadActivities.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block mb-2">CRM ACTIVITY ({leadActivities.length})</span>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {leadActivities.map(a => (
                          <div key={a.id} className="bg-muted/5 border border-border/50 p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`px-1.5 py-0.5 border text-[9px] uppercase font-bold ${CHANNEL_COLOR[a.channel] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                                {CHANNEL_LABEL[a.channel] || a.channel} · {a.direction.toUpperCase()}
                              </span>
                              <span className="text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{a.phone}</span>
                              {a.status && <span>· {a.status.toUpperCase()}</span>}
                              {!!a.durationSeconds && a.durationSeconds > 0 && (
                                <span>· {Math.floor(a.durationSeconds / 60)}:{String(a.durationSeconds % 60).padStart(2, '0')}</span>
                              )}
                            </div>
                            {a.summary && <p className="mt-1 text-muted-foreground">{a.summary}</p>}
                            {a.body && <p className="mt-1 text-muted-foreground/80 whitespace-pre-wrap text-[11px]">{a.body}</p>}
                            {a.recordingUrl && (
                              <a href={a.recordingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] uppercase text-primary hover:underline">RECORDING</a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={() => setShowAddForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm uppercase">ADD NEW LEAD</h3>
                <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                {(['name', 'phone', 'email', 'company', 'jobTitle'] as const).map(field => (
                  <div key={field}>
                    <label className="text-[10px] uppercase text-muted-foreground block mb-1">{field === 'jobTitle' ? 'JOB TITLE' : field.toUpperCase()}</label>
                    <input
                      value={addForm[field]}
                      onChange={e => setAddForm(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted/10 border border-border text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-sm font-bold uppercase text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                <button onClick={createLead} disabled={saving || !addForm.name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold uppercase bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} CREATE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingLead && admin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={() => setEditingLead(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm uppercase">EDIT LEAD</h3>
                <button onClick={() => setEditingLead(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                {(['name', 'phone', 'email', 'company', 'jobTitle'] as const).map(field => (
                  <div key={field}>
                    <label className="text-[10px] uppercase text-muted-foreground block mb-1">{field === 'jobTitle' ? 'JOB TITLE' : field.toUpperCase()}</label>
                    <input
                      value={editForm[field]}
                      onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted/10 border border-border text-sm focus:outline-none focus:border-primary/50"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block mb-1">STATUS</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted/10 border border-border text-sm focus:outline-none focus:border-primary/50 uppercase"
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block mb-1">ASSIGN TO</label>
                  <select
                    value={editForm.assignedUserId}
                    onChange={e => setEditForm(prev => ({ ...prev, assignedUserId: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted/10 border border-border text-sm focus:outline-none focus:border-primary/50 uppercase"
                  >
                    <option value="">UNASSIGNED</option>
                    {Object.entries(memberMap).map(([uid, name]) => (
                      <option key={uid} value={uid}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditingLead(null)}
                  className="px-4 py-2 text-sm font-bold uppercase text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                <button onClick={saveLead} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold uppercase bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} SAVE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showImport && admin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={() => { setShowImport(false); setImportResult(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border p-6 w-full max-w-lg"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm uppercase">IMPORT LEADS — CSV OR EXCEL</h3>
                <button onClick={() => { setShowImport(false); setImportResult(null); }}><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="bg-muted/10 border border-border p-3 text-xs">
                  <p className="mb-2 font-bold uppercase">CSV FORMAT:</p>
                  <p className="text-muted-foreground">Required columns: <span className="text-primary">name</span></p>
                  <p className="text-muted-foreground">Optional: Phone, Email, Business (or Company), Job Title</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">Accepts .csv, .xlsx, .xls. Headers from a previous EXPORT will round-trip exactly. Use the <b>Business</b> column to group leads under different businesses inside your org.</p>
                  <p className="text-muted-foreground mt-1">Imported leads are <span className="text-amber-300">LOCKED</span> — only admins can delete them.</p>
                </div>
                <div className="flex items-center justify-center">
                  <label className="flex items-center gap-2 px-6 py-3 bg-primary/20 border border-primary/30 text-primary text-sm font-bold uppercase cursor-pointer hover:bg-primary/30 transition-colors">
                    <Upload className="w-4 h-4" />
                    {importing ? 'IMPORTING...' : 'SELECT CSV FILE'}
                    <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" disabled={importing} />
                  </label>
                </div>
                {importing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> PROCESSING...
                  </div>
                )}
                {importResult && (
                  <div className="bg-muted/10 border border-border p-3 text-xs space-y-1">
                    <p className="text-emerald-300">{importResult.success} LEADS IMPORTED SUCCESSFULLY</p>
                    {importResult.errors > 0 && <p className="text-red-300">{importResult.errors} ERRORS</p>}
                    {importResult.errorDetails.map((e, i) => (
                      <p key={i} className="text-red-400/70 text-[10px]">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
