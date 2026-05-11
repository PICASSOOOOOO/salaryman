import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { PicassoLogo } from '../components/PicassoLogo';
import { useArtAsset } from '@/lib/art';

/**
 * PabloPromo — the slim "promotional only" page that the SALARYMAN logo
 * on the Pablo nebula links to.
 *
 * Why this exists separately from Cover (/landing):
 *   The full Cover page exposes Get Started, Pricing, Jean Claw, the
 *   changelog and email-signup. Most of those CTAs route into gated
 *   surfaces (`/world`, `/pricing`, `/jean-claw`, OAuth handoff) that
 *   a brand-new visitor — who hasn't even cleared Pablo's intake yet —
 *   shouldn't have access to. Linking Pablo's logo at /landing meant
 *   the user could escape onboarding mid-intake by tapping the icon.
 *
 *   This page deliberately strips the page down to the cinematic promo
 *   (hero image, headline, tagline) plus a single explicit return path
 *   to the nebula. No Get Started. No pricing. No jean-claw. No login.
 *   Onboarding stays the only forward path.
 *
 * Only the Pablo nebula's logo links here; this page is intentionally
 * unlisted in nav, NavBar, and the landing/Cover surface.
 */
export default function PabloPromo() {
  const { t } = useTranslation();
  const heroUrl = useArtAsset('cover_hero');

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-16 sm:py-24"
      style={{
        background:
          'radial-gradient(ellipse at 50% 25%, #1a0a2e 0%, #0a0418 55%, #000 100%)',
      }}
      data-testid="pablo-promo"
    >
      {/* Persistent "back to nebula chat" button — top-left so the user
          always has an obvious way home regardless of scroll position.
          The PicassoLogo at the top of the column is decorative; this
          button is the actual exit. */}
      <Link
        href="/pablo"
        className="fixed top-3 left-3 sm:top-5 sm:left-5 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full border border-pink-400/40 bg-black/60 backdrop-blur text-pink-200 text-[10px] sm:text-[11px] font-mono tracking-[0.3em] hover:bg-pink-500/15 transition-colors"
        data-testid="link-promo-back-to-nebula"
        aria-label="Back to nebula chat"
      >
        <ArrowLeft className="w-3 h-3" />
        BACK TO PABLO
      </Link>

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-8"
        >
          <PicassoLogo size={44} gap={4} glow />
        </motion.div>

        {/* Cinematic hero — same Nano-Banana-cached asset Cover uses, so
            both surfaces stay visually consistent without re-generating. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="w-full max-w-3xl mx-auto mb-10 rounded-2xl overflow-hidden border border-pink-500/25"
          style={{
            aspectRatio: '16/9',
            boxShadow: '0 0 60px rgba(236,72,153,0.18)',
          }}
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt="Salaryman promotional hero"
              className="w-full h-full object-cover"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-950/40 via-black to-cyan-950/30">
              <span className="text-pink-500/40 text-[10px] font-mono tracking-[0.4em]">
                ▌ COMPOSING ▌
              </span>
            </div>
          )}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl sm:text-7xl md:text-8xl font-black tracking-[-0.06em] leading-none mb-5 text-zinc-100"
          style={{
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontStretch: 'condensed',
            transform: 'scaleX(0.85) scaleY(1.1)',
          }}
        >
          SALARYMAN
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="text-[11px] font-mono tracking-[0.25em] uppercase text-zinc-500 mb-10"
        >
          by{' '}
          <a
            href="https://picassoo.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-300"
            style={{ textDecoration: 'none' }}
          >
            PICASSO.AI
          </a>
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-10 max-w-xl"
        >
          {t('cover.tagline')}
        </motion.p>

        {/* Single forward path: back to the nebula. No login, no pricing,
            no module routes — onboarding is the only door, and it lives
            inside Pablo. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          <Link
            href="/pablo"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-pink-500 text-black font-semibold text-sm hover:bg-pink-400 transition-colors"
            data-testid="link-promo-cta-nebula"
          >
            <ArrowLeft className="w-4 h-4" />
            BACK TO NEBULA CHAT
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
