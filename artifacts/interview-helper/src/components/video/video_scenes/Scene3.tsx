import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const FEATURES = [
  { title: '7 AI AGENTS', sub: 'MULTI-AGENT WORKFORCE', color: '#10b981', icon: '◆' },
  { title: '8 CHANNELS', sub: 'OMNICHANNEL DEPLOYMENT', color: '#3b82f6', icon: '◈' },
  { title: 'DARK ROOM', sub: 'CREATIVE STUDIO', color: '#a855f7', icon: '◉' },
  { title: 'PHONE SYSTEM', sub: 'AUTONOMOUS CALL AGENTS', color: '#f59e0b', icon: '◎' },
  { title: 'CRM & PIPELINE', sub: 'DEALS · CONTACTS · LEADS', color: '#ef4444', icon: '◐' },
  { title: 'BOT FACTORY', sub: 'CUSTOM AI BOTS', color: '#38bdf8', icon: '◑' },
  { title: '24 CITIES', sub: 'WORLDWIDE NETWORK', color: '#10b981', icon: '◒' },
];

export function Scene3() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setIdx(p => (p < FEATURES.length - 1 ? p + 1 : p));
    }, 1050);
    return () => clearInterval(iv);
  }, []);

  const f = FEATURES[idx];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, #0c1220 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${f.color}08 0%, transparent 60%)`,
        }}
        key={idx}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-[8%]">
        <motion.div
          className="mb-2"
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)', letterSpacing: '0.25em', color: f.color, opacity: 0.7 }}
          key={`label-${idx}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.7, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          SYS.MODULE {idx + 1}/{FEATURES.length}
        </motion.div>

        <motion.div
          className="mb-1"
          key={`icon-${idx}`}
          style={{ fontSize: 'clamp(12px, 2.5vw, 22px)', color: f.color }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
        >
          {f.icon}
        </motion.div>

        <motion.h2
          key={`title-${idx}`}
          style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(22px, 6vw, 48px)', lineHeight: 1, color: '#fff' }}
          className="font-bold uppercase tracking-tight"
          initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {f.title}
        </motion.h2>

        <motion.p
          key={`sub-${idx}`}
          style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.3vw, 12px)', letterSpacing: '0.2em', color: f.color }}
          className="mt-1 uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {f.sub}
        </motion.p>
      </div>

      <div className="absolute bottom-[10%] left-[10%] right-[10%] h-[2px] bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: f.color }}
          animate={{ width: `${((idx + 1) / FEATURES.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="absolute bottom-[6%] left-0 right-0 flex justify-center gap-[1%]">
        {FEATURES.map((_, i) => (
          <div
            key={i}
            style={{
              width: 'clamp(3px, 0.5vw, 5px)',
              height: 'clamp(3px, 0.5vw, 5px)',
              borderRadius: '50%',
              background: i === idx ? f.color : '#1e293b',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
