import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const STATS = [
  { label: 'HP', value: 350, max: 350, color: '#ef4444' },
  { label: 'CASH', value: 12450, max: 99999, color: '#10b981' },
  { label: 'REP', value: 42, max: 100, color: '#f59e0b' },
  { label: 'LVL', value: 7, max: 99, color: '#38bdf8' },
];

const INVENTORY = [
  { name: 'OFFICE DEED', rarity: 'EPIC', color: '#f59e0b' },
  { name: 'BUSINESS LICENSE', rarity: 'RARE', color: '#a855f7' },
  { name: 'ENERGY DRINK x3', rarity: 'COMMON', color: '#10b981' },
  { name: 'GOLDEN BRIEFCASE', rarity: 'LEGENDARY', color: '#ef4444' },
];

const MAP_LOCATIONS = [
  { x: 20, y: 30, name: 'YOUR OFFICE', color: '#00ff88', active: true },
  { x: 55, y: 25, name: 'BANK', color: '#f59e0b', active: false },
  { x: 75, y: 50, name: 'CASINO', color: '#ef4444', active: false },
  { x: 35, y: 65, name: 'MARKET', color: '#38bdf8', active: false },
  { x: 60, y: 70, name: 'ARENA', color: '#a855f7', active: false },
];

const QUESTS = [
  { name: 'Close 3 deals this week', progress: 2, total: 3, xp: 500 },
  { name: 'Hire your first employee', progress: 0, total: 1, xp: 250 },
  { name: 'Reach $10K revenue', progress: 1, total: 1, xp: 1000 },
];

