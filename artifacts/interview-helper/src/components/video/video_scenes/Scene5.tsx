import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const INVENTORY = [
  { name: 'PLASMA RIFLE', rarity: 'RARE', color: '#a855f7' },
  { name: 'COMBAT ARMOR', rarity: 'EPIC', color: '#f59e0b' },
  { name: 'MED-KIT x3', rarity: 'COMMON', color: '#10b981' },
  { name: 'STEALTH CLOAK', rarity: 'LEGENDARY', color: '#ef4444' },
];

const STATS = [
  { label: 'HP', value: 350, max: 350, color: '#ef4444' },
  { label: 'ATK', value: 3, max: 20, color: '#f59e0b' },
  { label: 'DEF', value: 6, max: 20, color: '#3b82f6' },
  { label: 'LVL', value: 1, max: 50, color: '#10b981' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, #0a1628 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative z-10 w-[88%] h-[80%] flex gap-[2%]">
        <motion.div
          className="flex-1 flex flex-col"
          initial={{ opacity: 0, x: -15 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.4 }}
        >
          <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 8px)', letterSpacing: '0.25em', color: '#10b981', marginBottom: '3%' }}>
            CHARACTER HUD
          </div>

          <div
            className="rounded-sm p-[4%] flex-1"
            style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.12)' }}
          >
            <div className="flex items-center gap-[3%] mb-[6%]">
              <div
                style={{
                  width: 'clamp(16px, 3.5vw, 30px)',
                  height: 'clamp(16px, 3.5vw, 30px)',
                  background: 'linear-gradient(135deg, #38bdf830, #10b98120)',
                  border: '1px solid #38bdf830',
                  borderRadius: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.5vw, 14px)', color: '#38bdf8' }}>P</div>
              </div>
              <div>
                <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.8vw, 16px)', color: '#fff', letterSpacing: '0.08em', lineHeight: 1 }}>PLAYER_ONE</div>
                <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: '#38bdf8', letterSpacing: '0.15em', opacity: 0.7 }}>PABLO CORP · CORPORATE</div>
              </div>
            </div>

            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                className="flex items-center gap-[2%] mb-[4%]"
                initial={{ opacity: 0, x: -8 }}
                animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.08, duration: 0.2 }}
              >
                <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.65vw, 6px)', color: s.color, letterSpacing: '0.1em', width: '12%' }}>{s.label}</span>
                <div style={{ flex: 1, height: 'clamp(3px, 0.5vw, 5px)', background: '#1e293b', borderRadius: 1, overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', background: s.color, borderRadius: 1 }}
                    initial={{ width: 0 }}
                    animate={phase >= 2 ? { width: `${(s.value / s.max) * 100}%` } : {}}
                    transition={{ delay: i * 0.1, duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
                <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', color: '#fff', opacity: 0.7, width: '15%', textAlign: 'right' }}>{s.value}</span>
              </motion.div>
            ))}

            <motion.div
              className="mt-[4%] flex items-center gap-[2%]"
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : {}}
              transition={{ duration: 0.3 }}
            >
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)', color: '#f59e0b', letterSpacing: '0.1em' }}>SALARY</span>
              <span style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(6px, 1vw, 9px)', color: '#f59e0b' }}>ƒ100/MIN</span>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          className="flex-1 flex flex-col"
          initial={{ opacity: 0, x: 15 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 8px)', letterSpacing: '0.25em', color: '#a855f7', marginBottom: '3%' }}>
            INVENTORY
          </div>

          <div className="flex-1 flex flex-col gap-[3%]">
            {INVENTORY.map((item, i) => (
              <motion.div
                key={item.name}
                className="rounded-sm p-[3%] flex items-center justify-between"
                style={{
                  background: `${item.color}08`,
                  border: `1px solid ${item.color}20`,
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.25 }}
              >
                <div>
                  <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(6px, 1vw, 10px)', color: '#fff', letterSpacing: '0.06em', lineHeight: 1 }}>{item.name}</div>
                  <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)', color: item.color, letterSpacing: '0.15em', opacity: 0.8 }}>{item.rarity}</div>
                </div>
                <div style={{ width: 'clamp(4px, 0.7vw, 6px)', height: 'clamp(4px, 0.7vw, 6px)', background: item.color, borderRadius: 1, boxShadow: `0 0 6px ${item.color}60` }} />
              </motion.div>
            ))}
          </div>

          <motion.div
            className="mt-[4%] rounded-sm p-[3%] text-center"
            style={{ background: 'rgba(255,204,0,0.04)', border: '1px solid rgba(255,204,0,0.15)' }}
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : {}}
            transition={{ duration: 0.4 }}
          >
            <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)', color: '#ffcc00', letterSpacing: '0.2em', opacity: 0.7 }}>NET WORTH</div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.4vw, 14px)', color: '#ffcc00', letterSpacing: '0.08em' }}>ƒ0</div>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-[4%] left-0 right-0 text-center"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 0.5 } : {}}
        transition={{ duration: 0.4 }}
      >
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.8vw, 7px)', color: '#38bdf8', letterSpacing: '0.2em' }}>
          REAL-TIME MMO · BUILD · FIGHT · EARN
        </span>
      </motion.div>
    </motion.div>
  );
}
