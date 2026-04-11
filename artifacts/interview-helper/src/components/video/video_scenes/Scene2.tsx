import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const words = ['RUN YOUR BUSINESS.', 'BUILD YOUR EMPIRE.', 'PLAY THE GAME.'];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0c1220 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative z-10 flex flex-col items-center text-center px-[8%]">
        <motion.div
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)', letterSpacing: '0.35em', color: '#10b981' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 0.7, y: 0 } : {}}
          transition={{ duration: 0.3 }}
        >
          THE PICASSO PLATFORM
        </motion.div>

        <motion.h2
          className="mt-3"
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(14px, 3.5vw, 30px)', lineHeight: 1.3, color: '#fff' }}
        >
          {words.map((word, i) => (
            <motion.span
              key={i}
              className="block"
              style={{ color: i === 2 ? '#38bdf8' : '#fff' }}
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.2, duration: 0.35, ease: 'easeOut' }}
            >
              {word}
            </motion.span>
          ))}
        </motion.h2>

        <motion.div
          className="mt-4 flex flex-wrap justify-center gap-[1.5vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {[
            { label: 'CRM', color: '#ef4444' },
            { label: 'AI AGENTS', color: '#10b981' },
            { label: 'PHONE', color: '#f59e0b' },
            { label: 'CREATIVE', color: '#a855f7' },
            { label: 'MMO WORLD', color: '#38bdf8' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-[0.4vw]"
              initial={{ opacity: 0, y: 6 }}
              animate={phase >= 2 ? { opacity: 0.8, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.2 }}
            >
              <div style={{ width: 'clamp(3px,0.5vw,5px)', height: 'clamp(3px,0.5vw,5px)', borderRadius: '50%', background: item.color }} />
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.85vw, 8px)', letterSpacing: '0.15em', color: item.color }}>
                {item.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          className="mt-3"
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 8px)', letterSpacing: '0.2em', color: '#fff', opacity: 0.3 }}
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 0.3 } : {}}
          transition={{ duration: 0.4 }}
        >
          YOUR VIRTUAL OFFICE · ONE PLATFORM · EVERYTHING YOU NEED
        </motion.p>
      </div>
    </motion.div>
  );
}