export function Scene7() {
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
      style={{ background: 'linear-gradient(180deg, #060a14 0%, #0a1020 50%, #080c18 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {phase >= 1 && (
        <motion.div
          style={{
            position: 'absolute', top: '2%', left: '3%', right: '3%',
            height: 'clamp(14px, 2.5vw, 22px)',
            display: 'flex', gap: 'clamp(3px, 0.5vw, 6px)', alignItems: 'center',
          }}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {STATS.map((stat, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)',
                  color: stat.color, letterSpacing: '0.1em',
                }}>
                  {stat.label}
                </span>
                <span style={{
                  fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)',
                  color: '#94a3b8',
                }}>
                  {stat.label === 'CASH' ? `$${stat.value.toLocaleString()}` : stat.value}
                </span>
              </div>
              <div style={{
                width: '100%', height: 'clamp(2px, 0.4vw, 4px)',
                background: '#1e293b', borderRadius: 1,
              }}>
                <motion.div
                  style={{
                    height: '100%', background: stat.color,
                    borderRadius: 1,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(stat.value / stat.max) * 100}%` }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                />
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div
          style={{
            position: 'absolute', top: '12%', left: '3%', width: '48%', height: '45%',
            background: '#0a0f1a',
            border: '1px solid #ffffff10',
            borderRadius: 3, overflow: 'hidden',
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            padding: 'clamp(2px, 0.4vw, 4px) clamp(4px, 0.6vw, 6px)',
            background: '#0f1420', borderBottom: '1px solid #ffffff08',
          }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
              color: '#64748b', letterSpacing: '0.15em',
            }}>
              MINX CITY · MAP
            </span>
          </div>

          <div style={{ position: 'relative', width: '100%', height: 'calc(100% - clamp(12px, 1.8vw, 16px))' }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, #0a1628 0%, #0d1a30 50%, #0a1420 100%)',
            }}>
              {[20, 40, 60, 80].map(x => (
                <div key={`v${x}`} style={{
                  position: 'absolute', left: `${x}%`, top: 0, bottom: 0,
                  width: 1, background: '#ffffff06',
                }} />
              ))}
              {[25, 50, 75].map(y => (
                <div key={`h${y}`} style={{
                  position: 'absolute', top: `${y}%`, left: 0, right: 0,
                  height: 1, background: '#ffffff06',
                }} />
              ))}
            </div>

            {MAP_LOCATIONS.map((loc, i) => (
              <motion.div
                key={i}
                style={{
                  position: 'absolute', left: `${loc.x}%`, top: `${loc.y}%`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.2, ease: 'backOut' }}
              >
                <motion.div
                  style={{
                    width: 'clamp(4px, 0.7vw, 6px)', height: 'clamp(4px, 0.7vw, 6px)',
                    background: loc.color, borderRadius: loc.active ? '50%' : 1,
                    boxShadow: loc.active ? `0 0 8px ${loc.color}80` : 'none',
                  }}
                  animate={loc.active ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: 'clamp(2px, 0.3vw, 3px)',
                  color: loc.color, marginTop: 1, opacity: 0.8,
                  letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>
                  {loc.name}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div
          style={{
            position: 'absolute', top: '12%', right: '3%', width: '44%', height: '25%',
            background: '#0a0f1a',
            border: '1px solid #ffffff10',
            borderRadius: 3,
          }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div style={{
            padding: 'clamp(2px, 0.4vw, 4px) clamp(4px, 0.6vw, 6px)',
            borderBottom: '1px solid #ffffff08',
          }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
              color: '#64748b', letterSpacing: '0.15em',
            }}>
              INVENTORY
            </span>
          </div>

          {INVENTORY.map((item, i) => (
            <motion.div
              key={i}
              style={{
                padding: 'clamp(2px, 0.3vw, 3px) clamp(4px, 0.6vw, 6px)',
                borderBottom: '1px solid #ffffff05',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : {}}
              transition={{ delay: i * 0.08, duration: 0.2 }}
            >
              <span style={{
                fontFamily: '"VT323", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)',
                color: '#e2e8f0',
              }}>
                {item.name}
              </span>
              <span style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)',
                color: item.color, letterSpacing: '0.1em',
              }}>
                {item.rarity}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {phase >= 3 && (
        <motion.div
          style={{
            position: 'absolute', top: '40%', right: '3%', width: '44%', height: '22%',
            background: '#0a0f1a',
            border: '1px solid #ffffff10',
            borderRadius: 3,
          }}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            padding: 'clamp(2px, 0.4vw, 4px) clamp(4px, 0.6vw, 6px)',
            borderBottom: '1px solid #ffffff08',
          }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
              color: '#f59e0b80', letterSpacing: '0.15em',
            }}>
              MISSIONS
            </span>
          </div>

          {QUESTS.map((quest, i) => (
            <div
              key={i}
              style={{
                padding: 'clamp(2px, 0.3vw, 3px) clamp(4px, 0.6vw, 6px)',
                borderBottom: '1px solid #ffffff05',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.4vw, 4px)',
                  color: '#e2e8f0',
                }}>
                  {quest.name}
                </span>
                <span style={{
                  fontFamily: '"VT323", monospace', fontSize: 'clamp(2px, 0.4vw, 4px)',
                  color: '#f59e0b',
                }}>
                  +{quest.xp}XP
                </span>
              </div>
              <div style={{
                width: '100%', height: 'clamp(1px, 0.2vw, 2px)',
                background: '#1e293b', borderRadius: 1, marginTop: 1,
              }}>
                <div style={{
                  width: `${(quest.progress / quest.total) * 100}%`,
                  height: '100%', background: quest.progress >= quest.total ? '#10b981' : '#f59e0b',
                  borderRadius: 1,
                }} />
              </div>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: '4%',
          fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)',
          color: '#f59e0b', letterSpacing: '0.06em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
      >
        PLAY THE GAME · EARN REAL MONEY
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: '1%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)',
          color: '#a855f7', letterSpacing: '0.15em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.5 } : {}}
      >
        MINX CITY MMO · YOUR BUSINESS IS THE GAME
      </motion.div>
    </motion.div>
  );
}
