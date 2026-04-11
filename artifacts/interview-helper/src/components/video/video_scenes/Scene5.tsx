import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const WAVEFORM = Array.from({ length: 40 }, (_, i) => ({
  h: 15 + Math.sin(i * 0.5) * 12 + Math.random() * 8,
}));

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

const TOOLS = [
  { label: 'DARK ROOM', desc: 'AI image generation', color: '#a855f7', icon: '◆' },
  { label: '1999', desc: 'Music production', color: '#f59e0b', icon: '♪' },
  { label: 'HEMINGWAY', desc: 'AI copywriting', color: '#10b981', icon: '¶' },
  { label: 'BRAND KIT', desc: 'Identity & logos', color: '#ec4899', icon: '◎' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(ellipse at 40% 30%, #1a0a2e 0%, #0a0e1a 50%, #06080d 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        style={{
          position: 'absolute', top: '3%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)',
          letterSpacing: '0.25em', color: '#a855f7',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.7 } : {}}
      >
        CREATIVE STUDIO
      </motion.div>

      {phase >= 1 && (
        <motion.div
          style={{
            position: 'absolute', top: '10%', left: '5%', width: '55%', height: '35%',
            background: '#0f0a1a',
            border: '1px solid #a855f730',
            borderRadius: 4, overflow: 'hidden',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(8px, 1.2vw, 10px)',
            background: '#1a0f2e', borderBottom: '1px solid #a855f720',
            display: 'flex', alignItems: 'center', paddingLeft: 6,
          }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#a855f780', letterSpacing: '0.1em' }}>
              DARK ROOM · RENDERING
            </span>
          </div>

          <div style={{
            position: 'absolute', top: 'clamp(12px, 2vw, 16px)', left: '5%', right: '5%', bottom: '5%',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(2px, 0.4vw, 4px)',
          }}>
            {PALETTE.map((c, i) => (
              <motion.div
                key={i}
                style={{
                  background: `linear-gradient(135deg, ${c}30 0%, ${c}10 100%)`,
                  border: `1px solid ${c}25`,
                  borderRadius: 2,
                }}
                initial={{ opacity: 0 }}
                animate={phase >= 2 ? { opacity: [0.4, 0.8, 0.4] } : {}}
                transition={{ delay: i * 0.15, duration: 2.5, repeat: Infinity }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div
          style={{
            position: 'absolute', top: '10%', right: '5%', width: '32%', height: '35%',
            background: '#0a0f1a',
            border: '1px solid #f59e0b25',
            borderRadius: 4, overflow: 'hidden',
          }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 'clamp(8px, 1.2vw, 10px)',
            background: '#1a150a', borderBottom: '1px solid #f59e0b20',
            display: 'flex', alignItems: 'center', paddingLeft: 6,
          }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#f59e0b80', letterSpacing: '0.1em' }}>
              1999 · BEAT MACHINE
            </span>
          </div>

          <div style={{
            position: 'absolute', top: 'clamp(14px, 2.2vw, 18px)', left: '8%', right: '8%', bottom: '15%',
            display: 'flex', alignItems: 'flex-end', gap: 1,
          }}>
            {WAVEFORM.map((bar, i) => (
              <motion.div
                key={i}
                style={{
                  flex: 1,
                  background: `linear-gradient(180deg, #f59e0b ${100 - bar.h}%, #f59e0b20 100%)`,
                  borderRadius: '1px 1px 0 0',
                  minHeight: 1,
                }}
                initial={{ height: 0 }}
                animate={phase >= 2 ? { height: `${bar.h}%` } : {}}
                transition={{ delay: i * 0.02, duration: 0.3 }}
              />
            ))}
          </div>

          <motion.div
            style={{
              position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)',
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
              color: '#f59e0b60',
            }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            ▶ PLAYING
          </motion.div>
        </motion.div>
      )}

      {phase >= 3 && (
        <div style={{
          position: 'absolute', bottom: '12%', left: '5%', right: '5%',
          display: 'flex', gap: 'clamp(3px, 0.6vw, 6px)',
        }}>
          {TOOLS.map((tool, i) => (
            <motion.div
              key={i}
              style={{
                flex: 1,
                background: `${tool.color}08`,
                border: `1px solid ${tool.color}25`,
                borderRadius: 3,
                padding: 'clamp(3px, 0.5vw, 5px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 'clamp(1px, 0.2vw, 2px)',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3, ease: 'backOut' }}
            >
              <div style={{ fontSize: 'clamp(6px, 1vw, 10px)', color: tool.color, opacity: 0.8 }}>
                {tool.icon}
              </div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)',
                color: tool.color, letterSpacing: '0.08em', textAlign: 'center',
              }}>
                {tool.label}
              </div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)',
                color: '#64748b', textAlign: 'center',
              }}>
                {tool.desc}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: '4%',
          fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)',
          color: '#a855f7', letterSpacing: '0.06em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
      >
        DESIGN · MUSIC · WRITE · BRAND
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: '1%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)',
          color: '#f59e0b', letterSpacing: '0.15em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.5 } : {}}
      >
        YOUR CREATIVE SUITE · ALL AI-POWERED
      </motion.div>
    </motion.div>
  );
}
