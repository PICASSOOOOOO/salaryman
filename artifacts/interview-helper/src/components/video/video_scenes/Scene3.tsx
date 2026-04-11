import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BUILDINGS = [
  { x: 10, w: 14, h: 55, color: '#38bdf8', label: 'PABLO TOWER', windows: 8 },
  { x: 28, w: 10, h: 38, color: '#a855f7', label: '', windows: 5 },
  { x: 42, w: 12, h: 45, color: '#10b981', label: 'BANK', windows: 6 },
  { x: 58, w: 8, h: 30, color: '#f59e0b', label: '', windows: 4 },
  { x: 69, w: 11, h: 42, color: '#ef4444', label: 'CASINO', windows: 6 },
  { x: 83, w: 9, h: 35, color: '#3b82f6', label: '', windows: 5 },
];

const NPCS = [
  { x: 22, color: '#00ff88', size: 1 },
  { x: 38, color: '#ffcc00', size: 0.8 },
  { x: 55, color: '#ff4444', size: 0.9 },
  { x: 65, color: '#00ccff', size: 0.8 },
  { x: 78, color: '#ff88ff', size: 0.85 },
  { x: 48, color: '#88ff44', size: 0.9 },
];

const VEHICLES = [
  { x: 30, w: 5, color: '#f59e0b' },
  { x: 60, w: 4, color: '#ef4444' },
  { x: 80, w: 5, color: '#38bdf8' },
];

