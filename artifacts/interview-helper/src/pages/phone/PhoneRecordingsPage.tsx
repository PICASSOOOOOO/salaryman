import { apiFetch } from '@/lib/api-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Mic, Search, Phone, Download, AlertTriangle, X, ArrowUpRight, ArrowDownLeft, ChevronRight, ChevronDown, Shield, Voicemail } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, destructive, warning, primary, accent, formatPhone, formatDuration,
  type CallRecord, type VoicemailRecord } from '@/lib/phone-utils';

type RecordingItem =
  | { kind: 'call'; id: number; startedAt: string; durationSeconds: number | null; partyName: string | null; partyNumber: string; direction: string; transcript: string | null; summary: string | null; recordingUrl: string; }
  | { kind: 'vm';   id: number; startedAt: string; durationSeconds: number | null; partyName: string | null; partyNumber: string; transcript: string | null; summary: string | null; recordingUrl: string; };

export default function PhoneRecordingsPage() {
  const isMobile = useIsMobile();

  const [boomerMode] = useBoomerMode();
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const userId = user?.id ?? '';

  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [vms, setVms] = useState<VoicemailRecord[]>([]);
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
      const [callsRes, vmRes] = await Promise.all([
        apiFetch(apiUrl(`twilio/history/${encodeURIComponent(userId)}`), { credentials: 'include' }).catch(() => null),
        apiFetch(apiUrl(`twilio/voicemail`), { credentials: 'include' }).catch(() => null),
      ]);
      if (callsRes && callsRes.status === 403) { navigate('/pricing'); return; }
      if (callsRes && callsRes.ok) {
        const d = await safeJson(callsRes) as { calls?: CallRecord[] } | null;
        if (d?.calls && Array.isArray(d.calls)) setCalls(d.calls);
      }
      if (vmRes && vmRes.ok) {
        const d = await safeJson(vmRes) as { voicemails?: VoicemailRecord[] } | VoicemailRecord[] | null;
        if (d && !Array.isArray(d) && Array.isArray(d.voicemails)) setVms(d.voicemails);
        else if (Array.isArray(d)) setVms(d);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, userId, navigate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const items: RecordingItem[] = useMemo(() => {
    const callItems: RecordingItem[] = calls
      .filter(c => !!c.recordingUrl)
      .map(c => ({
        kind: 'call' as const,
        id: c.id,
        startedAt: c.startedAt,
        durationSeconds: c.durationSeconds,
        partyName: c.callerName,
        partyNumber: c.recipientNumber,
        direction: c.direction ?? 'outbound',
        transcript: c.transcript ?? null,
        summary: c.summary ?? null,
        recordingUrl: c.recordingUrl as string }));
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
  }, [calls, vms]);

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
      subtitle="Every call and voicemail — downloadable and retained for up to 3 years"
      icon={<Mic size={24} style={{ color: slate(0.85) }} />}
      statusLine={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: slate(0.55) }}>
          <Shield size={11} style={{ color: slate(0.6) }} />
          <span>{stats.total} ARCHIVED · 3-YEAR MAX RETENTION</span>
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
        marginBottom: 16, padding: '14px 18px',
        background: slate(0.02),
        border: `1px solid ${slate(0.15)}`, borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8,
          background: slate(0.02),
          border: `1px solid ${slate(0.3)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={18} style={{ color: slate(0.9) }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.6rem', color: slate(0.85), letterSpacing: '0.1em' }}>HIPAA-ALIGNED RECORDING ARCHIVE</div>
          <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 3, letterSpacing: '0.06em' }}>
            Every inbound call, outbound call, conference, and voicemail is recorded and retained for up to three years. We email you before call recordings expire so you can download them.
            Audio, transcripts, and AI summaries are encrypted and only accessible to you.
          </div>
        </div>
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
          <span>RECORDING ARCHIVE</span>
          <span style={{ color: slate(0.55), fontVariantNumeric: 'tabular-nums' }}>{filtered.length} / {stats.total}</span>
        </PhoneCardHeader>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '0.6rem', color: slate(0.55), letterSpacing: '0.15em' }}>
            LOADING RECORDING ARCHIVE...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            message={items.length === 0 ? "NO RECORDINGS YET — make or receive a call to start archiving" : "NO RECORDINGS MATCH FILTER"}
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
                      {it.transcript && <span style={{ color: accent(0.5) }}>📝</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
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
                          <span style={{ color: slate(0.55) }}>· RETAINED 10 YEARS · HIPAA</span>
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
    </PhonePageLayout>
  );
}
