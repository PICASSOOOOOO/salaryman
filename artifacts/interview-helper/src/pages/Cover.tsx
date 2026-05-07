import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useLocation, Link } from 'wouter';
import { PicassoLogo } from '../components/PicassoLogo';
import { useTranslation } from 'react-i18next';
import { useArtAsset } from '@/lib/art';
import { useAuth } from '@workspace/replit-auth-web';
import { isTutorialDone } from '@/lib/tutorial-progress';
import changelogData from '../changelog.json';

/**
 * Decide where "Get Started" sends the user. Old version sniffed
 * `connect.sid` from document.cookie, but our session cookie is `sid`
 * (httpOnly anyway, so JS can never read it). The check therefore always
 * failed and *every* click bounced through `/api/login`, which combined
 * with OIDC `prompt:"login consent"` forced a fresh OAuth round-trip every
 * single time. Any hiccup in that chain dumped the user at /pablo
 * unauthenticated → Pablo re-asked name/email → the reported loop.
 *
 * New behaviour:
 *   - unauthenticated  → /api/login → returns to /pablo?guided=1
 *   - authed + tutorial done   → straight into the world (skip the tour)
 *   - authed + tutorial pending → /immigration (the dedicated intake gate;
 *     Pablo's terminal would just bounce them there anyway via its
 *     IMMIGRATION HAND-OFF GUARD)
 */
function getStartedHref(isAuthenticated: boolean): string {
  if (!isAuthenticated) {
    const target = '/pablo?guided=1';
    return `/api/login?returnTo=${encodeURIComponent(target)}`;
  }
  if (isTutorialDone()) return '/world/play';
  return '/immigration';
}

const TrailerPlayer = lazy(() => import('../components/video/TrailerPlayer'));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${BASE ? BASE + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}


function EmailSubscribeForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      const res = await fetch(apiUrl('subscribers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'cover' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? t('cover.genericError'));
      } else if (data.alreadySubscribed) {
        setStatus('duplicate');
        setMessage(t('cover.alreadySubscribed'));
      } else {
        setStatus('success');
        setMessage(t('cover.subscribedSuccess'));
      }
    } catch {
      setStatus('error');
      setMessage(t('cover.networkError'));
    }
  };

  if (status === 'success' || status === 'duplicate') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm"
      >
        <Check className="w-4 h-4 shrink-0" />
        {message}
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={t('cover.emailPlaceholder')}
        required
        className="flex-1 min-w-0 bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/20 transition-all"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium hover:bg-sky-500/25 transition-all disabled:opacity-50"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>{t('cover.notifyMe')} <ArrowRight className="w-3.5 h-3.5" /></>
        )}
      </button>
      {status === 'error' && (
        <p className="absolute bottom-0 translate-y-full pt-1 text-xs text-red-400">{message}</p>
      )}
    </form>
  );
}

