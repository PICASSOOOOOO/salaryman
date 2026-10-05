import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Mic, Search, Phone, Download, AlertTriangle, X, ArrowUpRight, ArrowDownLeft, ChevronRight, ChevronDown, Shield, Voicemail, FileText, Share2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, destructive, warning, primary, accent, formatPhone, formatDuration,
  type CallRecord, type VoicemailRecord } from '@/lib/phone-utils';

type RecordingItem =
  | { kind: 'call'; id: number; startedAt: string; durationSeconds: number | null; partyName: string | null; partyNumber: string; direction: string; transcript: string | null; summary: string | null; recordingUrl: string; ownerId?: string; employeeName?: string; sharedBy?: string; shareId?: number; }
  | { kind: 'vm';   id: number; startedAt: string; durationSeconds: number | null; partyName: string | null; partyNumber: string; transcript: string | null; summary: string | null; recordingUrl: string; };

type ArchiveScope = 'mine' | 'organization' | 'shared';
type ArchiveCall = CallRecord & { userId?: string; employeeName?: string; orgId?: number | null };
type RecordingPreferences = {
  userCallsEnabled: boolean;
  organizationCallsEnabled: boolean | null;
  effectiveCallsEnabled: boolean;
  canManageOrganization: boolean;
  organizationId?: number | null;
};
type SharedRecording = {
  id: number;
  mediaType: string;
  callHistoryId?: number | null;
  fromUserName?: string;
  title: string;
};

