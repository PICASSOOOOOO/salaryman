import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.h1 
          className="text-[8vw] font-bold text-white tracking-[0.15em] leading-none mb-4"
          style={{ fontFamily: '"VT323", monospace' }}
        >
          {'SALARYMAN'.split('').map((char, i) => (
            <motion.span 
              key={i} 
              className="inline-block"
              initial={{ opacity: 0, y: 20, filter: 'blur(5px)' }}
              animate={phase >= 1 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 20, filter: 'blur(5px)' }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>
        
        <motion.p
          className="text-[1.5vw] text-[#38bdf8] uppercase tracking-[0.3em]"
          style={{ fontFamily: '"Share Tech Mono", monospace' }}
          initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
          animate={phase >= 2 ? { opacity: 1, clipPath: 'inset(0 0% 0 0)' } : { opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
          transition={{ duration: 0.4, ease: "circOut" }}
        >
          BY PICASSO.AI
        </motion.p>
      </div>
      
      {/* Glitch accents */}
      {phase >= 1 && phase < 3 && (
        <motion.div 
          className="absolute inset-0 pointer-events-none mix-blend-screen opacity-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0, 0.8, 0] }}
          transition={{ duration: 0.5, times: [0, 0.2, 0.4, 0.6, 1], repeat: Infinity }}
        >
          <div className="w-full h-2 bg-[#38bdf8] absolute top-[40%] -translate-y-1/2 left-0 transform -skew-x-12" />
          <div className="w-full h-1 bg-[#10b981] absolute top-[60%] -translate-y-1/2 left-0 transform skew-x-12" />
        </motion.div>
      )}
    </motion.div>
  );
}
