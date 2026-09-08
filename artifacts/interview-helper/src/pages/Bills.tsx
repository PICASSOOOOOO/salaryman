import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt, Plus, X, Trash2, Loader2, Check, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface Bill {
  id: number;
  vendor: string;
  description: string;
  amount: string;
  dueDate: string;
  category: string;
  recurrence: string;
  status: string;
  proofPath: string | null;
  paidAt: string | null;
  createdAt: string;
}

const BILL_CATEGORIES = ['rent', 'utilities', 'subscriptions', 'insurance', 'vendor', 'marketing', 'equipment', 'legal', 'tax', 'payable', 'other'];
const BILL_RECURRENCES = ['one-time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'];
const BILL_STATUSES = ['pending', 'paid', 'overdue'];

function Field({ label, value, onChange, type = 'text', textarea = false, options }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; textarea?: boolean; options?: string[];
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
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  pending: { label: 'Pending', color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10', icon: Clock },
  paid: { label: 'Paid', color: 'text-sky-400 border-sky-500/20 bg-sky-500/10', icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: 'text-red-400 border-red-500/20 bg-red-500/10', icon: AlertTriangle },
};

function isOverdue(bill: Bill) {
  return bill.status === 'pending' && bill.dueDate < new Date().toISOString().slice(0, 10);
}

export default function Bills() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);

  const emptyForm = { vendor: '', description: '', amount: '', dueDate: '', category: 'other', recurrence: 'one-time', status: 'pending', proofPath: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchBills = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/enterprise/bills');
      if (r.ok) { const d = await r.json(); setBills(d.bills); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const openForm = (bill?: Bill) => {
    if (bill) {
      setEditBill(bill);
      setForm({ vendor: bill.vendor, description: bill.description, amount: bill.amount, dueDate: bill.dueDate, category: bill.category, recurrence: bill.recurrence, status: bill.status, proofPath: bill.proofPath ?? '' });
    } else {
      setEditBill(null);
      setForm(emptyForm);
    }
    setShowForm(true);
  };

  const saveBill = async () => {
    if (!form.vendor.trim() || !form.dueDate) return;
    setSaving(true);
    try {
      const url = editBill ? `/api/enterprise/bills/${editBill.id}` : '/api/enterprise/bills';
      const method = editBill ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchBills(); }
    } finally { setSaving(false); }
  };

  const markPaid = async (bill: Bill) => {
    setMarkingPaidId(bill.id);
    try {
      const r = await apiFetch(`/api/enterprise/bills/${bill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (r.ok) fetchBills();
    } finally { setMarkingPaidId(null); }
  };

  const deleteBill = async (id: number) => {
    if (!confirm('Delete this bill?')) return;
    await apiFetch(`/api/enterprise/bills/${id}`, { method: 'DELETE' });
    fetchBills();
  };

  const displayBills = bills.map(b => ({ ...b, effectiveStatus: isOverdue(b) ? 'overdue' : b.status }));
  const filtered = statusFilter === 'all' ? displayBills : displayBills.filter(b => b.effectiveStatus === statusFilter);

  const counts = { pending: 0, paid: 0, overdue: 0 };
  displayBills.forEach(b => { counts[b.effectiveStatus as keyof typeof counts] = (counts[b.effectiveStatus as keyof typeof counts] || 0) + 1; });

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to manage your bills." />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-orange-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-orange-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Bills' : 'PAYABLE-X'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Track incoming and outgoing bills.' : 'Bill tracking and payment status module.'}
            </p>
          </div>
          {isAuthenticated && (
            <button onClick={() => openForm()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-semibold hover:bg-orange-500/30 transition-colors">
              <Plus className="w-4 h-4" /> Add Bill
            </button>
          )}
        </div>

        {isAuthenticated && bills.length > 0 && (
          <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
            {(['all', 'pending', 'overdue', 'paid'] as const).map(f => {
              const cnt = f === 'all' ? bills.length : counts[f];
              const isActive = statusFilter === f;
              const colorMap = {
                all: 'text-zinc-400 border-white/[0.06]',
                pending: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
                overdue: 'text-red-400 border-red-500/20 bg-red-500/10',
                paid: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
              };
              return (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 border ${
                    isActive ? colorMap[f] : 'text-zinc-500 border-white/[0.06]'
                  } hover:opacity-80`}>
                  {f.toUpperCase()}
                  <span className="text-[9px] opacity-60">({cnt})</span>
                </button>
              );
            })}
          </div>
        )}

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>}

        {!loading && (
          <div className="flex flex-col gap-2">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground/40 text-sm font-mono">
                {statusFilter === 'all' ? 'No bills yet. Add your first bill.' : `No ${statusFilter} bills.`}
              </div>
            )}
            {filtered.map(bill => {
              const meta = STATUS_META[bill.effectiveStatus] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <div key={bill.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{bill.vendor}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${meta.color} uppercase tracking-wider flex items-center gap-1`}>
                        <Icon className="w-2.5 h-2.5" /> {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono uppercase">{bill.category}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {bill.description && <span>{bill.description} · </span>}
                      Due: <span className={bill.effectiveStatus === 'overdue' ? 'text-red-400' : ''}>{bill.dueDate}</span>
                      <span className="ml-2 text-muted-foreground/50">{bill.recurrence}</span>
                    </div>
                  </div>
                  <div className="text-right mr-2">
                    <div className="font-mono font-bold text-foreground">${Number(bill.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    {bill.paidAt && <div className="text-[9px] text-muted-foreground font-mono">paid {new Date(bill.paidAt).toLocaleDateString()}</div>}
                  </div>
                  <div className="flex gap-1">
                    {bill.status !== 'paid' && (
                      <button onClick={() => markPaid(bill)} disabled={markingPaidId === bill.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10 transition-colors disabled:opacity-40"
                        title="Mark as paid">
                        {markingPaidId === bill.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button onClick={() => openForm(bill)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteBill(bill.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-md my-auto shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-foreground">{editBill ? 'Edit Bill' : 'Add Bill'}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <Field label="Vendor / Source *" value={form.vendor} onChange={v => setForm(f => ({ ...f, vendor: v }))} />
                  <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount ($) *" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" />
                    <Field label="Due Date *" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} type="date" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={BILL_CATEGORIES} />
                    <Field label="Recurrence" value={form.recurrence} onChange={v => setForm(f => ({ ...f, recurrence: v }))} options={BILL_RECURRENCES} />
                  </div>
                  <Field label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={BILL_STATUSES} />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                  <button onClick={saveBill} disabled={saving || !form.vendor.trim() || !form.dueDate}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editBill ? 'Update Bill' : 'Save Bill'}
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
