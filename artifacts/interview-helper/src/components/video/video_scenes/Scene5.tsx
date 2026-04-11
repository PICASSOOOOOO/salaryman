import { motion } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';

const WAVEFORM = Array.from({ length: 48 }, (_, i) => ({
  h: 12 + Math.sin(i * 0.4) * 15 + Math.random() * 12,
}));

const TOOLS = [
  { label: 'DARK ROOM', desc: 'AI IMAGE GEN', color: '#a855f7', icon: '◆' },
  { label: '1999', desc: 'MUSIC STUDIO', color: '#f59e0b', icon: '♪' },
  { label: 'HEMINGWAY', desc: 'AI COPYWRITER', color: '#10b981', icon: '¶' },
  { label: 'BRAND KIT', desc: 'IDENTITY', color: '#ec4899', icon: '◎' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  const imageGrid = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      color: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#38bdf8', '#84cc16'][i],
      pattern: Math.floor(Math.random() * 3),
    })), []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 1200),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 35% 30%, #1a0a2e 0%, #0a0e1a 50%, #040608 100%)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>

      <motion.div className="absolute top-[2.5%] left-[3%] z-20 flex items-center gap-[0.8vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#a855f7' }}>
          FORGE MATRIX
        </span>
      </motion.div>

      {phase >= 1 && (
        <motion.div className="absolute" style={{
          top: '9%', left: '3%', width: '52%', height: '38%',
          background: '#0c081a', border: '1px solid #a855f720', borderRadius: 6,
          boxShadow: '0 4px 30px rgba(168,85,247,0.05)', overflow: 'hidden',
        }}
          initial={{ opacity: 0, scale: 0.9, x: -10 }} animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'backOut' }}>
          <div className="absolute top-0 left-0 right-0 flex items-center px-2 gap-1" style={{
            height: 'clamp(10px, 1.4vw, 14px)', background: '#150d28', borderBottom: '1px solid #a855f715',
          }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 5px)', color: '#a855f760', letterSpacing: '0.12em' }}>
              DARK ROOM · RENDERING
            </span>
            <motion.span className="ml-auto" style={{ fontSize: 'clamp(3px, 0.4vw, 4px)', color: '#10b98160', fontFamily: '"Share Tech Mono", monospace' }}
              animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
              ● GENERATING
            </motion.span>
          </div>
          <div className="absolute" style={{ top: 'clamp(14px, 2vw, 18px)', left: '4%', right: '4%', bottom: '4%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(2px, 0.3vw, 3px)' }}>
            {imageGrid.map((img, i) => (
              <motion.div key={i} style={{
                background: img.pattern === 0
                  ? `linear-gradient(135deg, ${img.color}25 0%, ${img.color}08 100%)`
                  : img.pattern === 1
                  ? `radial-gradient(circle at 30% 30%, ${img.color}30 0%, ${img.color}05 70%)`
                  : `linear-gradient(45deg, ${img.color}20 25%, transparent 25%, transparent 75%, ${img.color}15 75%)`,
                border: `1px solid ${img.color}18`, borderRadius: 2,
              }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={phase >= 2 ? { opacity: [0.5, 0.9, 0.5], scale: 1 } : {}}
                transition={{ delay: i * 0.08, duration: 2 + Math.random() * 2, repeat: Infinity }} />
            ))}
          </div>
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div className="absolute" style={{
          top: '9%', right: '3%', width: '38%', height: '38%',
          background: '#0a0d15', border: '1px solid #f59e0b18', borderRadius: 6,
          boxShadow: '0 4px 30px rgba(245,158,11,0.03)', overflow: 'hidden',
        }}
          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
          <div className="absolute top-0 left-0 right-0 flex items-center px-2" style={{
            height: 'clamp(10px, 1.4vw, 14px)', background: '#1a150a', borderBottom: '1px solid #f59e0b15',
          }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 5px)', color: '#f59e0b60', letterSpacing: '0.12em' }}>
              1999 · BEAT MACHINE
            </span>
          </div>
          <div className="absolute flex items-end" style={{ top: 'clamp(16px, 2.2vw, 20px)', left: '6%', right: '6%', bottom: '18%', gap: 1 }}>
            {WAVEFORM.map((bar, i) => (
              <motion.div key={i} style={{
                flex: 1, background: `linear-gradient(180deg, #f59e0b ${100 - bar.h}%, #f59e0b15 100%)`,
                borderRadius: '1px 1px 0 0', minHeight: 1,
              }}
                initial={{ height: 0 }}
                animate={phase >= 2 ? { height: [`${bar.h * 0.3}%`, `${bar.h}%`, `${bar.h * 0.5}%`, `${bar.h * 0.8}%`] } : {}}
                transition={{ delay: i * 0.015, duration: 1.5, repeat: Infinity }} />
            ))}
          </div>
          <motion.div className="absolute flex items-center justify-center" style={{ bottom: '5%', left: '50%', transform: 'translateX(-50%)' }}
            animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1, repeat: Infinity }}>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.5vw, 5px)', color: '#f59e0b', letterSpacing: '0.15em' }}>
              ▶ PLAYING · 2:34
            </span>
          </motion.div>
        </motion.div>
      )}

      {phase >= 3 && (
        <div className="absolute flex" style={{ bottom: '14%', left: '3%', right: '3%', gap: 'clamp(3px, 0.5vw, 6px)' }}>
          {TOOLS.map((tool, i) => (
            <motion.div key={i} className="flex-1 flex flex-col items-center" style={{
              background: `${tool.color}06`, border: `1px solid ${tool.color}18`,
              borderRadius: 4, padding: 'clamp(4px, 0.6vw, 8px) clamp(2px, 0.3vw, 4px)',
              gap: 'clamp(2px, 0.25vw, 3px)',
            }}
              initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: 'backOut' }}>
              <span style={{ fontSize: 'clamp(8px, 1.2vw, 12px)', color: tool.color, opacity: 0.8 }}>{tool.icon}</span>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.55vw, 6px)', color: tool.color, letterSpacing: '0.1em', fontWeight: 600, textAlign: 'center' }}>
                {tool.label}
              </span>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)', color: '#64748b', textAlign: 'center' }}>
                {tool.desc}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 8 }} animate={phase >= 5 ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#a855f7', letterSpacing: '0.08em', textShadow: '0 0 10px #a855f730' }}>
          DESIGN · MUSIC · WRITE · BRAND
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#f59e0b', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          YOUR CREATIVE SUITE · ALL AI-POWERED
        </div>
      </motion.div>
    </motion.div>
  );
}
