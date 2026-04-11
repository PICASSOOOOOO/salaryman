import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const DESK_ITEMS = [
  { x: 15, y: 45, w: 28, h: 18, label: 'CRM', color: '#38bdf8', items: ['Sarah M. — Follow Up', 'Jake R. — New Lead', 'Corp Inc — Proposal'] },
  { x: 57, y: 45, w: 28, h: 18, label: 'DEALS', color: '#10b981', items: ['$12K — Closing', '$8.5K — Negotiation', '$24K — Won'] },
  { x: 15, y: 68, w: 28, h: 14, label: 'INVOICES', color: '#f59e0b', items: ['INV-0042 — $3,200', 'INV-0041 — $1,800'] },
  { x: 57, y: 68, w: 28, h: 14, label: 'CALENDAR', color: '#a855f7', items: ['10am — Client Call', '2pm — Team Sync'] },
];

const MONITOR_LINES = [
  { w: 60, color: '#38bdf830' },
  { w: 45, color: '#10b98130' },
  { w: 75, color: '#38bdf820' },
  { w: 35, color: '#f59e0b20' },
  { w: 55, color: '#38bdf825' },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #0d1520 60%, #111a2e 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        style={{
          position: 'absolute', top: '3%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)',
          letterSpacing: '0.25em', color: '#38bdf8',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.7 } : {}}
      >
        YOUR OFFICE · LIVE
      </motion.div>

      {phase >= 1 && (
        <motion.div
          style={{
            position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)',
            width: '72%', height: '30%',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            border: '2px solid #334155',
            borderRadius: 4,
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
          style-origin="bottom"
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(8px, 1.5vw, 14px)',
            background: '#1e293b', borderBottom: '1px solid #334155',
            display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 6,
          }}>
            {['#ef4444', '#f59e0b', '#10b981'].map((c, i) => (
              <div key={i} style={{ width: 'clamp(3px, 0.5vw, 5px)', height: 'clamp(3px, 0.5vw, 5px)', borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)', color: '#64748b', marginLeft: 4 }}>
              salaryman.app/business
            </span>
          </div>

          <div style={{ position: 'absolute', top: 'clamp(12px, 2vw, 18px)', left: '5%', right: '5%', bottom: '8%' }}>
            {MONITOR_LINES.map((line, i) => (
              <motion.div
                key={i}
                style={{
                  width: `${line.w}%`, height: 'clamp(2px, 0.4vw, 3px)',
                  background: line.color, borderRadius: 1, marginBottom: 'clamp(2px, 0.5vw, 4px)',
                }}
                initial={{ scaleX: 0 }}
                animate={phase >= 2 ? { scaleX: 1 } : {}}
                transition={{ delay: i * 0.1, duration: 0.2 }}
                style-origin="left"
              />
            ))}
          </div>
        </motion.div>
      )}

      {phase >= 1 && (
        <motion.div
          style={{
            position: 'absolute', top: '38%', left: '50%', transform: 'translateX(-50%)',
            width: '82%', height: '4%',
            background: 'linear-gradient(90deg, transparent 0%, #1e293b40 20%, #1e293b60 50%, #1e293b40 80%, transparent 100%)',
            borderRadius: 2,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        />
      )}

      {phase >= 3 && DESK_ITEMS.map((item, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            left: `${item.x}%`, top: `${item.y}%`,
            width: `${item.w}%`, height: `${item.h}%`,
            background: `${item.color}08`,
            border: `1px solid ${item.color}30`,
            borderRadius: 3, padding: 'clamp(3px, 0.6vw, 6px)',
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.3, ease: 'backOut' }}
        >
          <div style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: 'clamp(4px, 0.6vw, 6px)',
            color: item.color, letterSpacing: '0.15em', marginBottom: 'clamp(2px, 0.3vw, 4px)',
          }}>
            {item.label}
          </div>
          {item.items.map((line, li) => (
            <motion.div
              key={li}
              style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(3px, 0.45vw, 4px)',
                color: '#94a3b8', marginBottom: 1,
                opacity: 0.7,
              }}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 0.7, x: 0 }}
              transition={{ delay: 0.3 + i * 0.12 + li * 0.06, duration: 0.2 }}
            >
              {line}
            </motion.div>
          ))}
        </motion.div>
      ))}

      {phase >= 2 && (
        <>
          <div style={{
            position: 'absolute', bottom: '10%', left: '20%',
            width: 'clamp(5px, 0.8vw, 7px)', height: 'clamp(8px, 1.5vw, 12px)',
            background: '#334155', borderRadius: '2px 2px 0 0',
          }} />
          <div style={{
            position: 'absolute', bottom: '10%', left: '75%',
            width: 'clamp(5px, 0.8vw, 7px)', height: 'clamp(8px, 1.5vw, 12px)',
            background: '#334155', borderRadius: '2px 2px 0 0',
          }} />
          <motion.div style={{
            position: 'absolute', bottom: '7%', left: '10%', right: '10%',
            height: 'clamp(2px, 0.4vw, 3px)',
            background: '#1e293b40',
            borderRadius: 1,
          }} />
        </>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: '4%',
          fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)',
          color: '#38bdf8', letterSpacing: '0.06em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
        transition={{ duration: 0.4 }}
      >
        CRM · INVOICES · DEALS · PAYROLL
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: '1%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)',
          color: '#10b981', letterSpacing: '0.15em', opacity: 0.5,
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.5 } : {}}
      >
        EVERYTHING IN ONE PLACE
      </motion.div>
    </motion.div>
  );
}
