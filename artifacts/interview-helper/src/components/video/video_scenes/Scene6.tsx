import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const GRID = [
    { bg: '#7C3AED', shape: 'square' as const },
    { bg: '#FFFFFF', shape: 'square' as const },
    { bg: '#22C55E', shape: 'circle' as const },
    { bg: '#FFFFFF', shape: 'square' as const },
    { bg: '#3B82F6', shape: 'square' as const },
    { bg: '#FFFFFF', shape: 'square' as const },
    { bg: '#EC4899', shape: 'triangle' as const },
    { bg: '#FFFFFF', shape: 'square' as const },
    { bg: '#1E3A5F', shape: 'square' as const },
  ];

  const cellSize = 'clamp(4px, 1vw, 8px)';

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
        <div className="mb-3" style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${cellSize})`, gap: 'clamp(1px, 0.2vw, 2px)' }}>
          {GRID.map((cell, i) => {
            const size = cellSize;
            if (cell.shape === 'circle') {
              return (
                <motion.div
                  key={i}
                  style={{ width: size, height: size, background: cell.bg, borderRadius: '50%' }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={phase >= 1 ? { opacity: 0.85, scale: 1 } : {}}
                  transition={{ delay: i * 0.03, duration: 0.15 }}
                />
              );
            }
            if (cell.shape === 'triangle') {
              return (
                <motion.div
                  key={i}
                  style={{ width: size, height: size, position: 'relative', overflow: 'hidden' }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={phase >= 1 ? { opacity: 0.85, scale: 1 } : {}}
                  transition={{ delay: i * 0.03, duration: 0.15 }}
                >
                  <div style={{
                    width: 0, height: 0,
                    borderLeft: `calc(${size} / 2) solid transparent`,
                    borderRight: `calc(${size} / 2) solid transparent`,
                    borderBottom: `${size} solid ${cell.bg}`,
                    position: 'absolute', top: 0, left: 0,
                  }} />
                </motion.div>
              );
            }
            return (
              <motion.div
                key={i}
                style={{ width: size, height: size, background: cell.bg, borderRadius: 1 }}
                initial={{ opacity: 0, scale: 0 }}
                animate={phase >= 1 ? { opacity: 0.85, scale: 1 } : {}}
                transition={{ delay: i * 0.03, duration: 0.15 }}
              />
            );
          })}
        </div>

        <h3
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(18px, 4vw, 34px)', letterSpacing: '0.15em', lineHeight: 1 }}
          className="font-bold text-white text-center"
        >
          SALARYMAN
        </h3>

        <motion.p
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1.1vw, 10px)', letterSpacing: '0.35em' }}
          className="text-[#38bdf8] mt-2 uppercase text-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 0.8 } : {}}
          transition={{ duration: 0.4 }}
        >
          THE PICASSO PLATFORM
        </motion.p>

        <motion.div
          className="mt-4 flex items-center gap-[2vw] flex-wrap justify-center"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {['75 BOTS', 'PHONE', 'CRM', 'INSURANCE', 'PUBLISHING', 'API'].map((t, i) => (
            <motion.span
              key={t}
              style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(4px, 0.7vw, 6px)',
                letterSpacing: '0.15em',
                color: '#38bdf8',
                opacity: 0.5,
                padding: 'clamp(1px, 0.2vw, 3px) clamp(3px, 0.5vw, 6px)',
                border: '1px solid rgba(56,189,248,0.15)',
                borderRadius: 2,
              }}
              initial={{ opacity: 0, y: 5 }}
              animate={phase >= 3 ? { opacity: 0.5, y: 0 } : {}}
              transition={{ delay: i * 0.06, duration: 0.2 }}
            >
              {t}
            </motion.span>
          ))}
        </motion.div>

        <motion.div
          className="mt-3 flex items-center gap-[1vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
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
