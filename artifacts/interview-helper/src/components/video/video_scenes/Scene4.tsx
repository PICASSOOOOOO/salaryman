import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const DEPLOY_LOG = [
  { time: '09:01', bot: 'CLOSER', action: 'DEPLOYED TO SALES PIPELINE', color: '#ef4444' },
  { time: '09:01', bot: 'SCOUT', action: 'RESEARCHING 48 LEADS', color: '#f59e0b' },
  { time: '09:02', bot: 'HEMINGWAY', action: 'WRITING 12 EMAIL DRAFTS', color: '#10b981' },
  { time: '09:03', bot: 'DISPATCH', action: 'SENDING OUTREACH BATCH #7', color: '#84cc16' },
  { time: '09:04', bot: 'ORACLE', action: 'ANALYZING Q2 REVENUE DATA', color: '#ec4899' },
  { time: '09:05', bot: 'SENTINEL', action: 'RESPONDING TO 3 TICKETS', color: '#06b6d4' },
];

const METRICS = [
  { label: 'BOTS ACTIVE', value: '64/77', color: '#10b981' },
  { label: 'TASKS TODAY', value: '1,247', color: '#38bdf8' },
  { label: 'EFFICIENCY', value: '94.2%', color: '#f59e0b' },
  { label: 'COST SAVED', value: '$12,400', color: '#a855f7' },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 2000),
      setTimeout(() => setPhase(5), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060a14 0%, #0a1220 50%, #0d1628 100%)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.4 }}>

      <motion.div className="absolute top-[2.5%] left-[3%] z-20 flex items-center gap-[0.8vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#ef4444' }}>
          COMMAND CENTER
        </span>
        <motion.span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#10b98160' }}
          animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
          LIVE
        </motion.span>
      </motion.div>

      {phase >= 1 && (
        <div className="absolute flex gap-[1vw]" style={{ top: '8%', left: '3%', right: '3%' }}>
          {METRICS.map((m, i) => (
            <motion.div key={i} style={{
              flex: 1, background: `${m.color}08`, border: `1px solid ${m.color}20`, borderRadius: 4,
              padding: 'clamp(4px, 0.6vw, 8px)', textAlign: 'center',
            }}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}>
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#64748b', letterSpacing: '0.15em' }}>
                {m.label}
              </div>
              <motion.div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)', color: m.color, marginTop: 2 }}
                initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 1 } : {}} transition={{ delay: 0.2 + i * 0.1, duration: 0.3 }}>
                {m.value}
              </motion.div>
            </motion.div>
          ))}
        </div>
      )}

      {phase >= 2 && (
        <motion.div style={{
          position: 'absolute', top: '28%', left: '3%', right: '3%', bottom: '14%',
          background: '#0a0e18', border: '1px solid #ffffff10', borderRadius: 4, overflow: 'hidden',
        }}
          initial={{ opacity: 0, scaleY: 0.9 }} animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.35, ease: 'backOut' }}>
          <div style={{ padding: 'clamp(4px, 0.6vw, 6px)', borderBottom: '1px solid #ffffff08', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.55vw, 5px)', color: '#ef444480', letterSpacing: '0.15em' }}>
              DEPLOYMENT LOG
            </span>
            <motion.span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#10b98160' }}
              animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1, repeat: Infinity }}>
              ● STREAMING
            </motion.span>
          </div>

          {DEPLOY_LOG.map((entry, i) => (
            <motion.div key={i} style={{
              padding: 'clamp(4px, 0.6vw, 6px) clamp(6px, 0.8vw, 8px)',
              borderBottom: '1px solid #ffffff05',
              display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.6vw, 8px)',
            }}
              initial={{ opacity: 0, x: -15 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.12, duration: 0.3 }}>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#475569', minWidth: 'clamp(16px, 2.5vw, 24px)' }}>
                {entry.time}
              </span>
              <motion.div style={{
                width: 'clamp(4px, 0.6vw, 6px)', height: 'clamp(4px, 0.6vw, 6px)',
                borderRadius: '50%', background: entry.color,
              }}
                animate={{ boxShadow: [`0 0 0px ${entry.color}`, `0 0 6px ${entry.color}60`, `0 0 0px ${entry.color}`] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              />
              <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: entry.color, minWidth: 'clamp(30px, 5vw, 50px)' }}>
                {entry.bot}
              </span>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)', color: '#94a3b8' }}>
                {entry.action}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 8 }} animate={phase >= 5 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#ef4444', letterSpacing: '0.08em', textShadow: '0 0 10px #ef444430' }}>
          DEPLOY · MONITOR · SCALE
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#94a3b8', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          JEAN CLAW MANAGES EVERYTHING
        </div>
      </motion.div>
    </motion.div>
  );
}
