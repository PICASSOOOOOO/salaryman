import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, FolderPlus, Upload, Download, Link, Trash2, Plus, X, ChevronRight,
  Folder, File, Eye, ArrowLeft, FilePen, ScrollText, HardDrive, Share2, Copy, Check,
  RefreshCw, Loader2, Image, Music, Video, FileCode, FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useUpload } from '@workspace/object-storage-web';
import { SignInPage } from '@/components/SignInPrompt';

type ActiveTab = 'invoices' | 'contracts' | 'files';

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

interface Contract {
  id: number;
  templateType: string;
  partyA: string;
  partyB: string;
  startDate: string;
  endDate: string;
  terms: string;
  scope: string;
  compensation: string;
  jurisdiction: string;
  extraClauses: string;
  status: string;
  createdAt: string;
}

interface FileItem {
  id: number;
  name: string;
  parentId: number | null;
  isFolder: boolean;
  objectPath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
}

const CONTRACT_TEMPLATES = [
  { id: 'nda', label: 'NDA', desc: 'Non-Disclosure Agreement' },
  { id: 'freelance', label: 'FREELANCE', desc: 'Freelance Service Agreement' },
  { id: 'service', label: 'SERVICE', desc: 'General Service Contract' },
] as const;

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null, isFolder: boolean) {
  if (isFolder) return Folder;
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript')) return FileCode;
  return File;
}

