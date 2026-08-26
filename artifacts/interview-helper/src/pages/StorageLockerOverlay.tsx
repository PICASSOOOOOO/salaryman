import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api-client';

interface CatalogItem {
  id: string;
  name: string;
  type?: string;
  description?: string;
}

function lockerSlot(): number {
  try {
    return parseInt(localStorage.getItem('sm_slot') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

const PANEL: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
};

export default function StorageLockerOverlay({ onClose }: { onClose: () => void }) {
  const slot = useMemo(() => lockerSlot(), []);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [carried, setCarried] = useState<Set<string>>(new Set());
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [catRes, invRes, stRes] = await Promise.all([
        apiFetch('/api/items/catalog'),
        apiFetch(`/api/items/inventory?slot=${slot}`),
        apiFetch(`/api/items/storage?slot=${slot}`),
      ]);
      const cat = await catRes.json();
      setCatalog(Array.isArray(cat.items) ? cat.items : []);
      if (invRes.ok) {
        const inv = await invRes.json();
        setCarried(new Set<string>(inv.itemIds ?? []));
      }
      if (stRes.ok) {
        const st = await stRes.json();
        setStored(new Set<string>(st.itemIds ?? []));
      }
    } catch {
      setNotice('Could not reach the locker network.');
    } finally {
      setLoading(false);
    }
  }, [slot]);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const it of catalog) m.set(it.id, it);
    return m;
  }, [catalog]);

  const move = useCallback(
    async (path: string, itemId: string) => {
      if (busy) return;
      setBusy(true);
      setNotice('');
      try {
        const res = await apiFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, itemId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          await load();
        } else {
          setNotice(data.error ?? 'That move was rejected.');
        }
      } catch {
        setNotice('Network error — try again.');
      } finally {
        setBusy(false);
      }
    },
    [busy, slot, load],
  );

  const carriedItems = useMemo(
    () => [...carried].map((id) => byId.get(id)).filter(Boolean) as CatalogItem[],
    [carried, byId],
  );
  const storedItems = useMemo(
    () => [...stored].map((id) => byId.get(id)).filter(Boolean) as CatalogItem[],
    [stored, byId],
  );

  const col = (
    title: string,
    sub: string,
    items: CatalogItem[],
    action: 'deposit' | 'withdraw',
  ) => (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(56,189,248,.25)',
        background: 'rgba(6,12,18,.85)',
      }}
    >
      <div
        style={{
          padding: '.5rem .7rem',
          borderBottom: '1px solid rgba(56,189,248,.2)',
          color: '#9fe6ff',
          fontSize: '.9rem',
          letterSpacing: '.05em',
        }}
      >
        {title}
        <div style={{ color: 'rgba(120,160,180,.7)', fontSize: '.7rem', marginTop: '.15rem' }}>{sub}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '.4rem' }}>
        {items.length === 0 ? (
          <div style={{ color: 'rgba(120,150,170,.55)', fontSize: '.75rem', padding: '.6rem .3rem' }}>
            {action === 'deposit' ? 'Nothing on hand to stash.' : 'The locker is empty.'}
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '.5rem',
                padding: '.35rem .45rem',
                marginBottom: '.3rem',
                border: '1px solid rgba(56,189,248,.12)',
                background: 'rgba(10,18,26,.6)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#cfeeff', fontSize: '.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.name}
                </div>
                {it.type && (
                  <div style={{ color: 'rgba(120,160,180,.6)', fontSize: '.62rem', textTransform: 'uppercase' }}>{it.type}</div>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => move(`/api/items/storage/${action}`, it.id)}
                style={{
                  flexShrink: 0,
                  padding: '.25rem .55rem',
                  background: 'transparent',
                  border: '1px solid rgba(56,189,248,.4)',
                  color: '#9fe6ff',
                  cursor: busy ? 'wait' : 'pointer',
                  fontSize: '.7rem',
                  fontFamily: 'inherit',
                }}
              >
                {action === 'deposit' ? 'STORE →' : '← TAKE'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(2,6,10,.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        ...PANEL,
      }}
    >
      <div
        style={{
          width: 'min(680px, 96vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(56,189,248,.35)',
          background: 'rgba(4,9,14,.96)',
          boxShadow: '0 0 40px rgba(56,189,248,.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '.6rem .8rem',
            borderBottom: '1px solid rgba(56,189,248,.25)',
          }}
        >
          <div style={{ color: '#9fe6ff', fontSize: '1rem', letterSpacing: '.08em' }}>STORAGE LOCKER</div>
          <button
            onClick={onClose}
            style={{
              padding: '.2rem .6rem',
              background: 'transparent',
              border: '1px solid rgba(56,189,248,.25)',
              color: 'rgba(56,189,248,.6)',
              cursor: 'pointer',
              fontSize: '.8rem',
              fontFamily: 'inherit',
            }}
          >
            ESC
          </button>
        </div>
        <div style={{ padding: '.4rem .8rem', color: 'rgba(150,180,200,.7)', fontSize: '.72rem', borderBottom: '1px solid rgba(56,189,248,.12)' }}>
          Stored gear stays safe at home — it isn't carried and can't be equipped until you withdraw it.
        </div>
        {notice && (
          <div style={{ padding: '.4rem .8rem', color: '#ffb37a', fontSize: '.72rem' }}>{notice}</div>
        )}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(120,160,180,.6)' }}>Accessing locker…</div>
        ) : (
          <div style={{ display: 'flex', gap: '.6rem', padding: '.6rem', overflow: 'hidden' }}>
            {col('ON HAND', 'Carried gear — store it away', carriedItems, 'deposit')}
            {col('IN LOCKER', 'Stashed gear — pull it out', storedItems, 'withdraw')}
          </div>
        )}
      </div>
    </div>
  );
}
