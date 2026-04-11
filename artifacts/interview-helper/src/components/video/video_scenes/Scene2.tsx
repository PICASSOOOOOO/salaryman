import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const MODULES = [
  { label: 'CRM', color: '#ef4444', icon: '◆' },
  { label: 'AI AGENTS', color: '#10b981', icon: '⬢' },
  { label: 'PHONE', color: '#f59e0b', icon: '◉' },
  { label: 'CREATIVE', color: '#a855f7', icon: '✦' },
  { label: 'MMO WORLD', color: '#38bdf8', icon: '◈' },
  { label: 'BOT FACTORY', color: '#ec4899', icon: '⚙' },
  { label: 'PUBLISHING', color: '#84cc16', icon: '▣' },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 2600),
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
        background: 'radial-gradient(ellipse 70% 50% at 50% 35%, rgba(16,185,129,0.05) 0%, transparent 70%)',
      }} />

      {phase >= 1 && (
        <motion.div className="absolute" style={{ width: '120%', height: '120%', top: '-10%', left: '-10%' }}
          initial={{ opacity: 0 }} animate={{ opacity: 0.03 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div key={i} className="absolute left-0 right-0 h-[1px]"
              style={{ top: `${8 + i * 8}%`, background: `linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.3) ${40 + Math.random() * 20}%, transparent 100%)` }}
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ delay: i * 0.05, duration: 0.4 }} />
          ))}
        </motion.div>
      )}

      <div className="relative z-10 flex flex-col items-center text-center px-[6%] w-full">
        <motion.div
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.5em', color: '#10b981' }}
          initial={{ opacity: 0, y: -15, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 0.8, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.5, ease: 'backOut' }}
        >
          THE SALARYMAN PLATFORM
        </motion.div>

        <div className="mt-4 space-y-1">
          {['RUN YOUR BUSINESS.', 'BUILD YOUR EMPIRE.', 'PLAY THE GAME.'].map((line, i) => (
            <motion.div key={i}
              style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(18px, 4.5vw, 38px)', lineHeight: 1.2, color: i === 2 ? '#38bdf8' : '#fff' }}
              initial={{ opacity: 0, x: -40, filter: 'blur(8px)' }}
              animate={phase >= 2 ? { opacity: 1, x: 0, filter: 'blur(0px)' } : {}}
              transition={{ delay: i * 0.18, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {line}
              {i === 2 && phase >= 2 && (
                <motion.span className="inline-block ml-1"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  style={{ color: '#38bdf8' }}>_</motion.span>
              )}
            </motion.div>
          ))}
        </div>

        {phase >= 3 && (
          <motion.div className="mt-6 w-full max-w-[85%]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <div className="flex flex-wrap justify-center gap-x-[2vw] gap-y-[1vw]">
              {MODULES.map((mod, i) => (
                <motion.div key={mod.label} className="flex items-center gap-[0.5vw]"
                  initial={{ opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.06, duration: 0.3, ease: 'backOut' }}>
                  <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: mod.color, opacity: 0.9 }}>{mod.icon}</span>
                  <span style={{
                    fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 0.85vw, 9px)',
                    letterSpacing: '0.12em', color: mod.color, fontWeight: 600,
                  }}>
                    {mod.label}
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
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', letterSpacing: '0.3em', color: '#94a3b8' }}>
              ONE PLATFORM · EVERYTHING YOU NEED
            </span>
            <div className="h-[1px] w-[3vw] bg-gradient-to-l from-transparent to-white/20" />
          </motion.div>
        )}
      </div>

      <motion.div className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(3,5,8,0.8) 100%)' }} />
    </motion.div>
  );
}
