import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { getActiveCityName, hydrateActiveCityFromSave } from '@/lib/city-defs';
import { SignInPage } from '@/components/SignInPrompt';
import { useBoomerMode } from '@/hooks/use-mobile';

interface BillboardRow {
  id: number; locationId: string; label: string;
  ownerPlayerName: string | null; adText: string | null; adImageUrl: string | null;
  priceFlorin: number; rentedUntil: string | null; expired: boolean;
}

export default function BillboardAdmin() {
  hydrateActiveCityFromSave();
  const [boomerMode] = useBoomerMode();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [boards, setBoards] = useState<BillboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [authError, setAuthError] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const r = await apiFetch('/api/billboards', { credentials: 'include' });
      if (r.ok) setBoards(await r.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetSlot = async (id: number) => {
    try {
      const r = await apiFetch(`/api/billboards/${id}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), credentials: 'include',
      });
      const d = await r.json();
      if (d.ok) { setMsg(`Slot ${id} released.`); fetchAll(); }
      else { setMsg(`Error: ${d.error}`); if (r.status === 403) setAuthError(true); }
    } catch { setMsg('Network error'); }
  };

  const updatePrice = async (id: number, price: number) => {
    try {
      const r = await apiFetch(`/api/billboards/${id}/set-price`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceFlorin: price }), credentials: 'include',
      });
      const d = await r.json();
      if (d.ok) { setMsg(`Price updated.`); fetchAll(); }
      else { setMsg(`Error: ${d.error}`); if (r.status === 403) setAuthError(true); }
    } catch { setMsg('Network error'); }
  };

  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access billboard administration." />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060d14', color: '#38bdf8', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), padding: '2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 style={boomerMode ? { fontSize: '2rem', letterSpacing: '.2em', margin: 0 } : { fontFamily: "var(--font-sans)", fontSize: '2rem', letterSpacing: '.2em', margin: 0 }}>BILLBOARD ADMIN</h1>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.3)' }}>{user?.email ?? 'unknown'}</span>
            <button onClick={() => navigate('/dashboard')} style={{ padding: '.4rem 1rem', background: 'transparent', border: '1px solid rgba(56,189,248,.3)', color: '#38bdf8', cursor: 'pointer', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
              ← DASHBOARD
            </button>
          </div>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.3), transparent)', marginBottom: '1rem' }} />
        {authError && <div style={{ padding: '.5rem', background: 'rgba(255,0,0,.05)', border: '1px solid rgba(255,80,80,.3)', marginBottom: '1rem', fontSize: '.6rem', color: '#ff6666' }}>Admin access required. Only owner accounts can modify billboard settings.</div>}
        {msg && <div style={{ padding: '.5rem', background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.2)', marginBottom: '1rem', fontSize: '.7rem' }}>{msg}</div>}
        {loading ? (
          <div style={{ color: 'rgba(56,189,248,.4)', fontSize: '.8rem' }}>Loading billboard data...</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {boards.map(b => (
              <div key={b.id} style={{ border: '1px solid rgba(56,189,248,.15)', padding: '1rem', background: 'rgba(0,10,5,.6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                  <div>
                    <div style={{ fontSize: '.8rem', color: '#00ccff', letterSpacing: '.1em' }}>{b.label}</div>
                    <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.3)' }}>ID: {b.locationId} · DB #{b.id}</div>
                  </div>
                  <div style={{ fontSize: '.6rem', color: b.ownerPlayerName && !b.expired ? '#ff00ff' : 'rgba(56,189,248,.4)' }}>
                    {b.ownerPlayerName && !b.expired ? `OWNED: ${b.ownerPlayerName}` : 'AVAILABLE'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem', marginBottom: '.5rem' }}>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.35)' }}>
                    Price: ç{b.priceFlorin.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.35)' }}>
                    Expires: {b.rentedUntil ? new Date(b.rentedUntil).toLocaleDateString() : '—'}
                  </div>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.35)' }}>
                    Expired: {b.expired ? 'YES' : 'NO'}
                  </div>
                </div>
                {b.adText && (
                  <div style={{ fontSize: '.5rem', color: '#ff88ff', padding: '.3rem', background: 'rgba(255,0,255,.03)', border: '1px solid rgba(255,0,255,.1)', marginBottom: '.5rem', wordBreak: 'break-word' }}>
                    AD: {b.adText}
                  </div>
                )}
                {b.adImageUrl && (
                  <div style={{ marginBottom: '.5rem' }}>
                    <img src={b.adImageUrl} alt="Billboard ad" style={{ maxWidth: 200, maxHeight: 80, objectFit: 'contain', border: '1px solid rgba(255,0,255,.15)' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => resetSlot(b.id)} style={{ padding: '.3rem .8rem', background: 'rgba(255,0,0,.08)', border: '1px solid rgba(255,80,80,.3)', color: '#ff6666', cursor: 'pointer', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.5rem' }}>
                    RESET SLOT
                  </button>
                  <button onClick={() => { const p = prompt('New price (CREAM):', String(b.priceFlorin)); if (p) updatePrice(b.id, parseInt(p)); }} style={{ padding: '.3rem .8rem', background: 'rgba(0,200,255,.06)', border: '1px solid rgba(0,200,255,.3)', color: '#00ccff', cursor: 'pointer', ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }), fontSize: '.5rem' }}>
                    SET PRICE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '1.5rem', fontSize: '.4rem', color: 'rgba(56,189,248,.15)', letterSpacing: '.08em' }}>
          {getActiveCityName()} BILLBOARD ADMINISTRATION · {boards.length} slots configured
        </div>
      </div>
    </div>
  );
}
