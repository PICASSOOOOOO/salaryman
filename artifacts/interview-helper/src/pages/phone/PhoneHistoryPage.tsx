import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Clock, Search, Phone, Mail, Calendar, ChevronDown, ChevronRight, X, ArrowUpRight, ArrowDownLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, purple, formatPhone, formatDuration,
  addActiveCall,
  type CallRecord,
} from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';

export default function PhoneHistoryPage() {
  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';

  const [history, setHistory] = useState<CallRecord[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [followupCallSid, setFollowupCallSid] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState({ title: '', startAt: '', endAt: '' });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState('');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const fetchHistory = useCallback(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    setLoading(true);
    fetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}${q}`), { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) { rawNavigate('/pricing'); return; }
        if (r.ok) { const d = await r.json(); if (d?.calls) setHistory(d.calls); }
        else { setError(`Failed to load history (${r.status})`); }
      })
      .catch(() => setError('Network error loading call history'))
      .finally(() => setLoading(false));
  }, [userId, apiUrl, search, rawNavigate]);

  useEffect(() => { fetchHistory(); }, []);

  const callSingle = async (phone: string, name?: string) => {
    setError('');
    try {
      const r = await fetch(apiUrl('twilio/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientNumber: phone, userId, callerName: user?.firstName, contactName: name }),
      });
      const d = await r.json();
      if (r.status === 403) { setError(d.error || 'Access denied'); rawNavigate('/pricing'); return; }
      if (!r.ok) { setError(d.error || `Call failed (${r.status})`); return; }
      if (d.callSid) {
        addActiveCall({ callSid: d.callSid, phone, name: name ?? phone, status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound' });
      }
      navigate('/phone/active');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error — could not place call'); }
  };

  const emailCallSummary = async (callId: number) => {
    try {
      const r = await fetch(apiUrl(`twilio/history/${callId}/email-summary`), { method: 'POST', credentials: 'include' });
      if (r.status === 403) { rawNavigate('/pricing'); return; }
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Failed to send email summary'); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error — could not send email summary'); }
  };

  const scheduleFollowup = async () => {
    if (!followupCallSid || !followupForm.title || !followupForm.startAt) return;
    setError('');
    try {
      const startAt = new Date(followupForm.startAt);
      const endAt = followupForm.endAt ? new Date(followupForm.endAt) : new Date(startAt.getTime() + 30 * 60 * 1000);
      const r = await fetch(apiUrl(`twilio/call/${followupCallSid}/schedule-followup`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: followupForm.title, startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      if (r.status === 403) { rawNavigate('/pricing'); return; }
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Failed to schedule follow-up'); return; }
      setFollowupCallSid(null);
      setFollowupForm({ title: '', startAt: '', endAt: '' });
      fetchHistory();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Network error — could not schedule follow-up'); }
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return history;
    return history.filter(h => {
      if (statusFilter === 'completed') return h.status === 'completed';
      if (statusFilter === 'failed') return ['failed', 'busy', 'no-answer'].includes(h.status);
      if (statusFilter === 'inbound') return h.direction === 'inbound';
      return true;
    });
  }, [history, statusFilter]);

  const stats = useMemo(() => {
    const total = history.length;
    const completed = history.filter(h => h.status === 'completed').length;
    const failed = history.filter(h => ['failed', 'busy', 'no-answer'].includes(h.status)).length;
    const totalDuration = history.reduce((a, h) => a + (h.durationSeconds ?? 0), 0);
    const avgDuration = completed > 0 ? Math.round(totalDuration / completed) : 0;
    const inbound = history.filter(h => h.direction === 'inbound').length;
    const withTranscript = history.filter(h => h.transcript).length;
    return { total, completed, failed, totalDuration, avgDuration, inbound, withTranscript };
  }, [history]);

  const statusColor = (status: string) => {
    if (status === 'completed') return crt(0.6);
    if (['failed', 'busy', 'no-answer'].includes(status)) return red(0.7);
    return amber(0.6);
  };

  const FILTERS = [
    { key: 'all', label: 'ALL' },
    { key: 'completed', label: 'COMPLETED' },
    { key: 'failed', label: 'FAILED' },
    { key: 'inbound', label: 'INBOUND' },
  ];

  return (
    <PhonePageLayout
      title="CALL LOG"
      subtitle="Searchable call history with transcripts, AI summaries, and follow-up scheduling"
      icon={<Clock size={24} style={{ color: crt(0.8) }} />}
      statusLine={<span style={{ color: crt(0.25) }}>{stats.total} RECORDS</span>}
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL CALLS" value={stats.total} />
        <StatBlock label="COMPLETED" value={stats.completed} color={crt} sub={`${stats.total ? Math.round(stats.completed / stats.total * 100) : 0}%`} />
        <StatBlock label="FAILED" value={stats.failed} color={stats.failed > 0 ? red : undefined} />
        <StatBlock label="INBOUND" value={stats.inbound} color={blue} />
        <StatBlock label="AVG DURATION" value={formatDuration(stats.avgDuration)} color={amber} />
        <StatBlock label="TRANSCRIBED" value={stats.withTranscript} color={purple} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: crt(0.3) }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transcripts, names, numbers..."
            style={{ ...INPUT_STYLE, paddingLeft: 34 }}
            onKeyDown={e => e.key === 'Enter' && fetchHistory()}
          />
        </div>
        <PhoneBtn onClick={fetchHistory} size="sm">
          <Search size={11} /> SEARCH
        </PhoneBtn>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '5px 10px', fontSize: '0.45rem', letterSpacing: '0.1em',
                background: statusFilter === f.key ? crt(0.08) : 'transparent',
                border: `1px solid ${statusFilter === f.key ? crt(0.25) : crt(0.08)}`,
                color: statusFilter === f.key ? crt(0.8) : crt(0.3),
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <PhoneCard>
        <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>CALL HISTORY</span>
          <span style={{ color: crt(0.4), fontVariantNumeric: 'tabular-nums' }}>{filtered.length} RECORDS</span>
        </PhoneCardHeader>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: crt(0.3), letterSpacing: '0.15em' }}>
            <div style={{ marginBottom: 8 }}>LOADING CALL HISTORY...</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: crt(0.3), animation: `pulse 1s infinite ${i * 0.3}s` }} />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState message="NO CALL HISTORY FOUND" icon={<Clock size={32} />} />
        ) : (
          filtered.map(h => (
            <div key={h.id} style={{ borderBottom: `1px solid ${crt(0.05)}` }}>
              <div
                onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.12s' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(0,12,0,0.5)',
                  border: `1px solid ${crt(0.08)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {h.direction === 'inbound'
                    ? <ArrowDownLeft size={16} style={{ color: blue(0.6) }} />
                    : <ArrowUpRight size={16} style={{ color: crt(0.5) }} />
                  }
                  <div style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 8, height: 8, borderRadius: '50%',
                    background: statusColor(h.status),
                    border: '2px solid rgba(0,10,0,0.8)',
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: crt(0.85), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {h.callerName || formatPhone(h.recipientNumber)}
                  </div>
                  <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{formatPhone(h.recipientNumber)}</span>
                    <span style={{ color: crt(0.12) }}>·</span>
                    <span style={{
                      padding: '1px 5px', borderRadius: 3,
                      background: h.status === 'completed' ? crt(0.05) : ['failed', 'busy', 'no-answer'].includes(h.status) ? red(0.05) : amber(0.05),
                      border: `1px solid ${statusColor(h.status).replace(/[^,]+$/, '0.2)')}`,
                      color: statusColor(h.status),
                    }}>
                      {h.status.toUpperCase()}
                    </span>
                    {h.durationSeconds != null && h.durationSeconds > 0 && (
                      <>
                        <span style={{ color: crt(0.12) }}>·</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(h.durationSeconds)}</span>
                      </>
                    )}
                    <span style={{ color: crt(0.12) }}>·</span>
                    <span>{new Date(h.startedAt).toLocaleDateString()} {new Date(h.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {h.direction === 'inbound' && <span style={{ color: blue(0.6), padding: '1px 4px', borderRadius: 3, background: blue(0.05), border: `1px solid ${blue(0.15)}` }}>↙ INBOUND</span>}
                    {h.callType && h.callType !== 'single' && <span style={{ color: amber(0.6) }}>[{h.callType}]</span>}
                    {h.transcript && <span style={{ color: purple(0.5) }}>📝</span>}
                  </div>
                  {h.summary && expandedId !== h.id && (
                    <div style={{ fontSize: '0.5rem', color: crt(0.4), marginTop: 4, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.summary}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                  <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); callSingle(h.recipientNumber, h.callerName || undefined); }} size="sm" title="Call back">
                    <Phone size={11} />
                  </PhoneBtn>
                  <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); setFollowupCallSid(h.twilioCallSid ?? null); }} size="sm" title="Schedule follow-up" color={amber}>
                    <Calendar size={11} />
                  </PhoneBtn>
                  <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); emailCallSummary(h.id); }} size="sm" title="Email summary" color={blue}>
                    <Mail size={11} />
                  </PhoneBtn>
                  {expandedId === h.id ? <ChevronDown size={13} style={{ color: crt(0.5) }} /> : <ChevronRight size={13} style={{ color: crt(0.2) }} />}
                </div>
              </div>

              {expandedId === h.id && (h.transcript || h.notes || h.summary) && (
                <div style={{ padding: '14px 20px 18px', background: 'rgba(56,189,248,0.015)', borderTop: `1px solid ${crt(0.05)}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: h.transcript ? '1fr 1fr' : '1fr', gap: 16 }}>
                    {h.summary && (
                      <div>
                        <div style={{ fontSize: '0.42rem', color: purple(0.5), letterSpacing: '0.2em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 3, height: 3, borderRadius: '50%', background: purple(0.5) }} /> AI SUMMARY
                        </div>
                        <div style={{ fontSize: '0.6rem', color: crt(0.6), lineHeight: 1.7, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: `1px solid ${crt(0.05)}` }}>
                          {h.summary}
                        </div>
                      </div>
                    )}
                    {h.transcript && (
                      <div>
                        <div style={{ fontSize: '0.42rem', color: crt(0.35), letterSpacing: '0.2em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 3, height: 3, borderRadius: '50%', background: crt(0.35) }} /> TRANSCRIPT
                        </div>
                        <div style={{
                          fontSize: '0.55rem', color: crt(0.45), maxHeight: 180, overflowY: 'auto',
                          whiteSpace: 'pre-wrap', lineHeight: 1.7,
                          padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 6,
                          border: `1px solid ${crt(0.05)}`,
                        }}>
                          {h.transcript}
                        </div>
                      </div>
                    )}
                  </div>
                  {h.notes && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.42rem', color: amber(0.4), letterSpacing: '0.2em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 3, height: 3, borderRadius: '50%', background: amber(0.4) }} /> NOTES
                      </div>
                      <div style={{ fontSize: '0.6rem', color: crt(0.5), padding: '10px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: 6, border: `1px solid ${crt(0.05)}` }}>
                        {h.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {followupCallSid === (h.twilioCallSid ?? '') && followupCallSid && (
                <div style={{ padding: '14px 20px', background: amber(0.02), borderTop: `1px solid ${amber(0.1)}` }}>
                  <div style={{ fontSize: '0.45rem', color: amber(0.5), letterSpacing: '0.2em', marginBottom: 10 }}>SCHEDULE FOLLOW-UP</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={followupForm.title} onChange={e => setFollowupForm(f => ({ ...f, title: e.target.value }))} placeholder="Follow-up title..." style={INPUT_STYLE} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: '0.4rem', color: crt(0.25), letterSpacing: '0.15em', display: 'block', marginBottom: 4 }}>START</label>
                        <input type="datetime-local" value={followupForm.startAt} onChange={e => setFollowupForm(f => ({ ...f, startAt: e.target.value }))} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.4rem', color: crt(0.25), letterSpacing: '0.15em', display: 'block', marginBottom: 4 }}>END (OPTIONAL)</label>
                        <input type="datetime-local" value={followupForm.endAt} onChange={e => setFollowupForm(f => ({ ...f, endAt: e.target.value }))} style={{ ...INPUT_STYLE, colorScheme: 'dark' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <PhoneBtn onClick={scheduleFollowup} disabled={!followupForm.title || !followupForm.startAt} color={amber} style={{ flex: 1, justifyContent: 'center' }}>
                        SCHEDULE FOLLOW-UP
                      </PhoneBtn>
                      <PhoneBtn onClick={() => setFollowupCallSid(null)} color={red} size="sm"><X size={12} /></PhoneBtn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </PhoneCard>
    </PhonePageLayout>
  );
}
