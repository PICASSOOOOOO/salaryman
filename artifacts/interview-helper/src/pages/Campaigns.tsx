import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, MessageSquare, BarChart2, Plus, Trash2, Send, Clock, CheckCircle2,
  AlertCircle, Loader2, X, ChevronRight, Edit2, Eye, Users, Phone,
  Zap, Filter, RefreshCw, Check, Copy, ArrowLeft, Megaphone, Inbox,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  htmlBody: string;
  textBody: string;
  previewText: string;
  fromName: string;
  replyTo: string;
  recipientFilter: any;
  createdAt: string;
}

interface SmsCampaign {
  id: number;
  name: string;
  messageBody: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalReplied: number;
  recipientFilter: any;
  createdAt: string;
}

interface SmsConversation {
  id: number;
  contactPhone: string;
  contactName: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface SmsMessage {
  id: number;
  direction: string;
  body: string;
  fromPhone: string;
  toPhone: string;
  status: string;
  createdAt: string;
}

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  tag: string;
  dealStage: string;
}

type Tab = 'dashboard' | 'email-campaigns' | 'sms-campaigns' | 'sms-inbox';
type EmailView = 'list' | 'compose' | 'detail';
type SmsView = 'list' | 'compose' | 'detail';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.BASE_URL;

function api(path: string, opts?: RequestInit) {
  const fullPath = path.startsWith('/api/') ? `${BASE_URL}${path.slice(1)}` : path;
  return apiFetch(fullPath, { headers: { 'Content-Type': 'application/json' }, ...opts });
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  scheduled: 'text-amber-300 bg-amber-900/30 border-amber-700/50',
  sending: 'text-blue-300 bg-blue-900/30 border-blue-700/50',
  sent: 'text-sky-300 bg-sky-900/30 border-sky-700/50',
  completed: 'text-sky-300 bg-sky-900/30 border-sky-700/50',
};

