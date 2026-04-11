import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const MODULES = [
  { x: 8, y: 42, w: 38, h: 24, label: 'CRM', color: '#38bdf8', rows: [
    { text: 'Sarah M. — Follow Up', status: 'HOT', statusColor: '#ef4444' },
    { text: 'Jake R. — New Lead', status: 'NEW', statusColor: '#10b981' },
    { text: 'Corp Inc — $45K Proposal', status: 'SENT', statusColor: '#f59e0b' },
  ]},
  { x: 54, y: 42, w: 38, h: 24, label: 'DEALS PIPELINE', color: '#10b981', rows: [
    { text: '$12,000 — Closing Friday', status: '●', statusColor: '#10b981' },
    { text: '$8,500 — In Negotiation', status: '●', statusColor: '#f59e0b' },
    { text: '$24,000 — Won ✓', status: '●', statusColor: '#38bdf8' },
  ]},
  { x: 8, y: 70, w: 25, h: 18, label: 'INVOICES', color: '#f59e0b', rows: [
    { text: 'INV-0042  $3,200', status: 'PAID', statusColor: '#10b981' },
    { text: 'INV-0043  $1,800', status: 'DUE', statusColor: '#f59e0b' },
  ]},
  { x: 37, y: 70, w: 25, h: 18, label: 'CALENDAR', color: '#a855f7', rows: [
    { text: '10am — Client Call', status: '', statusColor: '' },
    { text: '2pm — Team Standup', status: '', statusColor: '' },
  ]},
  { x: 66, y: 70, w: 26, h: 18, label: 'PAYROLL', color: '#ec4899', rows: [
    { text: 'Q2 Run  $28,400', status: 'DONE', statusColor: '#10b981' },
    { text: 'Next: Jul 1', status: '', statusColor: '' },
  ]},
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 500),
      setTimeout(() => setPhase(3), 1000),
      setTimeout(() => setPhase(4), 1800),
      setTimeout(() => setPhase(5), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060a14 0%, #0a1220 50%, #0d1628 100%)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.4 }}>

      <motion.div className="absolute top-[2.5%] left-[3%] z-20 flex items-center gap-[0.8vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#38bdf8' }}>
          YOUR OFFICE
        </span>
        <motion.span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#38bdf860' }}
          animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
          LIVE
        </motion.span>
      </motion.div>

      {phase >= 1 && (
        <motion.div className="absolute" style={{
          top: '7%', left: '50%', transform: 'translateX(-50%)', width: '86%', height: '30%',
          background: 'linear-gradient(180deg, #111827 0%, #0a0f1a 100%)',
          border: '1px solid #1e293b', borderRadius: 6,
          boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
        }}
          initial={{ opacity: 0, scaleY: 0.8, y: 10 }} animate={{ opacity: 1, scaleY: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'backOut' }}>
          <div className="absolute top-0 left-0 right-0 flex items-center gap-[4px] px-2" style={{
            height: 'clamp(10px, 1.6vw, 16px)', background: '#151c2c', borderRadius: '6px 6px 0 0', borderBottom: '1px solid #1e293b40',
          }}>
            {['#ef4444', '#f59e0b', '#10b981'].map((c, i) => (
              <div key={i} style={{ width: 'clamp(3px, 0.5vw, 5px)', height: 'clamp(3px, 0.5vw, 5px)', borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
            <span className="ml-2" style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.55vw, 5px)', color: '#475569' }}>
              salaryman.app/business
            </span>
          </div>

          <div className="absolute" style={{ top: 'clamp(14px, 2.2vw, 20px)', left: '3%', right: '3%', bottom: '6%' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div key={i} style={{
                width: `${35 + Math.random() * 45}%`, height: 'clamp(2px, 0.4vw, 3px)',
                background: `rgba(56,189,248,${0.08 + Math.random() * 0.12})`, borderRadius: 1, marginBottom: 'clamp(3px, 0.5vw, 5px)',
              }}
                initial={{ scaleX: 0 }} animate={phase >= 2 ? { scaleX: 1 } : {}}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.25 }} style-origin="left" />
            ))}
          </div>
        </motion.div>
      )}

      {phase >= 3 && MODULES.map((mod, i) => (
        <motion.div key={i} className="absolute" style={{
          left: `${mod.x}%`, top: `${mod.y}%`, width: `${mod.w}%`, height: `${mod.h}%`,
          background: `${mod.color}06`, border: `1px solid ${mod.color}20`,
          borderRadius: 4, overflow: 'hidden',
        }}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.1, duration: 0.35, ease: 'backOut' }}>
          <div className="px-[6%] py-[3%]" style={{ borderBottom: `1px solid ${mod.color}15` }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: mod.color, letterSpacing: '0.15em', fontWeight: 600 }}>
              {mod.label}
            </span>
          </div>
          {mod.rows.map((row, ri) => (
            <motion.div key={ri} className="flex justify-between items-center px-[6%]"
              style={{ paddingTop: 'clamp(2px, 0.3vw, 3px)', paddingBottom: 'clamp(2px, 0.3vw, 3px)', borderBottom: `1px solid ${mod.color}08` }}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 0.8, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 + ri * 0.06, duration: 0.2 }}>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)', color: '#94a3b8' }}>
                {row.text}
              </span>
              {row.status && (
                <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)', color: row.statusColor, letterSpacing: '0.1em' }}>
                  {row.status}
                </span>
              )}
            </motion.div>
          ))}
        </motion.div>
      ))}

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 8 }} animate={phase >= 5 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#38bdf8', letterSpacing: '0.08em', textShadow: '0 0 10px #38bdf830' }}>
          CRM · INVOICES · DEALS · PAYROLL
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#10b981', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          EVERYTHING IN ONE PLACE
        </div>
      </motion.div>
    </motion.div>
  );
}
