import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #1a0808 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="grid grid-cols-3"
        style={{ width: 'clamp(24px, 5vw, 40px)', height: 'clamp(24px, 5vw, 40px)', gap: 'clamp(1px, 0.2vw, 2px)' }}
        initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, rotate: 0 } : {}}
        transition={{ duration: 0.5, ease: 'backOut' }}
      >
        {['#7C3AED','#fff','#22C55E','#fff','#3B82F6','#fff','#EC4899','#fff','#1E3A5F'].map((c, i) => (
          <motion.div key={i} style={{ background: c, borderRadius: i === 2 ? '50%' : 2, clipPath: i === 6 ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined, boxShadow: `0 0 4px ${c}30` }}
            initial={{ opacity: 0, scale: 0 }} animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.05 + i * 0.03, duration: 0.2, ease: 'backOut' }} />
        ))}
      </motion.div>

      <motion.div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 'clamp(14px, 3.5vw, 32px)',
          color: '#ef4444',
          letterSpacing: '0.15em',
          textShadow: '0 0 20px #ef444440, 0 0 40px #ef444420',
          marginTop: 'clamp(4px, 0.8vw, 8px)',
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.4, ease: 'backOut', delay: 0.15 }}
      >
        PIXEL AGENTS
      </motion.div>

      <motion.div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 'clamp(5px, 0.9vw, 8px)',
          color: '#94a3b8',
          letterSpacing: '0.3em',
          marginTop: 'clamp(2px, 0.5vw, 4px)',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 0.6 } : {}}
        transition={{ duration: 0.3 }}
      >
        9 AI AGENTS · $149/MO
      </motion.div>

      {phase >= 2 && (
        <motion.div
          style={{
            width: 'clamp(30px, 6vw, 50px)', height: 1,
            background: 'linear-gradient(90deg, transparent, #ef444460, transparent)',
            marginTop: 'clamp(6px, 1.2vw, 10px)', marginBottom: 'clamp(6px, 1.2vw, 10px)',
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {phase >= 3 && (
        <motion.div
          style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            gap: 'clamp(2px, 0.4vw, 4px)',
            maxWidth: '80%', marginTop: 'clamp(2px, 0.4vw, 4px)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {['SALES', 'WRITING', 'CREATIVE', 'DATA', 'SUPPORT', 'CODE', 'MARKETING'].map((f, i) => (
            <motion.div
              key={i}
              style={{
                padding: 'clamp(1px, 0.2vw, 2px) clamp(3px, 0.5vw, 6px)',
                border: '1px solid #ef444425',
                borderRadius: 2,
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(3px, 0.5vw, 5px)',
                color: '#ef4444',
                letterSpacing: '0.1em',
                opacity: 0.7,
              }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 0.7, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.2 }}
            >
              {f}
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '12%',
          fontFamily: "var(--font-sans)",
          fontSize: 'clamp(6px, 1.2vw, 11px)',
          color: '#10b981',
          letterSpacing: '0.12em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: [0, 0.8, 0.4, 0.8] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        YOUR WORKFORCE. AUTOMATED.
      </motion.div>

      <motion.div
        style={{
          position: 'absolute', bottom: '6%',
          fontFamily: "var(--font-sans)",
          fontSize: 'clamp(3px, 0.55vw, 5px)',
          color: '#64748b',
          letterSpacing: '0.2em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.4 } : {}}
      >
        THE SALARYMAN PLATFORM
      </motion.div>
    </motion.div>
  );
}
