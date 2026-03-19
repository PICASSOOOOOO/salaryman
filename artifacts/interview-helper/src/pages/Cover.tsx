import { useState } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { motion } from 'framer-motion';
import { ChevronRight, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${BASE ? BASE + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}

function EmailSubscribeForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
  const [message, setMessage] = useState('');

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
        setMessage(data.error ?? 'Something went wrong. Try again.');
      } else if (data.alreadySubscribed) {
        setStatus('duplicate');
        setMessage("You're already on the list.");
      } else {
        setStatus('success');
        setMessage("You're on the list.");
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (status === 'success' || status === 'duplicate') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm"
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
        placeholder="you@company.com"
        required
        className="flex-1 min-w-0 bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-all disabled:opacity-50"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>Notify me <ArrowRight className="w-3.5 h-3.5" /></>
        )}
      </button>
      {status === 'error' && (
        <p className="absolute bottom-0 translate-y-full pt-1 text-xs text-red-400">{message}</p>
      )}
    </form>
  );
}

export default function Cover() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#09090b] relative overflow-x-hidden px-6 py-16">

      {/* Subtle ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-emerald-500/4 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-emerald-500/3 blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2.5 mb-8 px-5 py-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 text-sm font-mono tracking-widest uppercase shadow-lg shadow-emerald-500/10"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Early Access
        </motion.div>

        {/* Headline */}
        <style>{`
          @keyframes gradient-shift {
            0%   { background-position: 0% 50%; }
            50%  { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animated-title {
            background: linear-gradient(
              270deg,
              #22c55e, #ec4899, #22c55e
            );
            background-size: 200% 200%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradient-shift 30s ease-in-out infinite;
          }
          .animated-title-glow {
            background: linear-gradient(
              270deg,
              #22c55e, #ec4899, #22c55e
            );
            background-size: 200% 200%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradient-shift 30s ease-in-out infinite;
            filter: blur(20px);
            opacity: 0.35;
          }
        `}</style>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="relative text-6xl sm:text-8xl md:text-9xl font-black tracking-[-0.02em] leading-none mb-5"
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-2 max-w-xl"
        >
          The professional intelligence platform — AI advisor, contacts, calendar, documents, hiring, and more. Built for people who take their career seriously.
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-emerald-500/60 text-sm mb-10 font-mono tracking-widest uppercase"
        >
          Attention is All You Need
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex flex-wrap justify-center gap-3 mb-10"
        >
          <motion.button
            onClick={login}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 text-[#09090b] font-semibold text-sm hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/15"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </motion.button>

          <motion.button
            onClick={() => navigate('/features')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-zinc-300 text-sm hover:bg-white/5 hover:border-white/15 transition-colors"
          >
            See all features <ChevronRight className="w-4 h-4" />
          </motion.button>
        </motion.div>

        {/* Email subscribe */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full flex flex-col items-center gap-3"
        >
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Every App in One</p>
          <div className="relative">
            <EmailSubscribeForm />
          </div>
          <p className="text-zinc-700 text-xs">No spam. Unsubscribe anytime.</p>
        </motion.div>

        {/* Powered by */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-14 flex flex-col items-center gap-3"
        >
          <p className="text-[10px] font-mono text-zinc-700 uppercase tracking-[0.2em]">Powered by</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Claude Sonnet', 'GPT-4o', 'OpenClaw', 'React', 'Node', 'Postgres', 'Stripe', 'Resend'].map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-2.5 py-1 rounded-md uppercase tracking-wider"
              >
                {t}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
