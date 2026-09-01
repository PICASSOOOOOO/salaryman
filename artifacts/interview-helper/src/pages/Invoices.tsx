import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, X, Trash2, Eye, Download, Loader2, Check, Send, Mail,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useAppMode } from '@/hooks/use-app-mode';
import { SignInPage } from '@/components/SignInPrompt';

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
}

interface Invoice {
  id: number;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  taxRate: number;
  notes: string;
  terms: string;
  status: string;
  createdAt: string;
}

function CrtInput({ label, value, onChange, type = 'text', placeholder = '', textarea = false, readOnly = false }: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; textarea?: boolean; readOnly?: boolean;
}) {
  const baseClass = "bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors w-full";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly} rows={3}
          className={`${baseClass} resize-none`} />
      ) : (
        <input type={type} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
          className={baseClass} />
      )}
    </div>
  );
}

export default function Invoices() {
  const { user, isAuthenticated } = useAuth();
  const { config } = useAppMode();
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [form, setForm] = useState({
    clientName: '', clientEmail: '', clientAddress: '',
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    taxRate: 0,
    notes: '',
    terms: 'Payment due within 30 days of invoice date.',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', quantity: 1, rate: 0 }]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const fetchInvoices = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/tools/documents/invoices');
      if (r.ok) { const d = await r.json(); setInvoices(d.invoices); }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.rate, 0);
  const tax = subtotal * (form.taxRate / 100);
  const total = subtotal + tax;

  const resetForm = () => {
    setForm({
      clientName: '', clientEmail: '', clientAddress: '',
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: '', taxRate: 0, notes: '',
      terms: 'Payment due within 30 days of invoice date.',
    });
    setLineItems([{ description: '', quantity: 1, rate: 0 }]);
    setEditingId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form, lineItems, taxRate: form.taxRate };
      const url = editingId ? `/api/tools/documents/invoices/${editingId}` : '/api/tools/documents/invoices';
      const method = editingId ? 'PUT' : 'POST';
      const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        setShowForm(false);
        resetForm();
        fetchInvoices();
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice?')) return;
    await apiFetch(`/api/tools/documents/invoices/${id}`, { method: 'DELETE' });
    fetchInvoices();
  };

  const handleStatusChange = async (invoiceId: number, newStatus: string) => {
    try {
      const r = await apiFetch(`/api/tools/documents/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) fetchInvoices();
    } catch {}
  };

  const handleSendEmail = async (invoice: Invoice) => {
    if (!user?.email || sendingId === invoice.id) return;
    setSendingId(invoice.id);
    const appName = config.emailSender;
    const sub = (invoice.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0);
    const tx = sub * ((invoice.taxRate || 0) / 100);
    const totalAmt = sub + tx;
    const html = `
      <div style="font-family:monospace;background:#09090b;color:#38bdf8;padding:32px;max-width:600px">
        <h1 style="font-size:22px;margin-bottom:4px">INVOICE #${invoice.invoiceNumber}</h1>
        <p style="color:rgba(56,189,248,0.5);font-size:12px">Issued: ${invoice.issueDate} · Due: ${invoice.dueDate}</p>
        <p style="margin-top:16px;font-size:13px">BILL TO:<br/><strong>${invoice.clientName}</strong>${invoice.clientEmail ? `<br/>${invoice.clientEmail}` : ''}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:12px">
          <tr style="border-bottom:1px solid rgba(56,189,248,0.3)"><th style="text-align:left;padding:6px">Description</th><th style="text-align:right;padding:6px">Qty</th><th style="text-align:right;padding:6px">Rate</th><th style="text-align:right;padding:6px">Amount</th></tr>
          ${(invoice.lineItems as LineItem[]).map(item => `<tr><td style="padding:6px">${item.description}</td><td style="text-align:right;padding:6px">${item.quantity}</td><td style="text-align:right;padding:6px">$${item.rate.toFixed(2)}</td><td style="text-align:right;padding:6px">$${(item.quantity * item.rate).toFixed(2)}</td></tr>`).join('')}
        </table>
        <div style="text-align:right;margin-top:16px;font-size:14px">
          <div>Subtotal: $${sub.toFixed(2)}</div>
          ${invoice.taxRate > 0 ? `<div>Tax (${invoice.taxRate}%): $${tx.toFixed(2)}</div>` : ''}
          <div style="font-size:18px;margin-top:4px"><strong>TOTAL: $${totalAmt.toFixed(2)}</strong></div>
        </div>
        ${invoice.terms ? `<p style="font-size:11px;color:rgba(56,189,248,0.4);margin-top:20px">Terms: ${invoice.terms}</p>` : ''}
      </div>
    `;
    try {
      await apiFetch('/api/tools/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: invoice.clientEmail || user.email,
          subject: `Invoice #${invoice.invoiceNumber} from ${appName}`,
          html,
        }),
      });
      if (invoice.status === 'draft') {
        await handleStatusChange(invoice.id, 'sent');
      }
      setSentId(invoice.id);
      setTimeout(() => setSentId(null), 3000);
    } catch {}
    setSendingId(null);
  };

  const handleGeneratePdf = async (invoice: Invoice) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const green = [0, 200, 80] as [number, number, number];
    const dark = [5, 15, 5] as [number, number, number];
    const grey = [80, 100, 80] as [number, number, number];

    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(...green);
    doc.setFontSize(22);
    doc.setFont('courier', 'bold');
    doc.text('INVOICE', 20, 25);
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...grey);
    doc.text(`#${invoice.invoiceNumber}`, 20, 32);
    doc.text(`Issued: ${invoice.issueDate}  |  Due: ${invoice.dueDate}`, 20, 38);
    doc.setTextColor(...green);
    doc.setFontSize(10);
    doc.text('BILL TO:', 20, 50);
    doc.setFontSize(9);
    doc.setTextColor(...grey);
    doc.text(invoice.clientName, 20, 56);
    if (invoice.clientEmail) doc.text(invoice.clientEmail, 20, 62);
    if (invoice.clientAddress) doc.text(invoice.clientAddress, 20, 68);

    let y = 82;
    doc.setTextColor(...green);
    doc.setFontSize(8);
    doc.text('DESCRIPTION', 20, y);
    doc.text('QTY', 120, y);
    doc.text('RATE', 145, y);
    doc.text('AMOUNT', 170, y);
    doc.setDrawColor(...green);
    doc.line(20, y + 2, 190, y + 2);
    y += 8;
    doc.setTextColor(...grey);
    (invoice.lineItems as LineItem[]).forEach(item => {
      doc.text(item.description.substring(0, 50), 20, y);
      doc.text(String(item.quantity), 120, y);
      doc.text(`$${item.rate.toFixed(2)}`, 145, y);
      doc.text(`$${(item.quantity * item.rate).toFixed(2)}`, 170, y);
      y += 7;
    });
    doc.line(20, y, 190, y);
    y += 6;
    const sub = (invoice.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0);
    const tx = sub * ((invoice.taxRate || 0) / 100);
    doc.text(`Subtotal: $${sub.toFixed(2)}`, 145, y); y += 6;
    if (invoice.taxRate) { doc.text(`Tax (${invoice.taxRate}%): $${tx.toFixed(2)}`, 145, y); y += 6; }
    doc.setTextColor(...green);
    doc.setFontSize(11);
    doc.text(`TOTAL: $${(sub + tx).toFixed(2)}`, 145, y);
    if (invoice.terms) {
      y += 14;
      doc.setFontSize(8);
      doc.setTextColor(...grey);
      doc.text('TERMS:', 20, y); y += 5;
      doc.text(invoice.terms, 20, y, { maxWidth: 170 });
    }
    doc.save(`invoice-${invoice.invoiceNumber}.pdf`);
  };

  const previewInvoice = invoices.find(i => i.id === previewId);

  const STATUS_COLOR: Record<string, string> = {
    draft: 'text-zinc-400',
    sent: 'text-blue-400',
    paid: 'text-sky-400',
    overdue: 'text-red-400',
  };

  const STATUS_BG: Record<string, string> = {
    draft: 'bg-zinc-500/10 border-zinc-500/20',
    sent: 'bg-blue-500/10 border-blue-500/20',
    paid: 'bg-sky-500/10 border-sky-500/20',
    overdue: 'bg-red-500/10 border-red-500/20',
  };

  const STATUS_FILTERS = ['all', 'draft', 'sent', 'paid', 'overdue'];

  const filteredInvoices = statusFilter === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === statusFilter);

  const statusCounts = invoices.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <FileText className="w-5 h-5 text-sky-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {boomerMode ? 'Invoices' : 'LEDGER-3'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">
              {boomerMode ? 'Generate, send, and track invoices.' : 'Invoice generation and delivery module. Line items, PDF export, Resend email integration.'}
            </p>
          </div>
          {isAuthenticated && (
            <button
              onClick={() => { resetForm(); setShowForm(v => !v); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Invoice
            </button>
          )}
        </div>

        {isAuthenticated && invoices.length > 0 && (
          <div className="flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide pb-1">
            {STATUS_FILTERS.map(filter => {
              const count = filter === 'all' ? invoices.length : (statusCounts[filter] || 0);
              const isActive = statusFilter === filter;
              const colorClass = filter === 'all'
                ? (isActive ? 'bg-sky-500/15 text-sky-400 border-sky-500/25' : 'text-zinc-500 border-white/[0.06]')
                : (isActive ? `${STATUS_BG[filter]} ${STATUS_COLOR[filter]}` : 'text-zinc-500 border-white/[0.06]');
              return (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-colors shrink-0 border ${colorClass} hover:opacity-80`}
                >
                  {filter === 'all' ? 'ALL' : filter.toUpperCase()}
                  <span className={`text-[9px] ${isActive ? 'opacity-80' : 'opacity-50'}`}>({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {!isAuthenticated && !loading && (
          <SignInPage context="Sign in to manage your invoices." />
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {/* Invoice form modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl my-auto shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-foreground">{editingId ? 'Edit Invoice' : 'New Invoice'}</h3>
                  <button onClick={() => { setShowForm(false); resetForm(); }}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <CrtInput label="Client Name *" value={form.clientName} onChange={v => setForm(f => ({ ...f, clientName: v }))} />
                  <CrtInput label="Client Email" value={form.clientEmail} onChange={v => setForm(f => ({ ...f, clientEmail: v }))} type="email" />
                  <div className="sm:col-span-2">
                    <CrtInput label="Client Address" value={form.clientAddress} onChange={v => setForm(f => ({ ...f, clientAddress: v }))} textarea />
                  </div>
                  <CrtInput label="Invoice Number *" value={form.invoiceNumber} onChange={v => setForm(f => ({ ...f, invoiceNumber: v }))} />
                  <CrtInput label="Issue Date" value={form.issueDate} onChange={v => setForm(f => ({ ...f, issueDate: v }))} type="date" />
                  <CrtInput label="Due Date" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} type="date" />
                  <CrtInput label="Tax Rate (%)" value={String(form.taxRate)} onChange={v => setForm(f => ({ ...f, taxRate: Number(v) || 0 }))} type="number" />
                </div>

                <div className="mb-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Line Items</p>
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                      <div className="col-span-6">
                        {idx === 0 && <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>}
                        <input value={item.description} onChange={e => setLineItems(li => li.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                          placeholder="Service or product"
                          className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Qty</label>}
                        <input type="number" value={item.quantity} onChange={e => setLineItems(li => li.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) || 1 } : x))}
                          className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                      </div>
                      <div className="col-span-3">
                        {idx === 0 && <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Rate ($)</label>}
                        <input type="number" value={item.rate} onChange={e => setLineItems(li => li.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) || 0 } : x))}
                          className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
                      </div>
                      <div className="col-span-1 flex items-end">
                        <button onClick={() => setLineItems(li => li.filter((_, i) => i !== idx))} disabled={lineItems.length === 1}
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setLineItems(li => [...li, { description: '', quantity: 1, rate: 0 }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-muted-foreground text-xs hover:text-foreground transition-colors mt-1">
                    <Plus className="w-3 h-3" /> Add Line
                  </button>
                  <div className="text-right mt-3 font-mono text-sm text-foreground">
                    Subtotal: ${subtotal.toFixed(2)}{form.taxRate > 0 && ` · Tax: $${tax.toFixed(2)}`} · <strong>TOTAL: ${total.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="grid gap-4 mb-5">
                  <CrtInput label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} textarea placeholder="Additional notes for client..." />
                  <CrtInput label="Payment Terms" value={form.terms} onChange={v => setForm(f => ({ ...f, terms: v }))} textarea />
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowForm(false); resetForm(); }}
                    className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancel</button>
                  <button onClick={handleSave} disabled={saving || !form.clientName.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editingId ? 'Update Invoice' : 'Save Invoice'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview modal */}
        <AnimatePresence>
          {previewInvoice && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={() => setPreviewId(null)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-card border border-border rounded-2xl p-8 w-full max-w-lg max-h-[80vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setPreviewId(null)} className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
                <p className="font-mono text-xl font-bold text-primary mb-1">INVOICE #{previewInvoice.invoiceNumber}</p>
                <p className="text-[10px] text-muted-foreground font-mono mb-4">Issued: {previewInvoice.issueDate} · Due: {previewInvoice.dueDate}</p>
                <p className="text-xs text-muted-foreground mb-1">BILL TO:</p>
                <p className="text-sm font-semibold text-foreground">{previewInvoice.clientName}</p>
                {previewInvoice.clientEmail && <p className="text-xs text-muted-foreground">{previewInvoice.clientEmail}</p>}
                <div className="border-t border-border my-4" />
                <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground font-mono mb-2">
                  <span>Description</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amt</span>
                </div>
                {(previewInvoice.lineItems as LineItem[]).map((item, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 text-xs text-foreground mb-1">
                    <span className="truncate">{item.description}</span>
                    <span className="text-right">{item.quantity}</span>
                    <span className="text-right">${item.rate.toFixed(2)}</span>
                    <span className="text-right">${(item.quantity * item.rate).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-border mt-3 pt-3 text-right text-sm font-mono">
                  {(() => {
                    const sub = (previewInvoice.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0);
                    const tx = sub * ((previewInvoice.taxRate || 0) / 100);
                    return <>
                      <div className="text-muted-foreground">Subtotal: ${sub.toFixed(2)}</div>
                      {previewInvoice.taxRate > 0 && <div className="text-muted-foreground">Tax ({previewInvoice.taxRate}%): ${tx.toFixed(2)}</div>}
                      <div className="text-lg font-bold text-primary mt-1">TOTAL: ${(sub + tx).toFixed(2)}</div>
                    </>;
                  })()}
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <button onClick={() => handleGeneratePdf(previewInvoice)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && isAuthenticated && (
          <>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground text-sm">No invoices yet — create your first one</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                  {statusFilter !== 'all' && ` (${statusFilter})`}
                </p>
                {filteredInvoices.map(inv => {
                  const sub = (inv.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0);
                  const tx = sub * ((inv.taxRate || 0) / 100);
                  const totalAmt = sub + tx;
                  return (
                    <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="bg-card border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-primary/30 transition-all group">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{inv.clientName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          #{inv.invoiceNumber} · Due {inv.dueDate || 'N/A'} · <span className={STATUS_COLOR[inv.status] ?? 'text-zinc-400'}>{inv.status.toUpperCase()}</span>
                        </p>
                      </div>
                      <p className="font-mono text-sm font-bold text-foreground shrink-0">${totalAmt.toFixed(2)}</p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setPreviewId(inv.id)} title="Preview"
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleGeneratePdf(inv)} title="PDF"
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {inv.clientEmail && (
                          <button onClick={() => handleSendEmail(inv)} title="Send via email" disabled={sendingId === inv.id}
                            className={`p-1.5 rounded-lg transition-colors ${sentId === inv.id ? 'text-sky-400' : 'text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10'}`}>
                            {sentId === inv.id ? <Check className="w-3.5 h-3.5" /> : sendingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {inv.status === 'draft' && (
                          <button onClick={() => handleStatusChange(inv.id, 'sent')} title="Mark as Sent"
                            className="p-1.5 text-muted-foreground hover:text-blue-400 rounded-lg hover:bg-blue-500/10 transition-colors">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(inv.status === 'sent' || inv.status === 'overdue') && (
                          <button onClick={() => handleStatusChange(inv.id, 'paid')} title="Mark as Paid"
                            className="p-1.5 text-muted-foreground hover:text-sky-400 rounded-lg hover:bg-sky-500/10 transition-colors">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(inv.id)} title="Delete"
                          className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
