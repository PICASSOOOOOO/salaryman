import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useArtKit } from '@/lib/video/useArtKit';

const TRANSCRIPT = '> PABLO, BUY ME FLOOR 14.';
const RESPONSE_PARTS = [
  { t: 'ACQUIRING MINX TOWER · FLR 14', delay: 0 },
  { t: 'ESCROW $48,200 → CLEARED', delay: 600 },
  { t: 'TITLE TRANSFERRED · DEED #07A2', delay: 1200 },
  { t: 'DONE.', delay: 1800 },
];

const WAVE_BARS = Array.from({ length: 22 });

export function Scene5() {
  const art = useArtKit(['scene_pablo_terminal', 'cutscene_pablo']);
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 4500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(TRANSCRIPT.slice(0, i));
      if (i >= TRANSCRIPT.length) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 45%, #14041a 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45 }}
    >
      {/* Procedural terminal-room fallback — purple gradient + center glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 45%, rgba(167,139,250,0.18) 0%, transparent 60%), repeating-linear-gradient(0deg, rgba(167,139,250,0.04) 0 1px, transparent 1px 80px)',
        }}
      />
      {/* Terminal room plate */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1.0, opacity: art.scene_pablo_terminal ? 0.6 : 0 }}
        transition={{ duration: 5.5, ease: 'easeOut' }}
        style={{
          backgroundImage: art.scene_pablo_terminal ? `url(${art.scene_pablo_terminal})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          filter: 'saturate(0.95) contrast(1.1) hue-rotate(-10deg)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 20%, rgba(6,8,13,0.92) 80%)',
        }}
      />

      {/* HUD */}
      <motion.div
        className="absolute top-[3%] left-[3%] flex items-center gap-[0.7vw] z-30"
        initial={{ opacity: 0, x: -10 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          style={{
            width: 'clamp(5px, 0.6vw, 7px)',
            height: 'clamp(5px, 0.6vw, 7px)',
            borderRadius: '50%',
            background: '#a78bfa',
          }}
          animate={{ boxShadow: ['0 0 0px #a78bfa', '0 0 10px #a78bfa', '0 0 0px #a78bfa'] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(7px, 1vw, 11px)',
            letterSpacing: '0.3em',
            color: '#a78bfa',
          }}
        >
          SUMMON · PABLO
        </span>
      </motion.div>

      {/* Pablo orb — glowing core */}
      <div className="absolute inset-0 flex items-center justify-center z-20" style={{ paddingBottom: '8%' }}>
        <div className="relative" style={{ width: 'clamp(120px, 28vw, 260px)', aspectRatio: '1/1' }}>
          {/* Aura */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0.15) 40%, transparent 70%)',
              filter: 'blur(6px)',
            }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Pablo */}
          {art.cutscene_pablo && (
            <motion.img
              src={art.cutscene_pablo}
              alt=""
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 26px rgba(167,139,250,0.65)) drop-shadow(0 0 60px rgba(244,114,182,0.25))',
                imageRendering: 'pixelated',
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.9, ease: 'backOut' }}
            />
          )}

          {/* Orbiting ring */}
          <motion.div
            className="absolute inset-[-8%] rounded-full pointer-events-none"
            style={{ border: '1px dashed rgba(167,139,250,0.45)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </div>

      {/* Voice waveform */}
      {phase >= 1 && (
        <div
          className="absolute z-30"
          style={{
            top: '24%',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 'clamp(2px, 0.3vw, 4px)',
            alignItems: 'center',
            height: 'clamp(20px, 3vw, 30px)',
          }}
        >
          {WAVE_BARS.map((_, i) => (
            <motion.div
              key={i}
              style={{
                width: 'clamp(2px, 0.4vw, 4px)',
                background: '#a78bfa',
                borderRadius: 1,
                boxShadow: '0 0 6px rgba(167,139,250,0.5)',
              }}
              animate={{
                height: [
                  `${20 + ((i * 13) % 50)}%`,
                  `${50 + ((i * 7) % 50)}%`,
                  `${20 + ((i * 17) % 50)}%`,
                ],
              }}
              transition={{
                duration: 0.7 + (i % 5) * 0.1,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}

      {/* Transcript line — typing */}
      {phase >= 2 && (
        <div
          className="absolute z-30"
          style={{
            bottom: '32%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(10px, 1.8vw, 16px)',
            color: '#22d3ee',
            letterSpacing: '0.05em',
            textShadow: '0 0 8px rgba(34,211,238,0.4)',
          }}
        >
          {typed}
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ marginLeft: 2 }}
          >
            ▌
          </motion.span>
        </div>
      )}

      {/* Pablo response — streams in lines */}
      {phase >= 3 && (
        <div
          className="absolute z-30"
          style={{
            bottom: '14%',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(2px, 0.4vw, 4px)',
            alignItems: 'center',
            width: '88%',
            maxWidth: 480,
          }}
        >
          {RESPONSE_PARTS.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: p.delay / 1000, duration: 0.35 }}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(6px, 0.9vw, 10px)',
                color: i === RESPONSE_PARTS.length - 1 ? '#10b981' : '#f472b6',
                letterSpacing: '0.2em',
                textShadow: i === RESPONSE_PARTS.length - 1 ? '0 0 8px rgba(16,185,129,0.5)' : 'none',
              }}
            >
              {p.t}
            </motion.div>
          ))}
        </div>
      )}

      {/* Caption */}
      <motion.div
        className="absolute bottom-[3%] left-[3%] z-30"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.45 }}
      >
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(11px, 2.2vw, 20px)',
            color: '#fff',
            letterSpacing: '0.06em',
            textShadow: '0 0 12px rgba(167,139,250,0.45)',
          }}
        >
          JUST TALK. PABLO HANDLES IT.
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(5px, 0.75vw, 7px)',
            color: '#94a3b8',
            letterSpacing: '0.25em',
            opacity: 0.7,
            marginTop: 4,
          }}
        >
          BUY · NEGOTIATE · DEPLOY · DONE
        </div>
      </motion.div>
    </motion.div>
  );
}
