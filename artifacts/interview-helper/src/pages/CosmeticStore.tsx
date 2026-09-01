import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useBoomerMode } from '@/hooks/use-mobile';

export type CosmeticCategory = 'all' | 'skin' | 'vehicle' | 'weapon' | 'emote' | 'theme';

interface CosmeticItem {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCrypto: number;
  rarity: string;
  colorHex?: string;
  iconEmoji?: string;
}

interface CryptoBundle {
  id: string;
  label: string;
  amount: number;
  cents: number;
  popular: boolean;
}

interface PlayerCosmetic {
  cosmeticId: string;
  equipped: boolean;
}

const RARITY_COLOR: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#55cc44',
  rare: '#4488ff',
  epic: '#cc44ff',
  legendary: '#ffaa00',
};

const CATEGORY_LABELS: Record<CosmeticCategory, string> = {
  all: 'ALL ITEMS',
  skin: '👤 SKINS',
  vehicle: '🚗 WRAPS',
  weapon: '🗡️ WEAPONS',
  emote: '💬 EMOTES',
  theme: '🎨 THEMES',
};

interface Props {
  onClose: () => void;
  onEquipChange?: (equipped: Record<string, string>) => void;
}

export default function CosmeticStore({ onClose, onEquipChange }: Props) {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const VT: React.CSSProperties = boomerMode ? {} : { fontFamily: "var(--font-sans)" };
  const ST: React.CSSProperties = boomerMode ? {} : { fontFamily: "var(--font-sans)" };
  const [tab, setTab] = useState<'store' | 'wardrobe' | 'bundles'>('store');
  const [category, setCategory] = useState<CosmeticCategory>('all');
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [inventory, setInventory] = useState<PlayerCosmetic[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [bundles, setBundles] = useState<CryptoBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, balanceRes, bundlesRes] = await Promise.all([
        apiFetch('/api/cosmetics/catalog'),
        isAuthenticated ? apiFetch('/api/cosmetics/balance', { credentials: 'include' }) : Promise.resolve(null),
        apiFetch('/api/cosmetics/bundles'),
      ]);
      if (catalogRes.ok) setCatalog((await catalogRes.json()).items ?? []);
      if (balanceRes?.ok) setBalance((await balanceRes.json()).balance ?? 0);
      if (bundlesRes.ok) setBundles((await bundlesRes.json()).bundles ?? []);
      if (isAuthenticated) {
        const invRes = await apiFetch('/api/cosmetics/inventory', { credentials: 'include' });
        if (invRes.ok) {
          const inv = (await invRes.json()).inventory ?? [];
          setInventory(inv);
          const equippedMap: Record<string, string> = {};
          for (const item of inv) {
            if (item.equipped) {
              const catalogItem = catalog.find(c => c.id === item.cosmeticId);
              if (catalogItem) equippedMap[catalogItem.category] = item.cosmeticId;
            }
          }
          onEquipChange?.(equippedMap);
        }
      }
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBuy = async (item: CosmeticItem) => {
    if (!isAuthenticated) { showToast('LOGIN REQUIRED', false); return; }
    setBuyingId(item.id);
    try {
      const res = await apiFetch('/api/cosmetics/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cosmeticId: item.id }),
      });
      const j = await res.json();
      if (res.ok) {
        setBalance(j.newBalance);
        setInventory(prev => [...prev, { cosmeticId: item.id, equipped: false }]);
        showToast(`ACQUIRED: ${item.name}`);
      } else if (res.status === 402) {
        showToast('INSUFFICIENT FIAT — BUY MORE BUNDLES', false);
      } else if (res.status === 409) {
        showToast('ALREADY OWNED', false);
      } else {
        showToast(j.error ?? 'TRANSACTION FAILED', false);
      }
    } catch {
      showToast('NETWORK ERROR', false);
    }
    setBuyingId(null);
  };

  const handleEquip = async (cosmeticId: string, currentlyEquipped: boolean) => {
    if (!isAuthenticated) return;
    setEquippingId(cosmeticId);
    try {
      const res = await apiFetch('/api/cosmetics/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cosmeticId, equipped: !currentlyEquipped }),
      });
      if (res.ok) {
        const newEquipped = !currentlyEquipped;
        const thisItem = catalog.find(c => c.id === cosmeticId);
        setInventory(prev => prev.map(i => {
          if (i.cosmeticId === cosmeticId) return { ...i, equipped: newEquipped };
          if (newEquipped && thisItem && catalog.find(c => c.id === i.cosmeticId)?.category === thisItem.category) {
            return { ...i, equipped: false };
          }
          return i;
        }));
        const newEquippedMap: Record<string, string> = {};
        for (const inv of inventory) {
          const cat = catalog.find(c => c.id === inv.cosmeticId)?.category;
          if (cat) {
            const isThis = inv.cosmeticId === cosmeticId;
            const eq = isThis ? newEquipped : (inv.equipped && !(newEquipped && thisItem && cat === thisItem.category));
            if (eq) newEquippedMap[cat] = inv.cosmeticId;
          }
        }
        if (newEquipped && thisItem) newEquippedMap[thisItem.category] = cosmeticId;
        onEquipChange?.(newEquippedMap);
        showToast(newEquipped ? 'EQUIPPED' : 'UNEQUIPPED');
      } else {
        showToast('EQUIP FAILED', false);
      }
    } catch {
      showToast('NETWORK ERROR', false);
    }
    setEquippingId(null);
  };

  const handleCheckout = async (bundleId: string) => {
    if (!isAuthenticated) { showToast('LOGIN REQUIRED', false); return; }
    setCheckoutLoading(bundleId);
    try {
      const res = await apiFetch('/api/cosmetics/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bundleId }),
      });
      const j = await res.json();
      if (res.ok && j.url) {
        window.location.href = j.url;
      } else {
        showToast(j.error ?? 'CHECKOUT FAILED', false);
      }
    } catch {
      showToast('NETWORK ERROR', false);
    }
    setCheckoutLoading(null);
  };

  const ownedSet = new Set(inventory.map(i => i.cosmeticId));
  const equippedSet = new Set(inventory.filter(i => i.equipped).map(i => i.cosmeticId));

  const filteredCatalog = category === 'all' ? catalog : catalog.filter(c => c.category === category);
  const wardrobeItems = catalog.filter(c => ownedSet.has(c.id));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,2,0,.97)',
      display: 'flex', flexDirection: 'column', ...ST,
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
        @keyframes shimmer { 0%{background-position:-200px}100%{background-position:200px} }
        .fiat-btn:hover { filter: brightness(1.3); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(56,189,248,.02); }
        ::-webkit-scrollbar-thumb { background: rgba(56,189,248,.15); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? 'rgba(56,189,248,.15)' : 'rgba(255,68,68,.15)',
          border: `1px solid ${toast.ok ? 'rgba(56,189,248,.5)' : 'rgba(255,68,68,.5)'}`,
          color: toast.ok ? '#38bdf8' : '#ff4444',
          padding: '.4rem 1rem', ...VT, fontSize: '1.1rem', letterSpacing: '.12em',
          zIndex: 10001, pointerEvents: 'none',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ padding: '.6rem 1rem', borderBottom: '1px solid rgba(56,189,248,.2)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <div>
          <div style={{ ...VT, fontSize: '1.6rem', color: '#38bdf8', letterSpacing: '.2em', textShadow: '0 0 16px rgba(56,189,248,.4)' }}>
            COSMETIC STORE
          </div>
          <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em' }}>PABLO CORP COSMETIC EXCHANGE ALPHA {__BUILD_VERSION__}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.45rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em' }}>BALANCE</div>
            <div style={{ ...VT, fontSize: '1.4rem', color: '#ffcc00', letterSpacing: '.1em', textShadow: '0 0 10px rgba(255,200,0,.3)' }}>
              ƒ {balance.toLocaleString()} FIAT
            </div>
          </div>
          <button
            onClick={onClose}
            className="fiat-btn"
            style={{ ...VT, fontSize: '1.4rem', color: '#ff4444', background: 'rgba(255,68,68,.08)', border: '1px solid rgba(255,68,68,.4)', padding: '.2rem .7rem', cursor: 'pointer', letterSpacing: '.08em' }}
          >
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(56,189,248,.1)', flexShrink: 0 }}>
        {([
          { id: 'store', label: '🛒 STORE' },
          { id: 'wardrobe', label: `🧥 WARDROBE (${wardrobeItems.length})` },
          { id: 'bundles', label: 'ƒ BUY FIAT' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '.5rem', border: 'none',
              borderBottom: tab === t.id ? '2px solid #38bdf8' : '2px solid transparent',
              background: tab === t.id ? 'rgba(56,189,248,.06)' : 'transparent',
              color: tab === t.id ? '#38bdf8' : 'rgba(56,189,248,.35)',
              cursor: 'pointer', ...VT, fontSize: '1rem', letterSpacing: '.1em',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...VT, fontSize: '1.5rem', color: '#38bdf8', letterSpacing: '.2em', animation: 'pulse 1.2s infinite' }}>LOADING...</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

          {/* ── STORE TAB ── */}
          {tab === 'store' && (
            <>
              {/* Category filter */}
              <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {(Object.keys(CATEGORY_LABELS) as CosmeticCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      ...ST, fontSize: '.55rem', letterSpacing: '.08em',
                      padding: '.3rem .6rem', cursor: 'pointer', border: 'none',
                      background: category === cat ? 'rgba(56,189,248,.15)' : 'rgba(56,189,248,.04)',
                      color: category === cat ? '#38bdf8' : 'rgba(56,189,248,.4)',
                      borderBottom: category === cat ? '2px solid #38bdf8' : '2px solid transparent',
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.6rem' }}>
                {filteredCatalog.map(item => {
                  const owned = ownedSet.has(item.id);
                  const equipped = equippedSet.has(item.id);
                  const rarityColor = RARITY_COLOR[item.rarity] ?? '#aaaaaa';
                  const isBuying = buyingId === item.id;
                  return (
                    <div
                      key={item.id}
                      style={{
                        border: equipped ? `1px solid ${rarityColor}` : owned ? '1px solid rgba(56,189,248,.25)' : '1px solid rgba(56,189,248,.12)',
                        background: equipped ? `${rarityColor}12` : owned ? 'rgba(56,189,248,.05)' : 'rgba(56,189,248,.02)',
                        padding: '.7rem',
                        position: 'relative',
                        transition: 'border .2s',
                      }}
                    >
                      {/* Rarity badge */}
                      <div style={{ position: 'absolute', top: 6, right: 8, fontSize: '.42rem', color: rarityColor, letterSpacing: '.1em', ...ST }}>
                        {item.rarity.toUpperCase()}
                      </div>

                      {/* Icon + color swatch */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
                        <div style={{ width: 28, height: 28, background: item.colorHex ?? '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', border: `1px solid ${rarityColor}44` }}>
                          {item.iconEmoji}
                        </div>
                        <div>
                          <div style={{ ...VT, fontSize: '1rem', color: rarityColor, letterSpacing: '.06em', lineHeight: 1 }}>{item.name}</div>
                          <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.08em' }}>{item.category.toUpperCase()}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.5)', lineHeight: 1.6, marginBottom: '.5rem' }}>
                        {item.description}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ ...VT, fontSize: '1.1rem', color: '#ffcc00', letterSpacing: '.05em' }}>
                          ƒ {item.priceCrypto.toLocaleString()}
                        </div>
                        {owned ? (
                          <div style={{ fontSize: '.5rem', color: '#38bdf8', letterSpacing: '.08em', ...ST }}>✓ OWNED</div>
                        ) : (
                          <button
                            onClick={() => handleBuy(item)}
                            disabled={isBuying || balance < item.priceCrypto}
                            className="fiat-btn"
                            style={{
                              ...ST, fontSize: '.55rem', letterSpacing: '.08em',
                              padding: '.3rem .6rem', cursor: balance < item.priceCrypto ? 'not-allowed' : 'pointer',
                              background: balance < item.priceCrypto ? 'rgba(255,68,68,.06)' : 'rgba(56,189,248,.1)',
                              border: balance < item.priceCrypto ? '1px solid rgba(255,68,68,.3)' : '1px solid rgba(56,189,248,.4)',
                              color: balance < item.priceCrypto ? 'rgba(255,68,68,.5)' : '#38bdf8',
                              opacity: isBuying ? 0.5 : 1,
                            }}
                          >
                            {isBuying ? '...' : 'BUY'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredCatalog.length === 0 && (
                <div style={{ textAlign: 'center', color: 'rgba(56,189,248,.3)', marginTop: '3rem', ...VT, fontSize: '1.3rem', letterSpacing: '.15em' }}>
                  NO ITEMS IN THIS CATEGORY
                </div>
              )}
            </>
          )}

          {/* ── WARDROBE TAB ── */}
          {tab === 'wardrobe' && (
            <>
              <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.25)', letterSpacing: '.12em', marginBottom: '.75rem' }}>
                OWNED COSMETICS — EQUIP TO APPLY IN GAME
              </div>
              {wardrobeItems.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(56,189,248,.25)', marginTop: '3rem', ...VT, fontSize: '1.3rem', letterSpacing: '.15em' }}>
                  NO COSMETICS OWNED<br />
                  <span style={{ fontSize: '.8rem', color: 'rgba(56,189,248,.18)' }}>VISIT THE STORE TO ACQUIRE ITEMS</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.6rem' }}>
                  {wardrobeItems.map(item => {
                    const owned = inventory.find(i => i.cosmeticId === item.id);
                    const equipped = owned?.equipped ?? false;
                    const rarityColor = RARITY_COLOR[item.rarity] ?? '#aaaaaa';
                    const isEquipping = equippingId === item.id;
                    return (
                      <div
                        key={item.id}
                        style={{
                          border: equipped ? `1px solid ${rarityColor}` : '1px solid rgba(56,189,248,.2)',
                          background: equipped ? `${rarityColor}10` : 'rgba(56,189,248,.03)',
                          padding: '.7rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
                          <div style={{ width: 28, height: 28, background: item.colorHex ?? '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', border: `1px solid ${rarityColor}44` }}>
                            {item.iconEmoji}
                          </div>
                          <div>
                            <div style={{ ...VT, fontSize: '1rem', color: rarityColor, letterSpacing: '.06em', lineHeight: 1 }}>{item.name}</div>
                            <div style={{ fontSize: '.42rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.08em' }}>{item.category.toUpperCase()} · {item.rarity.toUpperCase()}</div>
                          </div>
                          {equipped && (
                            <div style={{ marginLeft: 'auto', fontSize: '.45rem', color: '#38bdf8', ...ST, letterSpacing: '.08em' }}>● EQUIPPED</div>
                          )}
                        </div>
                        <div style={{ fontSize: '.55rem', color: 'rgba(56,189,248,.45)', lineHeight: 1.6, marginBottom: '.5rem' }}>
                          {item.description}
                        </div>
                        <button
                          onClick={() => handleEquip(item.id, equipped)}
                          disabled={isEquipping}
                          className="fiat-btn"
                          style={{
                            width: '100%', ...ST, fontSize: '.6rem', letterSpacing: '.1em',
                            padding: '.35rem', cursor: 'pointer',
                            background: equipped ? 'rgba(255,68,68,.08)' : 'rgba(56,189,248,.1)',
                            border: equipped ? '1px solid rgba(255,68,68,.4)' : '1px solid rgba(56,189,248,.4)',
                            color: equipped ? '#ff6666' : '#38bdf8',
                            opacity: isEquipping ? 0.5 : 1,
                          }}
                        >
                          {isEquipping ? '...' : equipped ? 'UNEQUIP' : 'EQUIP'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── BUNDLES TAB ── */}
          {tab === 'bundles' && (
            <>
              <div style={{ maxWidth: 480, margin: '0 auto' }}>
                <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                  <div style={{ ...VT, fontSize: '1.4rem', color: '#ffcc00', letterSpacing: '.15em', textShadow: '0 0 12px rgba(255,200,0,.3)' }}>BUY FIAT BUNDLES</div>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.1em', marginTop: '.3rem' }}>
                    FIAT (ƒ) is the in-game currency of SALARYMAN. Spend it in the store on cosmetics — never pay-to-win.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  {bundles.map(bundle => (
                    <div
                      key={bundle.id}
                      style={{
                        border: bundle.popular ? '1px solid rgba(255,200,0,.5)' : '1px solid rgba(56,189,248,.2)',
                        background: bundle.popular ? 'rgba(255,200,0,.04)' : 'rgba(56,189,248,.02)',
                        padding: '1rem',
                        position: 'relative',
                      }}
                    >
                      {bundle.popular && (
                        <div style={{ position: 'absolute', top: -1, right: 12, ...VT, fontSize: '.8rem', color: '#ffcc00', letterSpacing: '.1em', background: 'rgba(255,200,0,.15)', border: '1px solid rgba(255,200,0,.3)', padding: '0 .4rem', transform: 'translateY(-50%)' }}>
                          BEST VALUE
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ ...VT, fontSize: '1.4rem', color: bundle.popular ? '#ffcc00' : '#38bdf8', letterSpacing: '.12em' }}>
                            {bundle.label}
                          </div>
                          <div style={{ ...VT, fontSize: '1.8rem', color: '#ffcc00', letterSpacing: '.1em' }}>
                            ƒ {bundle.amount.toLocaleString()} FIAT
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ ...VT, fontSize: '2rem', color: '#38bdf8', letterSpacing: '.08em' }}>
                            ${(bundle.cents / 100).toFixed(2)}
                          </div>
                          <button
                            onClick={() => handleCheckout(bundle.id)}
                            disabled={checkoutLoading === bundle.id}
                            className="fiat-btn"
                            style={{
                              marginTop: '.4rem', ...ST, fontSize: '.6rem', letterSpacing: '.1em',
                              padding: '.4rem 1rem', cursor: 'pointer',
                              background: bundle.popular ? 'rgba(255,200,0,.15)' : 'rgba(56,189,248,.1)',
                              border: bundle.popular ? '1px solid rgba(255,200,0,.5)' : '1px solid rgba(56,189,248,.4)',
                              color: bundle.popular ? '#ffcc00' : '#38bdf8',
                              opacity: checkoutLoading === bundle.id ? 0.5 : 1,
                            }}
                          >
                            {checkoutLoading === bundle.id ? 'REDIRECTING...' : 'PURCHASE'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1.5rem', padding: '.75rem', border: '1px solid rgba(56,189,248,.08)', background: 'rgba(56,189,248,.02)' }}>
                  <div style={{ fontSize: '.5rem', color: 'rgba(56,189,248,.3)', letterSpacing: '.08em', lineHeight: 1.8 }}>
                    ⬡ FIAT (ƒ) never expires and cannot be transferred between accounts.<br />
                    ⬡ Purchases are processed securely via Stripe.<br />
                    ⬡ FIAT (ƒ) has no gameplay effect — purely cosmetic.<br />
                    ⬡ No refunds once FIAT has been spent on cosmetics.
                  </div>
                </div>

                {/* Purchase history link */}
                <div style={{ marginTop: '.5rem', textAlign: 'center', fontSize: '.45rem', color: 'rgba(56,189,248,.2)', letterSpacing: '.08em' }}>
                  Current balance: ƒ {balance.toLocaleString()} FIAT
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