export default function PhoneRecordingsPage() {
  const isMobile = useIsMobile();

  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const userId = user?.id ?? '';

  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [vms, setVms] = useState<VoicemailRecord[]>([]);
  const [scope, setScope] = useState<ArchiveScope>('mine');
  const [preferences, setPreferences] = useState<RecordingPreferences | null>(null);
  const [sharedItems, setSharedItems] = useState<SharedRecording[]>([]);
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ callId: number; title: string; orgId?: number | null } | null>(null);
  const [shareToUser, setShareToUser] = useState('');
  const [savingPreference, setSavingPreference] = useState(false);
  const [shareError, setShareError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'calls' | 'vm' | 'inbound' | 'outbound'>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    const safeJson = async (r: Response): Promise<unknown> => {
      try {
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) return null;
        return await r.json();
      } catch { return null; }
    };
    try {
      const historyScope = scope === 'mine' ? '' : `?scope=${scope === 'organization' ? 'organization' : 'shared'}`;
      const [callsRes, vmRes, preferencesRes, inboxRes] = await Promise.all([
        apiFetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}${historyScope}`), { credentials: 'include' }).catch(() => null),
        scope === 'mine' ? apiFetch(apiUrl(`twilio/voicemail`), { credentials: 'include' }).catch(() => null) : Promise.resolve(null),
        apiFetch(apiUrl('twilio/recording-preferences'), { credentials: 'include' }).catch(() => null),
        scope === 'shared' ? apiFetch(apiUrl('media/inbox?limit=200'), { credentials: 'include' }).catch(() => null) : Promise.resolve(null),
      ]);
      if (callsRes && callsRes.status === 403) {
        const body = await safeJson(callsRes) as { feature?: string; error?: string } | null;
        if (body?.feature === 'phone_system') navigate('/pricing');
        else setError(body?.error || 'You do not have access to this recording archive.');
        setCalls([]);
        return;
      }
      if (callsRes && callsRes.ok) {
        const d = await safeJson(callsRes) as { calls?: ArchiveCall[] } | null;
        if (d?.calls && Array.isArray(d.calls)) setCalls(d.calls);
        else setCalls([]);
      } else {
        setCalls([]);
      }
      if (vmRes && vmRes.ok) {
        const d = await safeJson(vmRes) as { voicemails?: VoicemailRecord[] } | VoicemailRecord[] | null;
        if (d && !Array.isArray(d) && Array.isArray(d.voicemails)) setVms(d.voicemails);
        else if (Array.isArray(d)) setVms(d);
      } else {
        setVms([]);
      }
      if (preferencesRes?.ok) {
        const d = await safeJson(preferencesRes) as RecordingPreferences | null;
        if (d) setPreferences(d);
      }
      if (inboxRes?.ok) {
        const d = await safeJson(inboxRes) as { items?: SharedRecording[] } | null;
        setSharedItems((d?.items ?? []).filter(item => item.mediaType === 'recording' && !!item.callHistoryId));
      } else {
        setSharedItems([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, userId, navigate, scope]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateRecordingPreference = async (targetScope: 'user' | 'organization', enabled: boolean) => {
    setSavingPreference(true);
    setError('');
    try {
      const response = await apiFetch(apiUrl('twilio/recording-preferences'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: targetScope, enabled }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Could not update recording setting (${response.status})`);
      }
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update recording setting');
    } finally {
      setSavingPreference(false);
    }
  };

  const startSharing = async (callId: number, title: string, orgId?: number | null) => {
    setShareError('');
    setShareTarget({ callId, title, orgId });
    setMembers([]);
    setLoadingMembers(true);
    try {
      const memberQuery = orgId != null ? `?orgId=${encodeURIComponent(String(orgId))}` : '';
      const response = await apiFetch(apiUrl(`media/org-members${memberQuery}`), { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to load your organization colleagues');
      const data = await response.json() as { members?: { userId: string; name: string }[] };
      setMembers(data.members ?? []);
    } catch (e: unknown) {
      setShareError(e instanceof Error ? e.message : 'Unable to load colleagues');
    } finally {
      setLoadingMembers(false);
    }
  };

  const shareRecording = async () => {
    if (!shareTarget || !shareToUser) return;
    setShareError('');
    try {
      const response = await apiFetch(apiUrl('media/share'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: shareToUser,
          mediaType: 'recording',
          title: shareTarget.title,
          callHistoryId: shareTarget.callId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Could not share recording (${response.status})`);
      }
      setShareTarget(null);
      setShareToUser('');
    } catch (e: unknown) {
      setShareError(e instanceof Error ? e.message : 'Could not share recording');
    }
  };

  const items: RecordingItem[] = useMemo(() => {
    const callItems: RecordingItem[] = calls
      .filter(c => !!c.recordingUrl)
      .map(c => {
        const archiveCall = c as ArchiveCall;
        const share = sharedItems.find(item => item.callHistoryId === c.id);
        return ({
        kind: 'call' as const,
        id: c.id,
        startedAt: c.startedAt,
        durationSeconds: c.durationSeconds,
        partyName: c.callerName,
        partyNumber: c.recipientNumber,
        direction: c.direction ?? 'outbound',
        transcript: c.transcript ?? null,
        summary: c.summary ?? null,
        recordingUrl: c.recordingUrl as string,
        ownerId: archiveCall.userId,
        employeeName: archiveCall.employeeName,
        orgId: archiveCall.orgId,
        sharedBy: share?.fromUserName,
        shareId: share?.id,
      });
      });
    const vmItems: RecordingItem[] = vms
      .filter(v => !!v.recordingUrl)
      .map(v => ({
        kind: 'vm' as const,
        id: v.id,
        startedAt: v.createdAt,
        durationSeconds: v.durationSeconds,
        partyName: v.fromName,
        partyNumber: v.fromNumber,
        transcript: v.transcript ?? null,
        summary: v.summary ?? null,
        recordingUrl: v.recordingUrl as string }));
    return [...callItems, ...vmItems].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [calls, vms, sharedItems]);

  const filtered = useMemo(() => {
    let xs = items;
    if (filter === 'calls') xs = xs.filter(x => x.kind === 'call');
    else if (filter === 'vm') xs = xs.filter(x => x.kind === 'vm');
    else if (filter === 'inbound') xs = xs.filter(x => x.kind === 'vm' || (x.kind === 'call' && x.direction === 'inbound'));
    else if (filter === 'outbound') xs = xs.filter(x => x.kind === 'call' && x.direction === 'outbound');
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(x =>
        x.partyName?.toLowerCase().includes(q) ||
        x.partyNumber.includes(q) ||
        x.transcript?.toLowerCase().includes(q) ||
        x.summary?.toLowerCase().includes(q)
      );
    }
    return xs;
  }, [items, filter, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const totalDuration = items.reduce((a, x) => a + (x.durationSeconds ?? 0), 0);
    const callRecs = items.filter(x => x.kind === 'call').length;
    const vmRecs = items.filter(x => x.kind === 'vm').length;
    const transcribed = items.filter(x => !!x.transcript).length;
    return { total, totalDuration, callRecs, vmRecs, transcribed };
  }, [items]);

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'calls', label: 'CALLS' },
    { key: 'vm', label: 'VOICEMAIL' },
    { key: 'inbound', label: 'INBOUND' },
    { key: 'outbound', label: 'OUTBOUND' },
  ];

  const recordingUrlFor = (it: RecordingItem) =>
    it.kind === 'call' ? apiUrl(`twilio/recording/${it.id}`) : apiUrl(`twilio/voicemail-recording/${it.id}`);
  const downloadUrlFor = (it: RecordingItem) =>
    it.kind === 'call' ? apiUrl(`twilio/recording/${it.id}?download=1`) : apiUrl(`twilio/voicemail-recording/${it.id}?download=1`);

  return (
    <PhonePageLayout
      title="RECORDINGS"
      subtitle="Recorded calls and voicemails — playback, downloads, and colleague sharing"
      icon={<Mic size={24} style={{ color: slate(0.85) }} />}
      statusLine={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: slate(0.55) }}>
          <Shield size={11} style={{ color: slate(0.6) }} />
          <span>{stats.total} AVAILABLE · 3-YEAR MAX RETENTION</span>
        </span>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: slate(0.02), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={14} /> {error}</div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{
        marginBottom: 14, padding: '14px 18px',
        background: slate(0.02),
        border: `1px solid ${slate(0.15)}`, borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: slate(0.02),
          border: `1px solid ${slate(0.3)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={18} style={{ color: slate(0.9) }} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '0.6rem', color: slate(0.85), letterSpacing: '0.1em' }}>CALL RECORDING SETTINGS</div>
          <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 4, lineHeight: 1.6 }}>
            New calls are recorded only when both settings are on. SALARYMAN does not announce recording; the user and organization are responsible for any required notice.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            aria-pressed={preferences?.userCallsEnabled ?? true}
            disabled={!preferences || savingPreference}
            onClick={() => preferences && updateRecordingPreference('user', !preferences.userCallsEnabled)}
            style={{
              padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${preferences?.userCallsEnabled ? primary(0.45) : slate(0.18)}`,
              background: preferences?.userCallsEnabled ? primary(0.08) : 'transparent',
              color: preferences?.userCallsEnabled ? primary(0.85) : slate(0.55),
              fontSize: '0.48rem', letterSpacing: '0.08em',
              ...(boomerMode ? {} : { fontFamily: 'var(--font-sans)' }),
            }}
          >
            MY RECORDING · {preferences?.userCallsEnabled ? 'ON' : 'OFF'}
          </button>
          {preferences?.canManageOrganization && (
            <button
              type="button"
              aria-pressed={preferences.organizationCallsEnabled ?? true}
              disabled={savingPreference}
              onClick={() => updateRecordingPreference('organization', !(preferences.organizationCallsEnabled ?? true))}
              style={{
                padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                border: `1px solid ${preferences.organizationCallsEnabled !== false ? primary(0.45) : slate(0.18)}`,
                background: preferences.organizationCallsEnabled !== false ? primary(0.08) : 'transparent',
                color: preferences.organizationCallsEnabled !== false ? primary(0.85) : slate(0.55),
                fontSize: '0.48rem', letterSpacing: '0.08em',
                ...(boomerMode ? {} : { fontFamily: 'var(--font-sans)' }),
              }}
            >
              ORG RECORDING · {preferences.organizationCallsEnabled === false ? 'OFF' : 'ON'}
            </button>
          )}
          {preferences?.organizationId != null && !preferences.canManageOrganization && (
            <span style={{ padding: '7px 10px', color: slate(0.5), fontSize: '0.48rem', letterSpacing: '0.08em' }}>
              ORG RECORDING · {preferences.organizationCallsEnabled === false ? 'OFF' : 'ON'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }} aria-label="Recording archive views">
        {([
          ['mine', 'MY RECORDINGS'],
          ...(preferences?.canManageOrganization ? [['organization', 'ORGANIZATION'] as const] : []),
          ['shared', 'SHARED WITH ME'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setScope(key); setExpandedKey(null); }}
            aria-pressed={scope === key}
            style={{
              padding: '7px 11px', fontSize: '0.48rem', letterSpacing: '0.1em',
              background: scope === key ? slate(0.08) : 'transparent',
              border: `1px solid ${scope === key ? slate(0.25) : slate(0.08)}`,
              color: scope === key ? slate(0.85) : slate(0.45),
              borderRadius: 4, cursor: 'pointer',
              ...(boomerMode ? {} : { fontFamily: 'var(--font-sans)' }),
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL RECORDINGS" value={stats.total} color={slate} />
        <StatBlock label="CALL RECORDINGS" value={stats.callRecs} color={slate} />
        <StatBlock label="VOICEMAILS" value={stats.vmRecs} color={warning} />
        <StatBlock label="TOTAL AUDIO" value={formatDuration(stats.totalDuration)} color={primary} />
        <StatBlock label="TRANSCRIBED" value={stats.transcribed} color={accent} sub={stats.total ? `${Math.round(stats.transcribed / stats.total * 100)}%` : '0%'} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: slate(0.55) }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recordings: name, number, transcript, summary..."
            style={{ ...INPUT_STYLE, paddingLeft: 34 }}
          />
        </div>
        <PhoneBtn onClick={fetchAll} size="sm"><Search size={11} /> REFRESH</PhoneBtn>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 10px', fontSize: '0.45rem', letterSpacing: '0.1em',
                background: filter === f.key ? slate(0.08) : 'transparent',
                border: `1px solid ${filter === f.key ? slate(0.25) : slate(0.08)}`,
                color: filter === f.key ? slate(0.8) : slate(0.3),
                borderRadius: 4, cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      <PhoneCard>
        <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{scope === 'mine' ? 'MY RECORDINGS' : scope === 'organization' ? 'ORGANIZATION RECORDINGS' : 'SHARED WITH ME'}</span>
          <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{filtered.length} / {stats.total}</span>
        </PhoneCardHeader>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: slate(0.55), letterSpacing: '0.15em' }}>
            LOADING RECORDING ARCHIVE...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            message={items.length === 0
              ? scope === 'shared'
                ? "NO RECORDINGS HAVE BEEN SHARED WITH YOU"
                : scope === 'organization'
                  ? "NO ORGANIZATION RECORDINGS AVAILABLE"
                  : "NO RECORDINGS YET — make or receive a call to start archiving"
              : "NO RECORDINGS MATCH FILTER"}
            icon={<Mic size={32} />}
          />
        ) : (
          filtered.map(it => {
            const key = `${it.kind}-${it.id}`;
            const expanded = expandedKey === key;
            return (
              <div key={key} style={{ borderBottom: `1px solid ${slate(0.05)}` }}>
                <div
                  onClick={() => setExpandedKey(expanded ? null : key)}
                  style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: it.kind === 'vm' ? `linear-gradient(135deg, ${warning(0.15)}, ${warning(0.03)})` : slate(0.04),
                    border: `1px solid ${it.kind === 'vm' ? warning(0.25) : slate(0.12)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {it.kind === 'vm'
                      ? <Voicemail size={16} style={{ color: warning(0.8) }} />
                      : it.direction === 'inbound'
                        ? <ArrowDownLeft size={16} style={{ color: primary(0.7) }} />
                        : <ArrowUpRight size={16} style={{ color: slate(0.6) }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: slate(0.85), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.partyName || formatPhone(it.partyNumber)}
                    </div>
                    <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>{formatPhone(it.partyNumber)}</span>
                      {it.kind === 'call' && it.employeeName && (
                        <>
                          <span style={{ color: slate(0.55) }}>·</span>
                          <span>EMPLOYEE · {it.employeeName}</span>
                        </>
                      )}
                      {it.kind === 'call' && it.sharedBy && (
                        <>
                          <span style={{ color: slate(0.55) }}>·</span>
                          <span>SHARED BY · {it.sharedBy}</span>
                        </>
                      )}
                      <span style={{ color: slate(0.55) }}>·</span>
                      <span style={{
                        padding: '1px 5px', borderRadius: 3,
                        background: it.kind === 'vm' ? warning(0.05) : slate(0.05),
                        border: `1px solid ${it.kind === 'vm' ? warning(0.18) : slate(0.18)}`,
                        color: it.kind === 'vm' ? warning(0.8) : slate(0.8),
                        display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {it.kind === 'vm' ? <><Voicemail size={9} /> VM</> : <><Mic size={9} /> CALL</>}
                      </span>
                      {it.durationSeconds != null && it.durationSeconds > 0 && (
                        <>
                          <span style={{ color: slate(0.55) }}>·</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(it.durationSeconds)}</span>
                        </>
                      )}
                      <span style={{ color: slate(0.55) }}>·</span>
                      <span>{new Date(it.startedAt).toLocaleDateString()} {new Date(it.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {it.kind === 'call' && it.direction === 'inbound' && <span style={{ color: primary(0.6) }}>↙ INBOUND</span>}
                      {it.transcript && <FileText size={12} color={accent(0.6)} />}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                    {it.kind === 'call' && (it.ownerId === userId || scope === 'organization') && scope !== 'shared' && (
                      <PhoneBtn
                        onClick={e => { e.stopPropagation(); void startSharing(it.id, it.partyName || formatPhone(it.partyNumber), it.orgId); }}
                        size="sm"
                        title="Share with a colleague"
                      >
                        <Share2 size={11} /> {!isMobile && 'SHARE'}
                      </PhoneBtn>
                    )}
                    <a
                      onClick={e => e.stopPropagation()}
                      href={downloadUrlFor(it)}
                      download={it.kind === 'call' ? `call-${it.id}.mp3` : `voicemail-${it.id}.mp3`}
                      title="Download MP3"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '5px 9px', fontSize: '0.45rem', letterSpacing: '0.1em',
                        color: slate(0.7), border: `1px solid ${slate(0.18)}`, borderRadius: 4,
                        textDecoration: 'none', background: slate(0.03),
                        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
                    >
                      <Download size={11} />
                    </a>
                    {it.kind === 'call' && (
                      <PhoneBtn onClick={e => { (e as React.MouseEvent).stopPropagation(); navigate(`/phone?tab=cmd&number=${encodeURIComponent(it.partyNumber)}`); }} size="sm" title="Call back">
                        <Phone size={11} />
                      </PhoneBtn>
                    )}
                    {expanded ? <ChevronDown size={13} style={{ color: slate(0.5) }} /> : <ChevronRight size={13} style={{ color: slate(0.55) }} />}
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: '14px 20px 18px', background: slate(0.25), borderTop: `1px solid ${slate(0.05)}` }}>
                    <div style={{ marginBottom: 12, padding: '12px 14px', background: slate(0.3), borderRadius: 6, border: `1px solid ${slate(0.12)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Mic size={11} /> {it.kind === 'vm' ? 'VOICEMAIL RECORDING' : 'CALL RECORDING'}
                          <span style={{ color: slate(0.55) }}>· RETAINED UP TO 3 YEARS</span>
                        </div>
                        <a
                          href={downloadUrlFor(it)}
                          download={it.kind === 'call' ? `call-${it.id}.mp3` : `voicemail-${it.id}.mp3`}
                          style={{ fontSize: '0.45rem', color: slate(0.7), letterSpacing: '0.15em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: `1px solid ${slate(0.2)}`, borderRadius: 4 }}
                        >
                          <Download size={10} /> DOWNLOAD MP3
                        </a>
                      </div>
                      <audio controls preload="none" src={recordingUrlFor(it)} style={{ width: '100%', height: 32 }} />
                    </div>

                    {(it.summary || it.transcript) && (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (it.summary && it.transcript ? '1fr 1fr' : '1fr'), gap: 16 }}>
                        {it.summary && (
                          <div>
                            <div style={{ fontSize: '0.42rem', color: accent(0.5), letterSpacing: '0.2em', marginBottom: 6 }}>AI SUMMARY</div>
                            <div style={{ fontSize: '0.6rem', color: slate(0.6), lineHeight: 1.7, padding: '10px 12px', background: slate(0.2), borderRadius: 6, border: `1px solid ${slate(0.05)}` }}>
                              {it.summary}
                            </div>
                          </div>
                        )}
                        {it.transcript && (
                          <div>
                            <div style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.2em', marginBottom: 6 }}>TRANSCRIPT</div>
                            <div style={{
                              fontSize: '0.55rem', color: slate(0.55), maxHeight: 180, overflowY: 'auto',
                              whiteSpace: 'pre-wrap', lineHeight: 1.7,
                              padding: '10px 12px', background: slate(0.3), borderRadius: 6,
                              border: `1px solid ${slate(0.05)}` }}>
                              {it.transcript}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </PhoneCard>

      {shareTarget && (
        <div role="dialog" aria-modal="true" aria-label="Share recording" style={{
          position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            width: 'min(440px, 100%)', padding: 20, borderRadius: 10,
            background: '#111318', border: `1px solid ${slate(0.2)}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ color: slate(0.9), fontSize: '0.66rem', letterSpacing: '0.08em' }}>SHARE RECORDING</strong>
              <button type="button" aria-label="Close" onClick={() => { setShareTarget(null); setShareError(''); }} style={{ background: 'none', border: 0, color: slate(0.65), cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ color: slate(0.6), fontSize: '0.55rem', marginBottom: 12 }}>{shareTarget.title}</div>
            {members.length > 0 ? (
              <select
                value={shareToUser}
                onChange={e => setShareToUser(e.target.value)}
                aria-label="Choose a colleague"
                style={{ ...INPUT_STYLE, width: '100%', marginBottom: 12 }}
              >
                <option value="">Choose a colleague</option>
                {members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            ) : loadingMembers ? (
              <div style={{ color: slate(0.55), fontSize: '0.52rem', marginBottom: 12 }}>Loading organization colleagues…</div>
            ) : !shareError ? (
              <div style={{ color: slate(0.55), fontSize: '0.52rem', marginBottom: 12 }}>No organization colleagues are available to share with.</div>
            ) : null}
            {shareError && <div role="alert" style={{ color: destructive(0.9), fontSize: '0.52rem', marginBottom: 12 }}>{shareError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <PhoneBtn onClick={() => { setShareTarget(null); setShareError(''); }} size="sm">CANCEL</PhoneBtn>
              <PhoneBtn onClick={() => { void shareRecording(); }} size="sm" disabled={!shareToUser || !members.length}>SHARE</PhoneBtn>
            </div>
          </div>
        </div>
      )}
    </PhonePageLayout>
  );
}
