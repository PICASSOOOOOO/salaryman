import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: '#030508' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 70% 50% at 50% 35%, rgba(239,68,68,0.06) 0%, transparent 70%)',
      }} />

      <div className="relative z-10 flex flex-col items-center text-center px-[6%] w-full">
        <motion.div
          style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.5em', color: '#ef4444' }}
          initial={{ opacity: 0, y: -15, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 0.8, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.5, ease: 'backOut' }}
        >
          INTRODUCING
        </motion.div>

        <div className="mt-4 space-y-1">
          {['9 AGENTS.', 'ONE SUBSCRIPTION.', 'ZERO EXCUSES.'].map((line, i) => (
            <motion.div key={i}
              style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(18px, 4.5vw, 38px)', lineHeight: 1.2, color: i === 1 ? '#ef4444' : '#fff' }}
              initial={{ opacity: 0, x: -40, filter: 'blur(8px)' }}
              animate={phase >= 2 ? { opacity: 1, x: 0, filter: 'blur(0px)' } : {}}
              transition={{ delay: i * 0.18, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {line}
              {i === 2 && phase >= 2 && (
                <motion.span className="inline-block ml-1"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  style={{ color: '#ef4444' }}>_</motion.span>
              )}
            </motion.div>
          ))}
        </div>

        {phase >= 3 && (
          <motion.div className="mt-6 w-full max-w-[85%]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <div className="flex flex-wrap justify-center gap-x-[2vw] gap-y-[1vw]">
              {[
                { label: 'SALES BOTS', icon: '◆' },
                { label: 'SUPPORT BOTS', icon: '⬢' },
                { label: 'WRITING BOTS', icon: '¶' },
                { label: 'RESEARCH BOTS', icon: '◈' },
                { label: 'CREATIVE BOTS', icon: '✦' },
                { label: 'DATA BOTS', icon: '◉' },
                { label: 'CODE BOTS', icon: '⚙' },
              ].map((cat, i) => (
                <motion.div key={cat.label} className="flex items-center gap-[0.5vw]"
                  initial={{ opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06, duration: 0.3, ease: 'backOut' }}>
                  <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: '#ef4444', opacity: 0.9 }}>{cat.icon}</span>
                  <span style={{
                    fontFamily: "var(--font-sans)", fontSize: 'clamp(6px, 0.85vw, 9px)',
                    letterSpacing: '0.12em', color: '#ef4444', fontWeight: 600,
                  }}>
                    {cat.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {phase >= 4 && (
          <motion.div className="mt-5 flex items-center gap-2"
            initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} transition={{ duration: 0.5 }}>
            <div className="h-[1px] w-[3vw] bg-gradient-to-r from-transparent to-white/20" />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(5px, 0.75vw, 7px)', letterSpacing: '0.3em', color: '#94a3b8' }}>
              $149/MO · PIXEL AGENTS SUBSCRIPTION
            </span>
            <div className="h-[1px] w-[3vw] bg-gradient-to-l from-transparent to-white/20" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
