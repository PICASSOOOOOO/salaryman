import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Clapperboard, Camera } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { useBoomerMode } from '@/hooks/use-mobile';

const ContentStudioInner = lazy(() => import('./ContentStudio'));
const ProductionStudioInner = lazy(() => import('./ProductionStudio'));

type DarkRoomTab = 'content' | 'production';

const CRT_GREEN = '#38bdf8';

const LOADER = (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '60vh', color: CRT_GREEN,
    fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem', letterSpacing: '.15em',
  }}>
    DEVELOPING...
  </div>
);

export default function DarkRoom() {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<DarkRoomTab>('content');

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access the Dark Room.' : 'Operative credentials required. DARK ROOM access locked.'} />;
  }

  const tabs: { id: DarkRoomTab; label: string; boomerLabel: string; icon: typeof Layers; desc: string }[] = [
    { id: 'content', label: 'FORGE', boomerLabel: 'CONTENT STUDIO', icon: Layers, desc: 'Graphics, copy & social content generation' },
    { id: 'production', label: 'EXPOSURE', boomerLabel: 'PRODUCTION STUDIO', icon: Camera, desc: 'Image production, video scripts & visual assets' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#030803', color: CRT_GREEN }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(56,189,248,0.15)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{
              width: '36px', height: '36px',
              border: '1px solid rgba(56,189,248,0.5)',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(56,189,248,0.1)',
            }}>
              <Clapperboard className="w-5 h-5" style={{ color: CRT_GREEN }} />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '1.4rem',
                letterSpacing: '0.12em',
                color: CRT_GREEN,
                textShadow: '0 0 12px rgba(56,189,248,0.5)',
                lineHeight: 1,
              }}>
                {boomerMode ? 'DARK ROOM' : PABLO_PRODUCTS.DARK_ROOM.name}
              </h1>
              <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.6rem', color: 'rgba(56,189,248,0.35)', letterSpacing: '0.1em', marginTop: '4px' }}>
                {boomerMode ? 'Content creation & production studio' : PABLO_PRODUCTS.DARK_ROOM.desc}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid rgba(56,189,248,0.15)' }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: active ? CRT_GREEN : 'rgba(56,189,248,0.35)',
                  background: active ? 'rgba(56,189,248,0.08)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(56,189,248,0.4)' : 'transparent'}`,
                  borderBottom: active ? '1px solid #030803' : '1px solid transparent',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  marginBottom: active ? '-1px' : '0',
                  transition: 'all 0.15s',
                  textShadow: active ? '0 0 8px rgba(56,189,248,0.5)' : 'none',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(56,189,248,0.7)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(56,189,248,0.35)'; }}
              >
                <t.icon className="w-3.5 h-3.5" />
                {boomerMode ? t.boomerLabel : t.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: '16px', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', color: 'rgba(56,189,248,0.3)', letterSpacing: '0.1em' }}>
          {tabs.find(t => t.id === activeTab)?.desc.toUpperCase()}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
          >
            <Suspense fallback={LOADER}>
              {activeTab === 'content' && <ContentStudioInner embedded />}
              {activeTab === 'production' && <ProductionStudioInner embedded />}
            </Suspense>
          </motion.div>
        </AnimatePresence>

        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(56,189,248,0.08)', textAlign: 'center' }}>
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.55rem', color: 'rgba(56,189,248,0.2)', letterSpacing: '0.12em' }}>
            PABLO USES YOUR BRAND KIT FROM DASHBOARD · CONTENT IS AI-GENERATED · REVIEW BEFORE PUBLISHING
          </span>
        </div>
      </div>
    </div>
  );
}
