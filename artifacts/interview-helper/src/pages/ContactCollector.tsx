import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Download, Trash2, Plus, X, Mail, Loader2, Check,
  Search, ChevronDown, ChevronUp, Edit2,
  Phone, TrendingUp, Building2, Clock, ArrowRight,
  StickyNote, PhoneCall, Send, CalendarPlus, Calendar,
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useAppMode } from '../hooks/use-app-mode';
import { SignInPage } from '@/components/SignInPrompt';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  age: string;
  ethnicity: string;
  hometown: string;
  timezone: string;
  kids: string;
  bio: string;
  tag: string;
  dealStage: string;
  dealValue: number | null;
  company: string;
  createdAt: string;
}

interface Interaction {
  id: number;
  contactId: number;
  type: string;
  note: string;
  createdAt: string;
}

type ViewMode = 'table' | 'pipeline';

const TAGS = ['Lead', 'Client', 'Vendor', 'Partner', 'Other'] as const;
const DEAL_STAGES = ['Prospect', 'Contacted', 'Proposal', 'Closed'] as const;

const TAG_COLORS: Record<string, string> = {
  Lead: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Client: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Vendor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Partner: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Other: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const STAGE_COLORS: Record<string, string> = {
  Prospect: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Contacted: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Proposal: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Closed: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

const STAGE_DROP_HIGHLIGHT: Record<string, string> = {
  Prospect: 'ring-2 ring-sky-500/50 bg-sky-500/5',
  Contacted: 'ring-2 ring-amber-500/50 bg-amber-500/5',
  Proposal: 'ring-2 ring-violet-500/50 bg-violet-500/5',
  Closed: 'ring-2 ring-sky-500/50 bg-sky-500/5',
};

const INTERACTION_TYPES = [
  { value: 'note', label: 'Note', icon: StickyNote },
  { value: 'call', label: 'Call', icon: PhoneCall },
  { value: 'email', label: 'Email', icon: Send },
  { value: 'meeting', label: 'Meeting', icon: Users },
];

const INTERACTION_ICONS: Record<string, React.ElementType> = {
  note: StickyNote,
  call: PhoneCall,
  email: Send,
  meeting: Users,
};

const EMPTY_FORM = {
  name: '', email: '', phone: '', address: '', age: '', ethnicity: '',
  hometown: '', timezone: '', kids: '', bio: '', tag: '', dealStage: '',
  dealValue: '', company: '',
};

function Field({ label, name, value, onChange, type = 'text', placeholder = '' }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );
}

export default function ContactCollector() {
  const { user, isAuthenticated } = useAuth();
  const { config } = useAppMode();
  usePlan();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Cutscene email pre-fill: ?compose=email&to=&subject=&body= opens the
  // composer with the supplied fields. Used by the cutscene "EMAIL …" buttons.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeStatus, setComposeStatus] = useState<null | { ok: boolean; msg: string }>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('compose') !== 'email') return;
    setComposeTo(params.get('to') || '');
    setComposeSubject(params.get('subject') || '');
    setComposeBody(params.get('body') || '');
    setComposeOpen(true);
    // Clean the URL so a refresh doesn't reopen the modal.
    const url = new URL(window.location.href);
    ['compose', 'to', 'subject', 'body'].forEach(k => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.toString());
  }, []);

  const sendComposed = useCallback(async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      setComposeStatus({ ok: false, msg: 'Need at least a recipient and subject.' });
      return;
    }
    setComposeSending(true);
    setComposeStatus(null);
    try {
      const html = composeBody
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      const r = await apiFetch('/api/tools/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: composeTo.trim(), subject: composeSubject.trim(), text: composeBody, html }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setComposeStatus({ ok: true, msg: 'Sent.' });
      setTimeout(() => { setComposeOpen(false); setComposeStatus(null); }, 900);
    } catch (e: any) {
      setComposeStatus({ ok: false, msg: e?.message || 'Send failed.' });
    } finally {
      setComposeSending(false);
    }
  }, [composeTo, composeSubject, composeBody]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'dealValue'>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [interactions, setInteractions] = useState<Record<number, Interaction[]>>({});
  const [interactionNote, setInteractionNote] = useState('');
  const [interactionType, setInteractionType] = useState('note');
  const [addingInteraction, setAddingInteraction] = useState(false);

  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Pipeline drag state
  const [dragContactId, setDragContactId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Follow-up scheduling
  const [followUpContact, setFollowUpContact] = useState<Contact | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpSaved, setFollowUpSaved] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await apiFetch('/api/tools/contacts');
      if (res.ok) { const data = await res.json(); setContacts(data.contacts ?? []); }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const loadInteractions = async (contactId: number) => {
    if (interactions[contactId]) return;
    try {
      const res = await apiFetch(`/api/tools/contacts/${contactId}/interactions`);
      if (res.ok) { const data = await res.json(); setInteractions(prev => ({ ...prev, [contactId]: data.interactions ?? [] })); }
    } catch {}
  };

  const handleExpand = (id: number) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) loadInteractions(next);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !isAuthenticated) return;
    const body = { ...form, dealValue: form.dealValue ? Number(form.dealValue) : null };
    if (editingId) {
      try {
        const res = await apiFetch(`/api/tools/contacts/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { const data = await res.json(); setContacts(prev => prev.map(c => c.id === editingId ? data.contact : c)); }
      } catch {}
    } else {
      try {
        const res = await apiFetch('/api/tools/contacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { const data = await res.json(); setContacts(prev => [data.contact, ...prev]); }
      } catch {}
    }
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (c: Contact) => {
    setForm({
      name: c.name, email: c.email, phone: c.phone, address: c.address, age: c.age,
      ethnicity: c.ethnicity, hometown: c.hometown, timezone: c.timezone, kids: c.kids,
      bio: c.bio, tag: c.tag, dealStage: c.dealStage, dealValue: c.dealValue?.toString() ?? '',
      company: c.company,
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await apiFetch(`/api/tools/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) setContacts(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const handleAddInteraction = async (contactId: number) => {
    if (!interactionNote.trim()) return;
    setAddingInteraction(true);
    try {
      const res = await apiFetch(`/api/tools/contacts/${contactId}/interactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: interactionType, note: interactionNote.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setInteractions(prev => ({ ...prev, [contactId]: [data.interaction, ...(prev[contactId] ?? [])] }));
        setInteractionNote('');
        setInteractionType('note');
      }
    } catch {}
    setAddingInteraction(false);
  };

  const handleDeleteInteraction = async (contactId: number, interactionId: number) => {
    try {
      const res = await apiFetch(`/api/tools/contacts/interactions/${interactionId}`, { method: 'DELETE' });
      if (res.ok) setInteractions(prev => ({ ...prev, [contactId]: (prev[contactId] ?? []).filter(i => i.id !== interactionId) }));
    } catch {}
  };

  const handleMoveDealStage = async (contactId: number, stage: string) => {
    try {
      const res = await apiFetch(`/api/tools/contacts/${contactId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealStage: stage }),
      });
      if (res.ok) { const data = await res.json(); setContacts(prev => prev.map(c => c.id === contactId ? data.contact : c)); }
    } catch {}
  };

  // Drag-and-drop handlers for pipeline
  const handleDragStart = (e: React.DragEvent, contactId: number) => {
    setDragContactId(contactId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(contactId));
  };

  const handleDragEnd = () => {
    setDragContactId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = dragContactId ?? Number(e.dataTransfer.getData('text/plain'));
    setDragContactId(null);
    setDragOverStage(null);
    if (!id) return;
    const contact = contacts.find(c => c.id === id);
    if (!contact || contact.dealStage === stage) return;
    await handleMoveDealStage(id, stage);
  };

  // Follow-up scheduling
  const openFollowUp = (contact: Contact) => {
    setFollowUpContact(contact);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFollowUpDate(tomorrow.toISOString().split('T')[0]);
    setFollowUpTime('10:00');
    setFollowUpNote(`Follow up with ${contact.name}`);
    setFollowUpSaved(false);
  };

  const handleScheduleFollowUp = async () => {
    if (!followUpContact || !followUpDate || followUpSaving) return;
    setFollowUpSaving(true);
    const startAt = new Date(`${followUpDate}T${followUpTime}:00`);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    const noteTitle = followUpNote || `Follow up with ${followUpContact.name}`;
    try {
      const [apptRes] = await Promise.all([
        apiFetch('/api/calendar/appointments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: noteTitle,
            description: `CRM follow-up: ${followUpContact.name}${followUpContact.company ? ` (${followUpContact.company})` : ''}`,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            reminderMinutes: 60,
          }),
        }),
      ]);
      if (apptRes.ok) {
        const logNote = `Scheduled follow-up: "${noteTitle}" on ${startAt.toLocaleDateString()} at ${startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        try {
          const iRes = await apiFetch(`/api/tools/contacts/${followUpContact.id}/interactions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'note', note: logNote }),
          });
          if (iRes.ok) {
            const data = await iRes.json();
            setInteractions(prev => ({
              ...prev,
              [followUpContact.id]: [data.interaction, ...(prev[followUpContact.id] ?? [])],
            }));
          }
        } catch {}
        setFollowUpSaved(true);
        setTimeout(() => {
          setFollowUpContact(null);
          setFollowUpSaved(false);
        }, 1500);
      }
    } catch {}
    setFollowUpSaving(false);
  };

  const handleExportCSV = () => {
    if (contacts.length === 0) return;
    const fields: (keyof Contact)[] = ['name', 'email', 'phone', 'company', 'tag', 'dealStage', 'dealValue', 'address', 'hometown', 'bio', 'createdAt'];
    const header = fields.join(',');
    const rows = filteredContacts.map(c => fields.map(f => `"${String(c[f] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contacts.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleEmailContacts = async () => {
    if (!user?.email || contacts.length === 0 || emailSending) return;
    setEmailSending(true);
    setEmailSent(false);
    const appName = config.emailSender;
    const html = `
      <h2>Your ${appName} Contacts</h2>
      <p>${contacts.length} contact${contacts.length !== 1 ? 's' : ''} exported on ${new Date().toLocaleDateString()}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
        <thead><tr style="background:#1a1a2e;color:white"><th>Name</th><th>Company</th><th>Email</th><th>Tag</th><th>Stage</th><th>Deal Value</th></tr></thead>
        <tbody>${contacts.map(c =>
          `<tr><td>${c.name}</td><td>${c.company}</td><td>${c.email}</td><td>${c.tag}</td><td>${c.dealStage}</td><td>${c.dealValue ? `$${c.dealValue.toLocaleString()}` : ''}</td></tr>`
        ).join('')}</tbody>
      </table>
    `;
    try {
      await apiFetch('/api/tools/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, subject: `Your ${appName} CRM — ${new Date().toLocaleDateString()}`, html }),
      });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    } catch {}
    setEmailSending(false);
  };

  const filteredContacts = contacts
    .filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase()) && !c.company.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTag && c.tag !== filterTag) return false;
      if (filterStage && c.dealStage !== filterStage) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'dealValue') cmp = (a.dealValue ?? 0) - (b.dealValue ?? 0);
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortAsc ? cmp : -cmp;
    });

  const f = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-accent/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        {/* Follow-up scheduling modal */}
        <AnimatePresence>
          {followUpContact && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setFollowUpContact(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CalendarPlus className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-foreground">Schedule Follow-up</h3>
                  </div>
                  <button onClick={() => setFollowUpContact(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">with <span className="text-foreground font-semibold">{followUpContact.name}</span>{followUpContact.company ? ` · ${followUpContact.company}` : ''}</p>

                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Note / Title</label>
                    <input value={followUpNote} onChange={e => setFollowUpNote(e.target.value)}
                      placeholder={`Follow up with ${followUpContact.name}`}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Date</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time</label>
                      <input type="time" value={followUpTime} onChange={e => setFollowUpTime(e.target.value)}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-5">
                  <button onClick={() => setFollowUpContact(null)}
                    className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                  <button onClick={handleScheduleFollowUp} disabled={!followUpDate || followUpSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${followUpSaved ? 'bg-sky-500/20 border border-sky-500/30 text-sky-300' : 'bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30'}`}>
                    {followUpSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : followUpSaved ? <Check className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    {followUpSaved ? 'Scheduled!' : 'Schedule'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cutscene-prefilled email composer */}
        <AnimatePresence>
          {composeOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
              onClick={() => !composeSending && setComposeOpen(false)}>
              <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold tracking-wide">COMPOSE EMAIL</h3>
                  </div>
                  <button onClick={() => !composeSending && setComposeOpen(false)}
                    className="p-1 rounded-lg hover:bg-muted/50 transition-colors" aria-label="Close">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">To</label>
                    <input type="email" value={composeTo} onChange={e => setComposeTo(e.target.value)}
                      placeholder="recipient@example.com" disabled={composeSending}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subject</label>
                    <input type="text" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                      placeholder="Subject line" disabled={composeSending}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Body</label>
                    <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                      rows={8} placeholder="Write your message…" disabled={composeSending}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors resize-y font-mono" />
                  </div>
                  {composeStatus && (
                    <div className={`text-xs ${composeStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {composeStatus.msg}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button onClick={() => setComposeOpen(false)} disabled={composeSending}
                      className="px-4 py-2 rounded-lg text-sm font-bold border border-border hover:bg-muted/50 transition-colors disabled:opacity-50">
                      CANCEL
                    </button>
                    <button onClick={sendComposed} disabled={composeSending || !composeTo.trim() || !composeSubject.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                      {composeSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {composeSending ? 'SENDING…' : 'SEND'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{boomerMode ? 'CRM' : 'Contact Collector'}</h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Manage contacts, deals, and your sales pipeline.' : 'Build your contact database. Track deals and interactions.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {contacts.length > 0 && (
              <>
                <button onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-semibold hover:bg-sky-500/25 transition-colors">
                  <Download className="w-4 h-4" /> CSV
                </button>
                {isAuthenticated && user?.email && (
                  <button onClick={handleEmailContacts} disabled={emailSending}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all
                      ${emailSent ? 'bg-sky-500/20 border border-sky-500/40 text-sky-300' : 'bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25'} disabled:opacity-60`}>
                    {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : emailSent ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {emailSent ? 'Sent!' : 'Email'}
                  </button>
                )}
              </>
            )}
            {isAuthenticated && (
              <button onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(v => !v); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors">
                <Plus className="w-4 h-4" /> {boomerMode ? 'New Contact' : 'Add Contact'}
              </button>
            )}
          </div>
        </div>

        {/* Add/Edit Contact Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-foreground">{editingId ? 'Edit Contact' : 'New Contact'}</h3>
                <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Full Name *" name="name" value={form.name} onChange={f('name')} placeholder="Jane Smith" />
                <Field label="Company" name="company" value={form.company} onChange={f('company')} placeholder="Acme Corp" />
                <Field label="Email" name="email" value={form.email} onChange={f('email')} type="email" placeholder="jane@example.com" />
                <Field label="Phone" name="phone" value={form.phone} onChange={f('phone')} placeholder="+1 (555) 000-0000" />

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{boomerMode ? 'Category' : 'Tag'}</label>
                  <select value={form.tag} onChange={e => f('tag')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    <option value="">No tag</option>
                    {TAGS.map(t => <option key={t} value={t} className="bg-card">{t}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{boomerMode ? 'Pipeline Stage' : 'Deal Stage'}</label>
                  <select value={form.dealStage} onChange={e => f('dealStage')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    <option value="">No stage</option>
                    {DEAL_STAGES.map(s => <option key={s} value={s} className="bg-card">{s}</option>)}
                  </select>
                </div>

                <Field label="Deal Value ($)" name="dealValue" value={form.dealValue} onChange={f('dealValue')} type="number" placeholder="5000" />
                <Field label="Hometown" name="hometown" value={form.hometown} onChange={f('hometown')} placeholder="Chicago, IL" />
              </div>

              <div className="flex flex-col gap-1 mb-5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bio / Notes</label>
                <textarea value={form.bio} onChange={e => f('bio')(e.target.value)}
                  placeholder="Quick note about this person — how you met, what they're working on..."
                  rows={2}
                  className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={!form.name.trim()}
                  className="px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {editingId ? 'Save Changes' : 'Save Contact'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Not logged in / loading */}
        {!isAuthenticated && !loading && (
          <SignInPage context="Sign in to manage your contacts." />
        )}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && isAuthenticated && (
          <>
            {/* View toggles + filters */}
            {contacts.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-1 bg-muted/20 rounded-xl p-1 border border-border">
                  <button onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'table' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <Users className="w-3.5 h-3.5" /> {boomerMode ? 'Contacts' : 'Table'}
                  </button>
                  <button onClick={() => setViewMode('pipeline')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'pipeline' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    <TrendingUp className="w-3.5 h-3.5" /> {boomerMode ? 'Pipeline' : 'Deals'}
                  </button>
                </div>

                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
                    className="w-full pl-8 pr-3 py-2 bg-muted/30 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                </div>

                <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
                  className="bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                  <option value="">All {boomerMode ? 'categories' : 'tags'}</option>
                  {TAGS.map(t => <option key={t} value={t} className="bg-card">{t}</option>)}
                </select>

                {viewMode === 'table' && (
                  <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                    className="bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    <option value="">All stages</option>
                    {DEAL_STAGES.map(s => <option key={s} value={s} className="bg-card">{s}</option>)}
                  </select>
                )}

                <span className="text-xs text-muted-foreground ml-auto">{filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            {contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <Users className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No contacts yet — add your first one above</p>
              </div>
            ) : viewMode === 'pipeline' ? (
              /* ─── Pipeline Board with Drag & Drop ─── */
              <div>
                <p className="text-xs text-muted-foreground mb-3">Drag contacts between stages to move them through your pipeline</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {DEAL_STAGES.map(stage => {
                    const stageContacts = filteredContacts.filter(c => c.dealStage === stage);
                    const isDragTarget = dragOverStage === stage;
                    return (
                      <div key={stage}
                        className={`bg-card border border-border rounded-2xl p-3 transition-all ${isDragTarget ? STAGE_DROP_HIGHLIGHT[stage] : ''}`}
                        onDragOver={e => handleDragOver(e, stage)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, stage)}>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded border ${STAGE_COLORS[stage]} uppercase font-bold`}>{stage}</span>
                          <span className="text-[10px] text-muted-foreground">{stageContacts.length}</span>
                        </div>
                        <div className="space-y-2 min-h-[60px]">
                          {stageContacts.map(c => (
                            <div key={c.id}
                              draggable
                              onDragStart={e => handleDragStart(e, c.id)}
                              onDragEnd={handleDragEnd}
                              className={`bg-muted/20 border border-border/50 rounded-xl p-2.5 cursor-grab active:cursor-grabbing transition-opacity ${dragContactId === c.id ? 'opacity-40' : ''}`}>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-semibold text-foreground truncate flex-1">{c.name}</p>
                                <div className="flex items-center gap-0.5 ml-1">
                                  <button onClick={() => openFollowUp(c)} className="p-0.5 text-muted-foreground/40 hover:text-primary transition-colors">
                                    <CalendarPlus className="w-2.5 h-2.5" />
                                  </button>
                                  <button onClick={() => handleEdit(c)} className="p-0.5 text-muted-foreground/40 hover:text-primary transition-colors">
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                              {c.company && <p className="text-[10px] text-muted-foreground mb-1 truncate">{c.company}</p>}
                              {c.dealValue && <p className="text-[10px] text-sky-400 font-semibold mb-1">${c.dealValue.toLocaleString()}</p>}
                              {c.tag && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${TAG_COLORS[c.tag] ?? TAG_COLORS.Other} font-bold uppercase`}>{c.tag}</span>
                              )}
                            </div>
                          ))}
                          {isDragTarget && dragContactId && !stageContacts.some(c => c.id === dragContactId) && (
                            <div className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-2.5 text-center">
                              <p className="text-[10px] text-muted-foreground/40">Drop here</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ─── Table / List View ─── */
              <div>
                <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-2 mb-1 border-b border-border/50">
                  {[
                    { key: 'name' as const, label: 'Name' },
                    { key: 'createdAt' as const, label: 'Company / Added' },
                  ].map(col => (
                    <button key={col.key} onClick={() => { if (sortBy === col.key) setSortAsc(v => !v); else { setSortBy(col.key); setSortAsc(true); } }}
                      className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors text-left">
                      {col.label}
                      {sortBy === col.key ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                    </button>
                  ))}
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{boomerMode ? 'Category' : 'Tag'}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{boomerMode ? 'Stage' : 'Deal Stage'}</span>
                  <span></span>
                </div>

                <div className="space-y-1.5">
                  {filteredContacts.map(contact => (
                    <motion.div key={contact.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-4 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors items-center"
                        onClick={() => handleExpand(contact.id)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{contact.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{contact.email || contact.phone || '—'}</p>
                          </div>
                        </div>
                        <div className="min-w-0">
                          {contact.company && <p className="text-sm text-muted-foreground truncate flex items-center gap-1"><Building2 className="w-3 h-3 flex-shrink-0" />{contact.company}</p>}
                          <p className="text-[10px] text-muted-foreground/40 flex items-center gap-1 mt-0.5"><Clock className="w-2.5 h-2.5" />{new Date(contact.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div>
                          {contact.tag ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[contact.tag] ?? TAG_COLORS.Other} font-bold uppercase`}>{contact.tag}</span>
                          ) : <span className="text-[10px] text-muted-foreground/30">—</span>}
                        </div>
                        <div>
                          {contact.dealStage ? (
                            <div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STAGE_COLORS[contact.dealStage] ?? ''} font-bold uppercase`}>{contact.dealStage}</span>
                              {contact.dealValue && <p className="text-[10px] text-sky-400 mt-0.5">${contact.dealValue.toLocaleString()}</p>}
                            </div>
                          ) : <span className="text-[10px] text-muted-foreground/30">—</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); openFollowUp(contact); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Schedule follow-up">
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleEdit(contact); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(contact.id); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {expandedId === contact.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      <div className="sm:hidden px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => handleExpand(contact.id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-sm text-foreground truncate">{contact.name}</p>
                              {expandedId === contact.id ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{contact.email || contact.phone || '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {contact.company && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Building2 className="w-2.5 h-2.5" />{contact.company}</span>}
                          {contact.tag && <span className={`text-[9px] px-1.5 py-0.5 rounded border ${TAG_COLORS[contact.tag] ?? TAG_COLORS.Other} font-bold uppercase`}>{contact.tag}</span>}
                          {contact.dealStage && <span className={`text-[9px] px-1.5 py-0.5 rounded border ${STAGE_COLORS[contact.dealStage] ?? ''} font-bold uppercase`}>{contact.dealStage}</span>}
                          {contact.dealValue && <span className="text-[10px] text-sky-400 font-semibold">${contact.dealValue.toLocaleString()}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <button onClick={e => { e.stopPropagation(); openFollowUp(contact); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Schedule follow-up">
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 transition-colors">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleEdit(contact); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(contact.id); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded: interaction history */}
                      <AnimatePresence>
                        {expandedId === contact.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border overflow-hidden">
                            <div className="px-5 pt-4 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                              {/* Details */}
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Details</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                  {[
                                    ['Phone', contact.phone], ['Address', contact.address], ['Hometown', contact.hometown],
                                    ['Timezone', contact.timezone],
                                  ].filter(([, v]) => v).map(([label, value]) => (
                                    <div key={label as string}>
                                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                                      <p className="text-xs text-foreground mt-0.5">{value}</p>
                                    </div>
                                  ))}
                                </div>
                                {contact.bio && (
                                  <div className="mt-3">
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bio</span>
                                    <p className="text-xs text-foreground mt-0.5">{contact.bio}</p>
                                  </div>
                                )}
                                {/* Quick stage move */}
                                {contact.dealStage && (
                                  <div className="mt-3">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Move to stage</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {DEAL_STAGES.filter(s => s !== contact.dealStage).map(s => (
                                        <button key={s} onClick={() => handleMoveDealStage(contact.id, s)}
                                          className={`text-[10px] px-2 py-0.5 rounded border ${STAGE_COLORS[s]} hover:opacity-80 transition-opacity flex items-center gap-0.5`}>
                                          <ArrowRight className="w-2.5 h-2.5" /> {s}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Schedule follow-up */}
                                <div className="mt-3">
                                  <button onClick={() => openFollowUp(contact)}
                                    className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors font-semibold">
                                    <CalendarPlus className="w-3 h-3" /> Schedule Follow-up
                                  </button>
                                </div>
                              </div>

                              {/* Interaction history */}
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                                  {boomerMode ? 'Interaction History' : 'Timeline'}
                                </p>

                                {/* Add interaction */}
                                <div className="mb-3 bg-muted/20 border border-border/50 rounded-xl p-3">
                                  <div className="flex gap-2 mb-2">
                                    {INTERACTION_TYPES.map(({ value, label }) => (
                                      <button key={value} onClick={() => setInteractionType(value)}
                                        className={`text-[10px] px-2 py-1 rounded-lg border font-semibold transition-colors ${interactionType === value ? 'bg-primary/20 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      value={interactionNote}
                                      onChange={e => setInteractionNote(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddInteraction(contact.id); }}
                                      placeholder={`Log a ${interactionType}...`}
                                      className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
                                    />
                                    <button onClick={() => handleAddInteraction(contact.id)} disabled={addingInteraction || !interactionNote.trim()}
                                      className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                                      {addingInteraction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>

                                {/* Interaction list */}
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {(interactions[contact.id] ?? []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground/40 text-center py-3">No interactions yet</p>
                                  ) : (interactions[contact.id] ?? []).map(i => {
                                    const Icon: React.ComponentType<{ className?: string }> = (INTERACTION_ICONS[i.type] ?? StickyNote) as React.ComponentType<{ className?: string }>;
                                    return (
                                      <div key={i.id} className="flex items-start gap-2 group">
                                        <div className="w-6 h-6 rounded-lg bg-muted/40 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                                          <Icon className="w-3 h-3 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs text-foreground">{i.note}</p>
                                          <p className="text-[10px] text-muted-foreground/40 mt-0.5">{new Date(i.createdAt).toLocaleString()}</p>
                                        </div>
                                        <button onClick={() => handleDeleteInteraction(contact.id, i.id)}
                                          className="p-0.5 rounded text-muted-foreground/20 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
