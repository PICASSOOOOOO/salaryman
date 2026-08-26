import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const COMPARISON = [
  { label: 'HIRE 1 EMPLOYEE', cost: '$4,500/MO', color: '#475569', you: false },
  { label: 'HIRE 5 FREELANCERS', cost: '$3,200/MO', color: '#475569', you: false },
  { label: '5 SAAS SUBSCRIPTIONS', cost: '$890/MO', color: '#475569', you: false },
  { label: 'PIXEL AGENTS · 9 AGENTS', cost: '$149/MO', color: '#ef4444', you: true },
];

const INCLUDES = [
  '9 CURATED AI AGENTS · 4 TEAMS',
  'UNLIMITED TASKS',
  'BOT-TO-BOT CHAINING',
  'COMMAND CENTER DASHBOARD',
  'PRIORITY PROCESSING',
  'ALL FUTURE BOTS INCLUDED',
];

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(180deg, #060a14 0%, #0a0810 50%, #080c18 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div style={{
        position: 'absolute', top: '3%', left: 0, right: 0, textAlign: 'center',
      }}
        initial={{ opacity: 0, y: -10 }} animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(12px, 2.5vw, 22px)', color: '#ef4444', letterSpacing: '0.12em' }}>
          THE MATH IS SIMPLE
        </span>
      </motion.div>

      <div className="absolute" style={{ top: '12%', left: '5%', right: '5%', height: '40%', display: 'flex', flexDirection: 'column', gap: 'clamp(3px, 0.5vw, 6px)' }}>
        {COMPARISON.map((item, i) => (
          <motion.div key={i} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 clamp(6px, 1vw, 12px)',
            background: item.you ? '#ef444410' : '#ffffff04',
            border: `1px solid ${item.you ? '#ef444440' : '#ffffff10'}`,
            borderRadius: 4,
          }}
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.12, duration: 0.35, ease: 'backOut' }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(4px, 0.65vw, 6px)', color: item.you ? '#ef4444' : '#94a3b8', letterSpacing: '0.1em' }}>
              {item.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.6vw, 6px)' }}>
              {!item.you && (
                <motion.div style={{ width: 'clamp(30px, 5vw, 50px)', height: 1, background: '#ef4444' }}
                  initial={{ scaleX: 0 }} animate={phase >= 2 ? { scaleX: 1 } : {}}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }} />
              )}
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(6px, 1.2vw, 11px)',
                color: item.you ? '#ef4444' : '#64748b',
                textDecoration: item.you ? 'none' : 'line-through',
                textDecorationColor: '#ef4444',
              }}>
                {item.cost}
              </span>
              {item.you && (
                <motion.span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#10b981', letterSpacing: '0.1em' }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  ✓ BEST VALUE
                </motion.span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {phase >= 3 && (
        <motion.div style={{
          position: 'absolute', top: '56%', left: '5%', right: '5%', bottom: '14%',
          background: '#0a0e1808', border: '1px solid #ef444418', borderRadius: 4,
          padding: 'clamp(4px, 0.7vw, 8px)',
        }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(3px, 0.5vw, 5px)', color: '#ef444480', letterSpacing: '0.15em', marginBottom: 'clamp(3px, 0.5vw, 6px)' }}>
            WHAT YOU GET
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'clamp(2px, 0.3vw, 4px)' }}>
            {INCLUDES.map((item, i) => (
              <motion.div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(2px, 0.4vw, 4px)' }}
                initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.2 }}>
                <span style={{ color: '#10b981', fontSize: 'clamp(4px, 0.5vw, 5px)' }}>✓</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(3px, 0.45vw, 4px)', color: '#e2e8f0' }}>
                  {item}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: 0, right: 0, textAlign: 'center',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 'clamp(10px, 2vw, 18px)', color: '#f59e0b', letterSpacing: '0.08em' }}>
          $149/MO · CANCEL ANYTIME
        </span>
      </motion.div>
    </motion.div>
  );
}