const STATUS_ICONS: Record<string, React.FC<any>> = {
  draft: Edit2,
  scheduled: Clock,
  sending: Loader2,
  sent: CheckCircle2,
  completed: CheckCircle2,
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] || AlertCircle;
  const cls = STATUS_COLORS[status] || 'text-zinc-400 bg-zinc-800 border-zinc-700';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      <Icon className={`w-2.5 h-2.5 ${status === 'sending' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-muted/20 border border-border rounded-xl p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">{label}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Email Compose ─────────────────────────────────────────────────────────────

function EmailCompose({
  initial,
  contacts,
  onSave,
  onBack,
}: {
  initial?: EmailCampaign | null;
  contacts: Contact[];
  onSave: (c: EmailCampaign) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [previewText, setPreviewText] = useState(initial?.previewText || '');
  const [fromName, setFromName] = useState(initial?.fromName || '');
  const [replyTo, setReplyTo] = useState(initial?.replyTo || '');
  const [htmlBody, setHtmlBody] = useState(initial?.htmlBody || '');
  const [filterTag, setFilterTag] = useState(initial?.recipientFilter?.tag || '');
  const [filterStage, setFilterStage] = useState(initial?.recipientFilter?.dealStage || '');
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? initial.scheduledAt.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGoal, setAiGoal] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'compose' | 'ai' | 'preview' | 'audience'>('compose');

  const { user } = useAuth();

  const recipientCount = contacts.filter(c => {
    if (!c.email) return false;
    if (filterTag && c.tag !== filterTag) return false;
    if (filterStage && c.dealStage !== filterStage) return false;
    return true;
  }).length;

  const TAGS = ['Lead', 'Client', 'Vendor', 'Partner', 'Other'];
  const STAGES = ['Prospect', 'Contacted', 'Proposal', 'Closed'];
  const TONES = ['professional', 'casual', 'bold', 'friendly', 'urgent', 'luxury'];

  async function handleSave() {
    if (!name.trim()) { setError('Campaign name required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = { name, subject, previewText, fromName, replyTo, htmlBody, scheduledAt: scheduledAt || null, recipientFilter: { ...(filterTag && { tag: filterTag }), ...(filterStage && { dealStage: filterStage }) } };
      const r = initial
        ? await api(`/api/campaigns/email/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/campaigns/email', { method: 'POST', body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Save failed'); return; }
      onSave(data.campaign);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function handleSend(campaignId: number) {
    if (!confirm(`Send this campaign to ~${recipientCount} recipients?`)) return;
    setSending(true);
    setError('');
    try {
      const r = await api(`/api/campaigns/email/${campaignId}/send`, { method: 'POST', body: JSON.stringify({}) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Send failed'); return; }
      alert(data.message || 'Campaign sending!');
      onBack();
    } catch (e: any) { setError(e.message); }
    setSending(false);
  }

  async function handleTestSend(campaignId: number) {
    if (!testEmail.trim()) { setTestMsg('Enter a test email'); return; }
    setTestSending(true);
    setTestMsg('');
    try {
      const r = await api(`/api/campaigns/email/${campaignId}/send`, { method: 'POST', body: JSON.stringify({ test: true, testEmail }) });
      const data = await r.json();
      setTestMsg(r.ok ? `Sent to ${testEmail}!` : (data.error || 'Failed'));
    } catch (e: any) { setTestMsg(e.message); }
    setTestSending(false);
  }

  async function generateWithAI() {
    if (!aiGoal.trim()) return;
    setAiGenerating(true);
    setHtmlBody('');
    try {
      const r = await apiFetch('/api/studio/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', tone: aiTone, context: aiGoal }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || 'Generation failed');
      }
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.error) throw new Error(d.error);
            if (d.content) result += d.content;
          } catch (sseErr) {
            if (sseErr instanceof SyntaxError) continue;
            throw sseErr;
          }
        }
        setHtmlBody(result);
      }
      setTab('compose');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI generation failed';
      setError(msg);
    }
    setAiGenerating(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted/40 text-muted-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-lg text-foreground">{initial ? 'Edit Campaign' : 'New Email Campaign'}</h3>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="flex gap-1 mb-6 bg-muted/20 rounded-xl p-1 border border-border">
        {(['compose', 'audience', 'ai', 'preview'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${tab === t ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'compose' ? 'Content' : t === 'ai' ? 'AI Assist' : t === 'audience' ? 'Audience' : 'Preview'}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Campaign Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Q4 Product Launch"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">From Name</label>
              <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Your Name / Company"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Subject Line *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your email subject..."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Preview Text</label>
            <input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Shows in inbox preview..."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Reply-To Email</label>
            <input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="replies@yourcompany.com"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Email Body (HTML or plain text)</label>
            <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={12}
              placeholder="Write your email body here. Use HTML for formatting, or paste plain text from AI Assist..."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">Tip: Use the AI Assist tab to generate copy, then paste here.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Schedule Send (optional)</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
        </div>
      )}

      {tab === 'audience' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-300">Estimated Recipients: {recipientCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Based on your CRM contacts with email addresses matching the selected filters.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Filter by Tag</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button onClick={() => setFilterTag('')}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${!filterTag ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>
                All Tags
              </button>
              {TAGS.map(t => (
                <button key={t} onClick={() => setFilterTag(t === filterTag ? '' : t)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${filterTag === t ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Filter by Deal Stage</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button onClick={() => setFilterStage('')}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${!filterStage ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>
                All Stages
              </button>
              {STAGES.map(s => (
                <button key={s} onClick={() => setFilterStage(s === filterStage ? '' : s)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${filterStage === s ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-4">
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-bold text-violet-300">AI Email Generator</span>
            </div>
            <p className="text-xs text-muted-foreground">Powered by Dark Room. Generated content will replace the current email body.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Campaign Goal</label>
            <textarea value={aiGoal} onChange={e => setAiGoal(e.target.value)} rows={3}
              placeholder="Describe what you want this email to achieve. E.g.: Promote our new product launch and drive clicks to the sales page..."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Tone</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {TONES.map(t => (
                <button key={t} onClick={() => setAiTone(t)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold capitalize border transition-colors ${aiTone === t ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={generateWithAI} disabled={aiGenerating || !aiGoal.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-bold hover:bg-violet-500/30 transition-colors disabled:opacity-40">
            {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {aiGenerating ? 'Generating...' : 'Generate Email Copy'}
          </button>
          {htmlBody && (
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Generated Content</label>
              <div className="bg-muted/20 border border-border rounded-xl p-4 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                {htmlBody}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'preview' && (
        <div className="space-y-4">
          <div className="bg-muted/20 border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Subject</div>
            <div className="text-sm font-semibold text-foreground">{subject || '(no subject)'}</div>
            {previewText && <div className="text-xs text-muted-foreground mt-1">{previewText}</div>}
          </div>
          <div className="bg-white rounded-xl p-6 border border-border min-h-[200px]"
            dangerouslySetInnerHTML={{ __html: htmlBody || '<p style="color:#999;font-family:sans-serif">No content yet.</p>' }} />
          {initial && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Send Test To</label>
                <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder={user?.email || 'test@example.com'}
                  className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="mt-5">
                <button onClick={() => handleTestSend(initial.id)} disabled={testSending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-40">
                  {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Test
                </button>
              </div>
              {testMsg && <p className="w-full text-xs text-muted-foreground">{testMsg}</p>}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-6 pt-4 border-t border-border">
        <button onClick={onBack} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {initial && initial.status !== 'sent' && (
          <button onClick={() => handleSend(initial.id)} disabled={sending}
            className="ml-auto flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : `Send to ${recipientCount} contacts`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── SMS Compose ────────────────────────────────────────────────────────────────

function SmsCompose({
  initial,
  contacts,
  onSave,
  onBack,
}: {
  initial?: SmsCampaign | null;
  contacts: Contact[];
  onSave: (c: SmsCampaign) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [messageBody, setMessageBody] = useState(initial?.messageBody || '');
  const [filterTag, setFilterTag] = useState(initial?.recipientFilter?.tag || '');
  const [filterStage, setFilterStage] = useState(initial?.recipientFilter?.dealStage || '');
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ? initial.scheduledAt.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGoal, setAiGoal] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiOutput, setAiOutput] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'compose' | 'ai' | 'audience'>('compose');

  const TAGS = ['Lead', 'Client', 'Vendor', 'Partner', 'Other'];
  const STAGES = ['Prospect', 'Contacted', 'Proposal', 'Closed'];
  const TONES = ['professional', 'casual', 'bold', 'friendly', 'urgent'];

  const charCount = messageBody.length;
  const segments = Math.ceil(charCount / 160) || 1;

  const recipientCount = contacts.filter(c => {
    if (!c.phone) return false;
    if (filterTag && c.tag !== filterTag) return false;
    if (filterStage && c.dealStage !== filterStage) return false;
    return true;
  }).length;

  async function handleSave() {
    if (!name.trim()) { setError('Campaign name required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = { name, messageBody, scheduledAt: scheduledAt || null, recipientFilter: { ...(filterTag && { tag: filterTag }), ...(filterStage && { dealStage: filterStage }) } };
      const r = initial
        ? await api(`/api/campaigns/sms/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/campaigns/sms', { method: 'POST', body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Save failed'); return; }
      onSave(data.campaign);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function handleSend(campaignId: number) {
    if (!confirm(`Send this SMS campaign to ~${recipientCount} recipients?`)) return;
    setSending(true);
    setError('');
    try {
      const r = await api(`/api/campaigns/sms/${campaignId}/send`, { method: 'POST', body: JSON.stringify({}) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Send failed'); return; }
      alert(data.message || 'SMS campaign sending!');
      onBack();
    } catch (e: any) { setError(e.message); }
    setSending(false);
  }

  async function handleTestSend(campaignId: number) {
    if (!testPhone.trim()) { setTestMsg('Enter a test phone number'); return; }
    setTestSending(true);
    setTestMsg('');
    try {
      const r = await api(`/api/campaigns/sms/${campaignId}/send`, { method: 'POST', body: JSON.stringify({ test: true, testPhone }) });
      const data = await r.json();
      setTestMsg(r.ok ? `Sent to ${testPhone}!` : (data.error || 'Failed'));
    } catch (e: any) { setTestMsg(e.message); }
    setTestSending(false);
  }

  async function generateSmsWithAI() {
    if (!aiGoal.trim()) return;
    setAiGenerating(true);
    setAiOutput('');
    try {
      const r = await apiFetch('/api/campaigns/generate-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: aiGoal, tone: aiTone }),
      });
      if (!r.ok) throw new Error('Generation failed');
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { const d = JSON.parse(line.slice(6)); if (d.content) result += d.content; } catch {}
        }
        setAiOutput(result);
      }
    } catch { setError('AI generation failed'); }
    setAiGenerating(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-muted/40 text-muted-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-lg text-foreground">{initial ? 'Edit SMS Campaign' : 'New SMS Campaign'}</h3>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="flex gap-1 mb-6 bg-muted/20 rounded-xl p-1 border border-border">
        {(['compose', 'audience', 'ai'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${tab === t ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'compose' ? 'Message' : t === 'ai' ? 'AI Assist' : 'Audience'}
          </button>
        ))}
      </div>

      {tab === 'compose' && (
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Summer Sale Campaign"
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Message Body *</label>
              <span className={`text-[10px] font-mono ${charCount > 160 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                {charCount}/160 · {segments} segment{segments !== 1 ? 's' : ''}
              </span>
            </div>
            <textarea value={messageBody} onChange={e => setMessageBody(e.target.value)} rows={5}
              placeholder="Write your SMS message... Keep it under 160 chars for 1 segment."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
            {charCount > 160 && (
              <p className="text-[11px] text-amber-400 mt-1">Messages over 160 chars use multiple SMS segments and cost more to send.</p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Schedule Send (optional)</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          {initial && (
            <div className="pt-2 border-t border-border space-y-3">
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Test Send</label>
              <div className="flex gap-2">
                <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+1 555 000 1234"
                  className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
                <button onClick={() => handleTestSend(initial.id)} disabled={testSending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-bold hover:bg-blue-500/30 transition-colors disabled:opacity-40">
                  {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Test
                </button>
              </div>
              {testMsg && <p className="text-xs text-muted-foreground">{testMsg}</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'audience' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-300">Estimated Recipients: {recipientCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">CRM contacts with phone numbers matching your filters.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Filter by Tag</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button onClick={() => setFilterTag('')} className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${!filterTag ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>All Tags</button>
              {TAGS.map(t => (
                <button key={t} onClick={() => setFilterTag(t === filterTag ? '' : t)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${filterTag === t ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Filter by Deal Stage</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button onClick={() => setFilterStage('')} className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${!filterStage ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>All Stages</button>
              {STAGES.map(s => (
                <button key={s} onClick={() => setFilterStage(s === filterStage ? '' : s)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${filterStage === s ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-4">
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-bold text-violet-300">AI SMS Generator</span>
            </div>
            <p className="text-xs text-muted-foreground">Generate 3 SMS variations. Click one to use it.</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Campaign Goal</label>
            <textarea value={aiGoal} onChange={e => setAiGoal(e.target.value)} rows={3}
              placeholder="Describe what you want this SMS to achieve..."
              className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Tone</label>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {TONES.map(t => (
                <button key={t} onClick={() => setAiTone(t)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold capitalize border transition-colors ${aiTone === t ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'}`}>{t}</button>
              ))}
            </div>
          </div>
          <button onClick={generateSmsWithAI} disabled={aiGenerating || !aiGoal.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-bold hover:bg-violet-500/30 transition-colors disabled:opacity-40">
            {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {aiGenerating ? 'Generating...' : 'Generate SMS Variations'}
          </button>
          {aiOutput && (
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Generated Variations</label>
              <div className="bg-muted/20 border border-border rounded-xl p-4 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                {aiOutput}
              </div>
              <button onClick={() => setMessageBody(aiOutput)} className="mt-2 text-xs text-violet-400 hover:underline">Use full output as message</button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-6 pt-4 border-t border-border">
        <button onClick={onBack} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {initial && initial.status !== 'sent' && (
          <button onClick={() => handleSend(initial.id)} disabled={sending}
            className="ml-auto flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-300 text-sm font-bold hover:bg-sky-500/30 transition-colors disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : `Send to ${recipientCount} contacts`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── SMS Inbox ─────────────────────────────────────────────────────────────────

function SmsInbox({ contacts }: { contacts: Contact[] }) {
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [activeConv, setActiveConv] = useState<SmsConversation | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api('/api/sms/conversations');
      if (r.ok) { const d = await r.json(); setConversations(d.conversations || []); }
    } catch {}
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await api(`/api/sms/conversations/${convId}/messages`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); }
    } catch {}
    setLoadingMsgs(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (activeConv) loadMessages(activeConv.id);
  }, [activeConv, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!newMsg.trim() || !activeConv) return;
    setSending(true);
    const body = newMsg.trim();
    setNewMsg('');
    try {
      const r = await api('/api/sms/send', {
        method: 'POST',
        body: JSON.stringify({ phone: activeConv.contactPhone, body, contactName: activeConv.contactName }),
      });
      const d = await r.json();
      if (r.ok) {
        setMessages(prev => [...prev, d.message]);
        setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, lastMessageAt: new Date().toISOString() } : c));
      }
    } catch {}
    setSending(false);
  }

  async function startNewConversation() {
    if (!newPhone.trim()) return;
    setSending(true);
    try {
      const contact = contacts.find(c => c.phone.replace(/\D/g, '') === newPhone.replace(/\D/g, ''));
      const r = await api('/api/sms/send', {
        method: 'POST',
        body: JSON.stringify({ phone: newPhone, body: newMsg || 'Hello!', contactName: newName || contact?.name || newPhone }),
      });
      const d = await r.json();
      if (r.ok) {
        setShowNewConv(false);
        setNewPhone('');
        setNewName('');
        setNewMsg('');
        await loadConversations();
        setActiveConv(d.conversation);
      }
    } catch {}
    setSending(false);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return (
    <div className="flex h-[600px] border border-border rounded-2xl overflow-hidden bg-background">
      {/* Conversation list */}
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> SMS Inbox
          </span>
          <button onClick={() => setShowNewConv(true)}
            className="p-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center flex-1"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 p-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No conversations yet. Send your first SMS!</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => setActiveConv(conv)}
                className={`w-full p-3 text-left border-b border-border/50 hover:bg-muted/20 transition-colors ${activeConv?.id === conv.id ? 'bg-primary/10' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{conv.contactName || conv.contactPhone}</div>
                    <div className="text-xs text-muted-foreground truncate">{conv.contactPhone}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatTime(conv.lastMessageAt)}</span>
                    {conv.unreadCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-primary text-background text-[9px] font-bold flex items-center justify-center">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col">
        {showNewConv ? (
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-foreground">New Conversation</h4>
              <button onClick={() => setShowNewConv(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Phone Number *</label>
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 555 000 1234"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                list="contact-phones" />
              <datalist id="contact-phones">
                {contacts.filter(c => c.phone).map(c => <option key={c.id} value={c.phone} label={c.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Contact Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">First Message *</label>
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={3} placeholder="Write your first message..."
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
            </div>
            <button onClick={startNewConversation} disabled={sending || !newPhone.trim() || !newMsg.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors disabled:opacity-40">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send & Start Conversation
            </button>
          </div>
        ) : activeConv ? (
          <>
            <div className="p-3 border-b border-border">
              <div className="font-semibold text-foreground">{activeConv.contactName || activeConv.contactPhone}</div>
              <div className="text-xs text-muted-foreground">{activeConv.contactPhone}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No messages yet.</div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${msg.direction === 'outbound' ? 'bg-primary/20 border border-primary/30 text-foreground rounded-br-sm' : 'bg-muted/40 border border-border text-foreground rounded-bl-sm'}`}>
                      <div>{msg.body}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{formatTime(msg.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={2} placeholder="Type a message..."
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
                className="self-end p-2.5 rounded-xl bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center p-8">
            <MessageSquare className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Select a conversation or start a new one</p>
            <button onClick={() => setShowNewConv(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors">
              <Plus className="w-4 h-4" /> New Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Campaigns() {
  const { isAuthenticated } = useAuth();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [smsCampaigns, setSmsCampaigns] = useState<SmsCampaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [emailView, setEmailView] = useState<EmailView>('list');
  const [smsView, setSmsView] = useState<SmsView>('list');
  const [editingEmail, setEditingEmail] = useState<EmailCampaign | null>(null);
  const [editingSms, setEditingSms] = useState<SmsCampaign | null>(null);

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) { setLoadingData(false); return; }
    setLoadingData(true);
    const [emailRes, smsRes, contactsRes] = await Promise.all([
      api('/api/campaigns/email').catch(() => null),
      api('/api/campaigns/sms').catch(() => null),
      api('/api/tools/contacts').catch(() => null),
    ]);
    if (emailRes?.ok) { const d = await emailRes.json(); setEmailCampaigns(d.campaigns || []); }
    if (smsRes?.ok) { const d = await smsRes.json(); setSmsCampaigns(d.campaigns || []); }
    if (contactsRes?.ok) { const d = await contactsRes.json(); setContacts(d.contacts || []); }
    setLoadingData(false);
  }, [isAuthenticated]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function deleteEmailCampaign(id: number) {
    if (!confirm('Delete this email campaign?')) return;
    await api(`/api/campaigns/email/${id}`, { method: 'DELETE' });
    setEmailCampaigns(prev => prev.filter(c => c.id !== id));
  }

  async function deleteSmsCampaign(id: number) {
    if (!confirm('Delete this SMS campaign?')) return;
    await api(`/api/campaigns/sms/${id}`, { method: 'DELETE' });
    setSmsCampaigns(prev => prev.filter(c => c.id !== id));
  }

  const totalEmailSent = emailCampaigns.reduce((a, c) => a + c.totalSent, 0);
  const totalSmsSent = smsCampaigns.reduce((a, c) => a + c.totalSent, 0);
  const avgOpenRate = emailCampaigns.length
    ? Math.round(emailCampaigns.reduce((a, c) => a + (c.totalSent > 0 ? (c.totalOpened / c.totalSent) * 100 : 0), 0) / emailCampaigns.length)
    : 0;

  const TABS = [
    { id: 'dashboard' as Tab, label: 'Dashboard', icon: BarChart2 },
    { id: 'email-campaigns' as Tab, label: 'Email', icon: Mail },
    { id: 'sms-campaigns' as Tab, label: 'SMS Campaigns', icon: Megaphone },
    { id: 'sms-inbox' as Tab, label: 'SMS Inbox', icon: Inbox },
  ];

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to manage your campaigns." />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-primary/8 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-blue-500/8 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Campaign Manager</h2>
            </div>
            <p className="text-sm text-muted-foreground ml-12">Email & SMS campaigns, direct messaging, and delivery analytics.</p>
          </div>
          <button onClick={loadAll} className="p-2 rounded-xl hover:bg-muted/30 text-muted-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-muted/20 rounded-xl p-1 border border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap uppercase tracking-wider transition-colors min-w-[100px] ${tab === t.id ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Email Campaigns" value={emailCampaigns.length} sub={`${emailCampaigns.filter(c => c.status === 'sent').length} sent`} />
              <MetricCard label="Emails Sent" value={totalEmailSent.toLocaleString()} sub={`Avg open rate ${avgOpenRate}%`} />
              <MetricCard label="SMS Campaigns" value={smsCampaigns.length} sub={`${smsCampaigns.filter(c => c.status === 'sent').length} sent`} />
              <MetricCard label="SMS Sent" value={totalSmsSent.toLocaleString()} sub="Total messages delivered" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Mail className="w-4 h-4 text-blue-400" /> Recent Email Campaigns</h3>
                  <button onClick={() => setTab('email-campaigns')} className="text-xs text-primary hover:underline">View all</button>
                </div>
                {emailCampaigns.length === 0 ? (
                  <div className="bg-muted/20 border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No email campaigns yet.</div>
                ) : (
                  <div className="space-y-2">
                    {emailCampaigns.slice(0, 5).map(c => (
                      <div key={c.id} className="bg-muted/20 border border-border rounded-xl p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.subject || '(no subject)'}</div>
                        </div>
                        <StatusBadge status={c.status} />
                        {c.status === 'sent' && <span className="text-xs text-muted-foreground">{c.totalSent} sent</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-sky-400" /> Recent SMS Campaigns</h3>
                  <button onClick={() => setTab('sms-campaigns')} className="text-xs text-primary hover:underline">View all</button>
                </div>
                {smsCampaigns.length === 0 ? (
                  <div className="bg-muted/20 border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">No SMS campaigns yet.</div>
                ) : (
                  <div className="space-y-2">
                    {smsCampaigns.slice(0, 5).map(c => (
                      <div key={c.id} className="bg-muted/20 border border-border rounded-xl p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{c.messageBody || '(no message)'}</div>
                        </div>
                        <StatusBadge status={c.status} />
                        {c.status === 'sent' && <span className="text-xs text-muted-foreground">{c.totalSent} sent</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Campaigns */}
        {tab === 'email-campaigns' && (
          <div>
            {emailView === 'list' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-foreground">Email Campaigns</h3>
                  <button onClick={() => { setEditingEmail(null); setEmailView('compose'); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors">
                    <Plus className="w-4 h-4" /> New Campaign
                  </button>
                </div>
                {loadingData ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : emailCampaigns.length === 0 ? (
                  <div className="text-center py-16">
                    <Mail className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No email campaigns yet. Create your first one!</p>
                    <button onClick={() => { setEditingEmail(null); setEmailView('compose'); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors mx-auto">
                      <Plus className="w-4 h-4" /> Create Campaign
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailCampaigns.map(c => (
                      <div key={c.id} className="bg-muted/20 border border-border rounded-xl p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                              <span className="font-semibold text-foreground">{c.name}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">{c.subject || '(no subject)'}</div>
                            {c.status === 'sent' && (
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <span>{c.totalSent} sent</span>
                                {c.totalOpened > 0 && <span className="text-sky-400">{Math.round((c.totalOpened / c.totalSent) * 100)}% opened</span>}
                                {c.totalClicked > 0 && <span className="text-blue-400">{Math.round((c.totalClicked / c.totalSent) * 100)}% clicked</span>}
                                {c.totalBounced > 0 && <span className="text-red-400">{c.totalBounced} bounced</span>}
                                {c.totalUnsubscribed > 0 && <span className="text-amber-400">{c.totalUnsubscribed} unsub</span>}
                              </div>
                            )}
                            {c.sentAt && <div className="text-xs text-muted-foreground mt-1">Sent {new Date(c.sentAt).toLocaleDateString()}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.status !== 'sent' && (
                              <button onClick={() => { setEditingEmail(c); setEmailView('compose'); }}
                                className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors">
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => deleteEmailCampaign(c.id)}
                              className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {emailView === 'compose' && (
              <EmailCompose
                initial={editingEmail}
                contacts={contacts}
                onSave={(c) => {
                  setEmailCampaigns(prev => {
                    const idx = prev.findIndex(x => x.id === c.id);
                    return idx >= 0 ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev];
                  });
                  setEditingEmail(c);
                }}
                onBack={() => { setEmailView('list'); setEditingEmail(null); }}
              />
            )}
          </div>
        )}

        {/* SMS Campaigns */}
        {tab === 'sms-campaigns' && (
          <div>
            {smsView === 'list' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-foreground">SMS Campaigns</h3>
                  <button onClick={() => { setEditingSms(null); setSmsView('compose'); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors">
                    <Plus className="w-4 h-4" /> New Campaign
                  </button>
                </div>
                {loadingData ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : smsCampaigns.length === 0 ? (
                  <div className="text-center py-16">
                    <MessageSquare className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No SMS campaigns yet. Create your first one!</p>
                    <button onClick={() => { setEditingSms(null); setSmsView('compose'); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/30 transition-colors mx-auto">
                      <Plus className="w-4 h-4" /> Create Campaign
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {smsCampaigns.map(c => (
                      <div key={c.id} className="bg-muted/20 border border-border rounded-xl p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                              <span className="font-semibold text-foreground">{c.name}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="text-sm text-muted-foreground mb-2 line-clamp-2">{c.messageBody || '(no message)'}</div>
                            {c.status === 'sent' && (
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <span>{c.totalSent} sent</span>
                                {c.totalDelivered > 0 && <span className="text-sky-400">{c.totalDelivered} delivered</span>}
                                {c.totalFailed > 0 && <span className="text-red-400">{c.totalFailed} failed</span>}
                                {c.totalReplied > 0 && <span className="text-blue-400">{c.totalReplied} replied</span>}
                              </div>
                            )}
                            {c.sentAt && <div className="text-xs text-muted-foreground mt-1">Sent {new Date(c.sentAt).toLocaleDateString()}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.status !== 'sent' && (
                              <button onClick={() => { setEditingSms(c); setSmsView('compose'); }}
                                className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors">
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => deleteSmsCampaign(c.id)}
                              className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {smsView === 'compose' && (
              <SmsCompose
                initial={editingSms}
                contacts={contacts}
                onSave={(c) => {
                  setSmsCampaigns(prev => {
                    const idx = prev.findIndex(x => x.id === c.id);
                    return idx >= 0 ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev];
                  });
                  setEditingSms(c);
                }}
                onBack={() => { setSmsView('list'); setEditingSms(null); }}
              />
            )}
          </div>
        )}

        {/* SMS Inbox */}
        {tab === 'sms-inbox' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-sky-400" /> Direct SMS Inbox
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Send and receive individual SMS messages with your contacts.</p>
              </div>
            </div>
            <SmsInbox contacts={contacts} />
          </div>
        )}
      </main>
    </div>
  );
}
