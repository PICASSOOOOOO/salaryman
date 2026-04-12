import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BOT_CATEGORIES = [
  { category: 'SALES & OUTREACH', count: 14, bots: ['CLOSER', 'SCOUT', 'DISPATCH', 'QUALIFIER'], color: '#ef4444' },
  { category: 'CONTENT & WRITING', count: 12, bots: ['HEMINGWAY', 'GHOSTWRITER', 'BLOGGER', 'TRANSLATOR'], color: '#10b981' },
  { category: 'CREATIVE & DESIGN', count: 11, bots: ['PIXEL', 'DARK ROOM', 'BRAND KIT', 'THUMBNAIL'], color: '#a855f7' },
  { category: 'DATA & RESEARCH', count: 10, bots: ['ORACLE', 'ANALYST', 'SCRAPER', 'FORECAST'], color: '#f59e0b' },
  { category: 'SUPPORT & OPS', count: 15, bots: ['SENTINEL', 'TRIAGE', 'FAQ BOT', 'ONBOARD'], color: '#06b6d4' },
  { category: 'CODE & DEV', count: 8, bots: ['FORGE', 'DEBUGGER', 'REVIEWER', 'DEPLOYER'], color: '#6366f1' },
  { category: 'SOCIAL & MARKETING', count: 7, bots: ['HERALD', 'SCHEDULER', 'MAVEN', 'INFLUENCER'], color: '#ec4899' },
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #1a0808 0%, #0a0e1a 50%, #06080d 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        style={{
          position: 'absolute', top: '3%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)',
          letterSpacing: '0.25em', color: '#ef4444',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.7 } : {}}
      >
        THE FULL ROSTER
      </motion.div>

      <motion.div
        style={{ position: 'absolute', top: '3%', right: '4%' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.5 } : {}}>
        <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.4vw, 12px)', color: '#f59e0b' }}>
          77 BOTS
        </span>
      </motion.div>

      <div className="absolute" style={{ top: '10%', left: '3%', right: '3%', bottom: '12%', display: 'flex', flexDirection: 'column', gap: 'clamp(2px, 0.4vw, 4px)' }}>
        {BOT_CATEGORIES.map((cat, i) => (
          <motion.div key={i} style={{
            flex: 1, display: 'flex', alignItems: 'center',
            background: `${cat.color}06`, border: `1px solid ${cat.color}18`,
            borderRadius: 3, padding: '0 clamp(4px, 0.7vw, 8px)', gap: 'clamp(4px, 0.8vw, 8px)',
          }}
            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.08, duration: 0.35, ease: 'backOut' }}
          >
            <div style={{ minWidth: 'clamp(24px, 4vw, 36px)', textAlign: 'center' }}>
              <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.4vw, 12px)', color: cat.color }}>
                {cat.count}
              </span>
            </div>
            <div style={{ width: 1, height: '60%', background: `${cat.color}25` }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: cat.color, letterSpacing: '0.1em' }}>
                {cat.category}
              </div>
              <div style={{ display: 'flex', gap: 'clamp(2px, 0.4vw, 4px)', marginTop: 1 }}>
                {cat.bots.map((b, bi) => (
                  <motion.span key={bi} style={{
                    fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.3vw, 3px)',
                    color: '#64748b', letterSpacing: '0.05em',
                  }}
                    initial={{ opacity: 0 }}
                    animate={phase >= 3 ? { opacity: 0.7 } : {}}
                    transition={{ delay: 0.3 + i * 0.05 + bi * 0.03 }}>
                    {b}{bi < cat.bots.length - 1 ? ' ·' : ''}
                  </motion.span>
                ))}
                <motion.span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.3vw, 3px)', color: cat.color + '60' }}
                  initial={{ opacity: 0 }} animate={phase >= 3 ? { opacity: 0.5 } : {}} transition={{ delay: 0.5 + i * 0.05 }}>
                  +{cat.count - 4} MORE
                </motion.span>
              </div>
            </div>
            <motion.div style={{
              width: `${(cat.count / 15) * 100}%`, maxWidth: '25%', height: 'clamp(2px, 0.3vw, 3px)',
              background: `linear-gradient(90deg, ${cat.color}40, ${cat.color}15)`, borderRadius: 1,
            }}
              initial={{ scaleX: 0 }} animate={phase >= 2 ? { scaleX: 1 } : {}}
              transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }} style-origin="left"
            />
          </motion.div>
        ))}
      </div>

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: '4%',
          fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)',
          color: '#ef4444', letterSpacing: '0.06em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
      >
        EVERY CATEGORY COVERED
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: '1%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)',
          color: '#94a3b8', letterSpacing: '0.15em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.5 } : {}}
      >
        ALL 77 INCLUDED · NO ADD-ONS · NO UPSELLS
      </motion.div>
    </motion.div>
  );
}
