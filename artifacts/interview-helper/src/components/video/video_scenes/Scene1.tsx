import { motion } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';

const GRID_DOTS = Array.from({ length: 80 }, (_, i) => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 1.5,
  size: 1 + Math.random() * 2,
}));

const PIXEL_COLORS = ['#3b82f6','#10b981','#38bdf8','#f59e0b','#3b82f6','#a855f7','#ef4444','#38bdf8','#10b981'];

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1100),
      setTimeout(() => setPhase(4), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const glitchFrames = useMemo(() =>
    Array.from({ length: 5 }, () => ({
      x: (Math.random() - 0.5) * 8,
      skew: (Math.random() - 0.5) * 4,
    })), []);

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
        background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(56,189,248,0.06) 0%, transparent 70%)',
      }} />

      {phase >= 1 && GRID_DOTS.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: `${dot.x}%`, top: `${dot.y}%`, width: dot.size, height: dot.size, background: '#38bdf8' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0.1, 0.25] }}
          transition={{ delay: dot.delay, duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {phase >= 1 && (
        <>
          <motion.div className="absolute left-0 right-0 h-[1px]" style={{ top: '20%', background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.08) 30%, rgba(56,189,248,0.08) 70%, transparent 100%)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
          <motion.div className="absolute left-0 right-0 h-[1px]" style={{ top: '80%', background: 'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.08) 30%, rgba(16,185,129,0.08) 70%, transparent 100%)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.2 }} />
          <motion.div className="absolute top-0 bottom-0 w-[1px]" style={{ left: '20%', background: 'linear-gradient(180deg, transparent 0%, rgba(56,189,248,0.06) 30%, rgba(56,189,248,0.06) 70%, transparent 100%)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.1 }} />
          <motion.div className="absolute top-0 bottom-0 w-[1px]" style={{ left: '80%', background: 'linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.06) 30%, rgba(16,185,129,0.06) 70%, transparent 100%)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.3 }} />
        </>
      )}

      {phase >= 2 && (
        <motion.div className="absolute" style={{ top: '50%', left: '50%', width: 200, height: 200, transform: 'translate(-50%, -50%)' }}
          initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 0.04, scale: 1, rotate: 360 }}
          transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.8, ease: 'backOut' }, rotate: { duration: 40, repeat: Infinity, ease: 'linear' } }}>
          <div className="w-full h-full rounded-full border border-sky-400/30" />
          <div className="absolute inset-3 rounded-full border border-emerald-400/20" />
          <div className="absolute inset-6 rounded-full border border-sky-400/10" />
        </motion.div>
      )}

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="mb-4 grid grid-cols-3 gap-[4px]"
          initial={{ opacity: 0, scale: 0.3, rotate: -45 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, rotate: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.175, 0.885, 0.32, 1.275] }}
        >
          {PIXEL_COLORS.map((c, i) => (
            <motion.div
              key={i}
              style={{ width: 'clamp(6px, 1.4vw, 12px)', height: 'clamp(6px, 1.4vw, 12px)', background: c, borderRadius: 2, boxShadow: `0 0 8px ${c}40` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={phase >= 2 ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.1 + i * 0.04, duration: 0.2, ease: 'backOut' }}
            />
          ))}
        </motion.div>

        <motion.h1
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(32px, 8vw, 64px)', lineHeight: 1, letterSpacing: '0.15em' }}
          className="font-bold text-white text-center"
        >
          {'SALARYMAN'.split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 30, rotateX: -90 }}
              animate={phase >= 3 ? {
                opacity: 1, y: 0, rotateX: 0,
                textShadow: ['0 0 0px transparent', '0 0 20px rgba(56,189,248,0.5)', '0 0 8px rgba(56,189,248,0.2)'],
              } : {}}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.175, 0.885, 0.32, 1.1] }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>

        {phase >= 3 && (
          <motion.div className="relative mt-1 h-[2px] overflow-hidden" style={{ width: 'clamp(100px, 20vw, 200px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <motion.div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)' }}
              animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>
        )}

        <motion.div className="flex items-center gap-3 mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}>
          <motion.div className="h-[1px] bg-gradient-to-r from-transparent to-sky-400/40" style={{ width: 'clamp(20px, 4vw, 40px)' }}
            initial={{ scaleX: 0 }} animate={phase >= 4 ? { scaleX: 1 } : {}} transition={{ duration: 0.4 }} />
          <motion.p
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(8px, 1.4vw, 14px)', letterSpacing: '0.4em' }}
            className="text-sky-400 uppercase text-center"
          >
            THE SALARYMAN PLATFORM
          </motion.p>
          <motion.div className="h-[1px] bg-gradient-to-l from-transparent to-sky-400/40" style={{ width: 'clamp(20px, 4vw, 40px)' }}
            initial={{ scaleX: 0 }} animate={phase >= 4 ? { scaleX: 1 } : {}} transition={{ duration: 0.4 }} />
        </motion.div>
      </div>

      {phase >= 3 && (
        <motion.div className="absolute bottom-[8%] left-0 right-0 flex justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 0.15 }} transition={{ duration: 0.6, delay: 0.3 }}>
          <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', letterSpacing: '0.5em', color: '#64748b' }}>
            THE SALARYMAN PLATFORM
          </div>
        </motion.div>
      )}

      <motion.div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.6), transparent)', opacity: 0 }}
        animate={phase >= 2 ? { opacity: [0, 0.8, 0], top: ['0%', '100%'] } : {}}
        transition={{ duration: 1.5, ease: 'easeInOut' }} />
    </motion.div>
  );
}
