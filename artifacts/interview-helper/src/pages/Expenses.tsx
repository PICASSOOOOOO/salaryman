import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Plus, X, Trash2, Loader2, Check, Tag,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { SignInPage } from '@/components/SignInPrompt';

interface Expense {
  id: number;
  category: string;
  amount: string;
  expenseDate: string;
  description: string;
  receiptPath: string | null;
  notes: string;
  createdAt: string;
}

const EXPENSE_CATEGORIES = ['supplies', 'travel', 'marketing', 'equipment', 'software', 'meals', 'utilities', 'professional_services', 'training', 'office', 'payable', 'other'];

const CATEGORY_COLORS: Record<string, string> = {
  supplies: 'text-blue-400',
  travel: 'text-indigo-400',
  marketing: 'text-pink-400',
  equipment: 'text-purple-400',
  software: 'text-cyan-400',
  meals: 'text-yellow-400',
  utilities: 'text-orange-400',
  professional_services: 'text-teal-400',
  training: 'text-sky-400',
  office: 'text-slate-400',
  payable: 'text-rose-400',
  other: 'text-zinc-400',
};

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
          {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className={cls + " resize-none"} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

export default function Expenses() {
  const { isAuthenticated } = useAuth();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    category: 'other', amount: '', expenseDate: new Date().toISOString().slice(0, 10),
    description: '', receiptPath: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchExpenses = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/enterprise/expenses');
      if (r.ok) { const d = await r.json(); setExpenses(d.expenses); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const openForm = (expense?: Expense) => {
    if (expense) {
      setEditExpense(expense);
      setForm({ category: expense.category, amount: expense.amount, expenseDate: expense.expenseDate, description: expense.description, receiptPath: expense.receiptPath ?? '', notes: expense.notes });
    } else {
      setEditExpense(null);
      setForm(emptyForm);
    }
    setShowForm(true);
  };

  const saveExpense = async () => {
    if (!form.expenseDate) return;
    setSaving(true);
    try {
      const url = editExpense ? `/api/enterprise/expenses/${editExpense.id}` : '/api/enterprise/expenses';
      const method = editExpense ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchExpenses(); }
    } finally { setSaving(false); }
  };

  const deleteExpense = async (id: number) => {
    if (!confirm('Delete this expense? This will also remove the ledger entry.')) return;
    await apiFetch(`/api/enterprise/expenses/${id}`, { method: 'DELETE' });
    fetchExpenses();
  };

  const filtered = categoryFilter === 'all' ? expenses : expenses.filter(e => e.category === categoryFilter);
  const totalFiltered = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const usedCategories = Array.from(new Set(expenses.map(e => e.category)));

  if (!isAuthenticated && !loading) return <SignInPage context="Sign in to track business expenses." />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">

        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Expenses' : 'SPEND-TRACK'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Log and categorize business expenses.' : 'Expense logging, categorization, and receipt tracking.'}
            </p>
          </div>
          {isAuthenticated && (
            <button onClick={() => openForm()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold hover:bg-purple-500/30 transition-colors">
              <Plus className="w-4 h-4" /> Log Expense
            </button>
          )}
        </div>

        {isAuthenticated && expenses.length > 0 && (
          <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
            <button onClick={() => setCategoryFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 border ${
                categoryFilter === 'all' ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'text-zinc-500 border-white/[0.06]'
              }`}>
              ALL <span className="text-[9px] opacity-60">({expenses.length})</span>
            </button>
            {usedCategories.map(cat => {
              const cnt = expenses.filter(e => e.category === cat).length;
              const isActive = categoryFilter === cat;
              return (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 border ${
                    isActive ? `${CATEGORY_COLORS[cat] ?? 'text-zinc-400'} border-white/10 bg-white/5` : 'text-zinc-500 border-white/[0.06]'
                  } hover:opacity-80`}>
                  {cat.replace(/_/g, ' ')}
                  <span className="text-[9px] opacity-60">({cnt})</span>
                </button>
              );
            })}
          </div>
        )}

        {isAuthenticated && filtered.length > 0 && (
          <div className="bg-card border border-border rounded-xl px-4 py-3 mb-4 flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
              {categoryFilter === 'all' ? 'Total Expenses' : `${categoryFilter.replace(/_/g, ' ')} Total`}
            </span>
            <span className="font-mono font-bold text-lg text-purple-400">
              ${totalFiltered.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" /></div>}

        {!loading && (
          <div className="flex flex-col gap-2">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground/40 text-sm font-mono">
                {expenses.length === 0 ? 'No expenses logged yet.' : `No expenses in this category.`}
              </div>
            )}
            {filtered.map(exp => (
              <div key={exp.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                  <Tag className={`w-4 h-4 ${CATEGORY_COLORS[exp.category] ?? 'text-zinc-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{exp.description || exp.category.replace(/_/g, ' ')}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/5 ${CATEGORY_COLORS[exp.category] ?? 'text-zinc-400'} uppercase tracking-wider`}>
                      {exp.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {exp.expenseDate}
                    {exp.notes && <span> · {exp.notes}</span>}
                  </div>
                </div>
                <div className="text-right mr-2">
                  <div className="font-mono font-bold text-foreground">${Number(exp.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openForm(exp)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteExpense(exp.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-md my-auto shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-foreground">{editExpense ? 'Edit Expense' : 'Log Expense'}</h3>
                  <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount ($) *" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} type="number" />
                    <Field label="Date *" value={form.expenseDate} onChange={v => setForm(f => ({ ...f, expenseDate: v }))} type="date" />
                  </div>
                  <Field label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={EXPENSE_CATEGORIES} />
                  <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
                  <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} textarea />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                  <button onClick={saveExpense} disabled={saving || !form.expenseDate}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-bold hover:bg-purple-500/30 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editExpense ? 'Update' : 'Log Expense'}
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
