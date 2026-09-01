import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { useBoomerMode } from '@/hooks/use-mobile';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketCategory = 'bug' | 'support' | 'feature_request' | 'billing' | 'other';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Ticket {
  id: number;
  orgId: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
  status: TicketStatus;
  assignedToUserId: string | null;
  submittedByEmail: string | null;
  submittedByName: string | null;
  submittedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketComment {
  id: number;
  ticketId: number;
  userId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

interface OrgMember {
  orgId: number;
  userId: string;
  role: string;
  status: string;
  inviteEmail: string | null;
}

interface OrgInvite {
  id: number;
  orgId: number;
  invitedByUserId: string;
  inviteEmail: string | null;
  inviteUsername: string | null;
  token: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface Org {
  id: number;
  name: string;
  ownerUserId: string;
}

interface Summary {
  open: number;
  assignedToMe: number;
  resolvedToday: number;
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: '#38bdf8',
  in_progress: '#00ccff',
  resolved: '#7dd3fc',
  closed: 'rgba(56,189,248,0.3)',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'rgba(56,189,248,0.4)',
  medium: '#38bdf8',
  high: '#ff8800',
  urgent: '#ff4444',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: 'BUG',
  support: 'SUPPORT',
  feature_request: 'FEATURE REQ',
  billing: 'BILLING',
  other: 'OTHER',
};

function StatusBadge({ status, ST }: { status: TicketStatus; ST: React.CSSProperties }) {
  return (
    <span style={{
      ...ST,
      fontSize: '.55rem',
      color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}40`,
      background: `${STATUS_COLORS[status]}10`,
      padding: '2px 6px',
      borderRadius: 2,
      letterSpacing: '.1em',
    }}>
      {status.replace('_', ' ').toUpperCase()}
    </span>
  );
}

function PriorityBadge({ priority, ST }: { priority: TicketPriority; ST: React.CSSProperties }) {
  return (
    <span style={{
      ...ST,
      fontSize: '.5rem',
      color: PRIORITY_COLORS[priority],
      border: `1px solid ${PRIORITY_COLORS[priority]}40`,
      background: `${PRIORITY_COLORS[priority]}10`,
      padding: '2px 6px',
      borderRadius: 2,
      letterSpacing: '.08em',
    }}>
      {priority.toUpperCase()}
    </span>
  );
}

function TicketDetail({
  ticket,
  comments,
  orgMembers,
  currentUserId,
  onUpdate,
  onBack,
  ST,
  VT,
}: {
  ticket: Ticket;
  comments: TicketComment[];
  orgMembers: OrgMember[];
  currentUserId: string;
  onUpdate: () => void;
  onBack: () => void;
  ST: React.CSSProperties;
  VT: React.CSSProperties;
}) {
  const [localTicket, setLocalTicket] = useState(ticket);
  const [localComments, setLocalComments] = useState(comments);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState('');

  const patch = async (updates: Record<string, unknown>) => {
    setUpdating(true);
    try {
      const r = await apiFetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.ticket) { setLocalTicket(d.ticket); onUpdate(); setMsg('Updated.'); setTimeout(() => setMsg(''), 2000); }
      else setMsg(d.error ?? 'Error updating ticket');
    } catch { setMsg('Network error'); }
    setUpdating(false);
  };

  const postComment = async () => {
    if (!commentBody.trim()) return;
    setPosting(true);
    try {
      const r = await apiFetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim(), isInternal: true }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.comment) { setLocalComments(prev => [...prev, d.comment]); setCommentBody(''); }
      else setMsg(d.error ?? 'Error posting comment');
    } catch { setMsg('Network error'); }
    setPosting(false);
  };

  const activeMembers = orgMembers.filter(m => m.status === 'active');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button onClick={onBack} style={{ ...ST, background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.5)', padding: '.3rem .8rem', cursor: 'pointer', fontSize: '.55rem', marginBottom: '1rem', letterSpacing: '.1em' }}>
        ← BACK TO LIST
      </button>

      <div style={{ border: '1px solid rgba(56,189,248,.15)', padding: '1.5rem', background: 'rgba(6,13,20,.7)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>
              TICKET #{localTicket.id}
            </div>
            <div style={{ ...VT, fontSize: '1.6rem', color: '#38bdf8', letterSpacing: '.05em', marginBottom: '.4rem' }}>
              {localTicket.subject}
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <StatusBadge status={localTicket.status} ST={ST} />
              <PriorityBadge priority={localTicket.priority} ST={ST} />
              <span style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.4)', border: '1px solid rgba(56,189,248,.1)', padding: '2px 6px', borderRadius: 2, letterSpacing: '.08em' }}>
                {CATEGORY_LABELS[localTicket.category]}
              </span>
            </div>
          </div>
          <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.25)', textAlign: 'right' }}>
            <div>{new Date(localTicket.createdAt).toLocaleString()}</div>
            {localTicket.submittedByName && <div style={{ marginTop: '.2rem' }}>by {localTicket.submittedByName}</div>}
            {localTicket.submittedByEmail && <div>{localTicket.submittedByEmail}</div>}
          </div>
        </div>

        <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.7)', background: 'rgba(56,189,248,.04)', border: '1px solid rgba(56,189,248,.08)', padding: '1rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: '1rem' }}>
          {localTicket.description}
        </div>

        {msg && <div style={{ ...ST, fontSize: '.6rem', color: '#38bdf8', marginBottom: '.5rem' }}>{msg}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem' }}>
          <div>
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>STATUS</div>
            <select
              value={localTicket.status}
              onChange={e => patch({ status: e.target.value })}
              disabled={updating}
              style={{ ...ST, width: '100%', background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.3rem .5rem', fontSize: '.6rem', cursor: 'pointer' }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>PRIORITY</div>
            <select
              value={localTicket.priority}
              onChange={e => patch({ priority: e.target.value })}
              disabled={updating}
              style={{ ...ST, width: '100%', background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.3rem .5rem', fontSize: '.6rem', cursor: 'pointer' }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>ASSIGNED TO</div>
            <select
              value={localTicket.assignedToUserId ?? ''}
              onChange={e => patch({ assignedToUserId: e.target.value || null })}
              disabled={updating}
              style={{ ...ST, width: '100%', background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.3rem .5rem', fontSize: '.6rem', cursor: 'pointer' }}
            >
              <option value="">Unassigned</option>
              {activeMembers.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.userId === currentUserId ? 'Me' : (m.inviteEmail ?? m.userId.slice(0, 8))}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid rgba(56,189,248,.1)', padding: '1.5rem', background: 'rgba(6,13,20,.5)' }}>
        <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.12em', marginBottom: '1rem' }}>INTERNAL NOTES ({localComments.length})</div>

        {localComments.length === 0 && (
          <div style={{ ...ST, fontSize: '.6rem', color: 'rgba(56,189,248,.2)', marginBottom: '1rem' }}>No notes yet.</div>
        )}

        <div style={{ display: 'grid', gap: '.75rem', marginBottom: '1.25rem' }}>
          {localComments.map(c => (
            <div key={c.id} style={{ border: '1px solid rgba(56,189,248,.08)', padding: '.75rem', background: 'rgba(56,189,248,.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <span style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.4)' }}>
                  {c.userId === currentUserId ? 'YOU' : c.userId.slice(0, 8)}
                </span>
                <span style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.25)' }}>
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ ...ST, fontSize: '.65rem', color: 'rgba(56,189,248,.8)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '.5rem' }}>
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            placeholder="Add internal note..."
            rows={3}
            style={{ ...ST, width: '100%', background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', fontSize: '.65rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
          <button
            onClick={postComment}
            disabled={posting || !commentBody.trim()}
            style={{ ...ST, background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.2)', color: '#38bdf8', padding: '.4rem 1rem', cursor: posting ? 'wait' : 'pointer', fontSize: '.6rem', letterSpacing: '.1em', opacity: !commentBody.trim() ? 0.4 : 1 }}
          >
            {posting ? 'POSTING...' : 'ADD NOTE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmitTicketModal({ orgId, onClose, onSubmitted, ST, VT }: { orgId: number; onClose: () => void; onSubmitted: () => void; ST: React.CSSProperties; VT: React.CSSProperties }) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('support');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!subject.trim() || !description.trim()) { setError('Subject and description required'); return; }
    setSubmitting(true); setError('');
    try {
      const r = await apiFetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), category, priority, description: description.trim(), orgId }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.ticket) { onSubmitted(); onClose(); }
      else setError(d.error ?? 'Failed to submit ticket');
    } catch { setError('Network error'); }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#060d14', border: '1px solid rgba(56,189,248,.3)', padding: '2rem', width: '100%', maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ ...VT, fontSize: '1.4rem', color: '#38bdf8', letterSpacing: '.15em' }}>NEW TICKET</div>
          <button onClick={onClose} style={{ ...ST, background: 'transparent', border: 'none', color: 'rgba(56,189,248,.4)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
        {error && <div style={{ ...ST, fontSize: '.6rem', color: '#ff6666', background: 'rgba(255,0,0,.05)', border: '1px solid rgba(255,80,80,.2)', padding: '.5rem', marginBottom: '1rem' }}>{error}</div>}
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>SUBJECT</div>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief description of the issue..."
              style={{ ...ST, width: '100%', background: '#000', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', fontSize: '.7rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>CATEGORY</div>
              <select value={category} onChange={e => setCategory(e.target.value as TicketCategory)}
                style={{ ...ST, width: '100%', background: '#000', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', fontSize: '.65rem', cursor: 'pointer' }}>
                <option value="bug">Bug</option>
                <option value="support">Support</option>
                <option value="feature_request">Feature Request</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>PRIORITY</div>
              <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}
                style={{ ...ST, width: '100%', background: '#000', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', fontSize: '.65rem', cursor: 'pointer' }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginBottom: '.3rem' }}>DESCRIPTION</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detailed description..." rows={5}
              style={{ ...ST, width: '100%', background: '#000', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.5rem', fontSize: '.65rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={submit} disabled={submitting}
            style={{ ...ST, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', padding: '.6rem 1.5rem', cursor: submitting ? 'wait' : 'pointer', fontSize: '.65rem', letterSpacing: '.15em' }}>
            {submitting ? 'SUBMITTING...' : 'SUBMIT TICKET'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvitePanel({ orgId, orgName, ST }: { orgId: number; orgName: string; ST: React.CSSProperties }) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const fetchInvites = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/orgs/${orgId}/invites`, { credentials: 'include' });
      const d = await r.json();
      if (d.invites) setInvites(d.invites);
    } catch { }
  }, [orgId]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true); setError(''); setMsg('');
    try {
      const r = await apiFetch(`/api/orgs/${orgId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
        credentials: 'include',
      });
      const d = await r.json();
      if (d.invite) {
        setMsg(`Invite sent! Share this link: ${d.inviteUrl}`);
        setInviteEmail('');
        fetchInvites();
      } else {
        setError(d.error ?? 'Failed to send invite');
      }
    } catch { setError('Network error'); }
    setSending(false);
  };

  const pendingInvites = invites.filter(i => i.status === 'pending');
  const acceptedInvites = invites.filter(i => i.status === 'accepted');

  return (
    <div style={{ border: '1px solid rgba(56,189,248,.1)', padding: '1.5rem', background: 'rgba(6,13,20,.5)' }}>
      <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.12em', marginBottom: '1rem' }}>INVITE EMPLOYEE TO {orgName}</div>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <input
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendInvite()}
          placeholder="employee@company.com"
          type="email"
          style={{ ...ST, flex: 1, background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.4rem .6rem', fontSize: '.65rem', outline: 'none' }}
        />
        <button
          onClick={sendInvite}
          disabled={sending || !inviteEmail.trim()}
          style={{ ...ST, background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)', color: '#38bdf8', padding: '.4rem 1rem', cursor: 'pointer', fontSize: '.6rem', letterSpacing: '.1em', opacity: !inviteEmail.trim() ? 0.4 : 1 }}
        >
          {sending ? '...' : 'SEND INVITE'}
        </button>
      </div>

      {error && <div style={{ ...ST, fontSize: '.6rem', color: '#ff6666', marginBottom: '.75rem' }}>{error}</div>}
      {msg && (
        <div style={{ ...ST, fontSize: '.55rem', color: '#38bdf8', background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.15)', padding: '.5rem', marginBottom: '1rem', wordBreak: 'break-all' }}>
          {msg}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>PENDING ({pendingInvites.length})</div>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.05)' }}>
              {inv.inviteEmail ?? inv.inviteUsername ?? '—'} · {new Date(inv.expiresAt) < new Date() ? <span style={{ color: '#ff6666' }}>EXPIRED</span> : 'PENDING'}
            </div>
          ))}
        </div>
      )}

      {acceptedInvites.length > 0 && (
        <div>
          <div style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.1em', marginBottom: '.4rem' }}>ACCEPTED ({acceptedInvites.length})</div>
          {acceptedInvites.map(inv => (
            <div key={inv.id} style={{ ...ST, fontSize: '.55rem', color: '#38bdf8', padding: '.3rem 0', borderBottom: '1px solid rgba(56,189,248,.05)' }}>
              {inv.inviteEmail ?? inv.inviteUsername ?? '—'} · <span style={{ color: '#7dd3fc' }}>JOINED</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type View = 'list' | 'detail' | 'invite' | 'submit';

export default function AdminTickets({ params }: { params?: { id?: string } }) {
  const [boomerMode] = useBoomerMode();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const ST: React.CSSProperties = boomerMode ? {} : { fontFamily: "var(--font-sans)" };
  const VT: React.CSSProperties = boomerMode ? {} : { fontFamily: "var(--font-sans)" };

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [summary, setSummary] = useState<Summary>({ open: 0, assignedToMe: 0, resolvedToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [view, setView] = useState<View>('list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedComments, setSelectedComments] = useState<TicketComment[]>([]);
  const [selectedOrgMembers, setSelectedOrgMembers] = useState<OrgMember[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterAssignedToMe, setFilterAssignedToMe] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams();
      if (filterStatus) searchParams.set('status', filterStatus);
      if (filterCategory) searchParams.set('category', filterCategory);
      if (filterAssignedToMe) searchParams.set('assignedTo', 'me');
      const r = await apiFetch(`/api/tickets?${searchParams.toString()}`, { credentials: 'include' });
      if (r.status === 403) { setError('You must be a member of an organization to access the admin panel.'); setLoading(false); return; }
      const d = await r.json();
      if (d.tickets) {
        setTickets(d.tickets);
        setOrg(d.org);
        setSummary(d.summary);
      } else {
        setError(d.error ?? 'Failed to load tickets');
      }
    } catch { setError('Network error'); }
    setLoading(false);
  }, [filterStatus, filterCategory, filterAssignedToMe]);

  useEffect(() => {
    if (isAuthenticated) fetchTickets();
  }, [isAuthenticated, fetchTickets]);

  const openTicketById = useCallback(async (ticketId: number) => {
    setView('detail');
    try {
      const r = await apiFetch(`/api/tickets/${ticketId}`, { credentials: 'include' });
      const d = await r.json();
      if (d.ticket) {
        setSelectedTicket(d.ticket);
        setSelectedComments(d.comments ?? []);
        setSelectedOrgMembers(d.orgMembers ?? []);
      }
    } catch { }
  }, []);

  useEffect(() => {
    const urlTicketId = params?.id ? parseInt(params.id) : NaN;
    if (!isNaN(urlTicketId) && isAuthenticated) {
      openTicketById(urlTicketId);
    }
  }, [params?.id, isAuthenticated, openTicketById]);

  const openTicketDetail = async (ticket: Ticket) => {
    navigate(`/admin/tickets/${ticket.id}`);
    await openTicketById(ticket.id);
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#060d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...ST, color: 'rgba(56,189,248,.4)', fontSize: '.8rem', letterSpacing: '.2em' }}>LOADING...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access the admin panel." />;
  }

  const isOwner = org ? org.ownerUserId === user?.id : false;

  return (
    <div style={{ minHeight: '100vh', background: '#060d14', color: '#38bdf8', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div>
            <div style={{ ...VT, fontSize: '2.2rem', letterSpacing: '.2em', color: '#38bdf8' }}>ADMIN PANEL</div>
            {org && <div style={{ ...ST, fontSize: '.5rem', color: 'rgba(56,189,248,.35)', letterSpacing: '.1em', marginTop: '.2rem' }}>{org.name} · {isOwner ? 'OWNER' : 'EMPLOYEE'}</div>}
          </div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {view !== 'list' && (
              <button onClick={() => setView('list')} style={{ ...ST, background: 'transparent', border: '1px solid rgba(56,189,248,.2)', color: 'rgba(56,189,248,.5)', padding: '.35rem .8rem', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.1em' }}>
                TICKETS
              </button>
            )}
            {isOwner && org && view !== 'invite' && (
              <button onClick={() => setView('invite')} style={{ ...ST, background: 'rgba(0,200,255,.06)', border: '1px solid rgba(0,200,255,.25)', color: '#00ccff', padding: '.35rem .8rem', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.1em' }}>
                INVITE EMPLOYEE
              </button>
            )}
            {org && (
              <button onClick={() => setShowSubmitModal(true)} style={{ ...ST, background: 'rgba(255,0,255,.06)', border: '1px solid rgba(255,0,255,.25)', color: '#ff88ff', padding: '.35rem .8rem', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.1em' }}>
                + NEW TICKET
              </button>
            )}
            <button onClick={() => navigate('/')} style={{ ...ST, background: 'transparent', border: '1px solid rgba(56,189,248,.15)', color: 'rgba(56,189,248,.3)', padding: '.35rem .8rem', cursor: 'pointer', fontSize: '.55rem', letterSpacing: '.1em' }}>
              ← BACK
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.3), transparent)', marginBottom: '1.5rem' }} />

        {error && (
          <div style={{ ...ST, fontSize: '.65rem', color: '#ff6666', background: 'rgba(255,0,0,.05)', border: '1px solid rgba(255,80,80,.2)', padding: '1rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {!error && !loading && !org && (
          <div style={{ ...ST, fontSize: '.7rem', color: 'rgba(56,189,248,.4)', padding: '2rem', textAlign: 'center', border: '1px solid rgba(56,189,248,.1)' }}>
            You are not a member of any organization. Ask your company owner to invite you.
          </div>
        )}

        {org && (
          <>
            {view === 'list' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  {[
                    { label: 'OPEN', value: summary.open, color: '#38bdf8' },
                    { label: 'ASSIGNED TO ME', value: summary.assignedToMe, color: '#00ccff' },
                    { label: 'RESOLVED TODAY', value: summary.resolvedToday, color: '#7dd3fc' },
                  ].map(card => (
                    <div key={card.label} style={{ border: `1px solid ${card.color}20`, padding: '1rem', background: `${card.color}05` }}>
                      <div style={{ ...ST, fontSize: '.45rem', color: `${card.color}60`, letterSpacing: '.12em', marginBottom: '.4rem' }}>{card.label}</div>
                      <div style={{ ...VT, fontSize: '2.5rem', color: card.color, lineHeight: 1 }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>FILTER:</span>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    style={{ ...ST, background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.3rem .5rem', fontSize: '.6rem', cursor: 'pointer' }}>
                    <option value="">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                    style={{ ...ST, background: '#060d14', color: '#38bdf8', border: '1px solid rgba(56,189,248,.2)', padding: '.3rem .5rem', fontSize: '.6rem', cursor: 'pointer' }}>
                    <option value="">All Categories</option>
                    <option value="bug">Bug</option>
                    <option value="support">Support</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="billing">Billing</option>
                    <option value="other">Other</option>
                  </select>
                  <label style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.5)', display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={filterAssignedToMe} onChange={e => setFilterAssignedToMe(e.target.checked)} />
                    Assigned to me
                  </label>
                </div>

                {loading ? (
                  <div style={{ ...ST, color: 'rgba(56,189,248,.3)', fontSize: '.7rem', padding: '2rem', textAlign: 'center' }}>LOADING TICKETS...</div>
                ) : tickets.length === 0 ? (
                  <div style={{ ...ST, fontSize: '.65rem', color: 'rgba(56,189,248,.3)', padding: '2rem', textAlign: 'center', border: '1px solid rgba(56,189,248,.08)' }}>
                    No tickets found.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '.75rem' }}>
                    {tickets.map(t => (
                      <div
                        key={t.id}
                        onClick={() => openTicketDetail(t)}
                        style={{ border: '1px solid rgba(56,189,248,.1)', padding: '1rem', background: 'rgba(6,13,20,.6)', cursor: 'pointer', transition: 'border-color .2s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(56,189,248,.3)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(56,189,248,.1)')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.3rem' }}>
                              <span style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.3)' }}>#{t.id}</span>
                              <StatusBadge status={t.status} ST={ST} />
                              <PriorityBadge priority={t.priority} ST={ST} />
                              <span style={{ ...ST, fontSize: '.45rem', color: 'rgba(56,189,248,.35)', border: '1px solid rgba(56,189,248,.1)', padding: '1px 5px', borderRadius: 2 }}>
                                {CATEGORY_LABELS[t.category]}
                              </span>
                            </div>
                            <div style={{ ...ST, fontSize: '.75rem', color: '#38bdf8', marginBottom: '.2rem' }}>{t.subject}</div>
                            <div style={{ ...ST, fontSize: '.55rem', color: 'rgba(56,189,248,.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                              {t.description}
                            </div>
                          </div>
                          <div style={{ ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.25)', textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                            <div>{new Date(t.createdAt).toLocaleDateString()}</div>
                            {t.submittedByName && <div style={{ marginTop: '.2rem' }}>{t.submittedByName}</div>}
                            {t.assignedToUserId && <div style={{ color: '#00ccff', marginTop: '.2rem' }}>ASSIGNED</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === 'detail' && selectedTicket && (
              <TicketDetail
                ticket={selectedTicket}
                comments={selectedComments}
                orgMembers={selectedOrgMembers}
                currentUserId={user?.id ?? ''}
                onUpdate={fetchTickets}
                onBack={() => { setView('list'); setSelectedTicket(null); }}
                ST={ST}
                VT={VT}
              />
            )}

            {view === 'invite' && isOwner && (
              <InvitePanel orgId={org.id} orgName={org.name} ST={ST} />
            )}
          </>
        )}

        {showSubmitModal && org && (
          <SubmitTicketModal
            orgId={org.id}
            onClose={() => setShowSubmitModal(false)}
            onSubmitted={fetchTickets}
            ST={ST}
            VT={VT}
          />
        )}

        <div style={{ marginTop: '2rem', ...ST, fontSize: '.4rem', color: 'rgba(56,189,248,.1)', letterSpacing: '.1em' }}>
          SALARYMAN ADMIN PANEL · TICKET MANAGEMENT SYSTEM
        </div>
      </div>
    </div>
  );
}
