import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const CLAW_PARTICLES = Array.from({ length: 40 }, () => ({
  x: 50 + (Math.random() - 0.5) * 60,
  y: 50 + (Math.random() - 0.5) * 60,
  delay: Math.random() * 1.5,
  size: 1 + Math.random() * 2,
}));

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#030508' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(239,68,68,0.08) 0%, transparent 70%)',
      }} />

      {phase >= 1 && CLAW_PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: '#ef4444' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.4, 0.1, 0.3] }}
          transition={{ delay: p.delay, duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {phase >= 2 && (
        <motion.div className="absolute" style={{ top: '50%', left: '50%', width: 200, height: 200, transform: 'translate(-50%, -50%)' }}
          initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 0.06, scale: 1, rotate: 360 }}
          transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.8, ease: 'backOut' }, rotate: { duration: 40, repeat: Infinity, ease: 'linear' } }}>
          <div className="w-full h-full rounded-full border border-red-500/30" />
          <div className="absolute inset-3 rounded-full border border-red-400/20" />
          <div className="absolute inset-6 rounded-full border border-red-500/10" />
        </motion.div>
      )}

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="grid grid-cols-3 mb-2"
          style={{ width: 'clamp(28px, 6vw, 48px)', height: 'clamp(28px, 6vw, 48px)', gap: 'clamp(1px, 0.2vw, 2px)' }}
          initial={{ opacity: 0, scale: 0.3, rotate: -45 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, rotate: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.175, 0.885, 0.32, 1.275] }}
        >
          {['#7C3AED','#fff','#22C55E','#fff','#3B82F6','#fff','#EC4899','#fff','#1E3A5F'].map((c, i) => (
            <motion.div key={i} style={{ background: c, borderRadius: i === 2 ? '50%' : i === 6 ? 0 : 2, clipPath: i === 6 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined, boxShadow: `0 0 6px ${c}40` }}
              initial={{ opacity: 0, scale: 0 }} animate={phase >= 2 ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.05 + i * 0.03, duration: 0.2, ease: 'backOut' }} />
          ))}
        </motion.div>

        <motion.h1
          style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(28px, 7vw, 56px)', lineHeight: 1, letterSpacing: '0.12em' }}
          className="font-bold text-center mt-3"
        >
          {'PIXEL AGENTS'.split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              style={{ color: char === ' ' ? 'transparent' : '#ef4444' }}
              initial={{ opacity: 0, y: 30, rotateX: -90 }}
              animate={phase >= 3 ? {
                opacity: 1, y: 0, rotateX: 0,
                textShadow: ['0 0 0px transparent', '0 0 20px rgba(239,68,68,0.5)', '0 0 8px rgba(239,68,68,0.2)'],
              } : {}}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.175, 0.885, 0.32, 1.1] }}
            >
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          ))}
        </motion.h1>

        {phase >= 3 && (
          <motion.div className="relative mt-1 h-[2px] overflow-hidden" style={{ width: 'clamp(80px, 16vw, 160px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <motion.div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, #ef4444, transparent)' }}
              animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>
        )}

        <motion.div className="flex items-center gap-3 mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}>
          <motion.div className="h-[1px] bg-gradient-to-r from-transparent to-red-400/40" style={{ width: 'clamp(20px, 4vw, 40px)' }}
            initial={{ scaleX: 0 }} animate={phase >= 4 ? { scaleX: 1 } : {}} transition={{ duration: 0.4 }} />
          <motion.p
            style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(7px, 1.2vw, 12px)', letterSpacing: '0.4em' }}
            className="text-red-400 uppercase text-center"
          >
            PIXEL AGENTS MANAGER
          </motion.p>
          <motion.div className="h-[1px] bg-gradient-to-l from-transparent to-red-400/40" style={{ width: 'clamp(20px, 4vw, 40px)' }}
            initial={{ scaleX: 0 }} animate={phase >= 4 ? { scaleX: 1 } : {}} transition={{ duration: 0.4 }} />
        </motion.div>
      </div>

      {phase >= 3 && (
        <motion.div className="absolute bottom-[8%] left-0 right-0 flex justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 0.15 }} transition={{ duration: 0.6, delay: 0.3 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(5px, 0.7vw, 7px)', letterSpacing: '0.5em', color: '#64748b' }}>
            THE SALARYMAN PLATFORM
          </div>
        </motion.div>
      )}

      <motion.div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.6), transparent)', opacity: 0 }}
        animate={phase >= 2 ? { opacity: [0, 0.8, 0], top: ['0%', '100%'] } : {}}
        transition={{ duration: 1.5, ease: 'easeInOut' }} />
    </motion.div>
  );
}