const LAMP_POSTS = [15, 35, 52, 72, 88];

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(180deg, #060a14 0%, #0a1628 40%, #0d1a2a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute top-[3%] left-[4%] z-20"
        style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)', letterSpacing: '0.25em', color: '#10b981' }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.7 } : {}}
        transition={{ duration: 0.3 }}
      >
        MINX CITY · LIVE
      </motion.div>

      <motion.div
        className="absolute top-[3%] right-[4%] z-20"
        style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', letterSpacing: '0.15em', color: '#f59e0b' }}
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 0.5 } : {}}
        transition={{ duration: 0.3 }}
      >
        POPULATION: 1,247
      </motion.div>

      {phase >= 1 && (
        <div className="absolute bottom-0 left-0 right-0" style={{ height: '25%', background: '#111827' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#1e293b' }} />
          <div style={{ position: 'absolute', top: '40%', left: '5%', right: '5%', height: 1, background: '#f59e0b30', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: '60%', left: '5%', right: '5%', height: 1, background: '#f59e0b30', borderRadius: 1 }} />

          {[20, 40, 60, 80].map((x, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${x}%`, top: '20%', width: '8%', height: '60%',
              display: 'flex', gap: 2,
            }}>
              {[0,1,2].map(j => (
                <div key={j} style={{ flex: 1, height: '100%', borderTop: '2px solid #ffffff15', borderBottom: '2px solid #ffffff15' }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {BUILDINGS.map((b, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: `${b.x}%`, bottom: '25%',
            width: `${b.w}%`, height: `${b.h}%`,
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={phase >= 1 ? { opacity: 1, scaleY: 1 } : {}}
          transition={{ delay: i * 0.08, duration: 0.4, ease: 'backOut' }}
          style-origin="bottom"
        >
          <div
            className="w-full h-full relative"
            style={{
              background: `linear-gradient(180deg, ${b.color}25 0%, ${b.color}10 100%)`,
              border: `1px solid ${b.color}40`,
              borderBottom: 'none',
              transformOrigin: 'bottom',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `${b.color}60`,
            }} />

            {[...Array(b.windows)].map((_, wi) => (
              <motion.div
                key={wi}
                style={{
                  position: 'absolute',
                  left: '18%', right: '18%',
                  top: `${8 + wi * (85 / b.windows)}%`,
                  height: `${Math.min(6, 60 / b.windows)}%`,
                  background: `${b.color}${Math.random() > 0.3 ? '50' : '20'}`,
                  borderRadius: 1,
                }}
                animate={phase >= 2 ? { opacity: [0.3, 0.8, 0.3] } : {}}
                transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, delay: wi * 0.2 }}
              />
            ))}

            {b.label && (
              <div style={{
                position: 'absolute', bottom: '8%', left: 0, right: 0, textAlign: 'center',
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: 'clamp(3px, 0.5vw, 5px)',
                color: b.color, letterSpacing: '0.08em', opacity: 0.9,
              }}>
                {b.label}
              </div>
            )}
          </div>

          <div style={{
            position: 'absolute', top: -4, left: '40%', right: '40%', height: 4,
            background: b.color, opacity: 0.4, borderRadius: '2px 2px 0 0',
          }} />
        </motion.div>
      ))}

      {phase >= 2 && LAMP_POSTS.map((x, i) => (
        <motion.div
          key={`lamp-${i}`}
          style={{
            position: 'absolute', left: `${x}%`, bottom: '25%',
            width: 2, height: '8%',
            background: 'linear-gradient(180deg, #f59e0b 0%, #1e293b 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
        >
          <motion.div style={{
            position: 'absolute', top: -3, left: -4, width: 10, height: 6,
            background: 'radial-gradient(ellipse, #f59e0b40 0%, transparent 70%)',
            borderRadius: '50%',
          }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        </motion.div>
      ))}

      {phase >= 3 && NPCS.map((npc, i) => (
        <motion.div
          key={`npc-${i}`}
          style={{ position: 'absolute', left: `${npc.x}%`, bottom: '28%' }}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.2 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: `clamp(3px, ${0.6 * npc.size}vw, 5px)`,
              height: `clamp(3px, ${0.6 * npc.size}vw, 5px)`,
              background: npc.color, borderRadius: '50%',
            }} />
            <div style={{
              width: `clamp(2px, ${0.4 * npc.size}vw, 4px)`,
              height: `clamp(5px, ${1 * npc.size}vw, 8px)`,
              background: npc.color, borderRadius: 1, marginTop: 1,
              opacity: 0.7,
            }} />
          </div>
        </motion.div>
      ))}

      {phase >= 3 && VEHICLES.map((v, i) => (
        <motion.div
          key={`car-${i}`}
          style={{
            position: 'absolute', left: `${v.x}%`, bottom: '21%',
            width: `${v.w}%`, height: 'clamp(3px, 0.6vw, 5px)',
            background: v.color, borderRadius: 2, opacity: 0.6,
          }}
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 0.6 }}
          transition={{ delay: 0.5 + i * 0.2, duration: 0.4 }}
        >
          <div style={{
            position: 'absolute', right: 0, top: '20%', width: '15%', height: '60%',
            background: '#ff000080', borderRadius: 1,
          }} />
          <div style={{
            position: 'absolute', left: 0, top: '20%', width: '15%', height: '60%',
            background: '#ffff0060', borderRadius: 1,
          }} />
        </motion.div>
      ))}

      {phase >= 4 && (
        <motion.div
          style={{
            position: 'absolute', left: '46%', bottom: '30%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
        >
          <div style={{
            width: 'clamp(4px, 0.8vw, 7px)',
            height: 'clamp(4px, 0.8vw, 7px)',
            background: '#00ff88', borderRadius: '50%',
            boxShadow: '0 0 8px #00ff8880',
          }} />
          <div style={{
            width: 'clamp(3px, 0.5vw, 5px)',
            height: 'clamp(7px, 1.4vw, 12px)',
            background: '#00ff88', borderRadius: 1, marginTop: 1,
          }} />
          <motion.div style={{
            position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: 'clamp(3px, 0.5vw, 5px)',
            color: '#00ff88', letterSpacing: '0.1em', whiteSpace: 'nowrap',
          }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            YOU
          </motion.div>
        </motion.div>
      )}

      <motion.div
        className="absolute bottom-[4%] left-[4%] z-20"
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
        transition={{ duration: 0.4 }}
      >
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)', color: '#00ff88', letterSpacing: '0.06em' }}>
          EXPLORE · BUILD · EARN
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)', color: '#38bdf8', letterSpacing: '0.15em', opacity: 0.5, marginTop: 2 }}>
          OPEN WORLD MMO · OWN YOUR BUSINESS
        </div>
      </motion.div>
    </motion.div>
  );
}
