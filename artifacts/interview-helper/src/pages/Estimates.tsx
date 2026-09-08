import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, X, Trash2, Loader2, Edit2, Send,
  Check, DollarSign, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface LineItem { description: string; quantity: number; unitPrice: number; }
interface Estimate {
  id: number;
  clientName: string;
  clientEmail: string;
  estimateNumber: string;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  subtotal: string;
  taxRate: string;
  total: string;
  notes: string;
  lineItems: string;
  createdAt: string;
}

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500/15 text-zinc-400', sent: 'bg-sky-500/15 text-sky-400',
  accepted: 'bg-emerald-500/15 text-emerald-400', declined: 'bg-red-500/15 text-red-400',
  expired: 'bg-amber-500/15 text-amber-400',
};

function fmt$(v: number | string) {
  const n = Number(v);
  return isFinite(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
}

const EMPTY_LINE: LineItem = { description: '', quantity: 1, unitPrice: 0 };
const EMPTY_FORM = { clientName: '', clientEmail: '', estimateNumber: '', status: 'draft', issueDate: new Date().toISOString().slice(0, 10), expiryDate: '', notes: '', taxRate: '0' };

export default function Estimates() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Estimate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/business/estimates');
      if (r.ok) { const d = await r.json(); setEstimates(d.estimates); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const tax = subtotal * Number(form.taxRate) / 100;
  const total = subtotal + tax;

  const openForm = (item?: Estimate) => {
    if (item) {
      setEditItem(item);
      setForm({ clientName: item.clientName, clientEmail: item.clientEmail, estimateNumber: item.estimateNumber, status: item.status, issueDate: item.issueDate, expiryDate: item.expiryDate || '', notes: item.notes, taxRate: item.taxRate });
      try { setLines(JSON.parse(item.lineItems)); } catch { setLines([{ ...EMPTY_LINE }]); }
    } else {
      setEditItem(null);
      setForm({ ...EMPTY_FORM, estimateNumber: `EST-${Date.now().toString(36).toUpperCase().slice(-6)}` });
      setLines([{ ...EMPTY_LINE }]);
    }
    setShowForm(true);
  };

  const save = async () => {
    if (!form.clientName.trim()) return;
    setSaving(true);
    try {
      const url = editItem ? `/api/business/estimates/${editItem.id}` : '/api/business/estimates';
      const method = editItem ? 'PUT' : 'POST';
      const r = await apiFetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, subtotal: subtotal.toFixed(2), total: total.toFixed(2), lineItems: JSON.stringify(lines) }),
      });
      if (r.ok) { setShowForm(false); fetchData(); }
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Delete this estimate?')) return;
    await apiFetch(`/api/business/estimates/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const updateLine = (i: number, key: keyof LineItem, val: string | number) => {
    setLines(ls => ls.map((l, j) => j === i ? { ...l, [key]: val } : l));
  };

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage estimates." />;

  const totalAll = estimates.reduce((s, e) => s + Number(e.total), 0);
  const pendingCount = estimates.filter(e => e.status === 'sent').length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-teal-400" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground">
                {boomerMode ? 'Estimates & Quotes' : 'QUOTIENT — ESTIMATES'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Create quotes for clients before invoicing.' : 'PRE-INVOICE QUOTES — LINE ITEMS, TAX, CLIENT PROPOSALS.'}
            </p>
          </div>
          <button onClick={() => openForm()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold hover:bg-primary/20 transition-colors shrink-0">
            <Plus className="w-4 h-4" /> NEW ESTIMATE
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL QUOTED</div>
            <div className="text-2xl font-bold text-teal-400">{fmt$(totalAll)}</div>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">PENDING</div>
            <div className="text-2xl font-bold text-sky-400">{pendingCount}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">TOTAL ESTIMATES</div>
            <div className="text-2xl font-bold text-emerald-400">{estimates.length}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>
        ) : estimates.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-white/[0.015] p-12 text-center">
            <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">{boomerMode ? 'No estimates yet.' : 'NO QUOTES IN SYSTEM.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {estimates.map(e => {
              const isExp = expanded === e.id;
              let items: LineItem[] = [];
              try { items = JSON.parse(e.lineItems); } catch {}
              return (
                <div key={e.id} className="rounded-xl border border-zinc-800 bg-white/[0.015] overflow-hidden">
                  <button onClick={() => setExpanded(isExp ? null : e.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-foreground">{e.clientName}</span>
                        <span className="text-[10px] font-mono text-zinc-600">{e.estimateNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${STATUS_COLORS[e.status]}`}>{e.status.toUpperCase()}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Issued {e.issueDate}{e.expiryDate ? ` · Expires ${e.expiryDate}` : ''}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-teal-400">{fmt$(e.total)}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={ev => { ev.stopPropagation(); openForm(e); }} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-teal-400 transition-colors"><Edit2 className="w-3 h-3" /></button>
                      <button onClick={ev => { ev.stopPropagation(); del(e.id); }} className="w-7 h-7 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    {isExp ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </button>
                  {isExp && (
                    <div className="px-5 pb-4 border-t border-zinc-800/50 pt-4">
                      {items.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 overflow-x-auto mb-3">
                          <div className="min-w-[360px]">
                            <div className="grid grid-cols-[1fr_60px_80px_80px] sm:grid-cols-[1fr_80px_100px_100px] gap-0 bg-zinc-900/50 px-3 py-1.5 border-b border-zinc-800">
                              <span className="text-[9px] font-mono text-zinc-500">DESCRIPTION</span>
                              <span className="text-[9px] font-mono text-zinc-500 text-right">QTY</span>
                              <span className="text-[9px] font-mono text-zinc-500 text-right">UNIT PRICE</span>
                              <span className="text-[9px] font-mono text-zinc-500 text-right">TOTAL</span>
                            </div>
                            {items.map((l, i) => (
                              <div key={i} className="grid grid-cols-[1fr_60px_80px_80px] sm:grid-cols-[1fr_80px_100px_100px] gap-0 px-3 py-2 border-b border-zinc-800/30">
                                <span className="text-xs text-foreground truncate">{l.description || '—'}</span>
                                <span className="text-xs text-zinc-400 text-right">{l.quantity}</span>
                                <span className="text-xs text-zinc-400 text-right font-mono">{fmt$(l.unitPrice)}</span>
                                <span className="text-xs text-teal-400 text-right font-mono">{fmt$(l.quantity * l.unitPrice)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <div className="space-y-1 text-right">
                          <div className="text-[10px] text-zinc-500">Subtotal: {fmt$(e.subtotal)}</div>
                          {Number(e.taxRate) > 0 && <div className="text-[10px] text-zinc-500">Tax ({e.taxRate}%): {fmt$(Number(e.subtotal) * Number(e.taxRate) / 100)}</div>}
                          <div className="text-sm font-bold text-teal-400">Total: {fmt$(e.total)}</div>
                        </div>
                      </div>
                      {e.notes && <p className="text-[10px] text-zinc-500 mt-2 pt-2 border-t border-zinc-800/50">{e.notes}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground">{editItem ? 'EDIT ESTIMATE' : 'NEW ESTIMATE'}</h3>
                  <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CLIENT NAME</label>
                      <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Client name"
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CLIENT EMAIL</label>
                      <input value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} placeholder="email@client.com"
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ESTIMATE #</label>
                      <input value={form.estimateNumber} onChange={e => setForm(f => ({ ...f, estimateNumber: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ISSUE DATE</label>
                      <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">EXPIRY DATE</label>
                      <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">LINE ITEMS</label>
                    <div className="space-y-2 mt-1">
                      {lines.map((l, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Description"
                            className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors" />
                          <input type="number" value={l.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} placeholder="Qty"
                            className="w-16 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 transition-colors text-center" />
                          <input type="number" value={l.unitPrice} onChange={e => updateLine(i, 'unitPrice', Number(e.target.value))} placeholder="Price"
                            className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 transition-colors text-right" />
                          <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])} className="text-[10px] text-primary hover:text-primary/80 font-bold">+ ADD LINE</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">TAX RATE (%)</label>
                      <input type="number" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">STATUS</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                        className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                        {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="bg-teal-500/[0.05] border border-teal-500/20 rounded-lg p-3 text-right">
                    <div className="text-[10px] text-zinc-500">Subtotal: {fmt$(subtotal)}</div>
                    {Number(form.taxRate) > 0 && <div className="text-[10px] text-zinc-500">Tax: {fmt$(tax)}</div>}
                    <div className="text-lg font-bold text-teal-400">{fmt$(total)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">NOTES</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Terms, conditions, etc."
                      className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">CANCEL</button>
                  <button onClick={save} disabled={saving || !form.clientName.trim()}
                    className="px-5 py-2 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editItem ? 'UPDATE' : 'CREATE'}
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