export default function Cover() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const heroUrl = useArtAsset('cover_hero');
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#09090b] relative overflow-x-hidden px-6 py-20 sm:py-28">

      <style>{`
        @keyframes gradient-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animated-title {
          background: linear-gradient(
            270deg,
            #38bdf8, #06b6d4, #818cf8, #a78bfa, #ec4899, #a78bfa, #818cf8, #06b6d4, #38bdf8
          );
          background-size: 300% 300%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradient-shift 30s ease-in-out infinite;
        }
        .animated-title-glow {
          background: linear-gradient(
            270deg,
            #38bdf8, #06b6d4, #818cf8, #a78bfa, #ec4899, #a78bfa, #818cf8, #06b6d4, #38bdf8
          );
          background-size: 300% 300%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradient-shift 30s ease-in-out infinite;
          filter: blur(20px);
          opacity: 0.35;
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 12px 2px rgba(56,189,248,0.18), 0 4px 24px 0 rgba(56,189,248,0.10); }
          50%       { box-shadow: 0 0 28px 6px rgba(56,189,248,0.38), 0 4px 32px 0 rgba(56,189,248,0.22); }
        }
        .cta-primary {
          animation: glow-pulse 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-sky-500/4 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-sky-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto w-full">

        {/* Logo mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-6"
        >
          {/* Salaryman logo loops the user back to Pablo Nebula. The first
              login goes through Pablo's intro; on return trips Pablo skips
              the story and jumps the user straight into the world. */}
          <Link
            href="/pablo"
            className="inline-block transition-transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-pink-400/50 rounded"
            aria-label="Back to Pablo Nebula"
            data-testid="link-logo-to-nebula"
          >
            <PicassoLogo size={44} gap={4} glow />
          </Link>
        </motion.div>

        {/* Cinematic hero image — generated by Nano Banana, cached on the
            server. Renders a black placeholder while the asset composes so
            the page never feels empty above the fold. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="w-full max-w-3xl mx-auto mb-10 rounded-2xl overflow-hidden border border-pink-500/25"
          style={{ aspectRatio: '16/9', boxShadow: '0 0 60px rgba(236,72,153,0.18)' }}
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt="Salaryman cover hero"
              className="w-full h-full object-cover"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-950/40 via-black to-cyan-950/30">
              <span className="text-pink-500/40 text-[10px] font-mono tracking-[0.4em]">▌ COMPOSING ▌</span>
            </div>
          )}
        </motion.div>

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="inline-flex items-center gap-2.5 mb-12 px-5 py-2 rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-300 text-sm font-mono tracking-widest uppercase shadow-lg shadow-sky-500/10"
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          ALPHA {__BUILD_VERSION__}
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="relative text-5xl sm:text-8xl md:text-9xl font-black tracking-[-0.06em] leading-none mb-5"
          style={{ fontFamily: "Arial, Helvetica, sans-serif", fontStretch: "condensed", transform: "scaleX(0.85) scaleY(1.1)" }}
        >
          <span className="absolute inset-0 animated-title-glow select-none" aria-hidden="true">
            SALARYMAN
          </span>
          <span className="relative animated-title">
            SALARYMAN
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="text-[11px] font-mono tracking-[0.25em] uppercase text-zinc-500 mb-10"
        >
          by <a href="https://picassoo.ai" target="_blank" rel="noopener noreferrer" className="text-zinc-300" style={{ textDecoration: 'none' }}>PICASSO.AI</a>
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-[11px] font-mono tracking-[0.3em] uppercase text-sky-400/60 mb-5"
        >
          THE SALARYMAN PLATFORM
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-6 max-w-xl"
        >
          {t('cover.tagline')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.42 }}
          className="flex flex-wrap justify-center gap-2 mb-6"
        >
          {['AI AGENTS', 'INTERVIEWS', 'PRESENTATIONS', 'PHONE SYSTEM', 'WRITER STUDIO', 'CREATIVE TOOLS'].map(cap => (
            <span key={cap} className="text-[9px] font-mono text-zinc-500 border border-zinc-800/60 px-2 py-0.5 rounded tracking-wider uppercase">{cap}</span>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="text-sky-500/60 text-sm mb-10 font-mono tracking-widest uppercase"
        >
          {t('common.attentionIsAllYouNeed')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="w-full max-w-3xl mx-auto mb-14"
        >
          <Suspense fallback={
            <div className="w-full rounded-xl" style={{ maxWidth: 720, margin: '0 auto', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', borderRadius: 12, border: '1px solid rgba(56,189,248,0.18)' }}>
              <span className="text-sky-500/30 text-xs font-mono tracking-widest">LOADING TRAILER...</span>
            </div>
          }>
            <TrailerPlayer />
          </Suspense>
        </motion.div>

        {/* Jean Claw featured card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.52 }}
          className="w-full max-w-lg mx-auto mb-12"
        >
          <motion.button
            onClick={() => navigate('/jean-claw')}
            whileHover={{ scale: 1.02, borderColor: 'rgba(239,68,68,0.5)' }}
            whileTap={{ scale: 0.98 }}
            className="w-full group relative overflow-hidden rounded-xl border border-red-500/25 bg-gradient-to-br from-red-500/8 via-transparent to-red-500/5 p-6 sm:p-8 text-left transition-all cursor-pointer"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/5 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-red-400/70 border border-red-500/20 px-2 py-0.5 rounded bg-red-500/5">FEATURED</span>
                <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-600">$145/MO · ALL-IN</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                PIXEL AGENTS
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-md">
                Your office manager. 78 AI bots under one subscription — sales, creative, finance, legal, engineering, and operations. The entire workforce, managed by one boss.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['SALES', 'CREATIVE', 'FINANCE', 'LEGAL', 'ENGINEERING', 'OPS'].map(dept => (
                  <span key={dept} className="text-[8px] font-mono text-red-400/50 border border-red-500/15 px-1.5 py-0.5 rounded tracking-wider">{dept}</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-red-400 text-xs font-medium group-hover:gap-2.5 transition-all">
                EXPLORE PIXEL AGENTS <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </motion.button>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-5 w-full sm:w-auto"
        >
          <motion.button
            onClick={() => {
              const href = getStartedHref(isAuthenticated);
              // Internal SPA routes go through wouter so we don't tear down
              // the React tree (and lose the auth context we just consulted).
              // Only the /api/login redirect needs a hard navigation.
              if (href.startsWith('/api/')) {
                window.location.href = href;
              } else {
                navigate(href);
              }
            }}
            disabled={authLoading}
            whileHover={{ scale: authLoading ? 1 : 1.04 }}
            whileTap={{ scale: authLoading ? 1 : 0.97 }}
            className="cta-primary flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-sky-500 text-[#09090b] font-semibold text-sm hover:bg-sky-400 transition-colors w-full sm:w-auto disabled:opacity-60"
            data-testid="cover-get-started"
          >
            {t('cover.getStarted')} <ChevronRight className="w-4 h-4" />
          </motion.button>

          <motion.button
            onClick={() => navigate('/pricing')}
            whileHover={{ scale: 1.04, borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.12)' }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg border text-sm transition-colors w-full sm:w-auto"
            style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}
          >
            SEE PRICING <ChevronRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        {/* Alpha note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.65 }}
          className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase mb-16"
        >
          {t('cover.alphaNote')}
        </motion.p>

        {/* Email subscribe */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="w-full flex flex-col items-center gap-4 mb-16"
        >
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">{t('common.everyAppInOne')}</p>
          <div className="relative">
            <EmailSubscribeForm />
          </div>
          <p className="text-zinc-700 text-xs">{t('cover.noSpam')}</p>
        </motion.div>


        {/* Powered by — tiered disclosure of the AI models, partner APIs,
            and runtime stack we run alongside React. Three rows, each with
            its own accent color so the categories read at a glance. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.95 }}
          className="flex flex-col items-center gap-6 pb-12 w-full max-w-3xl"
        >
          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em]">{t('cover.poweredBy')}</p>

          {/* AI MODELS — frontier reasoning + multimodal */}
          <div className="flex flex-col items-center gap-2 w-full">
            <p className="text-[9px] font-mono text-pink-400/50 uppercase tracking-[0.3em]">AI MODELS</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[
                { name: 'Claude Sonnet 4.5', vendor: 'Anthropic' },
                { name: 'GPT-5', vendor: 'OpenAI' },
                { name: 'Gemini 2.5', vendor: 'Google' },
                { name: 'OpenRouter', vendor: 'Multi-model' },
                { name: 'ElevenLabs', vendor: 'Voice' },
                { name: 'Nano Banana', vendor: 'Image' },
                { name: 'OpenClaw', vendor: 'In-house' },
              ].map((m) => (
                <motion.span
                  key={m.name}
                  whileHover={{ borderColor: 'rgba(236,72,153,0.4)', color: 'rgba(244,114,182,0.85)' }}
                  title={m.vendor}
                  className="text-[10px] font-mono text-zinc-500 border border-pink-500/15 bg-pink-500/[0.03] px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors cursor-default"
                >
                  {m.name}
                </motion.span>
              ))}
            </div>
          </div>

          {/* PARTNER SYSTEMS — third-party APIs we route through */}
          <div className="flex flex-col items-center gap-2 w-full">
            <p className="text-[9px] font-mono text-cyan-400/50 uppercase tracking-[0.3em]">PARTNER SYSTEMS</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {[
                { name: 'Stripe',     role: 'Payments + Pablo Tax billing' },
                { name: 'Twilio',     role: 'Phone numbers + voice/SMS' },
                { name: 'Resend',     role: 'Transactional email' },
                { name: 'Clerk',      role: 'Authentication' },
                { name: 'RevenueCat', role: 'Mobile subscriptions' },
                { name: 'Gusto',      role: 'Payroll' },
                { name: 'Object Storage', role: 'Asset + Data Vault storage' },
              ].map((p) => (
                <motion.span
                  key={p.name}
                  whileHover={{ borderColor: 'rgba(56,189,248,0.4)', color: 'rgba(125,211,252,0.85)' }}
                  title={p.role}
                  className="text-[10px] font-mono text-zinc-500 border border-cyan-500/15 bg-cyan-500/[0.03] px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors cursor-default"
                >
                  {p.name}
                </motion.span>
              ))}
            </div>
          </div>

          {/* STACK — what runs the whole thing */}
          <div className="flex flex-col items-center gap-2 w-full">
            <p className="text-[9px] font-mono text-zinc-500/60 uppercase tracking-[0.3em]">RUNTIME STACK</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['React', 'Vite', 'TypeScript', 'Node', 'Express', 'Drizzle', 'Postgres', 'WebSockets', 'pnpm Monorepo'].map((tech) => (
                <motion.span
                  key={tech}
                  whileHover={{ borderColor: 'rgba(161,161,170,0.4)', color: 'rgba(212,212,216,0.85)' }}
                  className="text-[10px] font-mono text-zinc-600 border border-zinc-800 bg-white/[0.015] px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors cursor-default"
                >
                  {tech}
                </motion.span>
              ))}
            </div>
          </div>

          <p className="text-[9px] font-mono text-zinc-700 uppercase tracking-[0.25em] mt-2 text-center max-w-md">
            All AI traffic routes through PABLO PRIME ($145/mo) — over the cap, PABLO TAX bills 4× via the ƒ→gold→Stripe→BTC waterfall.
          </p>
        </motion.div>

        {/* Update Notes */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.05 }}
          className="flex flex-col items-center gap-3 pb-10 w-full max-w-md mx-auto"
        >
          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em]">{t('cover.updateNotes')}</p>
          <div className="w-full max-h-40 overflow-y-auto flex flex-col gap-2 px-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {[...changelogData].reverse().slice(0, 5).map((entry: { version: string; date: string; changes: string[] }) => (
              <div key={entry.version} className="border border-zinc-800/60 rounded px-3 py-2 bg-black/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{entry.version}</span>
                  <span className="text-[9px] font-mono text-zinc-700">{entry.date}</span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="text-[9px] font-mono text-zinc-600 leading-relaxed before:content-['—'] before:mr-1.5 before:text-zinc-700">
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>

      </div>

      {/* Legal footer */}
      <div className="relative z-10 mt-8 flex justify-center">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {[
            { label: t('cover.terms'), path: "/legal/terms" },
            { label: t('cover.privacy'), path: "/legal/privacy" },
            { label: t('cover.refunds'), path: "/legal/refunds" },
            { label: t('cover.contact'), path: "/legal/contact" },
            { label: t('cover.investors'), path: "/investors" },
            { label: t('cover.legal'), path: "/legal" },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors font-mono uppercase tracking-wider"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
