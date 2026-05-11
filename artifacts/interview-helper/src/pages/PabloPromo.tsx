import { motion } from 'framer-motion';
import { ArrowLeft, Phone, Calendar, Users, FileText, Wallet, Bot, Palette, Globe2, MessageCircle, Sparkles } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { PicassoLogo } from '../components/PicassoLogo';
import { useArtAsset } from '@/lib/art';

const TrailerPlayer = lazy(() => import('../components/video/TrailerPlayer'));

/**
 * PabloPromo — the "promotional only" page that the SALARYMAN logo on
 * the Pablo nebula links to.
 *
 * Why this exists separately from Cover (/landing):
 *   The full Cover page exposes Get Started, Pricing, Jean Claw, the
 *   changelog and email-signup. Most of those CTAs route into gated
 *   surfaces (`/world`, `/pricing`, `/jean-claw`, OAuth handoff) that
 *   a brand-new visitor — who hasn't even cleared Pablo's intake yet —
 *   shouldn't have access to. Linking Pablo's logo at /landing meant
 *   the user could escape onboarding mid-intake by tapping the icon.
 *
 *   This page is now richer than the original slim version: it shows
 *   the live cinematic trailer (the same animated scene-walk Cover
 *   uses) plus an elaborated module breakdown so a curious visitor can
 *   actually see what Salaryman is. The single forward path is still
 *   "back to Pablo" — no Get Started, no pricing, no jean-claw, no
 *   login. Onboarding stays the only door.
 *
 * Only the Pablo nebula's logo links here; this page is intentionally
 * unlisted in nav, NavBar, and the landing/Cover surface.
 */

type Module = {
  icon: typeof Phone;
  title: string;
  body: string;
};

const MODULES: Module[] = [
  {
    icon: Phone,
    title: 'PHONE SYSTEM',
    body: 'Real numbers, real calls, voicemail, transcription. Pablo can answer for you, screen leads, route to the right person, and hand back full transcripts.',
  },
  {
    icon: Bot,
    title: 'BOT FACTORY',
    body: 'Hire AI agents the same way you\'d hire a person — give them a job, a voice, a personality. They handle the work while you sleep.',
  },
  {
    icon: Wallet,
    title: 'PAYROLL & INVOICES',
    body: 'Payroll runs, invoice generation, payment tracking. The boring back-office stuff, automated end-to-end.',
  },
  {
    icon: Users,
    title: 'CRM & CONTACTS',
    body: 'Every conversation, every call, every email — stitched into a single contact timeline. Pablo remembers who you talked to and what about.',
  },
  {
    icon: Calendar,
    title: 'CALENDAR',
    body: 'Scheduling, reminders, meeting prep. Tell Pablo you need to talk to someone Friday — he books it.',
  },
  {
    icon: Palette,
    title: 'CREATIVE STUDIO',
    body: 'Image generation, sound design, writing tools, brand kit. Make the asset, ship it, log it — without leaving the platform.',
  },
  {
    icon: FileText,
    title: 'WORKSPACE & DOCS',
    body: 'Projects, notes, documents, brand settings. Everything your business runs on, in one place.',
  },
  {
    icon: Globe2,
    title: 'YOUR CITY',
    body: 'Salaryman wraps your real working tools inside a business + life simulator. The city you build in is named after your timezone — NEO TOKYO, NEW EDEN, IRON FALLS, more.',
  },
  {
    icon: MessageCircle,
    title: 'PABLO — UNLIMITED',
    body: 'Free forever. Talk to Pablo about anything — business, code, advice, trivia. He runs the platform on your behalf when you ask him to.',
  },
];

