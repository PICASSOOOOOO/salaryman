import { useState } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { motion } from 'framer-motion';
import { ChevronRight, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { PicassoLogo } from '../components/PicassoLogo';
import { useTranslation } from 'react-i18next';

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
  const { login, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

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
          className="mb-10"
        >
          <PicassoLogo size={36} gap={4} />
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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-6 max-w-xl"
        >
          {t('cover.tagline')}
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="text-sky-500/60 text-sm mb-14 font-mono tracking-widest uppercase"
        >
          {t('common.attentionIsAllYouNeed')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-5 w-full sm:w-auto"
        >
          <motion.button
            onClick={login}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="cta-primary flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-sky-500 text-[#09090b] font-semibold text-sm hover:bg-sky-400 transition-colors w-full sm:w-auto"
          >
            {t('cover.getStarted')} <ChevronRight className="w-4 h-4" />
          </motion.button>

          <motion.button
            onClick={() => navigate('/features')}
            whileHover={{ scale: 1.04, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.07)' }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg border border-white/10 text-zinc-300 text-sm transition-colors w-full sm:w-auto"
          >
            {t('cover.seeAllFeatures')} <ChevronRight className="w-4 h-4" />
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


        {/* Powered by */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.95 }}
          className="flex flex-col items-center gap-4 pb-12"
        >
          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em]">{t('cover.poweredBy')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Claude Sonnet', 'GPT-4o', 'OpenClaw', 'React', 'Node', 'Postgres', 'Stripe', 'Resend'].map((tech) => (
              <motion.span
                key={tech}
                whileHover={{ borderColor: 'rgba(161,161,170,0.3)', color: 'rgba(161,161,170,0.7)' }}
                className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2.5 py-1 rounded-md uppercase tracking-wider transition-colors cursor-default"
              >
                {tech}
              </motion.span>
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
