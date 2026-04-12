import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BOTS = [
  { name: 'CLOSER', desc: 'SALES AUTOMATION', color: '#ef4444', status: 'ACTIVE' },
  { name: 'SCOUT', desc: 'LEAD RESEARCH', color: '#f59e0b', status: 'ACTIVE' },
  { name: 'HEMINGWAY', desc: 'AI COPYWRITER', color: '#10b981', status: 'ACTIVE' },
  { name: 'WATCHDOG', desc: 'BRAND MONITOR', color: '#38bdf8', status: 'ACTIVE' },
  { name: 'PIXEL', desc: 'IMAGE GENERATOR', color: '#a855f7', status: 'IDLE' },
  { name: 'ORACLE', desc: 'DATA ANALYSIS', color: '#ec4899', status: 'ACTIVE' },
  { name: 'DISPATCH', desc: 'EMAIL OUTREACH', color: '#84cc16', status: 'ACTIVE' },
  { name: 'SENTINEL', desc: 'CUSTOMER SUPPORT', color: '#06b6d4', status: 'ACTIVE' },
  { name: 'GHOST', desc: 'STEALTH TYPING', color: '#6366f1', status: 'IDLE' },
  { name: 'FORGE', desc: 'CODE GENERATION', color: '#f97316', status: 'ACTIVE' },
  { name: 'MAVEN', desc: 'SEO OPTIMIZER', color: '#14b8a6', status: 'ACTIVE' },
  { name: 'HERALD', desc: 'SOCIAL MEDIA', color: '#e879f9', status: 'ACTIVE' },
];

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #030508 0%, #0a0810 50%, #08060d 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div className="absolute top-[3%] left-[3%] z-30 flex items-center gap-[0.6vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <span style={{ fontSize: 'clamp(8px, 1.2vw, 12px)' }}>🤖</span>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#ef4444' }}>
          BOT FACTORY
        </span>
        <motion.span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#10b98160' }}
          animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          ● 77 ONLINE
        </motion.span>
      </motion.div>

      <motion.div className="absolute top-[3%] right-[3%] z-30"
        initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 0.6 } : {}} transition={{ duration: 0.3 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 8px)', letterSpacing: '0.15em', color: '#ef4444' }}>
          MANAGED BY JEAN CLAW
        </span>
      </motion.div>

      <div className="absolute" style={{ top: '10%', left: '3%', right: '3%', bottom: '14%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 'clamp(3px, 0.5vw, 6px)' }}>
        {BOTS.map((bot, i) => (
          <motion.div key={i}
            style={{
              background: `${bot.color}08`,
              border: `1px solid ${bot.color}25`,
              borderRadius: 4,
              padding: 'clamp(4px, 0.6vw, 8px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              gap: 'clamp(2px, 0.3vw, 4px)',
              position: 'relative', overflow: 'hidden',
            }}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1, y: 0 } : {}}
            transition={{ delay: i * 0.05, duration: 0.3, ease: 'backOut' }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${bot.color}60, transparent)` }} />
            <motion.div style={{
              width: 'clamp(8px, 1.4vw, 12px)', height: 'clamp(8px, 1.4vw, 12px)',
              borderRadius: '50%', border: `1px solid ${bot.color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
              animate={{ boxShadow: [`0 0 0px ${bot.color}00`, `0 0 8px ${bot.color}30`, `0 0 0px ${bot.color}00`] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.15 }}
            >
              <div style={{ width: 'clamp(3px, 0.5vw, 4px)', height: 'clamp(3px, 0.5vw, 4px)', borderRadius: '50%', background: bot.color }} />
            </motion.div>
            <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', color: bot.color, letterSpacing: '0.08em', textAlign: 'center' }}>
              {bot.name}
            </span>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)', color: '#64748b', letterSpacing: '0.08em', textAlign: 'center' }}>
              {bot.desc}
            </span>
            <motion.div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.3vw, 3px)', color: bot.status === 'ACTIVE' ? '#10b981' : '#f59e0b', letterSpacing: '0.1em' }}
              animate={bot.status === 'ACTIVE' ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}>
              ● {bot.status}
            </motion.div>
          </motion.div>
        ))}
      </div>

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 10 }} animate={phase >= 4 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#ef4444', letterSpacing: '0.08em', textShadow: '0 0 10px #ef444430' }}>
          YOUR ARMY OF AI WORKERS
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#94a3b8', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          SHOWING 12 OF 77 · ALL CATEGORIES
        </div>
      </motion.div>
    </motion.div>
  );
}
