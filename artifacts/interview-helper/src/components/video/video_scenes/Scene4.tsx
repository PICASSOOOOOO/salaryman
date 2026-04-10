import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, #0a1a14 0%, #06080d 70%)' }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.06) 0%, transparent 50%)' }}
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: 'backOut' }}
        >
          <div
            className="px-[4vw] py-[1.2vw] border-2 border-[#10b981] relative overflow-hidden"
            style={{ background: 'rgba(16,185,129,0.06)' }}
          >
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.1), transparent)' }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            <h2
              style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(24px, 6vw, 48px)', lineHeight: 1 }}
              className="font-bold text-[#10b981] tracking-widest relative z-10"
            >
              ALPHA V.2.0
            </h2>
          </div>
          <div className="absolute -top-[1px] -left-[6px] w-3 h-[1px] bg-[#10b981]" />
          <div className="absolute -top-[6px] -left-[1px] w-[1px] h-3 bg-[#10b981]" />
          <div className="absolute -bottom-[1px] -right-[6px] w-3 h-[1px] bg-[#10b981]" />
          <div className="absolute -bottom-[6px] -right-[1px] w-[1px] h-3 bg-[#10b981]" />
        </motion.div>

        <motion.div
          className="mt-3 flex items-center gap-[1.5vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="h-[1px] w-[4vw] bg-white/20" />
          <span
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.2vw, 12px)', letterSpacing: '0.15em' }}
            className="text-white/50"
          >
            JEAN CLAW EDITION
          </span>
          <div className="h-[1px] w-[4vw] bg-white/20" />
        </motion.div>
      </div>
    </motion.div>
  );
}
