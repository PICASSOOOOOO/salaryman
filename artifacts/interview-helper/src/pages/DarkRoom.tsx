import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clapperboard, Image, FileText, Share2, Camera, Video } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { useBoomerMode } from '@/hooks/use-mobile';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';

const ContentStudioInner = lazy(() => import('./ContentStudio'));
const ProductionStudioInner = lazy(() => import('./ProductionStudio'));

type DarkRoomTab = 'graphics' | 'copy' | 'social' | 'image' | 'video';

const ACCENT_CYAN = '#22d3ee';

const LOADER = (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '60vh', color: ACCENT_CYAN,
    fontFamily: "var(--font-sans)", fontSize: '0.9rem', letterSpacing: '.15em',
  }}>
    DEVELOPING...
  </div>
);

export default function DarkRoom() {
  const [boomerMode] = useBoomerMode();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<DarkRoomTab>('graphics');

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access the Dark Room.' : 'Salaryman credentials required. DARK ROOM access locked.'} />;
  }

  const tabs: { id: DarkRoomTab; label: string; boomerLabel: string; icon: typeof Image; desc: string }[] = [
    { id: 'graphics', label: 'GRAPHICS', boomerLabel: 'IMAGES', icon: Image, desc: 'AI image generation + canvas editor' },
    { id: 'copy', label: 'COPY', boomerLabel: 'COPYWRITING', icon: FileText, desc: 'Marketing copy, emails, ads & pitches' },
    { id: 'social', label: 'SOCIAL', boomerLabel: 'SOCIAL MEDIA', icon: Share2, desc: 'Social media templates & scheduling' },
    { id: 'image', label: 'PRODUCTION', boomerLabel: 'PRODUCTION', icon: Camera, desc: 'Image production — clothing, lookbook, billboard, film, packaging' },
    { id: 'video', label: 'VIDEO', boomerLabel: 'VIDEO SCRIPTS', icon: Video, desc: 'TV commercial, music video, brand film & social video scripts' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: ACCENT_CYAN }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: '24px', borderBottom: '1px solid rgba(56,189,248,0.15)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            {/* hummingbird strip floats right */}
            <div style={{ marginLeft: 'auto' }}>
              <HummingBirdAttachStrip toolKey="dark-room" buttonStyle="ghost" pickerTitle="SCORE THIS PROJECT" />
            </div>
            <div style={{
              width: '36px', height: '36px',
              border: '1px solid rgba(34,211,238,0.4)',
              background: 'rgba(30,41,59,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Clapperboard className="w-5 h-5" style={{ color: ACCENT_CYAN }} />
            </div>
            <div>
              <h1 style={{
                fontFamily: "var(--font-sans)",
                fontSize: '1.4rem',
                letterSpacing: '0.12em',
                color: ACCENT_CYAN,
                lineHeight: 1,
              }}>
                {boomerMode ? 'DARK ROOM' : PABLO_PRODUCTS.DARK_ROOM.name}
              </h1>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: '0.6rem', color: 'rgba(56,189,248,0.35)', letterSpacing: '0.1em', marginTop: '4px' }}>
                {boomerMode ? 'Creative studio — graphics, copy, social, production & video' : PABLO_PRODUCTS.DARK_ROOM.desc}
              </p>
            </div>
          </div>
        </div>

        <div className="scrollbar-hide" style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid rgba(56,189,248,0.15)', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  flexShrink: 0, whiteSpace: 'nowrap',
                  fontFamily: "var(--font-sans)",
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: active ? ACCENT_CYAN : 'rgba(34,211,238,0.45)',
                  background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(34,211,238,0.4)' : 'transparent'}`,
                  borderBottom: active ? '1px solid #0f172a' : '1px solid transparent',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  marginBottom: active ? '-1px' : '0',
                  transition: 'all 0.15s',
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

        <div style={{ marginBottom: '16px', fontFamily: "var(--font-sans)", fontSize: '0.65rem', color: 'rgba(56,189,248,0.3)', letterSpacing: '0.1em' }}>
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
              {(activeTab === 'graphics' || activeTab === 'copy' || activeTab === 'social') && (
                <ContentStudioInner embedded initialTab={activeTab} />
              )}
              {(activeTab === 'image' || activeTab === 'video') && (
                <ProductionStudioInner embedded initialTab={activeTab} />
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>

        <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(56,189,248,0.08)', textAlign: 'center' }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: '0.55rem', color: 'rgba(56,189,248,0.2)', letterSpacing: '0.12em' }}>
            PABLO USES YOUR BRAND KIT FROM DASHBOARD · CONTENT IS AI-GENERATED · REVIEW BEFORE PUBLISHING
          </span>
        </div>
      </div>
    </div>
  );
}
