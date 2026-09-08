import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Download, Trash2, Plus, X, Loader2,
  Search, Edit2, Upload, Lock, Shield, ShieldAlert,
  Building2, Phone, Mail, StickyNote
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

const STATUSES = [
  { value: 'new', label: 'NEW' },
  { value: 'contacted', label: 'CONTACTED' },
  { value: 'qualified', label: 'QUALIFIED' },
  { value: 'proposal', label: 'PROPOSAL' },
  { value: 'closed_won', label: 'CLOSED WON' },
  { value: 'closed_lost', label: 'CLOSED LOST' },
];

function statusColor(s: string, selected: boolean) {
  if (selected) return 'border-[#00ff41] bg-[#00ff41] text-black';
  if (s === 'closed_won') return 'border-black bg-black text-[#00ff41]';
  if (s === 'closed_lost') return 'border-black bg-black/10 text-black/50';
  return 'border-black text-black';
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
        if (selectedLead?.id === editingLead.id) {
           void openDetail(editingLead);
        }
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
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-[#FAFAF7]">
        <div className="animate-pulse flex flex-col items-center gap-2 text-black/50">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest">Loading Database...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] bg-[#FAFAF7] text-black font-sans text-sm" {...preventCopy}>
      {!admin && (
        <style>{`
          .leads-data * { user-select: none !important; -webkit-user-select: none !important; }
          .leads-data a[href^="tel:"], .leads-data a[href^="mailto:"] { pointer-events: auto; }
        `}</style>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-black">
        <div className="flex items-center gap-4">
          <Users size={14} className="text-black" />
          <h1 className="font-bold uppercase tracking-widest text-xs">LEAD DATABASE</h1>
          <span className="bg-black text-[#00ff41] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest">
            {admin ? 'MANAGER' : 'MEMBER'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <>
              <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-widest font-bold uppercase border border-black hover:bg-black hover:text-[#00ff41] transition-colors">
                <Upload size={12}/> IMPORT
              </button>
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-widest font-bold uppercase border border-black hover:bg-black hover:text-[#00ff41] transition-colors">
                <Download size={12}/> CSV
              </button>
              <button onClick={exportXLSX} className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] tracking-widest font-bold uppercase border border-black hover:bg-black hover:text-[#00ff41] transition-colors">
                <Download size={12}/> XLSX
              </button>
            </>
          )}
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5 px-4 py-1.5 text-[9px] tracking-widest font-bold uppercase bg-black text-[#00ff41] hover:text-white transition-colors">
            <Plus size={12}/> ADD LEAD
          </button>
        </div>
      </header>

      {/* Toolbar & Error */}
      {error && (
        <div className="px-4 py-2 bg-black text-[#00ff41] text-[10px] font-mono font-bold uppercase flex justify-between items-center border-b border-black">
          <span>ERROR: {error}</span>
          <button onClick={() => setError('')} className="hover:text-white"><X size={14}/></button>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 border-b border-black bg-white">
        <div className="flex items-center gap-3">
          <div className="relative w-[300px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/50" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH LEADS..."
              className="w-full pl-7 pr-2 py-1.5 text-xs font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30 bg-white"
            />
          </div>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold border border-black outline-none uppercase bg-white cursor-pointer"
          >
            <option value="">ALL STATUSES</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest text-black/40">
          {leads.length} LEAD{leads.length !== 1 ? 'S' : ''}
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex flex-1 overflow-hidden leads-data">
        {/* Table Area */}
        <div className="flex-1 flex flex-col border-r border-black overflow-hidden bg-white">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_1fr_100px_90px_60px] gap-4 px-4 py-2 border-b border-black bg-black/5 text-[9px] font-bold uppercase tracking-widest text-black/50">
            <span>Name</span>
            <span>Contact</span>
            <span>Company</span>
            <span>Assigned</span>
            <span>Status</span>
            <span className="text-right">Calls</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {leads.length === 0 && (
              <div className="p-4 text-center text-[10px] uppercase tracking-widest font-bold text-black/30 mt-10">
                {search || statusFilter ? 'NO LEADS MATCH FILTERS' : 'NO LEADS FOUND'}
              </div>
            )}
            {leads.map(lead => (
              <button
                key={lead.id}
                onClick={() => openDetail(lead)}
                className={`w-full text-left grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_1fr_100px_90px_60px] gap-4 px-4 py-3 border-b border-black/10 text-xs items-center transition-colors ${selectedLead?.id === lead.id ? 'bg-black text-[#00ff41]' : 'hover:bg-black/5'}`}
              >
                <div className="font-bold truncate uppercase text-[11px] flex items-center gap-1.5">
                  {lead.isLocked && <Lock size={10} className={selectedLead?.id === lead.id ? 'text-[#00ff41]' : 'text-black/40'} />}
                  {lead.name}
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-mono text-[10px]">{lead.phone || '-'}</span>
                  <span className={`text-[10px] ${selectedLead?.id === lead.id ? 'text-[#00ff41]/70' : 'text-black/50'}`}>{lead.email || '-'}</span>
                </div>
                <div className="truncate text-[11px] font-bold">{lead.company || '-'}</div>
                <div className={`truncate text-[9px] font-bold uppercase tracking-widest ${selectedLead?.id === lead.id ? 'text-[#00ff41]/80' : 'text-black/50'}`}>
                  {lead.assignedUserId ? (memberMap[lead.assignedUserId] || 'ASSIGNED') : 'UNASSIGNED'}
                </div>
                <div>
                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest border ${statusColor(lead.status, selectedLead?.id === lead.id)}`}>
                    {statusLabel(lead.status)}
                  </span>
                </div>
                <div className="text-right text-[10px] font-mono">
                  {lead.callCount > 0 ? lead.callCount : '-'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Lead Panel */}
        {selectedLead && (
          <div className="w-[420px] flex flex-col bg-[#FAFAF7] shrink-0 overflow-hidden">
            {/* Context Header */}
            <div className="flex items-center justify-between p-3 border-b border-black bg-black text-[#00ff41]">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-bold uppercase tracking-widest text-xs truncate text-white">{selectedLead.name}</h2>
                {selectedLead.isLocked && <Lock size={12} />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {admin && (
                  <>
                    <button onClick={() => { setEditingLead(selectedLead); setEditForm({...selectedLead, assignedUserId: selectedLead.assignedUserId || ''}); }} className="hover:text-white transition-colors p-1.5"><Edit2 size={12}/></button>
                    <button onClick={() => deleteLead(selectedLead.id)} className="hover:text-red-500 transition-colors p-1.5"><Trash2 size={12}/></button>
                  </>
                )}
                <button onClick={() => setSelectedLead(null)} className="hover:text-white transition-colors p-1.5"><X size={14}/></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Phone</span>
                  <span className="text-[11px] font-mono font-bold mt-0.5">{selectedLead.phone || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Email</span>
                  <span className="text-[11px] font-bold mt-0.5">{selectedLead.email || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Company</span>
                  <span className="text-[11px] font-bold uppercase mt-0.5">{selectedLead.company || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Job Title</span>
                  <span className="text-[11px] font-bold uppercase mt-0.5">{selectedLead.jobTitle || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Source</span>
                  <span className="text-[11px] font-bold uppercase mt-0.5">{selectedLead.source || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40">Assigned To</span>
                  <span className="text-[11px] font-bold uppercase mt-0.5 text-black/80">{selectedLead.assignedUserId ? (memberMap[selectedLead.assignedUserId] || 'ASSIGNED') : 'UNASSIGNED'}</span>
                </div>
              </div>

              {/* Status Picker */}
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 block mb-2">Lead Status</span>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => updateStatus(selectedLead.id, s.value)}
                      className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest border transition-colors ${selectedLead.status === s.value ? 'bg-black text-[#00ff41] border-black' : 'border-black text-black bg-white hover:bg-black/5'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Extraction / Pablo Notes */}
              {selectedLead.pabloNotesJson && (
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/40 block mb-2">Extraction Notes</span>
                  <div className="bg-white border border-black p-3 text-[10px] font-mono leading-relaxed whitespace-pre-wrap">
                    {(() => { try { const notes = JSON.parse(selectedLead.pabloNotesJson); return Array.isArray(notes) ? notes.join('\n') : String(notes); } catch { return selectedLead.pabloNotesJson; } })()}
                  </div>
                </div>
              )}

              {/* Router Panel */}
              <div className="border-t border-black/10 pt-4">
                <CrmRoutingPanel
                  leadId={selectedLead.id}
                  leadName={selectedLead.name}
                  leadPhone={selectedLead.phone}
                  assignedUserId={selectedLead.assignedUserId}
                  canEdit={admin}
                  onUpdated={() => { void openDetail(selectedLead); }}
                />
              </div>

              {/* Notes */}
              <div className="border-t border-black/10 pt-4">
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/60 block mb-2">Manual Notes ({leadNotes.length})</span>
                <div className="flex gap-2 mb-4">
                  <input
                    value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
                    placeholder="ADD NOTE..."
                    className="flex-1 px-3 py-1.5 text-xs font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase bg-white"
                  />
                  <button onClick={addNote} disabled={!newNote.trim()} className="px-4 py-1.5 border border-black bg-black text-white font-bold hover:text-[#00ff41] disabled:opacity-50 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                {detailLoading ? (
                  <div className="flex justify-center p-4"><Loader2 size={16} className="animate-spin text-black/40" /></div>
                ) : (
                  <div className="space-y-3">
                    {leadNotes.map(n => (
                      <div key={n.id} className="bg-white border border-black/20 p-3 text-xs">
                        <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-black/5">
                          <span className="font-bold uppercase tracking-widest text-[9px]">{n.userName || 'UNKNOWN'}</span>
                          <span className="text-[9px] text-black/40 font-mono">{new Date(n.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="leading-relaxed text-[11px] font-mono">{n.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Calls */}
              {leadCalls.length > 0 && (
                <div className="border-t border-black/10 pt-4">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/60 block mb-2">Call Log ({leadCalls.length})</span>
                  <div className="space-y-3">
                    {leadCalls.map(c => (
                      <div key={c.id} className="bg-white border border-black/20 p-3 text-xs">
                        <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-black/5">
                          <span className="font-bold uppercase tracking-widest text-[9px]">{c.direction} · {c.callType}</span>
                          <span className="text-[9px] text-black/40 font-mono">{new Date(c.startedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-black/60 flex items-center gap-3 mb-1.5">
                          <span>Status: {c.status}</span>
                          <span>Dur: {c.durationSeconds}s</span>
                        </div>
                        {(c.summary || c.transcript) && (
                          <p className="leading-relaxed mt-1 text-[10px] font-mono text-black/80">{c.summary || c.transcript}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {leadActivities.length > 0 && (
                <div className="border-t border-black/10 pt-4">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-black/60 block mb-2">Raw Timeline ({leadActivities.length})</span>
                  <div className="space-y-2">
                    {leadActivities.map(a => (
                      <div key={a.id} className="bg-black/5 border border-black/10 p-2 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold uppercase tracking-widest text-[8px] text-black/50">{a.channel}</span>
                          <span className="text-[8px] text-black/40 font-mono">{new Date(a.occurredAt).toLocaleDateString()}</span>
                        </div>
                        <p className="leading-tight text-[10px] font-mono">{a.summary || a.body || 'No detail'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#FAFAF7] border border-black w-[400px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-black bg-black text-[#00ff41]">
              <h3 className="font-bold uppercase tracking-widest text-[10px]">Add New Lead</h3>
              <button onClick={() => setShowAddForm(false)} className="hover:text-white transition-colors p-1"><X size={14}/></button>
            </div>
            <div className="p-5 space-y-4 flex flex-col text-xs bg-white">
              <input placeholder="NAME (REQUIRED)" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
              <input placeholder="COMPANY" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={addForm.company} onChange={e => setAddForm({...addForm, company: e.target.value})} />
              <input placeholder="JOB TITLE" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={addForm.jobTitle} onChange={e => setAddForm({...addForm, jobTitle: e.target.value})} />
              <input placeholder="EMAIL" type="email" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} />
              <input placeholder="PHONE" type="tel" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})} />
            </div>
            <div className="p-3 border-t border-black bg-black/5 flex justify-end gap-3">
              <button onClick={() => setShowAddForm(false)} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest border border-black hover:bg-white transition-colors">Cancel</button>
              <button onClick={createLead} disabled={saving} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest border border-black bg-black text-[#00ff41] hover:text-white transition-colors disabled:opacity-50">Save Lead</button>
            </div>
          </div>
        </div>
      )}

      {editingLead && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#FAFAF7] border border-black w-[400px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-black bg-black text-[#00ff41]">
              <h3 className="font-bold uppercase tracking-widest text-[10px]">Edit Lead</h3>
              <button onClick={() => setEditingLead(null)} className="hover:text-white transition-colors p-1"><X size={14}/></button>
            </div>
            <div className="p-5 space-y-4 flex flex-col text-xs bg-white">
              <input placeholder="NAME" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
              <input placeholder="COMPANY" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={editForm.company} onChange={e => setEditForm({...editForm, company: e.target.value})} />
              <input placeholder="JOB TITLE" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={editForm.jobTitle} onChange={e => setEditForm({...editForm, jobTitle: e.target.value})} />
              <input placeholder="EMAIL" type="email" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
              <input placeholder="PHONE" type="tel" className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase placeholder:text-black/30" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              <select className="w-full px-3 py-2 font-bold border border-black focus:outline-none focus:ring-1 focus:ring-black uppercase bg-white cursor-pointer" value={editForm.assignedUserId} onChange={e => setEditForm({...editForm, assignedUserId: e.target.value})}>
                <option value="">UNASSIGNED</option>
                {Object.entries(memberMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="p-3 border-t border-black bg-black/5 flex justify-end gap-3">
              <button onClick={() => setEditingLead(null)} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest border border-black hover:bg-white transition-colors">Cancel</button>
              <button onClick={saveLead} disabled={saving} className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest border border-black bg-black text-[#00ff41] hover:text-white transition-colors disabled:opacity-50">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#FAFAF7] border border-black w-[400px] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-black bg-black text-[#00ff41]">
              <h3 className="font-bold uppercase tracking-widest text-[10px]">Import Data</h3>
              <button onClick={() => { setShowImport(false); setImportResult(null); }} className="hover:text-white transition-colors p-1"><X size={14}/></button>
            </div>
            <div className="p-6 space-y-5 flex flex-col text-xs text-center bg-white">
              <p className="text-black/50 uppercase font-bold text-[9px] tracking-widest">Select a CSV or XLSX file to import leads.</p>
              <label className="flex flex-col items-center justify-center gap-3 border border-black border-dashed bg-black/5 p-8 cursor-pointer hover:border-black hover:bg-black/10 transition-all">
                <Upload size={24} className="text-black/40" />
                <span className="font-bold uppercase text-[10px] tracking-widest">Choose File</span>
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleCSVUpload} disabled={importing} />
              </label>
              {importing && <div className="text-[10px] uppercase tracking-widest font-bold animate-pulse text-[#00ff41] bg-black p-3">Importing Data...</div>}
              {importResult && (
                <div className="text-left bg-[#FAFAF7] border border-black p-4 space-y-1.5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-black/50 border-b border-black/10 pb-1 mb-2">Import Result</div>
                  <div className="text-[#008f11] font-bold text-[10px] uppercase tracking-widest">Added/Updated: {importResult.success}</div>
                  {importResult.errors > 0 && <div className="text-red-600 font-bold text-[10px] uppercase tracking-widest">Errors: {importResult.errors}</div>}
                  {importResult.errorDetails.length > 0 && (
                    <div className="max-h-32 overflow-y-auto text-[10px] text-red-600 mt-2 bg-red-50 p-2 font-mono border border-red-200 leading-relaxed">
                      {importResult.errorDetails.map((err, i) => <div key={i}>{err}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
