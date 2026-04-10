import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#09090b] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 0.5, ease: "circOut" }}
    >
      <motion.div 
        className="absolute w-[150vw] h-[150vw] rounded-full border-[1px] border-[#38bdf8]/30"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      <motion.div 
        className="absolute w-[100vw] h-[100vw] rounded-full border-[2px] border-[#10b981]/40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
      />
      
      <div className="relative z-10 text-center">
        <motion.div
          className="inline-block px-6 py-2 border-2 border-[#10b981] bg-[#10b981]/10"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.4 }}
        >
          <h2 
            className="text-[7vw] font-bold text-[#10b981] tracking-widest leading-none"
            style={{ fontFamily: '"VT323", monospace' }}
          >
            ALPHA V.2.0
          </h2>
        </motion.div>
        
        <motion.div
          className="mt-6 text-[2vw] text-white/70"
          style={{ fontFamily: '"Share Tech Mono", monospace' }}
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          JEAN CLAW EDITION // PABLO AI CORE
        </motion.div>
      </div>
    </motion.div>
  );
}
