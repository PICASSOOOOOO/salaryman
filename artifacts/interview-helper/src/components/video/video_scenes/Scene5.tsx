import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#09090b] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase >= 3 ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center"
      >
        <div className="mb-6 grid grid-cols-3 gap-1">
          {['#3b82f6','#10b981','#38bdf8','#f59e0b','#3b82f6','#a855f7','#ef4444','#38bdf8','#10b981'].map((c, i) => (
            <motion.div
              key={i}
              className="w-[2vw] h-[2vw]"
              style={{ background: c }}
              initial={{ opacity: 0, scale: 0 }}
              animate={phase >= 1 ? { opacity: 0.9, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            />
          ))}
        </div>

        <h3 
          className="text-[4vw] font-bold text-white tracking-[0.2em] mb-2"
          style={{ fontFamily: '"VT323", monospace' }}
        >
          PABLO CORP
        </h3>
        
        <motion.p
          className="text-[2vw] text-[#38bdf8] uppercase tracking-[0.4em]"
          style={{ fontFamily: '"Share Tech Mono", monospace' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          ATTENTION IS ALL YOU NEED
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
