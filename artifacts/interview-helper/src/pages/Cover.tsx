import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { PicassoLogo } from '../components/PicassoLogo';
import { useArtAsset } from '@/lib/art';
import { useAuth } from '@workspace/replit-auth-web';
import { isTutorialDone } from '@/lib/tutorial-progress';

/**
 * Where "Play Free" sends the user.
 *   - signed out  → log in, then drop them at "/" which routes a brand-new
 *     player straight to the Immigration desk (the real intake). We skip the
 *     old text terminal so the masses get fewer pages, fewer words.
 *   - signed in, already played  → into the world.
 *   - signed in, new  → the Immigration desk.
 */
function playHref(isAuthenticated: boolean): string {
  if (!isAuthenticated) {
    return `/api/login?returnTo=${encodeURIComponent('/')}`;
  }
  if (isTutorialDone()) return '/world/play';
  return '/immigration';
}

const TrailerPlayer = lazy(() => import('../components/video/TrailerPlayer'));

type Tile = { key: string; title: string; blurb: string; tint: string };

const TILES: Tile[] = [
  {
    key: 'building_office_iso',
    title: 'Start a business',
    blurb: 'Open your shop. Hire a team. Watch it grow.',
    tint: '56,189,248',
  },
  {
    key: 'char_pablo',
    title: 'Get an AI team',
    blurb: 'Smart helpers that do the busywork for you.',
    tint: '236,72,153',
  },
  {
    key: 'ui_card_economy',
    title: 'Learn by playing',
    blurb: 'Practice money, sales, and big ideas — for fun.',
    tint: '167,139,250',
  },
];

function ArtTile({ tile, delay }: { tile: Tile; delay: number }) {
  const url = useArtAsset(tile.key);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative rounded-3xl overflow-hidden border-2 text-left"
      style={{ borderColor: `rgba(${tile.tint},0.4)`, boxShadow: `0 0 40px rgba(${tile.tint},0.12)` }}
    >
      <div className="aspect-square w-full overflow-hidden bg-black">
        {url ? (
          <img
            src={url}
            alt={tile.title}
            className="w-full h-full object-cover"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ background: `linear-gradient(135deg, rgba(${tile.tint},0.25), #000)` }}
          />
        )}
      </div>
      <div className="p-5 sm:p-6" style={{ background: `linear-gradient(180deg, rgba(${tile.tint},0.10), rgba(0,0,0,0.85))` }}>
        <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-1.5" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {tile.title}
        </h3>
        <p className="text-base sm:text-lg text-zinc-300 leading-snug">{tile.blurb}</p>
      </div>
    </motion.div>
  );
}

export default function Cover() {
  const [, navigate] = useLocation();
  const heroUrl = useArtAsset('cover_hero');
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const goPlay = () => {
    const href = playHref(isAuthenticated);
    if (href.startsWith('/api/')) window.location.href = href;
    else navigate(href);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white relative overflow-x-hidden">
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .sm-wordmark {
          background: linear-gradient(270deg,#38bdf8,#06b6d4,#818cf8,#a78bfa,#ec4899,#a78bfa,#818cf8,#06b6d4,#38bdf8);
          background-size: 300% 300%;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradient-shift 24s ease-in-out infinite;
        }
        @keyframes cta-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(56,189,248,0.45); }
          50% { box-shadow: 0 0 0 14px rgba(56,189,248,0); }
        }
        .cta-play { animation: cta-pulse 2.4s ease-in-out infinite; }
      `}</style>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative">
        {/* Full-bleed hero art */}
        <div className="absolute inset-0">
          {heroUrl ? (
            <img
              src={heroUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-950/50 via-black to-cyan-950/40" />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.75) 55%, #09090b 100%)' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-6 pt-12 pb-16 min-h-[88vh] justify-center max-w-3xl mx-auto">
          <Link href="/landing" className="mb-8 inline-block" aria-label="SALARYMAN home">
            <PicassoLogo size={48} gap={4} glow />
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-6xl sm:text-8xl md:text-9xl font-black leading-[0.9] tracking-tight mb-6"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            <span className="sm-wordmark">SALARYMAN</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-2xl sm:text-4xl font-bold text-white leading-tight mb-4"
          >
            Run your own company. Just by playing.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-zinc-300 leading-relaxed mb-10 max-w-xl"
          >
            A fun world where anyone can start a business, build a team of AI helpers,
            and pick up real skills. No experience needed.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            onClick={goPlay}
            disabled={authLoading}
            whileHover={{ scale: authLoading ? 1 : 1.05 }}
            whileTap={{ scale: authLoading ? 1 : 0.97 }}
            className="cta-play inline-flex items-center gap-3 px-12 py-5 rounded-full bg-sky-400 text-[#09090b] font-black text-xl sm:text-2xl hover:bg-sky-300 transition-colors disabled:opacity-60"
            data-testid="cover-play-free"
          >
            Play Free <ArrowRight className="w-6 h-6" strokeWidth={3} />
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="mt-4 text-sm text-zinc-400"
          >
            Free to start. No card needed.
          </motion.p>
        </div>
      </section>

      {/* ── WHAT YOU CAN DO ──────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-16 max-w-5xl mx-auto -mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {TILES.map((tile, i) => (
            <ArtTile key={tile.key} tile={tile} delay={0.1 + i * 0.1} />
          ))}
        </div>
      </section>

      {/* ── SEE IT MOVE ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-16 max-w-3xl mx-auto w-full">
        <Suspense fallback={
          <div className="w-full rounded-2xl flex items-center justify-center bg-black border border-sky-500/15" style={{ aspectRatio: '16/9' }}>
            <span className="text-sky-500/30 text-sm font-bold tracking-wide">Loading…</span>
          </div>
        }>
          <TrailerPlayer />
        </Suspense>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-20 text-center flex flex-col items-center">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-5xl font-black text-white mb-7"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Ready to play?
        </motion.h2>
        <button
          onClick={goPlay}
          disabled={authLoading}
          className="cta-play inline-flex items-center gap-3 px-12 py-5 rounded-full bg-sky-400 text-[#09090b] font-black text-xl sm:text-2xl hover:bg-sky-300 transition-colors disabled:opacity-60"
        >
          Play Free <ArrowRight className="w-6 h-6" strokeWidth={3} />
        </button>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="relative z-10 px-6 pb-10 flex flex-col items-center gap-2 text-center">
        <p className="text-xs text-zinc-500">
          by{' '}
          <a href="https://picassoo.ai" target="_blank" rel="noopener noreferrer" className="text-zinc-300 no-underline">PICASSO.AI</a>
        </p>
        <Link href="/legal" className="text-xs text-zinc-600 no-underline hover:text-zinc-400">Terms &amp; Privacy</Link>
      </footer>
    </div>
  );
}
