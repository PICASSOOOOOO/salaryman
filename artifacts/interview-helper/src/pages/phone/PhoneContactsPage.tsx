import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Phone, Search, CheckSquare, Square, Zap, Loader2, X, ArrowRight, Filter, Grid, List } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, purple, formatPhone,
  addActiveCall, addActiveCallsBatch,
  type CRMContact, type BatchResult, type ActiveCall,
} from '@/lib/phone-utils';
import { useCalllHomeNavigate } from './CalllHomeContext';

export default function PhoneContactsPage() {
  const BASE = import.meta.env.BASE_URL;
  const { user } = useAuth();
  const [, rawNavigate] = useLocation();
  const hubNav = useCalllHomeNavigate();
  const navigate = (path: string) => { if (!hubNav(path)) rawNavigate(path); };
  const userId = user?.id ?? '';
  const callerName = user?.firstName ?? user?.email?.split('@')[0];

  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [_loading, setLoading] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'company'>('name');
  const [contactFilter, setContactFilter] = useState<'all' | 'nums'>('all');

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => {
    if (!userId) return;
    setError('');
    fetch(apiUrl(`twilio/contacts/${encodeURIComponent(userId)}`), { credentials: 'include' })
      .then(async r => {
        if (r.status === 403) { navigate('/upgrade'); return; }
        if (r.ok) { const d = await r.json(); if (d?.contacts) setContacts(d.contacts); }
        else { setError(`Failed to load contacts (${r.status})`); }
      })
      .catch(() => setError('Network error loading contacts'));
  }, [userId, apiUrl, navigate]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (contactFilter === 'nums') list = list.filter(c => c.phone && c.phone.trim() !== '');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q) ||
        c.email.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => sortBy === 'company'
      ? (a.company ?? '').localeCompare(b.company ?? '')
      : a.name.localeCompare(b.name)
    );
  }, [contacts, search, sortBy, contactFilter]);

  const companies = useMemo(() => {
    const map = new Map<string, number>();
    contacts.forEach(c => { if (c.company) map.set(c.company, (map.get(c.company) || 0) + 1); });
    return map;
  }, [contacts]);

  const toggleSelect = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const callSingle = async (phone: string, name?: string, contactId?: number) => {
    setError('');
    setLoading(true);
    try {
      const r = await fetch(apiUrl('twilio/call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientNumber: phone, userId, callerName, contactName: name, contactId }),
      });
      if (r.status === 403) { rawNavigate('/upgrade'); return; }
      const d = await r.json();
      if (r.status === 403) { setError(d.error || 'Access denied'); navigate('/features'); setLoading(false); return; }
      if (!r.ok) { setError(d.error || 'Call failed'); setLoading(false); return; }
      if (d.callSid) {
        addActiveCall({ callSid: d.callSid, phone, name: name ?? phone, status: 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound' });
      }
      navigate('/phone/active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  };

  const blastSelected = async () => {
    if (selected.size === 0 || blasting) return;
    setBlasting(true);
    setError('');
    const numbers = contacts.filter(c => selected.has(c.id)).map(c => ({ phone: c.phone, name: c.name }));
    try {
      const r = await fetch(apiUrl('twilio/batch-call'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ numbers, userId, callerName }),
      });
      if (r.status === 403) { rawNavigate('/upgrade'); return; }
      const d = await r.json();
      if (r.status === 403) { setError(d.error || 'Access denied'); navigate('/features'); setBlasting(false); return; }
      if (!r.ok) { setError(d.error || 'Batch call failed'); setBlasting(false); return; }
      const batchCalls = d.calls as BatchResult[];
      const failCount = batchCalls.filter(c => !c.ok).length;
      if (failCount > 0) setError(`${failCount} call(s) failed to initiate`);
      const newActiveCalls: ActiveCall[] = batchCalls
        .filter(c => c.ok && c.callSid)
        .map(c => ({ callSid: c.callSid!, phone: c.phone, name: c.name ?? c.phone, status: c.status ?? 'queued', startTime: Date.now(), elapsed: 0, direction: 'outbound' }));
      addActiveCallsBatch(newActiveCalls);
      setSelected(new Set());
      navigate('/phone/active');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
    setBlasting(false);
  };

  const AVATAR_COLORS = [crt, blue, amber, purple];

  return (
    <PhonePageLayout
      title="CONTACTS"
      subtitle="Phone-enabled CRM contacts — search, select, batch dial"
      icon={<Users size={24} style={{ color: crt(0.8) }} />}
      statusLine={
        <span style={{ color: crt(0.25) }}>
          {contacts.length} CONTACTS · {companies.size} COMPANIES
        </span>
      }
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <PhoneBtn onClick={() => navigate('/business/contacts')} size="sm">
            MANAGE IN CRM <ArrowRight size={10} />
          </PhoneBtn>
        </div>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: 'linear-gradient(90deg, rgba(255,40,40,0.08), rgba(255,40,40,0.03))', border: `1px solid ${red(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: red(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: red(0.8) }} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: red(0.4), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL CONTACTS" value={contacts.length} />
        <StatBlock label="COMPANIES" value={companies.size} color={blue} />
        <StatBlock label="SELECTED" value={selected.size} color={selected.size > 0 ? amber : undefined} sub={selected.size > 0 ? 'ready to dial' : undefined} />
        <StatBlock label="FILTERED" value={filtered.length} sub={search ? `matching "${search}"` : 'showing all'} color={purple} />
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${crt(0.06)}` }}>
        {([['all', 'SEE'], ['nums', 'NUMS']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setContactFilter(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 14px', fontSize: '0.42rem', letterSpacing: '0.15em',
              color: contactFilter === key ? amber(0.9) : crt(0.3),
              borderBottom: contactFilter === key ? `2px solid ${amber(0.6)}` : '2px solid transparent',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: crt(0.3) }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, or company..."
            style={{ ...INPUT_STYLE, paddingLeft: 34 }}
          />
        </div>
        <PhoneBtn onClick={() => { setSearch(''); setContactFilter('all'); }} size="sm">ALL</PhoneBtn>
        <PhoneBtn onClick={() => setSortBy(s => s === 'name' ? 'company' : 'name')} size="sm">
          <Filter size={11} /> {sortBy === 'name' ? 'BY NAME' : 'BY COMPANY'}
        </PhoneBtn>
        <PhoneBtn onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} size="sm">
          {viewMode === 'list' ? <Grid size={11} /> : <List size={11} />}
        </PhoneBtn>
        <PhoneBtn onClick={selectAll}>
          {selected.size === filtered.length && filtered.length > 0 ? 'DESELECT ALL' : `SELECT ALL (${filtered.length})`}
        </PhoneBtn>
        {selected.size > 0 && (
          <PhoneBtn onClick={blastSelected} disabled={blasting} color={(o: number) => `rgba(0,220,60,${o})`} glow>
            {blasting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {blasting ? 'DIALING...' : `BLAST CALL ${selected.size}`}
          </PhoneBtn>
        )}
      </div>

      <PhoneCard>
        <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>CONTACTS WITH PHONE NUMBERS</span>
          <span style={{ color: crt(0.5), fontVariantNumeric: 'tabular-nums' }}>{filtered.length} / {contacts.length}</span>
        </PhoneCardHeader>

        {filtered.length === 0 ? (
          <EmptyState
            message={contacts.length === 0 ? 'NO CONTACTS WITH PHONE NUMBERS — ADD CONTACTS IN THE CRM FIRST' : 'NO CONTACTS MATCH YOUR SEARCH'}
            icon={<Users size={32} />}
          />
        ) : viewMode === 'grid' ? (
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {filtered.map((c, i) => {
              const colorFn = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <div
                  key={c.id}
                  onClick={() => toggleSelect(c.id)}
                  style={{
                    padding: 14, borderRadius: 8, cursor: 'pointer',
                    background: selected.has(c.id) ? crt(0.06) : 'rgba(0,12,0,0.5)',
                    border: `1px solid ${selected.has(c.id) ? crt(0.25) : crt(0.08)}`,
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', top: 10, right: 10, color: selected.has(c.id) ? crt(0.8) : crt(0.15) }}>
                    {selected.has(c.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                  </div>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, marginBottom: 10,
                    background: `linear-gradient(135deg, ${colorFn(0.15)}, ${colorFn(0.04)})`,
                    border: `1px solid ${colorFn(0.25)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', color: colorFn(0.7),
                  }}>
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: crt(0.85), marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: '0.48rem', color: crt(0.35), marginBottom: 2 }}>{formatPhone(c.phone)}</div>
                  {c.company && <div style={{ fontSize: '0.42rem', color: crt(0.2), marginTop: 2 }}>{c.company}</div>}
                  <PhoneBtn
                    onClick={e => { e?.stopPropagation(); callSingle(c.phone, c.name, c.id); }}
                    color={(o: number) => `rgba(0,220,60,${o})`}
                    size="sm"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  >
                    <Phone size={11} /> CALL
                  </PhoneBtn>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {filtered.map((c, i) => {
              const colorFn = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: `1px solid ${crt(0.04)}`,
                    background: selected.has(c.id) ? crt(0.04) : 'transparent',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onClick={() => toggleSelect(c.id)}
                >
                  <div style={{ color: selected.has(c.id) ? crt(0.8) : crt(0.15), flexShrink: 0 }}>
                    {selected.has(c.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                  </div>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `linear-gradient(135deg, ${colorFn(selected.has(c.id) ? 0.15 : 0.08)}, transparent)`,
                    border: `1px solid ${colorFn(selected.has(c.id) ? 0.3 : 0.12)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: '0.75rem', color: colorFn(selected.has(c.id) ? 0.8 : 0.5) }}>{c.name[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', color: crt(0.85), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{formatPhone(c.phone)}</span>
                      {c.company && <span style={{ color: crt(0.2) }}>· {c.company}</span>}
                      {c.email && <span style={{ color: crt(0.15) }}>· {c.email}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <PhoneBtn
                      onClick={e => { e?.stopPropagation(); callSingle(c.phone, c.name, c.id); }}
                      color={(o: number) => `rgba(0,220,60,${o})`}
                      size="sm"
                      title={`Call ${c.name}`}
                    >
                      <Phone size={12} /> CALL
                    </PhoneBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PhoneCard>

      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: 'rgba(0,8,0,0.97)', border: `1px solid ${crt(0.3)}`, borderRadius: 10,
          padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: `0 0 40px ${crt(0.1)}, 0 8px 32px rgba(0,0,0,0.5)`,
          backdropFilter: 'blur(12px)',
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: crt(0.9), fontVariantNumeric: 'tabular-nums' }}>{selected.size} SELECTED</div>
            <div style={{ fontSize: '0.42rem', color: crt(0.3) }}>ready for batch operation</div>
          </div>
          <PhoneBtn onClick={blastSelected} disabled={blasting} color={(o: number) => `rgba(0,220,60,${o})`} glow size="lg">
            {blasting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {blasting ? 'INITIATING...' : `BLAST CALL ALL ${selected.size}`}
          </PhoneBtn>
          <PhoneBtn onClick={() => navigate('/phone/sessions')}>
            START DIALING SESSION
          </PhoneBtn>
          <PhoneBtn onClick={() => setSelected(new Set())} color={red} size="sm">
            <X size={12} />
          </PhoneBtn>
        </div>
      )}
    </PhonePageLayout>
  );
}