export default function PabloPromo() {
  const { t } = useTranslation();
  const heroUrl = useArtAsset('cover_hero');

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-12 sm:py-16"
      style={{
        background:
          'radial-gradient(ellipse at 50% 25%, #1a0a2e 0%, #0a0418 55%, #000 100%)',
      }}
      data-testid="pablo-promo"
    >
      {/* Persistent "back to Pablo" button — top-left so the user
          always has an obvious way home regardless of scroll position. */}
      <Link
        href="/pablo"
        className="fixed top-3 left-3 sm:top-5 sm:left-5 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full border border-pink-400/40 bg-black/60 backdrop-blur text-pink-200 text-[10px] sm:text-[11px] font-mono tracking-[0.3em] hover:bg-pink-500/15 transition-colors"
        data-testid="link-promo-back-to-nebula"
        aria-label="Back to Pablo"
      >
        <ArrowLeft className="w-3 h-3" />
        BACK TO PABLO
      </Link>

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-8"
        >
          <PicassoLogo size={44} gap={4} glow />
        </motion.div>

        {/* Hero headline first — sets the room before the trailer rolls. */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="text-5xl sm:text-7xl md:text-8xl font-black tracking-[-0.06em] leading-none mb-3 text-zinc-100"
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
          transition={{ duration: 0.4, delay: 0.12 }}
          className="text-[11px] font-mono tracking-[0.25em] uppercase text-zinc-500 mb-8"
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

        {/* LIVE GAMEPLAY TRAILER — the same animated scene-walk Cover
            renders. Auto-plays in the browser, no external video host,
            no third-party tracking. This is the "video of gameplay
            live" the visitor sees. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18 }}
          className="w-full max-w-3xl mx-auto mb-3"
        >
          <Suspense
            fallback={
              <div
                className="w-full rounded-xl border border-pink-500/20 bg-black/60 flex items-center justify-center"
                style={{ aspectRatio: '16/9' }}
              >
                <span className="text-pink-400/60 text-[10px] font-mono tracking-[0.3em]">
                  ▌ LOADING TRAILER ▌
                </span>
              </div>
            }
          >
            <TrailerPlayer />
          </Suspense>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="text-[9px] font-mono tracking-[0.35em] text-zinc-600 mb-12"
        >
          ▸ LIVE GAMEPLAY — RENDERED IN-BROWSER
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="text-zinc-300 text-base sm:text-lg leading-relaxed mb-3 max-w-2xl"
        >
          {t('cover.tagline')}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.32 }}
          className="text-zinc-500 text-sm sm:text-base leading-relaxed max-w-2xl mb-14"
        >
          A business + life simulator wrapped around real working tools.
          Talk to Pablo, run a phone line, hire AI agents, send invoices,
          build a brand — all in one place.
        </motion.p>

        {/* Module breakdown — the "more elaborate details" the visitor
            asked for. Grid of icons + one-paragraph module descriptions
            so a curious newcomer can see exactly what Salaryman ships
            with, without forcing them past the gate to find out. */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full mb-14"
        >
          <div className="text-[10px] font-mono tracking-[0.4em] text-pink-400/60 mb-6">
            ▸ WHAT'S INSIDE
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
            {MODULES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-pink-500/15 bg-black/40 p-5 hover:border-pink-400/35 transition-colors"
                data-testid={`promo-module-${title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 text-pink-400" />
                  <h3 className="text-[11px] font-mono tracking-[0.18em] text-pink-200">
                    {title}
                  </h3>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-400">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* "How it works" capsule — three short beats so the visitor
            knows what happens when they go back and start chatting. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full max-w-3xl mb-14 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left"
        >
          {[
            { n: '01', t: 'Talk to Pablo', b: 'Free, unlimited. Ask him anything — Salaryman or not.' },
            { n: '02', t: 'Use a tool', b: 'Want a phone line, a dashboard, an invoice? Pablo sets you up.' },
            { n: '03', t: 'Build your city', b: 'Your business + life simulator runs in the timezone city you spawn in.' },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-cyan-400/15 bg-black/40 p-4"
            >
              <div className="text-[10px] font-mono tracking-[0.3em] text-cyan-400/70 mb-1.5">
                {s.n}
              </div>
              <div className="text-[13px] font-semibold text-zinc-200 mb-1.5">
                {s.t}
              </div>
              <div className="text-[12px] text-zinc-500 leading-relaxed">
                {s.b}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Optional cinematic still — kept low in the page now, since
            the trailer above is the primary visual. Only renders if the
            cached cover_hero is available. */}
        {heroUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="w-full max-w-3xl mx-auto mb-12 rounded-2xl overflow-hidden border border-pink-500/15"
            style={{
              aspectRatio: '16/9',
              boxShadow: '0 0 40px rgba(236,72,153,0.10)',
            }}
          >
            <img
              src={heroUrl}
              alt="Salaryman cinematic still"
              className="w-full h-full object-cover"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          </motion.div>
        )}

        {/* Single forward path: back to Pablo. No login, no pricing,
            no module routes — onboarding is the only door, and it lives
            inside Pablo. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-col items-center gap-3"
        >
          <Link
            href="/pablo"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-pink-500 text-black font-semibold text-sm hover:bg-pink-400 transition-colors"
            data-testid="link-promo-cta-nebula"
          >
            <Sparkles className="w-4 h-4" />
            TALK TO PABLO
          </Link>
          <span className="text-[10px] font-mono tracking-[0.25em] text-zinc-600">
            FREE — NO SIGN-UP REQUIRED TO CHAT
          </span>
        </motion.div>
      </div>
    </div>
  );
}
