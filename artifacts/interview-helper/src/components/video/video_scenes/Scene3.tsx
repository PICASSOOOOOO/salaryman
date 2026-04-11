import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BUILDINGS = [
  { x: 5, w: 16, h: 62, color: '#38bdf8', label: 'PABLO TOWER', windows: 10, antenna: true },
  { x: 24, w: 11, h: 42, color: '#a855f7', label: '', windows: 7 },
  { x: 38, w: 14, h: 52, color: '#10b981', label: 'BANK', windows: 8 },
  { x: 55, w: 9, h: 34, color: '#f59e0b', label: '', windows: 5 },
  { x: 67, w: 13, h: 48, color: '#ef4444', label: 'CASINO', windows: 8 },
  { x: 83, w: 10, h: 38, color: '#3b82f6', label: '', windows: 6 },
  { x: 95, w: 8, h: 28, color: '#ec4899', label: '', windows: 4 },
];

const STARS = Array.from({ length: 30 }, () => ({
  x: Math.random() * 100, y: Math.random() * 35,
  size: 0.5 + Math.random() * 1.5, delay: Math.random() * 3,
}));

const NPCS = [
  { x: 18, color: '#00ff88' }, { x: 35, color: '#ffcc00' }, { x: 52, color: '#ff4444' },
  { x: 63, color: '#00ccff' }, { x: 78, color: '#ff88ff' }, { x: 45, color: '#88ff44' },
  { x: 28, color: '#44aaff' }, { x: 72, color: '#ffaa44' },
];

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #020510 0%, #060d1f 30%, #0a1628 60%, #0d1a2a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      {STARS.map((s, i) => (
        <motion.div key={i} className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 2 + s.delay, repeat: Infinity, ease: 'easeInOut' }} />
      ))}

      <motion.div className="absolute top-[3%] left-[3%] z-30 flex items-center gap-[0.6vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <motion.div className="w-[clamp(4px,0.6vw,6px)] h-[clamp(4px,0.6vw,6px)] rounded-full bg-emerald-400"
          animate={{ opacity: [0.5, 1, 0.5], boxShadow: ['0 0 0px #10b981', '0 0 8px #10b981', '0 0 0px #10b981'] }}
          transition={{ duration: 1.5, repeat: Infinity }} />
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#10b981' }}>
          MINX CITY
        </span>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', letterSpacing: '0.15em', color: '#10b98160' }}>
          LIVE
        </span>
      </motion.div>

      <motion.div className="absolute top-[3%] right-[3%] z-30"
        initial={{ opacity: 0 }} animate={phase >= 2 ? { opacity: 0.6 } : {}} transition={{ duration: 0.3 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 8px)', letterSpacing: '0.15em', color: '#f59e0b' }}>
          POP: 1,247
        </span>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0" style={{ height: '22%' }}>
        <div className="absolute inset-0" style={{ background: '#0a1018' }} />
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, #1e293b, #334155, #1e293b)' }} />
        <motion.div className="absolute h-[1px]" style={{ top: '40%', left: '3%', right: '3%', background: '#f59e0b25' }}
          initial={{ scaleX: 0 }} animate={phase >= 1 ? { scaleX: 1 } : {}} transition={{ duration: 0.6 }} />
        <motion.div className="absolute h-[1px]" style={{ top: '60%', left: '3%', right: '3%', background: '#f59e0b18' }}
          initial={{ scaleX: 0 }} animate={phase >= 1 ? { scaleX: 1 } : {}} transition={{ duration: 0.6, delay: 0.1 }} />
      </div>

      {BUILDINGS.map((b, i) => (
        <motion.div key={i} className="absolute"
          style={{ left: `${b.x}%`, bottom: '22%', width: `${b.w}%`, height: `${b.h}%`, transformOrigin: 'bottom' }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={phase >= 1 ? { opacity: 1, scaleY: 1 } : {}}
          transition={{ delay: i * 0.06, duration: 0.5, ease: [0.175, 0.885, 0.32, 1.05] }}>
          <div className="w-full h-full relative" style={{
            background: `linear-gradient(180deg, ${b.color}20 0%, ${b.color}08 100%)`,
            border: `1px solid ${b.color}30`, borderBottom: 'none',
          }}>
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${b.color}40, ${b.color}80, ${b.color}40)` }} />
            {[...Array(b.windows)].map((_, wi) => (
              <motion.div key={wi} className="absolute"
                style={{
                  left: '15%', right: '15%', top: `${6 + wi * (88 / b.windows)}%`,
                  height: `${Math.min(5, 50 / b.windows)}%`,
                  background: b.color, borderRadius: 1,
                }}
                animate={{ opacity: [0.15, 0.6, 0.15] }}
                transition={{ duration: 1.5 + Math.random() * 3, repeat: Infinity, delay: wi * 0.15 + i * 0.1 }} />
            ))}
            {b.label && (
              <div className="absolute bottom-[6%] left-0 right-0 text-center" style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.55vw, 6px)',
                color: b.color, letterSpacing: '0.1em', opacity: 0.9,
              }}>{b.label}</div>
            )}
            {b.antenna && (
              <div className="absolute" style={{ top: -8, left: '48%', width: 2, height: 8, background: b.color, opacity: 0.5 }}>
                <motion.div className="absolute -top-1 -left-1 w-1 h-1 rounded-full" style={{ background: '#ef4444' }}
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {phase >= 3 && NPCS.map((npc, i) => (
        <motion.div key={i} className="absolute" style={{ left: `${npc.x}%`, bottom: '24%' }}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.2 }}>
          <div className="flex flex-col items-center">
            <div style={{ width: 'clamp(3px, 0.6vw, 5px)', height: 'clamp(3px, 0.6vw, 5px)', background: npc.color, borderRadius: '50%', boxShadow: `0 0 4px ${npc.color}60` }} />
            <div style={{ width: 'clamp(2px, 0.4vw, 3px)', height: 'clamp(5px, 1vw, 8px)', background: npc.color, borderRadius: 1, marginTop: 1, opacity: 0.7 }} />
          </div>
        </motion.div>
      ))}

      {phase >= 4 && (
        <motion.div className="absolute" style={{ left: '44%', bottom: '26%' }}
          initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'backOut' }}>
          <div className="flex flex-col items-center">
            <motion.div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: '#00ff88', letterSpacing: '0.1em', marginBottom: 2 }}
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>YOU</motion.div>
            <div style={{ width: 'clamp(5px, 0.8vw, 7px)', height: 'clamp(5px, 0.8vw, 7px)', background: '#00ff88', borderRadius: '50%', boxShadow: '0 0 12px #00ff8880' }} />
            <div style={{ width: 'clamp(3px, 0.5vw, 5px)', height: 'clamp(8px, 1.4vw, 12px)', background: '#00ff88', borderRadius: 1, marginTop: 1 }} />
          </div>
        </motion.div>
      )}

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 10 }} animate={phase >= 5 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#00ff88', letterSpacing: '0.08em', textShadow: '0 0 10px #00ff8830' }}>
          EXPLORE · BUILD · EARN
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#38bdf8', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          OPEN WORLD MMO · OWN YOUR BUSINESS
        </div>
      </motion.div>
    </motion.div>
  );
}
