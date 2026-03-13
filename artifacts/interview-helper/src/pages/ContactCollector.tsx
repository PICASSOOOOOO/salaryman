import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Download, Trash2, Plus, X, ChevronDown, ChevronUp, Mail, Loader2, Check } from 'lucide-react';
import { NavBar } from '@/components/NavBar';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppMode } from '../hooks/use-app-mode';

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
  createdAt: string;
}

const EMPTY: Omit<Contact, 'id' | 'createdAt'> = {
  name: '', email: '', phone: '', address: '', age: '',
  ethnicity: '', hometown: '', timezone: '', kids: '', bio: '',
};

const TIMEZONES = [
  'Eastern (ET)', 'Central (CT)', 'Mountain (MT)', 'Pacific (PT)',
  'Hawaii (HT)', 'Alaska (AKT)', 'UTC', 'Other',
];

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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await fetch('/api/tools/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts ?? []);
      }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleSave = async () => {
    if (!form.name.trim() || !isAuthenticated) return;
    try {
      const res = await fetch('/api/tools/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(prev => [data.contact, ...prev]);
        setForm({ ...EMPTY });
        setShowForm(false);
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/tools/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) setContacts(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const handleExportCSV = () => {
    if (contacts.length === 0) return;
    const fields: (keyof Omit<Contact, 'id'>)[] = [
      'name', 'email', 'phone', 'address', 'age', 'ethnicity',
      'hometown', 'timezone', 'kids', 'bio', 'createdAt',
    ];
    const header = fields.join(',');
    const rows = contacts.map(c =>
      fields.map(f => `"${String(c[f] ?? '').replace(/"/g, '""')}"`).join(',')
    );
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

    const fields: (keyof Omit<Contact, 'id'>)[] = [
      'name', 'email', 'phone', 'address', 'age', 'ethnicity',
      'hometown', 'timezone', 'kids', 'bio', 'createdAt',
    ];
    const header = fields.join(',');
    const rows = contacts.map(c =>
      fields.map(f => `"${String(c[f] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');

    const appName = config.emailSender;
    const html = `
      <h2>Your ${appName} Contacts</h2>
      <p>${contacts.length} contact${contacts.length !== 1 ? 's' : ''} exported on ${new Date().toLocaleDateString()}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
        <thead><tr style="background:#1a1a2e;color:white">${fields.map(f => `<th>${f}</th>`).join('')}</tr></thead>
        <tbody>${contacts.map(c =>
          `<tr>${fields.map(f => `<td>${c[f] ?? ''}</td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>
      <p style="color:#666;font-size:12px;margin-top:16px">Sent from ${appName}</p>
    `;

    try {
      await fetch('/api/tools/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          subject: `Your ${appName} Contacts — ${new Date().toLocaleDateString()}`,
          html,
          text: csv,
        }),
      });
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
    } catch {}
    setEmailSending(false);
  };

  const f = (k: keyof typeof EMPTY) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-accent/8 blur-[120px] rounded-full pointer-events-none" />

      <NavBar />

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full relative z-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-violet-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Contact Collector</h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">Build your contact database. Export to CSV → Google Sheets anytime.</p>
          </div>
          <div className="flex items-center gap-2">
            {contacts.length > 0 && (
              <>
                <button onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
                {isAuthenticated && user?.email && (
                  <button onClick={handleEmailContacts} disabled={emailSending}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                      ${emailSent
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25'} disabled:opacity-60`}>
                    {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : emailSent ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {emailSent ? 'Sent!' : 'Email me'}
                  </button>
                )}
              </>
            )}
            {isAuthenticated && (
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-colors">
                <Plus className="w-4 h-4" /> New Contact
              </button>
            )}
          </div>
        </div>

        {/* Add Contact Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-foreground">New Contact</h3>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <Field label="Full Name *" name="name" value={form.name} onChange={f('name')} placeholder="Jane Smith" />
                <Field label="Email" name="email" value={form.email} onChange={f('email')} type="email" placeholder="jane@example.com" />
                <Field label="Phone" name="phone" value={form.phone} onChange={f('phone')} placeholder="+1 (555) 000-0000" />
                <Field label="Address" name="address" value={form.address} onChange={f('address')} placeholder="City, State" />
                <Field label="Age" name="age" value={form.age} onChange={f('age')} placeholder="32" />
                <Field label="Ethnicity" name="ethnicity" value={form.ethnicity} onChange={f('ethnicity')} placeholder="Self-described" />
                <Field label="Hometown" name="hometown" value={form.hometown} onChange={f('hometown')} placeholder="Chicago, IL" />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time Zone</label>
                  <select value={form.timezone} onChange={e => f('timezone')(e.target.value)}
                    className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors">
                    <option value="">Select...</option>
                    {TIMEZONES.map(tz => <option key={tz} value={tz} className="bg-card">{tz}</option>)}
                  </select>
                </div>
                <Field label="Kids" name="kids" value={form.kids} onChange={f('kids')} placeholder="2 (ages 4, 7)" />
              </div>

              <div className="flex flex-col gap-1 mb-5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bio / Notes</label>
                <textarea value={form.bio} onChange={e => f('bio')(e.target.value)}
                  placeholder="A quick note about this person — personality, how you met, what they're working on..."
                  rows={3}
                  className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none" />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={!form.name.trim()}
                  className="px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Save Contact
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Google Sheets note */}
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
          <span className="text-amber-400 text-lg mt-0.5">💡</span>
          <div className="text-sm">
            <span className="font-semibold text-amber-300">Google Sheets sync</span>
            <span className="text-muted-foreground"> — ready to wire. Once you have a Google Sheets API key, drop it into the environment and contacts auto-sync on save. For now, use </span>
            <span className="font-semibold text-emerald-400">Export CSV</span>
            <span className="text-muted-foreground"> and import directly into Sheets.</span>
          </div>
        </div>

        {/* Not logged in state */}
        {!isAuthenticated && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm">Sign in to save and access your contacts from any device</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
          </div>
        )}

        {/* Contact list */}
        {!loading && isAuthenticated && (
          contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                <Users className="w-8 h-8 text-muted-foreground/30" />
              </div>
              <p className="text-muted-foreground text-sm">No contacts yet — add your first one above</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-2">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
              {contacts.map(contact => (
                <motion.div key={contact.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpanded(expanded === contact.id ? null : contact.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-sm font-bold text-foreground">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.email || contact.phone || contact.hometown || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/40">
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                      <button onClick={e => { e.stopPropagation(); handleDelete(contact.id); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {expanded === contact.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expanded === contact.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border px-5 pb-4 pt-3 overflow-hidden">
                        <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                          {[
                            ['Phone', contact.phone], ['Address', contact.address], ['Age', contact.age],
                            ['Ethnicity', contact.ethnicity], ['Hometown', contact.hometown], ['Timezone', contact.timezone],
                            ['Kids', contact.kids],
                          ].filter(([, v]) => v).map(([label, value]) => (
                            <div key={label as string}>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                              <p className="text-foreground text-xs mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                        {contact.bio && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bio</span>
                            <p className="text-xs text-foreground mt-0.5">{contact.bio}</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}
