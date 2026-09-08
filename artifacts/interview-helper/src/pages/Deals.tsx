import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Plus, X, Trash2, Edit2, Loader2, ChevronRight,
  Users, DollarSign, Calendar, ArrowRight, Check,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';

interface Contact {
  id: number;
  name: string;
  company: string;
}

interface Deal {
  id: number;
  title: string;
  stage: string;
  value: number | null;
  contactId: number | null;
  contactName: string | null;
  expectedCloseDate: string | null;
  notes: string;
  createdAt: string;
}

const STAGES = ['Lead', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, string> = {
  Lead: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Proposal: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Negotiation: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Won: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Lost: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const EMPTY_FORM = {
  title: '', stage: 'Lead', value: '', contactId: '', expectedCloseDate: '', notes: '',
};

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );
}

export default function Deals() {
  const { isAuthenticated } = useAuth();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const loadDeals = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const [dealsRes, contactsRes] = await Promise.all([
        apiFetch('/api/tools/deals'),
        apiFetch('/api/tools/contacts'),
      ]);
      if (dealsRes.ok) { const d = await dealsRes.json(); setDeals(d.deals ?? []); }
      if (contactsRes.ok) { const d = await contactsRes.json(); setContacts(d.contacts ?? []); }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to manage your deals.' : 'Salaryman credentials required. DEAL PIPELINE access locked.'} />;
  }

  const handleSave = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        stage: form.stage,
        value: form.value ? Number(form.value) : null,
        contactId: form.contactId ? Number(form.contactId) : null,
        expectedCloseDate: form.expectedCloseDate || null,
        notes: form.notes,
      };
      const url = editingId ? `/api/tools/deals/${editingId}` : '/api/tools/deals';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        if (editingId) {
          setDeals(prev => prev.map(d => d.id === editingId ? data.deal : d));
        } else {
          setDeals(prev => [data.deal, ...prev]);
        }
        setForm({ ...EMPTY_FORM });
        setShowForm(false);
        setEditingId(null);
      }
    } catch {}
    setSaving(false);
  };

  const handleEdit = (deal: Deal) => {
    setForm({
      title: deal.title,
      stage: deal.stage,
      value: deal.value?.toString() ?? '',
      contactId: deal.contactId?.toString() ?? '',
      expectedCloseDate: deal.expectedCloseDate ?? '',
      notes: deal.notes,
    });
    setEditingId(deal.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await apiFetch(`/api/tools/deals/${id}`, { method: 'DELETE' });
      if (res.ok) setDeals(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  const handleMoveStage = async (deal: Deal, newStage: string) => {
    try {
      const res = await apiFetch(`/api/tools/deals/${deal.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) { const data = await res.json(); setDeals(prev => prev.map(d => d.id === deal.id ? data.deal : d)); }
    } catch {}
  };

  const f = (k: keyof typeof EMPTY_FORM) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const totalValue = deals.filter(d => d.stage === 'Won').reduce((s, d) => s + (d.value ?? 0), 0);
  const pipelineValue = deals.filter(d => !['Won', 'Lost'].includes(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Deals' : 'PIPELINE-X'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Track deals and opportunities through your pipeline.' : 'Deal flow interception module. Lead → Proposal → Negotiation → Won/Lost.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/20 rounded-xl p-1 border border-border">
              {(['kanban', 'list'] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors uppercase tracking-wide ${viewMode === v ? 'bg-card text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
                  {v}
                </button>
              ))}
            </div>
            {isAuthenticated && (
              <button
                onClick={() => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(v => !v); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
              >
                <Plus className="w-4 h-4" /> New Deal
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Deals', value: deals.length, color: 'text-zinc-300' },
            { label: 'Pipeline Value', value: `$${pipelineValue.toLocaleString()}`, color: 'text-amber-400' },
            { label: 'Won Value', value: `$${totalValue.toLocaleString()}`, color: 'text-sky-400' },
            { label: 'Active Deals', value: deals.filter(d => !['Won', 'Lost'].includes(d.stage)).length, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-foreground">{editingId ? 'Edit Deal' : 'New Deal'}</h3>
                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Deal Title *" value={form.title} onChange={f('title')} placeholder="e.g. Acme Corp Enterprise License" />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stage</label>
                  <select value={form.stage} onChange={e => f('stage')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    {STAGES.map(s => <option key={s} value={s} className="bg-card">{s}</option>)}
                  </select>
                </div>
                <Field label="Deal Value ($)" value={form.value} onChange={f('value')} type="number" placeholder="10000" />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Linked Contact</label>
                  <select value={form.contactId} onChange={e => f('contactId')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    <option value="" className="bg-card">— None —</option>
                    {contacts.map(c => <option key={c.id} value={c.id} className="bg-card">{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                  </select>
                </div>
                <Field label="Expected Close Date" value={form.expectedCloseDate} onChange={f('expectedCloseDate')} type="date" />
              </div>
              <div className="flex flex-col gap-1 mb-5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea value={form.notes} onChange={e => f('notes')(e.target.value)} rows={2} placeholder="Notes about this deal..."
                  className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={!form.title.trim() || saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingId ? 'Update Deal' : 'Create Deal'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isAuthenticated && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">Sign in to track your deals</p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {!loading && isAuthenticated && viewMode === 'kanban' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {STAGES.map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage);
              return (
                <div key={stage} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${STAGE_COLORS[stage as Stage]}`}>
                      {stage}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">{stageDeals.length}</span>
                  </div>
                  {stageDeals.map(deal => (
                    <motion.div key={deal.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-all group">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{deal.title}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleEdit(deal)} className="p-1 text-muted-foreground hover:text-foreground rounded">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(deal.id)} className="p-1 text-muted-foreground hover:text-red-400 rounded">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {deal.value && (
                        <p className="text-xs font-mono text-sky-400 mb-1">${deal.value.toLocaleString()}</p>
                      )}
                      {deal.contactName && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" /> {deal.contactName}
                        </p>
                      )}
                      {deal.expectedCloseDate && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="w-2.5 h-2.5" /> {deal.expectedCloseDate}
                        </p>
                      )}
                      {/* Stage advance buttons */}
                      <div className="flex gap-1 mt-2 pt-2 border-t border-border">
                        {STAGES.filter(s => s !== stage).slice(0, 2).map(s => (
                          <button key={s} onClick={() => handleMoveStage(deal, s)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                            <ArrowRight className="w-2.5 h-2.5" /> {s}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="border border-dashed border-border rounded-xl p-4 text-center">
                      <p className="text-[10px] text-muted-foreground/40 font-mono">Empty</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && isAuthenticated && viewMode === 'list' && (
          <div className="space-y-2">
            {deals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No deals yet — create your first one above</p>
              </div>
            ) : deals.map(deal => (
              <motion.div key={deal.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-primary/30 transition-all group">
                <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{deal.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {deal.contactName && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Users className="w-2.5 h-2.5" /> {deal.contactName}
                      </span>
                    )}
                    {deal.expectedCloseDate && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" /> {deal.expectedCloseDate}
                      </span>
                    )}
                  </div>
                </div>
                {deal.value && (
                  <p className="font-mono text-sm text-sky-400 shrink-0">${deal.value.toLocaleString()}</p>
                )}
                <span className={`text-[10px] font-mono tracking-widest uppercase px-2 py-0.5 rounded-full border shrink-0 ${STAGE_COLORS[deal.stage as Stage] ?? ''}`}>
                  {deal.stage}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(deal)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(deal.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
