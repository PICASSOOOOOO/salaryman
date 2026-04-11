import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BUILDINGS: { x: number; y: number; w: number; h: number; color: string; label?: string }[] = [
  { x: 18, y: 22, w: 12, h: 28, color: '#38bdf8', label: 'PABLO TOWER' },
  { x: 35, y: 30, w: 8, h: 18, color: '#22c55e' },
  { x: 48, y: 26, w: 10, h: 22, color: '#a855f7' },
  { x: 63, y: 32, w: 7, h: 14, color: '#f59e0b' },
  { x: 75, y: 28, w: 9, h: 20, color: '#3b82f6' },
  { x: 22, y: 55, w: 6, h: 12, color: '#0ea5e9' },
  { x: 38, y: 52, w: 11, h: 16, color: '#ef4444', label: 'CASINO' },
  { x: 55, y: 58, w: 8, h: 10, color: '#10b981' },
  { x: 70, y: 54, w: 7, h: 15, color: '#f97316' },
  { x: 30, y: 72, w: 9, h: 11, color: '#6366f1' },
  { x: 50, y: 68, w: 10, h: 13, color: '#14b8a6', label: 'BANK' },
  { x: 65, y: 74, w: 6, h: 9, color: '#8b5cf6' },
];

const NPCS = [
  { x: 32, y: 48, color: '#ffcc00', label: 'GUARD' },
  { x: 60, y: 50, color: '#ff4444', label: 'THREAT' },
  { x: 45, y: 70, color: '#00ccff', label: 'SPY' },
  { x: 78, y: 45, color: '#5599ff', label: 'COP' },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);
  const [scanX, setScanX] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setScanX(p => (p + 1) % 100), 30);
    return () => clearInterval(iv);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: '#06080d' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute top-[3%] left-[4%] z-20"
        style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)', letterSpacing: '0.25em', color: '#10b981', opacity: 0.7 }}
        initial={{ opacity: 0, x: -10 }}
        animate={phase >= 1 ? { opacity: 0.7, x: 0 } : {}}
        transition={{ duration: 0.3 }}
      >
        LIVE GAMEPLAY
      </motion.div>

      <motion.div
        className="absolute inset-0 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 40% 40%, #0d1a2a 0%, #06080d 60%)' }}>
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {[...Array(11)].map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="#38bdf8" strokeOpacity="0.06" strokeWidth="0.15" />
            ))}
            {[...Array(11)].map((_, i) => (
              <line key={`v${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#38bdf8" strokeOpacity="0.06" strokeWidth="0.15" />
            ))}

            {[...Array(6)].map((_, i) => (
              <line key={`rd${i}`} x1={15 + i * 15} y1="0" x2={15 + i * 15} y2="100" stroke="#1a2a3a" strokeWidth="0.6" strokeOpacity="0.5" />
            ))}
            {[...Array(4)].map((_, i) => (
              <line key={`rh${i}`} x1="0" y1={20 + i * 20} x2="100" y2={20 + i * 20} stroke="#1a2a3a" strokeWidth="0.6" strokeOpacity="0.5" />
            ))}
          </svg>

          {BUILDINGS.map((b, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: `${b.x}%`, top: `${b.y - b.h}%`,
                width: `${b.w}%`, height: `${b.h}%`,
              }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={phase >= 2 ? { opacity: 1, scaleY: 1 } : {}}
              transition={{ delay: i * 0.06, duration: 0.3, ease: 'backOut' }}
            >
              <div
                className="w-full h-full relative"
                style={{
                  background: `linear-gradient(180deg, ${b.color}30 0%, ${b.color}10 100%)`,
                  border: `1px solid ${b.color}40`,
                  borderRadius: 2,
                  boxShadow: `0 0 ${b.h / 2}px ${b.color}15`,
                }}
              >
                {[...Array(Math.max(2, Math.floor(b.h / 5)))].map((_, wi) => (
                  <div
                    key={wi}
                    className="absolute"
                    style={{
                      left: '15%', right: '15%',
                      top: `${15 + wi * (70 / Math.max(2, Math.floor(b.h / 5)))}%`,
                      height: '8%',
                      background: `${b.color}50`,
                      borderRadius: 1,
                    }}
                  />
                ))}
                {b.label && (
                  <div
                    className="absolute w-full text-center"
                    style={{
                      bottom: '-16%',
                      fontFamily: '"Share Tech Mono", monospace',
                      fontSize: 'clamp(3px, 0.6vw, 5px)',
                      color: b.color,
                      letterSpacing: '0.1em',
                      opacity: 0.8,
                    }}
                  >
                    {b.label}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {phase >= 3 && NPCS.map((npc, i) => (
            <motion.div
              key={`npc-${i}`}
              className="absolute"
              style={{ left: `${npc.x}%`, top: `${npc.y}%` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.2 }}
            >
              <motion.div
                style={{
                  width: 'clamp(3px, 0.6vw, 5px)',
                  height: 'clamp(3px, 0.6vw, 5px)',
                  background: npc.color,
                  borderRadius: '50%',
                  boxShadow: `0 0 6px ${npc.color}80`,
                }}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
              />
            </motion.div>
          ))}

          <motion.div
            className="absolute"
            style={{
              left: '44%', top: '42%',
              width: 'clamp(5px, 1vw, 8px)',
              height: 'clamp(5px, 1vw, 8px)',
              background: '#00ff88',
              borderRadius: '1px',
              boxShadow: '0 0 10px #00ff8880, 0 0 20px #00ff8840',
              border: '1px solid #00ff88',
            }}
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : {}}
            transition={{ duration: 0.3 }}
          />
          {phase >= 3 && (
            <motion.div
              className="absolute"
              style={{
                left: '44%', top: '42%',
                width: 'clamp(12px, 2.5vw, 20px)',
                height: 'clamp(12px, 2.5vw, 20px)',
                border: '1px solid #00ff8850',
                borderRadius: '50%',
                marginLeft: 'clamp(-3.5px, -0.75vw, -6px)',
                marginTop: 'clamp(-3.5px, -0.75vw, -6px)',
              }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
      </motion.div>

      <motion.div
        className="absolute left-0 right-0 h-[1px] pointer-events-none z-30"
        style={{
          top: `${scanX}%`,
          background: 'linear-gradient(90deg, transparent 0%, #38bdf830 30%, #38bdf850 50%, #38bdf830 70%, transparent 100%)',
        }}
      />

      <motion.div
        className="absolute bottom-[4%] left-[4%] z-20 flex items-center gap-[1vw]"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4 }}
      >
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.4vw, 12px)', color: '#00ff88', letterSpacing: '0.08em' }}>
          ■ OPERATIVE ACTIVE
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', color: '#38bdf8', opacity: 0.5, letterSpacing: '0.15em' }}>
          CORPORATE DISTRICT
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-[4%] right-[4%] z-20"
        style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', color: '#f59e0b', opacity: 0.6, letterSpacing: '0.1em' }}
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 0.6 } : {}}
        transition={{ duration: 0.4 }}
      >
        ƒ12,450 FIAT
      </motion.div>

      <motion.div
        className="absolute top-[3%] right-[4%] z-20 flex flex-col items-end gap-[0.3vw]"
        initial={{ opacity: 0, x: 10 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-[0.5vw]">
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.65vw, 6px)', color: '#ef4444', letterSpacing: '0.1em' }}>HP</span>
          <div style={{ width: 'clamp(30px, 6vw, 50px)', height: 'clamp(3px, 0.5vw, 4px)', background: '#1e293b', borderRadius: 1, overflow: 'hidden' }}>
            <motion.div style={{ width: '78%', height: '100%', background: '#ef4444', borderRadius: 1 }} animate={{ opacity: [1, 0.7, 1] }} transition={{ duration: 2, repeat: Infinity }} />
          </div>
        </div>
        <div className="flex items-center gap-[0.5vw]">
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.65vw, 6px)', color: '#f59e0b', letterSpacing: '0.1em' }}>HNG</span>
          <div style={{ width: 'clamp(30px, 6vw, 50px)', height: 'clamp(3px, 0.5vw, 4px)', background: '#1e293b', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%', background: '#f59e0b', borderRadius: 1 }} />
          </div>
        </div>
        <div className="flex items-center gap-[0.5vw]">
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.65vw, 6px)', color: '#3b82f6', letterSpacing: '0.1em' }}>THR</span>
          <div style={{ width: 'clamp(30px, 6vw, 50px)', height: 'clamp(3px, 0.5vw, 4px)', background: '#1e293b', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ width: '85%', height: '100%', background: '#3b82f6', borderRadius: 1 }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
