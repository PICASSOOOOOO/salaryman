import { useState, useEffect, useCallback } from 'react';
import { Hash, Search, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  crt, red, amber, blue, formatPhone,
  type PhoneNumber, type CountryDialInfo, type RegulatoryRequirement, type AvailableNumber,
} from '@/lib/phone-utils';
import { apiFetch } from '@/lib/api-client';

export default function PhoneNumbersPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [regionDefaults, setRegionDefaults] = useState<{ cityId: string | null; country: string; countryInfo: CountryDialInfo; countries: CountryDialInfo[] } | null>(null);
  const [buyCountry, setBuyCountry] = useState('');
  const [regulatory, setRegulatory] = useState<RegulatoryRequirement | null>(null);
  const [numberSearch, setNumberSearch] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [purchasingNumber, setPurchasingNumber] = useState('');
  const [newNumberForm, setNewNumberForm] = useState({ number: '', label: '', greeting: '', routingMode: 'voicemail' });
  const [addingNumber, setAddingNumber] = useState(false);
  const [addError, setAddError] = useState('');
  const [settingActiveId, setSettingActiveId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchPhoneNumbers = useCallback(async () => {
    try {
      const r = await apiFetch('/api/twilio/phone-numbers');
      if (r.ok) { const d = await r.json(); if (d?.numbers) setPhoneNumbers(d.numbers); }
      else if (r.status !== 403) setError(`Failed to load numbers (${r.status})`);
    } catch { setError('Network error loading numbers'); }
  }, []);

  const fetchRegionDefaults = useCallback(async () => {
    try {
      const r = await apiFetch('/api/twilio/region-defaults');
      if (r.ok) {
        const d = await r.json();
        if (d?.country) {
          setRegionDefaults(d);
          setBuyCountry(prev => prev || d.country);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchPhoneNumbers();
    fetchRegionDefaults();
  }, [fetchPhoneNumbers, fetchRegionDefaults]);

  useEffect(() => {
    if (!buyCountry) return;
    let cancelled = false;
    apiFetch(`/api/twilio/regulatory?country=${encodeURIComponent(buyCountry)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.requirement) setRegulatory(d.requirement); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [buyCountry]);

  const searchAvailableNumbers = async () => {
    setSearchingNumbers(true);
    setSearchError('');
    setAvailableNumbers([]);
    try {
      const params = new URLSearchParams({ country: buyCountry });
      if (numberSearch.trim()) params.set('contains', numberSearch.trim());
      const r = await apiFetch(`/api/twilio/available-numbers?${params.toString()}`);
      const d = await r.json();
      if (r.ok) setAvailableNumbers(d.numbers ?? []);
      else setSearchError(d.error || 'Search failed');
    } catch { setSearchError('Search failed'); }
    setSearchingNumbers(false);
  };

  const purchaseNumber = async (phoneNumber: string) => {
    setPurchasingNumber(phoneNumber);
    setSearchError('');
    try {
      const r = await apiFetch('/api/twilio/purchase-number', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const d = await r.json();
      if (r.ok) {
        await fetchPhoneNumbers();
        setAvailableNumbers(prev => prev.filter(n => n.phoneNumber !== phoneNumber));
      } else if (d.error === 'regulatory_bundle_required') {
        setSearchError(d.requirement?.message || 'A regulatory bundle is required for this country.');
      } else {
        setSearchError(d.detail || d.error || 'Purchase failed');
      }
    } catch { setSearchError('Purchase failed'); }
    setPurchasingNumber('');
  };

  const addPhoneNumber = async () => {
    if (!newNumberForm.number) return;
    setAddingNumber(true);
    setAddError('');
    try {
      const r = await apiFetch('/api/twilio/phone-numbers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNumberForm),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        await fetchPhoneNumbers();
        setNewNumberForm({ number: '', label: '', greeting: '', routingMode: 'voicemail' });
      } else {
        setAddError(d?.error || `Failed to add number (${r.status})`);
      }
    } catch { setAddError('Network error adding number'); }
    setAddingNumber(false);
  };

  const setActiveNumber = async (id: number) => {
    setSettingActiveId(id);
    setError('');
    try {
      const r = await apiFetch(`/api/twilio/phone-numbers/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      if (r.ok) await fetchPhoneNumbers();
      else setError(`Failed to set active (${r.status})`);
    } catch { setError('Network error setting active number'); }
    setSettingActiveId(null);
  };

  const deletePhoneNumber = async (id: number) => {
    setDeletingId(id);
    setError('');
    try {
      const r = await apiFetch(`/api/twilio/phone-numbers/${id}`, { method: 'DELETE' });
      if (r.ok) await fetchPhoneNumbers();
      else setError(`Failed to delete number (${r.status})`);
    } catch { setError('Network error deleting number'); }
    setDeletingId(null);
  };

  const activeCount = phoneNumbers.filter(n => n.isActive).length;

  return (
    <PhonePageLayout
      title="NUMBERS"
      subtitle="Buy, add, switch & remove your phone numbers"
      icon={<Hash size={24} style={{ color: crt(0.8) }} />}
      statusLine={
        <span style={{ color: crt(0.25) }}>
          {phoneNumbers.length} NUMBERS · {activeCount} ACTIVE
        </span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL NUMBERS" value={phoneNumbers.length} />
        <StatBlock label="ACTIVE" value={activeCount} color={activeCount > 0 ? amber : undefined} />
        <StatBlock label="HOME REALM" value={regionDefaults?.countryInfo.flag ?? '—'} sub={regionDefaults?.countryInfo.region ?? undefined} color={blue} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Buy a number */}
        <PhoneCard>
          <PhoneCardHeader><Search size={11} /> BUY A NUMBER</PhoneCardHeader>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {regionDefaults && (
              <div style={{ fontSize: '0.5rem', color: crt(0.3) }}>
                Home realm: {regionDefaults.countryInfo.flag} {regionDefaults.countryInfo.region}
                {regionDefaults.cityId ? ` · ${regionDefaults.cityId.replace(/_/g, ' ').toUpperCase()}` : ''}
              </div>
            )}
            <select
              value={buyCountry}
              onChange={e => { setBuyCountry(e.target.value); setAvailableNumbers([]); setSearchError(''); }}
              style={{ ...INPUT_STYLE, fontSize: '0.65rem' }}
              data-testid="select-buy-country"
            >
              {(regionDefaults?.countries ?? []).map(c => (
                <option key={c.iso} value={c.iso} style={{ background: '#030803' }}>{c.flag} {c.name} (+{c.dialCode})</option>
              ))}
            </select>
            {regulatory?.required && (
              <div style={{ fontSize: '0.5rem', color: amber(0.85), border: `1px solid ${amber(0.3)}`, background: amber(0.06), padding: '6px 8px', borderRadius: 6, display: 'flex', gap: 6 }}>
                <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{regulatory.message}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={numberSearch}
                onChange={e => setNumberSearch(e.target.value)}
                placeholder="Area code / digits (optional)..."
                style={{ ...INPUT_STYLE, flex: 1, fontSize: '0.65rem' }}
                data-testid="input-number-search"
              />
              <PhoneBtn onClick={searchAvailableNumbers} disabled={!buyCountry || searchingNumbers} size="sm" data-testid="button-search-numbers">
                {searchingNumbers ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} SEARCH
              </PhoneBtn>
            </div>
            {searchError && <div style={{ fontSize: '0.5rem', color: red(0.8) }}>{searchError}</div>}
            {availableNumbers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                {availableNumbers.map(n => (
                  <div key={n.phoneNumber} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: `1px solid ${crt(0.1)}`, borderRadius: 6, background: crt(0.02) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: crt(0.85) }}>{formatPhone(n.phoneNumber)}</div>
                      {(n.locality || n.region) && <div style={{ fontSize: '0.45rem', color: crt(0.3) }}>{[n.locality, n.region].filter(Boolean).join(', ')}</div>}
                    </div>
                    <PhoneBtn onClick={() => purchaseNumber(n.phoneNumber)} disabled={!!purchasingNumber} size="sm" color={(o: number) => `rgba(0,220,60,${o})`} data-testid={`button-buy-${n.phoneNumber}`}>
                      {purchasingNumber === n.phoneNumber ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} BUY
                    </PhoneBtn>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PhoneCard>

        {/* Add existing number */}
        <PhoneCard>
          <PhoneCardHeader><Plus size={11} /> ADD EXISTING NUMBER</PhoneCardHeader>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={newNumberForm.number} onChange={e => setNewNumberForm(f => ({ ...f, number: e.target.value }))} placeholder="Phone number..." style={{ ...INPUT_STYLE, fontSize: '0.65rem' }} data-testid="input-new-number" />
            <input value={newNumberForm.label} onChange={e => setNewNumberForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. main, support)..." style={{ ...INPUT_STYLE, fontSize: '0.65rem' }} data-testid="input-new-label" />
            <input value={newNumberForm.greeting} onChange={e => setNewNumberForm(f => ({ ...f, greeting: e.target.value }))} placeholder="Greeting script (optional)..." style={{ ...INPUT_STYLE, fontSize: '0.65rem' }} data-testid="input-new-greeting" />
            <select value={newNumberForm.routingMode} onChange={e => setNewNumberForm(f => ({ ...f, routingMode: e.target.value }))} style={{ ...INPUT_STYLE, fontSize: '0.65rem' }} data-testid="select-routing-mode">
              <option value="voicemail" style={{ background: '#030803' }}>Route to Voicemail</option>
              <option value="secretary" style={{ background: '#030803' }}>Route to Secretary AI</option>
              <option value="forward" style={{ background: '#030803' }}>Forward to Number</option>
            </select>
            {addError && <div style={{ fontSize: '0.5rem', color: red(0.8) }}>{addError}</div>}
            <PhoneBtn onClick={addPhoneNumber} disabled={!newNumberForm.number || addingNumber} style={{ justifyContent: 'center' }} data-testid="button-add-number">
              {addingNumber ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} ADD NUMBER
            </PhoneBtn>
          </div>
        </PhoneCard>
      </div>

      {/* Configured numbers */}
      <PhoneCard>
        <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>YOUR NUMBERS</span>
          <span style={{ color: crt(0.5), fontVariantNumeric: 'tabular-nums' }}>{phoneNumbers.length}</span>
        </PhoneCardHeader>
        {phoneNumbers.length === 0 ? (
          <EmptyState message="NO NUMBERS CONFIGURED — BUY OR ADD A NUMBER ABOVE" icon={<Hash size={32} />} />
        ) : (
          <div>
            {phoneNumbers.map(n => (
              <div
                key={n.id}
                data-testid={`number-row-${n.id}`}
                style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: `1px solid ${crt(0.04)}`,
                  background: n.isActive ? crt(0.04) : 'transparent',
                }}
              >
                <div style={{ color: n.isActive ? crt(0.8) : crt(0.2), flexShrink: 0 }}>
                  {n.isActive ? <CheckCircle2 size={16} /> : <Hash size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: crt(0.85), display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.countryCode ? `${(regionDefaults?.countries.find(c => c.iso === n.countryCode)?.flag) ?? ''} ` : ''}{formatPhone(n.number)}
                    {n.isActive && (
                      <span style={{ fontSize: '0.4rem', color: amber(0.9), letterSpacing: '0.15em', padding: '1px 6px', borderRadius: 3, background: amber(0.08), border: `1px solid ${amber(0.25)}` }}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.48rem', color: crt(0.3), marginTop: 2 }}>
                    {n.label} · {n.routingMode}{n.region ? ` · ${n.region}` : ''}
                  </div>
                  {n.greeting && <div style={{ fontSize: '0.45rem', color: crt(0.4), fontStyle: 'italic', marginTop: 2 }}>"{n.greeting.slice(0, 80)}{n.greeting.length > 80 ? '...' : ''}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!n.isActive && (
                    <PhoneBtn onClick={() => setActiveNumber(n.id)} disabled={settingActiveId === n.id} size="sm" color={amber} data-testid={`button-set-active-${n.id}`}>
                      {settingActiveId === n.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} SET ACTIVE
                    </PhoneBtn>
                  )}
                  <PhoneBtn onClick={() => deletePhoneNumber(n.id)} disabled={deletingId === n.id} size="sm" color={red} title="Delete number" data-testid={`button-delete-${n.id}`}>
                    {deletingId === n.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </PhoneBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </PhoneCard>
    </PhonePageLayout>
  );
}
