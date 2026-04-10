import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at center, #0c1220 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(56,189,248,0.03) 90deg, transparent 180deg, rgba(16,185,129,0.03) 270deg, transparent 360deg)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="mb-3 grid grid-cols-3 gap-[3px]"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.4, ease: 'backOut' }}
        >
          {['#3b82f6','#10b981','#38bdf8','#f59e0b','#3b82f6','#a855f7','#ef4444','#38bdf8','#10b981'].map((c, i) => (
            <motion.div
              key={i}
              style={{ width: '1.2vw', height: '1.2vw', minWidth: 6, minHeight: 6, background: c, borderRadius: 1 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={phase >= 1 ? { opacity: 0.9, scale: 1 } : {}}
              transition={{ delay: i * 0.03, duration: 0.15 }}
            />
          ))}
        </motion.div>

        <motion.h1
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(28px, 7vw, 56px)', lineHeight: 1, letterSpacing: '0.12em' }}
          className="font-bold text-white text-center"
        >
          {'SALARYMAN'.split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 15 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.04, duration: 0.2, ease: 'backOut' }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(8px, 1.4vw, 14px)', letterSpacing: '0.3em' }}
          className="text-[#38bdf8] mt-2 uppercase text-center"
          initial={{ opacity: 0, width: 0 }}
          animate={phase >= 3 ? { opacity: 1, width: 'auto' } : {}}
          transition={{ duration: 0.4 }}
        >
          BY PICASSO.AI
        </motion.p>
      </div>

      {phase >= 2 && (
        <>
          <motion.div
            className="absolute left-0 right-0 h-[1px] top-[38%]"
            style={{ background: 'linear-gradient(90deg, transparent 0%, #38bdf8 50%, transparent 100%)' }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.15 }}
            transition={{ duration: 0.6 }}
          />
          <motion.div
            className="absolute left-0 right-0 h-[1px] bottom-[38%]"
            style={{ background: 'linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)' }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.15 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          />
        </>
      )}
    </motion.div>
  );
}
