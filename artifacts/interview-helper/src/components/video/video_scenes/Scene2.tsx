import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <motion.div 
        className="absolute left-0 w-[4px] h-full bg-[#38bdf8]"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.6, ease: "circOut" }}
      />
      
      <div className="text-center px-12">
        <motion.h2 
          className="text-[6vw] font-bold text-white uppercase leading-tight"
          style={{ fontFamily: '"VT323", monospace' }}
        >
          <motion.span 
            className="block text-[#10b981]"
            initial={{ x: -50, opacity: 0 }}
            animate={phase >= 1 ? { x: 0, opacity: 1 } : { x: -50, opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            THE PICASSO
          </motion.span>
          <motion.span 
            className="block tracking-widest"
            initial={{ x: 50, opacity: 0 }}
            animate={phase >= 1 ? { x: 0, opacity: 1 } : { x: 50, opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            PLATFORM
          </motion.span>
        </motion.h2>
      </div>
      
      {/* Flashing features in background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-10">
        <motion.div 
          className="text-[12vw] font-bold text-[#38bdf8] whitespace-nowrap"
          style={{ fontFamily: '"VT323", monospace' }}
          animate={{ x: ['100%', '-100%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          7 AI AGENTS • 8 CHANNELS • DARK ROOM • CRM & PIPELINE
        </motion.div>
      </div>
    </motion.div>
  );
}
