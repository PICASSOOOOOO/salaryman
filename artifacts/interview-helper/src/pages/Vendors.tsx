import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Plus, X, Trash2, Loader2, Edit2, Search,
  Mail, Phone, Globe, Building2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface Vendor {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  category: string;
  website: string;
  taxId: string;
  paymentTerms: string;
  notes: string;
  status: string;
  createdAt: string;
}

const CATEGORIES = ['general', 'technology', 'supplies', 'services', 'marketing', 'logistics', 'consulting', 'legal', 'insurance', 'other'] as const;
const PAYMENT_TERMS = ['net-15', 'net-30', 'net-45', 'net-60', 'net-90', 'due-on-receipt', 'prepaid'] as const;
const CAT_COLORS: Record<string, string> = {
  general: 'text-zinc-400', technology: 'text-sky-400', supplies: 'text-amber-400',
  services: 'text-violet-400', marketing: 'text-pink-400', logistics: 'text-orange-400',
  consulting: 'text-teal-400', legal: 'text-indigo-400', insurance: 'text-emerald-400', other: 'text-zinc-500',
};

const EMPTY = { name: '', contactName: '', email: '', phone: '', address: '', category: 'general', website: '', taxId: '', paymentTerms: 'net-30', notes: '' };

export default function Vendors() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/business/vendors');
      if (r.ok) { const d = await r.json(); setVendors(d.vendors); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openForm = (item?: Vendor) => {
    if (item) {
      setEditItem(item);
      setForm({ name: item.name, contactName: item.contactName, email: item.email, phone: item.phone, address: item.address, category: item.category, website: item.website, taxId: item.taxId, paymentTerms: item.paymentTerms, notes: item.notes });
    } else {
      setEditItem(null);
      setForm(EMPTY);
    }
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/business/vendors/${editItem.id}` : '/api/business/vendors';
      const method = editItem ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchData(); }
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Delete this vendor?')) return;
    await apiFetch(`/api/business/vendors/${id}`, { method: 'DELETE' });
    fetchData();
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage vendors." />;

  const filtered = vendors.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.name.toLowerCase().includes(q) || v.contactName.toLowerCase().includes(q) || v.category.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-orange-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Vendor Directory' : 'VENDOR REGISTRY — SUPPLY CHAIN'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Manage vendor contacts, terms, and categories.' : 'VENDOR RELATIONSHIPS, PAYMENT TERMS, CONTACT DIRECTORY.'}
            </p>
          </div>
          <button onClick={() => openForm()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold hover:bg-primary/20 transition-colors shrink-0">
            <Plus className="w-4 h-4" /> ADD VENDOR
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors..."
              className="w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
          </div>
          <span className="text-[10px] font-mono text-zinc-600 shrink-0">{filtered.length} VENDOR{filtered.length !== 1 ? 'S' : ''}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
            <Store className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{vendors.length === 0 ? (boomerMode ? 'No vendors yet.' : 'NO VENDORS REGISTERED.') : 'No vendors match your search.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(v => (
              <div key={v.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] p-4 hover:border-orange-500/20 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold text-foreground">{v.name}</div>
                    {v.contactName && <div className="text-xs text-zinc-400">{v.contactName}</div>}
                  </div>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openForm(v)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-orange-400 transition-colors"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => del(v.id)} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {v.email && <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Mail className="w-3 h-3" />{v.email}</div>}
                  {v.phone && <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Phone className="w-3 h-3" />{v.phone}</div>}
                  {v.website && <div className="flex items-center gap-2 text-[10px] text-zinc-500"><Globe className="w-3 h-3" />{v.website}</div>}
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/50 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold bg-zinc-800/50 ${CAT_COLORS[v.category] || 'text-zinc-400'}`}>{v.category.toUpperCase()}</span>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-zinc-800/50 text-zinc-400">{v.paymentTerms.toUpperCase()}</span>
                  {v.status !== 'active' && <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-red-500/15 text-red-400">{v.status.toUpperCase()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">{editItem ? 'EDIT VENDOR' : 'ADD VENDOR'}</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'COMPANY NAME', key: 'name' as const, placeholder: 'Vendor company name' },
                    { label: 'CONTACT PERSON', key: 'contactName' as const, placeholder: 'Primary contact' },
                  ].map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(fo => ({ ...fo, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'EMAIL', key: 'email' as const, placeholder: 'vendor@email.com' },
                      { label: 'PHONE', key: 'phone' as const, placeholder: '+1 555-0100' },
                    ].map(f => (
                      <div key={f.key} className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{f.label}</label>
                        <input value={form[f.key]} onChange={e => setForm(fo => ({ ...fo, [f.key]: e.target.value }))} placeholder={f.placeholder}
                          className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CATEGORY</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">PAYMENT TERMS</label>
                      <select value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        {PAYMENT_TERMS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>
                  {[
                    { label: 'WEBSITE', key: 'website' as const, placeholder: 'https://vendor.com' },
                    { label: 'TAX ID / EIN', key: 'taxId' as const, placeholder: 'XX-XXXXXXX' },
                  ].map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm(fo => ({ ...fo, [f.key]: e.target.value }))} placeholder={f.placeholder}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ADDRESS</label>
                    <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} placeholder="Full address"
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">NOTES</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                  <button onClick={save} disabled={saving || !form.name.trim()}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editItem ? 'UPDATE' : 'ADD'}
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
