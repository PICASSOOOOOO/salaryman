import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at center, #0c1220 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: 'backOut' }}
      >
        <div className="mb-3 grid grid-cols-3 gap-[2px]">
          {['#3b82f6','#10b981','#38bdf8','#f59e0b','#3b82f6','#a855f7','#ef4444','#38bdf8','#10b981'].map((c, i) => (
            <motion.div
              key={i}
              style={{ width: 'clamp(4px, 1vw, 8px)', height: 'clamp(4px, 1vw, 8px)', background: c, borderRadius: 1 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={phase >= 1 ? { opacity: 0.85, scale: 1 } : {}}
              transition={{ delay: i * 0.03, duration: 0.15 }}
            />
          ))}
        </div>

        <h3
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(18px, 4vw, 34px)', letterSpacing: '0.15em', lineHeight: 1 }}
          className="font-bold text-white text-center"
        >
          PABLO CORP
        </h3>

        <motion.p
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1.1vw, 10px)', letterSpacing: '0.35em' }}
          className="text-[#38bdf8] mt-2 uppercase text-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 0.8 } : {}}
          transition={{ duration: 0.4 }}
        >
          ATTENTION IS ALL YOU NEED
        </motion.p>

        <motion.div
          className="mt-3 flex items-center gap-[1vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          <div className="h-[1px] w-[3vw] bg-[#38bdf8]/30" />
          <span
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', letterSpacing: '0.2em' }}
            className="text-white/25 uppercase"
          >
            PICASSO.AI
          </span>
          <div className="h-[1px] w-[3vw] bg-[#38bdf8]/30" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