function CrtInput({ label, value, onChange, type = 'text', placeholder = '', textarea = false, readOnly = false }: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; textarea?: boolean; readOnly?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(228,228,231,0.9)',
    fontFamily: 'inherit',
    fontSize: '0.8rem',
    padding: '7px 10px',
    outline: 'none',
    width: '100%',
    borderRadius: '6px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '0.65rem', color: 'rgba(161,161,170,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
        {label}
      </label>
      {textarea ? (
        <textarea
          rows={3}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          style={{ ...baseStyle, resize: 'vertical' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          style={baseStyle}
        />
      )}
    </div>
  );
}

function InvoiceSection() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
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
  const [previewId, setPreviewId] = useState<number | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/tools/documents/invoices');
      if (r.ok) { const d = await r.json(); setInvoices(d.invoices); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.rate, 0);
  const tax = subtotal * (form.taxRate / 100);
  const total = subtotal + tax;

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form, lineItems, taxRate: form.taxRate };
      const path = editingId ? `/api/tools/documents/invoices/${editingId}` : '/api/tools/documents/invoices';
      const method = editingId ? 'PUT' : 'POST';
      const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        setShowForm(false);
        setEditingId(null);
        fetchInvoices();
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice?')) return;
    await apiFetch(`/api/tools/documents/invoices/${id}`, { method: 'DELETE' });
    fetchInvoices();
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)', letterSpacing: '0.1em' }}>
          {invoices.length} INVOICE{invoices.length !== 1 ? 'S' : ''} ON FILE
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ clientName: '', clientEmail: '', clientAddress: '', invoiceNumber: `INV-${Date.now().toString().slice(-6)}`, issueDate: new Date().toISOString().slice(0, 10), dueDate: '', taxRate: 0, notes: '', terms: 'Payment due within 30 days of invoice date.' }); setLineItems([{ description: '', quantity: 1, rate: 0 }]); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', letterSpacing: '0.1em', cursor: 'pointer' }}
        >
          <Plus className="w-3 h-3" /> NEW INVOICE
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.4)', fontFamily: "var(--font-sans)", fontSize: '0.75rem' }}>
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> LOADING...
        </div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.25)', fontFamily: "var(--font-sans)", fontSize: '0.75rem', border: '1px dashed rgba(56,189,248,0.15)' }}>
          NO INVOICES. CREATE ONE TO BEGIN.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {invoices.map(inv => (
            <motion.div key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ border: '1px solid rgba(56,189,248,0.15)', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileText className="w-4 h-4" style={{ color: 'rgba(56,189,248,0.5)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#38bdf8' }}>{inv.clientName}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.4)' }}>
                  #{inv.invoiceNumber} · Due {inv.dueDate || 'N/A'} · <span style={{ color: inv.status === 'paid' ? 'rgba(56,189,248,0.8)' : inv.status === 'overdue' ? 'rgba(255,80,80,0.8)' : 'rgba(255,165,0,0.8)' }}>{inv.status.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#38bdf8' }}>
                ${((inv.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0) * (1 + (inv.taxRate || 0) / 100)).toFixed(2)}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setPreviewId(inv.id)} title="Preview" style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.6)', cursor: 'pointer' }}><Eye className="w-3 h-3" /></button>
                <button onClick={() => handleGeneratePdf(inv)} title="Download PDF" style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.6)', cursor: 'pointer' }}><Download className="w-3 h-3" /></button>
                <button onClick={() => handleDelete(inv.id)} title="Delete" style={{ padding: '4px 6px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.2)', color: 'rgba(255,80,80,0.6)', cursor: 'pointer' }}><Trash2 className="w-3 h-3" /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {previewInvoice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: '#09090b', border: '1px solid rgba(56,189,248,0.3)', padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}>
              <button onClick={() => setPreviewId(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
              <div style={{ fontFamily: "var(--font-sans)" }}>
                <div style={{ fontSize: '1.2rem', color: '#38bdf8', marginBottom: '4px' }}>INVOICE #{previewInvoice.invoiceNumber}</div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(56,189,248,0.4)', marginBottom: '20px' }}>Issued: {previewInvoice.issueDate} · Due: {previewInvoice.dueDate}</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.6)', marginBottom: '2px' }}>BILL TO:</div>
                <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginBottom: '2px' }}>{previewInvoice.clientName}</div>
                {previewInvoice.clientEmail && <div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)' }}>{previewInvoice.clientEmail}</div>}
                <div style={{ margin: '20px 0', borderTop: '1px solid rgba(56,189,248,0.15)' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px', fontSize: '0.65rem', color: 'rgba(56,189,248,0.5)', marginBottom: '8px' }}>
                  <span>DESCRIPTION</span><span>QTY</span><span>RATE</span><span>AMT</span>
                </div>
                {(previewInvoice.lineItems as LineItem[]).map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px', fontSize: '0.75rem', color: '#38bdf8', marginBottom: '4px', alignItems: 'center' }}>
                    <span>{item.description}</span><span>{item.quantity}</span><span>${item.rate.toFixed(2)}</span><span>${(item.quantity * item.rate).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ marginTop: '16px', borderTop: '1px solid rgba(56,189,248,0.15)', paddingTop: '12px', fontSize: '0.75rem', color: '#38bdf8', textAlign: 'right' }}>
                  {(() => {
                    const sub = (previewInvoice.lineItems as LineItem[]).reduce((s, i) => s + i.quantity * i.rate, 0);
                    const tx = sub * ((previewInvoice.taxRate || 0) / 100);
                    return <>
                      <div>Subtotal: ${sub.toFixed(2)}</div>
                      {previewInvoice.taxRate > 0 && <div>Tax ({previewInvoice.taxRate}%): ${tx.toFixed(2)}</div>}
                      <div style={{ fontSize: '0.95rem', marginTop: '4px' }}>TOTAL: ${(sub + tx).toFixed(2)}</div>
                    </>;
                  })()}
                </div>
                {previewInvoice.terms && <div style={{ marginTop: '16px', fontSize: '0.65rem', color: 'rgba(56,189,248,0.4)' }}>TERMS: {previewInvoice.terms}</div>}
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => handleGeneratePdf(previewInvoice)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer' }}>
                    <Download className="w-3 h-3" /> DOWNLOAD PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: '#09090b', border: '1px solid rgba(56,189,248,0.3)', padding: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: '#38bdf8' }}>
                  {editingId ? 'EDIT INVOICE' : 'NEW INVOICE'}
                </span>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <CrtInput label="Client Name *" value={form.clientName} onChange={v => setForm(f => ({ ...f, clientName: v }))} />
                <CrtInput label="Client Email" value={form.clientEmail} onChange={v => setForm(f => ({ ...f, clientEmail: v }))} type="email" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <CrtInput label="Client Address" value={form.clientAddress} onChange={v => setForm(f => ({ ...f, clientAddress: v }))} textarea />
                </div>
                <CrtInput label="Invoice Number *" value={form.invoiceNumber} onChange={v => setForm(f => ({ ...f, invoiceNumber: v }))} />
                <CrtInput label="Issue Date" value={form.issueDate} onChange={v => setForm(f => ({ ...f, issueDate: v }))} type="date" />
                <CrtInput label="Due Date" value={form.dueDate} onChange={v => setForm(f => ({ ...f, dueDate: v }))} type="date" />
                <CrtInput label="Tax Rate (%)" value={String(form.taxRate)} onChange={v => setForm(f => ({ ...f, taxRate: Number(v) || 0 }))} type="number" />
              </div>

              <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(56,189,248,0.5)', letterSpacing: '0.12em', marginBottom: '8px' }}>LINE ITEMS</div>
                {lineItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px auto', gap: '8px', marginBottom: '6px', alignItems: 'end' }}>
                    <CrtInput label={idx === 0 ? 'Description' : ''} value={item.description} onChange={v => setLineItems(li => li.map((x, i) => i === idx ? { ...x, description: v } : x))} placeholder="Service or product" />
                    <CrtInput label={idx === 0 ? 'Qty' : ''} value={String(item.quantity)} onChange={v => setLineItems(li => li.map((x, i) => i === idx ? { ...x, quantity: Number(v) || 1 } : x))} type="number" />
                    <CrtInput label={idx === 0 ? 'Rate ($)' : ''} value={String(item.rate)} onChange={v => setLineItems(li => li.map((x, i) => i === idx ? { ...x, rate: Number(v) || 0 } : x))} type="number" />
                    <button onClick={() => setLineItems(li => li.filter((_, i) => i !== idx))} disabled={lineItems.length === 1}
                      style={{ height: '30px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.2)', color: 'rgba(255,80,80,0.5)', cursor: lineItems.length === 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: idx === 0 ? '14px' : '0' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setLineItems(li => [...li, { description: '', quantity: 1, rate: 0 }])}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.6)', fontFamily: "var(--font-sans)", fontSize: '0.6rem', cursor: 'pointer', marginTop: '4px' }}>
                  <Plus className="w-3 h-3" /> ADD LINE
                </button>
                <div style={{ textAlign: 'right', marginTop: '10px', fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#38bdf8' }}>
                  Subtotal: ${subtotal.toFixed(2)}{form.taxRate > 0 && ` · Tax: $${tax.toFixed(2)}`} · <strong>TOTAL: ${total.toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '12px' }}>
                <CrtInput label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} textarea placeholder="Additional notes for client..." />
                <CrtInput label="Payment Terms" value={form.terms} onChange={v => setForm(f => ({ ...f, terms: v }))} textarea />
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.5)', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer' }}>CANCEL</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '8px 20px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.5)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> SAVING...</> : 'SAVE INVOICE'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContractSection() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [form, setForm] = useState({
    templateType: 'nda', partyA: '', partyB: '', startDate: new Date().toISOString().slice(0, 10),
    endDate: '', scope: '', compensation: '', jurisdiction: '', extraClauses: '',
    terms: '',
  });

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/tools/documents/contracts');
      if (r.ok) { const d = await r.json(); setContracts(d.contracts); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const defaultTerms: Record<string, string> = {
    nda: 'The parties agree to keep all confidential information disclosed during the course of their relationship strictly confidential and to not disclose such information to any third party without prior written consent.',
    freelance: 'The freelancer agrees to complete all work in a professional manner. The client agrees to provide timely feedback and payment upon project completion.',
    service: 'The service provider agrees to deliver the services described herein. The client agrees to pay the agreed compensation per the terms specified.',
  };

  const handleTemplateChange = (t: string) => {
    setForm(f => ({ ...f, templateType: t, terms: defaultTerms[t] || '' }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await apiFetch('/api/tools/documents/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (r.ok) { setShowForm(false); fetchContracts(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this contract?')) return;
    await apiFetch(`/api/tools/documents/contracts/${id}`, { method: 'DELETE' });
    fetchContracts();
  };

  const handleGeneratePdf = async (contract: Contract) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const green = [0, 200, 80] as [number, number, number];
    const dark = [5, 15, 5] as [number, number, number];
    const grey = [80, 100, 80] as [number, number, number];

    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setTextColor(...green);
    doc.setFontSize(18);
    doc.setFont('courier', 'bold');
    const templateLabel = CONTRACT_TEMPLATES.find(t => t.id === contract.templateType)?.desc || contract.templateType.toUpperCase();
    doc.text(templateLabel.toUpperCase(), 20, 25);

    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...grey);
    doc.text(`Effective Date: ${contract.startDate}`, 20, 33);
    if (contract.endDate) doc.text(`End Date: ${contract.endDate}`, 20, 39);

    doc.setTextColor(...green);
    let y = 52;
    doc.setFontSize(9);
    doc.text('PARTIES:', 20, y); y += 6;
    doc.setTextColor(...grey);
    doc.text(`Party A: ${contract.partyA}`, 20, y); y += 6;
    doc.text(`Party B: ${contract.partyB}`, 20, y); y += 12;

    if (contract.scope) {
      doc.setTextColor(...green);
      doc.text('SCOPE OF WORK:', 20, y); y += 6;
      doc.setTextColor(...grey);
      const scopeLines = doc.splitTextToSize(contract.scope, 170);
      doc.text(scopeLines, 20, y); y += scopeLines.length * 5 + 8;
    }

    if (contract.compensation) {
      doc.setTextColor(...green);
      doc.text('COMPENSATION:', 20, y); y += 6;
      doc.setTextColor(...grey);
      doc.text(contract.compensation, 20, y); y += 10;
    }

    if (contract.terms) {
      doc.setTextColor(...green);
      doc.text('TERMS & CONDITIONS:', 20, y); y += 6;
      doc.setTextColor(...grey);
      const termsLines = doc.splitTextToSize(contract.terms, 170);
      doc.text(termsLines, 20, y); y += termsLines.length * 5 + 8;
    }

    if (contract.jurisdiction) {
      doc.setTextColor(...grey);
      doc.text(`Jurisdiction: ${contract.jurisdiction}`, 20, y); y += 10;
    }

    y = Math.max(y + 10, 260);
    doc.setTextColor(...green);
    doc.text('SIGNATURES:', 20, y); y += 8;
    doc.setTextColor(...grey);
    doc.text(`Party A: ${contract.partyA}`, 20, y);
    doc.text('Signature: ____________________', 100, y); y += 8;
    doc.text(`Party B: ${contract.partyB}`, 20, y);
    doc.text('Signature: ____________________', 100, y);

    doc.save(`contract-${contract.templateType}-${contract.id}.pdf`);
  };

  const previewContract = contracts.find(c => c.id === previewId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)', letterSpacing: '0.1em' }}>
          {contracts.length} CONTRACT{contracts.length !== 1 ? 'S' : ''} ON FILE
        </div>
        <button onClick={() => { setShowForm(true); setForm({ templateType: 'nda', partyA: '', partyB: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', scope: '', compensation: '', jurisdiction: '', extraClauses: '', terms: defaultTerms.nda }); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', letterSpacing: '0.1em', cursor: 'pointer' }}>
          <Plus className="w-3 h-3" /> NEW CONTRACT
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.4)', fontFamily: "var(--font-sans)", fontSize: '0.75rem' }}>
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> LOADING...
        </div>
      ) : contracts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.25)', fontFamily: "var(--font-sans)", fontSize: '0.75rem', border: '1px dashed rgba(56,189,248,0.15)' }}>
          NO CONTRACTS. GENERATE ONE FROM A TEMPLATE.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {contracts.map(c => {
            const tmpl = CONTRACT_TEMPLATES.find(t => t.id === c.templateType);
            return (
              <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ border: '1px solid rgba(56,189,248,0.15)', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ScrollText className="w-4 h-4" style={{ color: 'rgba(56,189,248,0.5)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#38bdf8' }}>{tmpl?.desc || c.templateType}</div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.4)' }}>
                    {c.partyA} ↔ {c.partyB} · {c.startDate}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setPreviewId(c.id)} title="Preview" style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.6)', cursor: 'pointer' }}><Eye className="w-3 h-3" /></button>
                  <button onClick={() => handleGeneratePdf(c)} title="Download PDF" style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.6)', cursor: 'pointer' }}><Download className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(c.id)} title="Delete" style={{ padding: '4px 6px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.2)', color: 'rgba(255,80,80,0.6)', cursor: 'pointer' }}><Trash2 className="w-3 h-3" /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {previewContract && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: '#09090b', border: '1px solid rgba(56,189,248,0.3)', padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto', position: 'relative', fontFamily: "var(--font-sans)" }}>
              <button onClick={() => setPreviewId(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
              <div style={{ fontSize: '1rem', color: '#38bdf8', marginBottom: '4px' }}>
                {CONTRACT_TEMPLATES.find(t => t.id === previewContract.templateType)?.desc || previewContract.templateType.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(56,189,248,0.4)', marginBottom: '20px' }}>Effective: {previewContract.startDate}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)', marginBottom: '4px' }}>PARTIES:</div>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '2px' }}>Party A: {previewContract.partyA}</div>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '16px' }}>Party B: {previewContract.partyB}</div>
              {previewContract.scope && <><div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)' }}>SCOPE:</div><div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{previewContract.scope}</div></>}
              {previewContract.compensation && <><div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)' }}>COMPENSATION:</div><div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '12px' }}>{previewContract.compensation}</div></>}
              {previewContract.terms && <><div style={{ fontSize: '0.7rem', color: 'rgba(56,189,248,0.5)' }}>TERMS:</div><div style={{ fontSize: '0.75rem', color: '#38bdf8', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{previewContract.terms}</div></>}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => handleGeneratePdf(previewContract)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer' }}>
                  <Download className="w-3 h-3" /> DOWNLOAD PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              style={{ background: '#09090b', border: '1px solid rgba(56,189,248,0.3)', padding: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.85rem', color: '#38bdf8' }}>NEW CONTRACT</span>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}><X className="w-4 h-4" /></button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.5)', letterSpacing: '0.12em', marginBottom: '8px' }}>TEMPLATE TYPE</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {CONTRACT_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => handleTemplateChange(t.id)}
                      style={{ flex: 1, padding: '8px', background: form.templateType === t.id ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${form.templateType === t.id ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.15)'}`, color: form.templateType === t.id ? '#38bdf8' : 'rgba(56,189,248,0.5)', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer', textAlign: 'center' }}>
                      <div>{t.label}</div>
                      <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <CrtInput label="Party A (Your Name/Company) *" value={form.partyA} onChange={v => setForm(f => ({ ...f, partyA: v }))} />
                <CrtInput label="Party B (Other Party) *" value={form.partyB} onChange={v => setForm(f => ({ ...f, partyB: v }))} />
                <CrtInput label="Start Date" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} type="date" />
                <CrtInput label="End Date (optional)" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} type="date" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <CrtInput label="Scope of Work" value={form.scope} onChange={v => setForm(f => ({ ...f, scope: v }))} textarea placeholder="Describe the work or services..." />
                </div>
                <CrtInput label="Compensation / Payment" value={form.compensation} onChange={v => setForm(f => ({ ...f, compensation: v }))} placeholder="e.g. $5,000 upon completion" />
                <CrtInput label="Jurisdiction" value={form.jurisdiction} onChange={v => setForm(f => ({ ...f, jurisdiction: v }))} placeholder="e.g. New York, USA" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <CrtInput label="Terms & Conditions" value={form.terms} onChange={v => setForm(f => ({ ...f, terms: v }))} textarea />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <CrtInput label="Additional Clauses (optional)" value={form.extraClauses} onChange={v => setForm(f => ({ ...f, extraClauses: v }))} textarea placeholder="Any extra clauses or provisions..." />
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(56,189,248,0.2)', color: 'rgba(56,189,248,0.5)', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer' }}>CANCEL</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '8px 20px', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.5)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> SAVING...</> : 'SAVE CONTRACT'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FileManagerSection() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<number | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: number | null; name: string }[]>([{ id: null, name: 'ROOT' }]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [copiedToken, setCopiedToken] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';

  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { uploadFile: doUpload, isUploading, progress } = useUpload({
    basePath: `${baseUrl}/api/tools/documents`,
    onSuccess: async (result: { uploadURL: string; objectPath: string; metadata: { name?: string; contentType?: string; size?: number } }) => {
      const name = pendingFile?.name || result.metadata?.name || 'unknown';
      const r = await apiFetch('/api/tools/documents/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parentId: currentFolder,
          objectPath: result.objectPath,
          mimeType: result.metadata?.contentType || pendingFile?.type || '',
          fileSize: result.metadata?.size || pendingFile?.size || 0,
        }),
      });
      if (r.ok) { setPendingFile(null); fetchItems(); }
    },
  });

  const uploadFile = async (file: File) => {
    setPendingFile(file);
    await doUpload(file);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const path = currentFolder ? `/api/tools/documents/files?parentId=${currentFolder}` : '/api/tools/documents/files';
      const r = await apiFetch(path);
      if (r.ok) { const d = await r.json(); setItems(d.items); }
    } finally { setLoading(false); }
  }, [currentFolder]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const navigateInto = (folder: FileItem) => {
    setCurrentFolder(folder.id);
    setBreadcrumb(bc => [...bc, { id: folder.id, name: folder.name }]);
  };

  const navigateTo = (idx: number) => {
    const crumb = breadcrumb[idx];
    setCurrentFolder(crumb.id);
    setBreadcrumb(bc => bc.slice(0, idx + 1));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await apiFetch('/api/tools/documents/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolder }),
    });
    setNewFolderName('');
    setShowNewFolder(false);
    fetchItems();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await apiFetch(`/api/tools/documents/files/${item.id}`, { method: 'DELETE' });
    fetchItems();
  };

  const handleShare = async (item: FileItem) => {
    const r = await apiFetch(`/api/tools/documents/files/${item.id}/share`, { method: 'POST' });
    if (r.ok) {
      const d = await r.json();
      const link = `${window.location.origin}${baseUrl}/api/tools/documents/files/shared/${d.shareToken}`;
      await navigator.clipboard.writeText(link);
      setCopiedToken(item.id);
      setTimeout(() => setCopiedToken(null), 2000);
      fetchItems();
    }
  };

  const handleUnshare = async (item: FileItem) => {
    await apiFetch(`/api/tools/documents/files/${item.id}/share`, { method: 'DELETE' });
    fetchItems();
  };

  const handleDownload = (item: FileItem) => {
    window.open(`/api/tools/documents/files/${item.id}/download`, '_blank');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(56,189,248,0.5)' }}>
          {breadcrumb.map((crumb, idx) => (
            <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {idx > 0 && <ChevronRight className="w-3 h-3" style={{ opacity: 0.4 }} />}
              <button onClick={() => navigateTo(idx)}
                style={{ background: 'none', border: 'none', color: idx === breadcrumb.length - 1 ? '#38bdf8' : 'rgba(56,189,248,0.4)', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer', letterSpacing: '0.1em' }}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowNewFolder(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.25)', color: 'rgba(56,189,248,0.7)', fontFamily: "var(--font-sans)", fontSize: '0.6rem', cursor: 'pointer' }}>
            <FolderPlus className="w-3 h-3" /> NEW FOLDER
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.6rem', cursor: 'pointer' }}>
            {isUploading ? <><Loader2 className="w-3 h-3 animate-spin" /> {Math.round(progress)}%</> : <><Upload className="w-3 h-3" /> UPLOAD</>}
          </button>
          <button onClick={fetchItems}
            style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.15)', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}>
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFileSelect} />

      {showNewFolder && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
          <input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
            placeholder="Folder name..."
            autoFocus
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.75rem', padding: '6px 10px', outline: 'none' }}
          />
          <button onClick={handleCreateFolder} style={{ padding: '6px 14px', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', fontFamily: "var(--font-sans)", fontSize: '0.65rem', cursor: 'pointer' }}>CREATE</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={{ padding: '6px 8px', background: 'none', border: '1px solid rgba(56,189,248,0.15)', color: 'rgba(56,189,248,0.4)', cursor: 'pointer' }}><X className="w-3 h-3" /></button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.4)', fontFamily: "var(--font-sans)", fontSize: '0.75rem' }}>
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> LOADING...
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(56,189,248,0.25)', fontFamily: "var(--font-sans)", fontSize: '0.75rem', border: '1px dashed rgba(56,189,248,0.15)' }}>
          EMPTY. UPLOAD FILES OR CREATE A FOLDER.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map(item => {
            const Icon = getFileIcon(item.mimeType, item.isFolder);
            return (
              <motion.div key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid rgba(56,189,248,0.1)', background: 'rgba(255,255,255,0.02)', cursor: item.isFolder ? 'pointer' : 'default' }}
                onClick={() => { if (item.isFolder) navigateInto(item); }}>
                <Icon className="w-4 h-4" style={{ color: item.isFolder ? 'rgba(236,72,153,0.6)' : 'rgba(56,189,248,0.5)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.75rem', color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  {!item.isFolder && (
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: 'rgba(56,189,248,0.35)' }}>
                      {item.mimeType || 'unknown'} · {formatBytes(item.fileSize)}
                      {item.isPublic && <span style={{ marginLeft: '8px', color: 'rgba(236,72,153,0.6)' }}>◉ SHARED</span>}
                    </div>
                  )}
                </div>
                {!item.isFolder && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDownload(item)} title="Download"
                      style={{ padding: '3px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(56,189,248,0.15)', color: 'rgba(56,189,248,0.5)', cursor: 'pointer' }}>
                      <Download className="w-3 h-3" />
                    </button>
                    <button onClick={() => item.isPublic ? handleUnshare(item) : handleShare(item)} title={item.isPublic ? 'Remove share link' : 'Get share link'}
                      style={{ padding: '3px 6px', background: copiedToken === item.id ? 'rgba(236,72,153,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${item.isPublic ? 'rgba(236,72,153,0.3)' : 'rgba(56,189,248,0.15)'}`, color: copiedToken === item.id ? 'rgba(236,72,153,0.8)' : item.isPublic ? 'rgba(236,72,153,0.5)' : 'rgba(56,189,248,0.5)', cursor: 'pointer' }}>
                      {copiedToken === item.id ? <Check className="w-3 h-3" /> : item.isPublic ? <Copy className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                    </button>
                    <button onClick={() => handleDelete(item)} title="Delete"
                      style={{ padding: '3px 6px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.15)', color: 'rgba(255,80,80,0.5)', cursor: 'pointer' }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {item.isFolder && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <ChevronRight className="w-3 h-3" style={{ color: 'rgba(56,189,248,0.3)' }} />
                    <button onClick={() => handleDelete(item)} title="Delete folder"
                      style={{ padding: '3px 6px', background: 'rgba(255,50,50,0.06)', border: '1px solid rgba(255,50,50,0.15)', color: 'rgba(255,80,80,0.5)', cursor: 'pointer' }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const { isAuthenticated } = useAuth();
  usePlan();
  const [tab, setTab] = useState<ActiveTab>('invoices');
  const [boomerMode, setBoomerMode] = useState(() => getDefaultBoomerMode());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const pageTitle = boomerMode ? 'DOCUMENTS' : 'ARCHIVE-X VAULT';
  const pageSubtitle = boomerMode ? 'Invoices, Contracts & File Storage' : 'SECURE DOCUMENT FABRICATION & FILE STORAGE UNIT';

  const TABS = [
    { id: 'invoices' as const, label: boomerMode ? 'INVOICES' : 'INVOICE GEN', icon: FilePen },
    { id: 'contracts' as const, label: boomerMode ? 'CONTRACTS' : 'CONTRACT GEN', icon: ScrollText },
    { id: 'files' as const, label: boomerMode ? 'FILE MANAGER' : 'FILE VAULT', icon: HardDrive },
  ];

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access your documents.' : 'Salaryman credentials required to access ARCHIVE-X VAULT.'} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ minHeight: '100vh', background: '#09090b', padding: '24px', paddingTop: '16px' }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: '1.1rem', color: '#38bdf8', letterSpacing: '0.12em', marginBottom: '2px', textShadow: '0 0 10px rgba(56,189,248,0.4)' }}>
            {pageTitle}
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.35)', letterSpacing: '0.1em' }}>
            {pageSubtitle}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid rgba(56,189,248,0.1)', paddingBottom: '0' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                fontFamily: "var(--font-sans)", fontSize: '0.65rem', letterSpacing: '0.1em',
                background: tab === id ? 'rgba(56,189,248,0.1)' : 'transparent',
                border: tab === id ? '1px solid rgba(56,189,248,0.35)' : '1px solid transparent',
                borderBottom: tab === id ? '1px solid #09090b' : '1px solid transparent',
                color: tab === id ? '#38bdf8' : 'rgba(56,189,248,0.4)',
                cursor: 'pointer',
                position: 'relative', bottom: '-1px',
              }}>
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        <div style={{ border: '1px solid rgba(56,189,248,0.1)', background: 'rgba(255,255,255,0.02)', padding: '20px' }}>
          <AnimatePresence mode="wait">
            {tab === 'invoices' && (
              <motion.div key="invoices" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <InvoiceSection />
              </motion.div>
            )}
            {tab === 'contracts' && (
              <motion.div key="contracts" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <ContractSection />
              </motion.div>
            )}
            {tab === 'files' && (
              <motion.div key="files" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                <FileManagerSection />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
