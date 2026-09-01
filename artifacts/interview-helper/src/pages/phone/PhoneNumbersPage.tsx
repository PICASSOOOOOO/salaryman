import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useCallback } from 'react';
import { Hash, Search, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { PhonePageLayout, PhoneCard, PhoneCardHeader, PhoneBtn, EmptyState, StatBlock, INPUT_STYLE } from './PhoneLayout';
import {
  slate, destructive, warning, primary, formatPhone,
  type PhoneNumber, type CountryDialInfo, type RegulatoryRequirement, type AvailableNumber } from '@/lib/phone-utils';
import { apiFetch } from '@/lib/api-client';

export default function PhoneNumbersPage() {
  const isMobile = useIsMobile();

  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [defaultNumber, setDefaultNumber] = useState<string | null>(null);
  const [regionDefaults, setRegionDefaults] = useState<{ cityId: string | null; country: string; countryInfo: CountryDialInfo; countries: CountryDialInfo[] } | null>(null);
  const [buyCountry, setBuyCountry] = useState('');
  const [regulatory, setRegulatory] = useState<RegulatoryRequirement | null>(null);
  const [numberSearch, setNumberSearch] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [purchasingNumber, setPurchasingNumber] = useState('');
  const [settingActiveId, setSettingActiveId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const checkoutResult = new URLSearchParams(window.location.search).get('number_checkout');

  const fetchPhoneNumbers = useCallback(async () => {
    try {
      const r = await apiFetch('/api/twilio/phone-numbers');
      if (r.ok) {
        const d = await r.json();
        if (d?.numbers) setPhoneNumbers(d.numbers);
        setDefaultNumber(d?.defaultNumber ?? null);
      }
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
    if (!window.confirm(`Buy ${formatPhone(phoneNumber)} for $10 one-time?\n\nYour $95/month Phone System subscription includes calls and two-way SMS.`)) return;
    setPurchasingNumber(phoneNumber);
    setSearchError('');
    try {
      const r = await apiFetch('/api/stripe/create-phone-number-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          countryCode: buyCountry,
          label: 'main',
          requestId: crypto.randomUUID(),
        }) });
      const d = await r.json();
      if (r.ok && d.url) {
        window.location.assign(d.url);
        return;
      } else {
        setSearchError(d.detail || d.error || 'Purchase failed');
      }
    } catch { setSearchError('Purchase failed'); }
    setPurchasingNumber('');
  };

  const setActiveNumber = async (id: number) => {
    setSettingActiveId(id);
    setError('');
    try {
      const r = await apiFetch(`/api/twilio/phone-numbers/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }) });
      if (r.ok) await fetchPhoneNumbers();
      else setError(`Failed to set active (${r.status})`);
    } catch { setError('Network error setting active number'); }
    setSettingActiveId(null);
  };

  const deletePhoneNumber = async (id: number) => {
    const number = phoneNumbers.find(n => n.id === id);
    if (!window.confirm(`Release ${number ? formatPhone(number.number) : 'this number'} from Twilio?\n\nThis is permanent. Calls and texts to it will stop immediately.`)) return;
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
      icon={<Hash size={24} style={{ color: slate(0.8) }} />}
      statusLine={
        <span style={{ color: slate(0.55) }}>
          {phoneNumbers.length} CUSTOM · {activeCount} ACTIVE · DEFAULT {defaultNumber ? formatPhone(defaultNumber) : 'UNAVAILABLE'}
        </span>
      }
    >
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 18px', background: slate(0.02), border: `1px solid ${destructive(0.2)}`, borderRadius: 8, fontSize: '0.65rem', color: destructive(0.9), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: destructive(0.8) }} />
            {error}
          </div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: destructive(0.55), cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}
      {checkoutResult === 'success' && (
        <div style={{ marginBottom: 16, padding: '12px 18px', border: `1px solid ${primary(0.3)}`, borderRadius: 8, color: primary(0.9), fontSize: '0.6rem' }}>
          PAYMENT RECEIVED — Twilio provisioning is finishing in the background. Refresh this list in a moment.
        </div>
      )}
      {checkoutResult === 'cancel' && (
        <div style={{ marginBottom: 16, padding: '12px 18px', border: `1px solid ${warning(0.3)}`, borderRadius: 8, color: warning(0.9), fontSize: '0.6rem' }}>
          CHECKOUT CANCELLED — no number was purchased.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBlock label="TOTAL NUMBERS" value={phoneNumbers.length} />
        <StatBlock label="ACTIVE" value={activeCount} color={activeCount > 0 ? warning : undefined} />
        <StatBlock label="HOME REALM" value={regionDefaults?.countryInfo.flag ?? '—'} sub={regionDefaults?.countryInfo.region ?? undefined} color={primary} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Buy a number */}
        <PhoneCard>
          <PhoneCardHeader><Search size={11} /> BUY A NUMBER</PhoneCardHeader>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.52rem', color: warning(0.9) }}>$10 ONE-TIME PER CUSTOM NUMBER</div>
            <div style={{ fontSize: '0.48rem', color: slate(0.55) }}>The $95/month Phone System includes two-way SMS and a default platform toll-free number.</div>
            {regionDefaults && (
              <div style={{ fontSize: '0.5rem', color: slate(0.55) }}>
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
              <div style={{ fontSize: '0.5rem', color: warning(0.85), border: `1px solid ${warning(0.3)}`, background: warning(0.06), padding: '6px 8px', borderRadius: 6, display: 'flex', gap: 6 }}>
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
            {searchError && <div style={{ fontSize: '0.5rem', color: destructive(0.8) }}>{searchError}</div>}
            {availableNumbers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                {availableNumbers.map(n => (
                  <div key={n.phoneNumber} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: `1px solid ${slate(0.1)}`, borderRadius: 6, background: slate(0.02) }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6rem', color: slate(0.85) }}>{formatPhone(n.phoneNumber)}</div>
                      {(n.locality || n.region) && <div style={{ fontSize: '0.45rem', color: slate(0.55) }}>{[n.locality, n.region].filter(Boolean).join(', ')}</div>}
                    </div>
                    <PhoneBtn onClick={() => purchaseNumber(n.phoneNumber)} disabled={!!purchasingNumber} size="sm" color={primary} data-testid={`button-buy-${n.phoneNumber}`}>
                      {purchasingNumber === n.phoneNumber ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} BUY
                    </PhoneBtn>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PhoneCard>

      </div>

      {/* Configured numbers */}
      <PhoneCard>
        <PhoneCardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>YOUR NUMBERS</span>
          <span style={{ color: slate(0.5), fontVariantNumeric: 'tabular-nums' }}>{phoneNumbers.length}</span>
        </PhoneCardHeader>
        {phoneNumbers.length === 0 ? (
          <EmptyState message={defaultNumber ? `USING PLATFORM DEFAULT ${formatPhone(defaultNumber)} — BUY OR ADD A CUSTOM NUMBER ABOVE` : "NO NUMBERS CONFIGURED — BUY OR ADD A NUMBER ABOVE"} icon={<Hash size={32} />} />
        ) : (
          <div>
            {phoneNumbers.map(n => (
              <div
                key={n.id}
                data-testid={`number-row-${n.id}`}
                style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: `1px solid ${slate(0.04)}`,
                  background: n.isActive ? slate(0.04) : 'transparent' }}
              >
                <div style={{ color: n.isActive ? slate(0.8) : slate(0.2), flexShrink: 0 }}>
                  {n.isActive ? <CheckCircle2 size={16} /> : <Hash size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: slate(0.85), display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.countryCode ? `${(regionDefaults?.countries.find(c => c.iso === n.countryCode)?.flag) ?? ''} ` : ''}{formatPhone(n.number)}
                    {n.isActive && (
                      <span style={{ fontSize: '0.4rem', color: warning(0.9), letterSpacing: '0.15em', padding: '1px 6px', borderRadius: 3, background: warning(0.08), border: `1px solid ${warning(0.25)}` }}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.48rem', color: slate(0.55), marginTop: 2 }}>
                    {n.label} · {n.routingMode}{n.region ? ` · ${n.region}` : ''}
                  </div>
                  {n.greeting && <div style={{ fontSize: '0.45rem', color: slate(0.55), fontStyle: 'italic', marginTop: 2 }}>"{n.greeting.slice(0, 80)}{n.greeting.length > 80 ? '...' : ''}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!n.isActive && (
                    <PhoneBtn onClick={() => setActiveNumber(n.id)} disabled={settingActiveId === n.id} size="sm" color={warning} data-testid={`button-set-active-${n.id}`}>
                      {settingActiveId === n.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} SET ACTIVE
                    </PhoneBtn>
                  )}
                  <PhoneBtn onClick={() => deletePhoneNumber(n.id)} disabled={deletingId === n.id} size="sm" color={destructive} title="Delete number" data-testid={`button-delete-${n.id}`}>
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
