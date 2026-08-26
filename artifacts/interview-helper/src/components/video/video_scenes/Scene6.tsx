import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useArtKit } from '@/lib/video/useArtKit';

const TICKER = [
  { t: '+ INVOICE PAID · $12,500 FIAT', color: '#10b981' },
  { t: 'BOT-MARK-04 · HIRED', color: '#22d3ee' },
  { t: 'BROADCAST → 412 TENANTS · OK', color: '#f472b6' },
  { t: 'PAYROLL RUN · 31 STAFF · USD→FIAT', color: '#a78bfa' },
];

export function Scene6() {
  const art = useArtKit(['scene_lobby', 'cutscene_receptionist', 'cutscene_courier', 'prop_bot_tube']);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1700),
      setTimeout(() => setPhase(4), 2700),
      setTimeout(() => setPhase(5), 3700),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#06080d' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.45 }}
    >
      {/* Procedural lobby fallback — warm reception ambient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 65%, rgba(16,185,129,0.08) 0%, transparent 60%), repeating-linear-gradient(90deg, rgba(244,114,182,0.03) 0 1px, transparent 1px 72px)',
        }}
      />
      {/* Lobby plate */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: 1.0, opacity: art.scene_lobby ? 0.7 : 0 }}
        transition={{ duration: 5.5, ease: 'easeOut' }}
        style={{
          backgroundImage: art.scene_lobby ? `url(${art.scene_lobby})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center 60%',
          filter: 'saturate(1.05) contrast(1.05) hue-rotate(8deg)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 55%, transparent 30%, rgba(6,8,13,0.85) 90%)',
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
            background: '#10b981',
          }}
          animate={{ boxShadow: ['0 0 0px #10b981', '0 0 8px #10b981', '0 0 0px #10b981'] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(7px, 1vw, 11px)',
            letterSpacing: '0.3em',
            color: '#10b981',
          }}
        >
          REAL BUSINESS · LIVE
        </span>
      </motion.div>

      {/* Receptionist greeting customer */}
      {phase >= 2 && art.cutscene_receptionist && (
        <motion.img
          src={art.cutscene_receptionist}
          alt=""
          className="absolute"
          style={{
            left: '8%',
            bottom: '8%',
            height: '56%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 0 14px rgba(244,114,182,0.4)) drop-shadow(0 6px 18px rgba(0,0,0,0.7))',
            zIndex: 16,
          }}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        />
      )}
      {phase >= 2 && art.cutscene_courier && (
        <motion.img
          src={art.cutscene_courier}
          alt=""
          className="absolute"
          style={{
            left: '34%',
            bottom: '8%',
            height: '52%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.4)) drop-shadow(0 6px 18px rgba(0,0,0,0.7))',
            zIndex: 15,
          }}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        />
      )}

      {/* Speech bubble between them */}
      {phase >= 3 && (
        <motion.div
          className="absolute"
          style={{ left: '24%', bottom: '52%', zIndex: 25 }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <div
            style={{
              padding: 'clamp(4px, 0.6vw, 8px) clamp(6px, 0.9vw, 12px)',
              background: 'rgba(6,8,13,0.92)',
              border: '1px solid rgba(244,114,182,0.5)',
              borderRadius: 4,
              fontFamily: "var(--font-sans)",
              fontSize: 'clamp(7px, 1.2vw, 11px)',
              color: '#f472b6',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 16px rgba(244,114,182,0.2)',
            }}
          >
            "WELCOME — DELIVERY FOR FLR 14?"
          </div>
        </motion.div>
      )}

      {/* Bot tube on right — spawning a new bot */}
      {phase >= 3 && art.prop_bot_tube && (
        <motion.div
          className="absolute"
          style={{
            right: '7%',
            bottom: '12%',
            height: '60%',
            zIndex: 17,
          }}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55 }}
        >
          <div className="relative h-full">
            <img
              src={art.prop_bot_tube}
              alt=""
              style={{
                height: '100%',
                imageRendering: 'pixelated',
                filter: 'drop-shadow(0 0 18px rgba(34,211,238,0.55))',
              }}
            />
            {/* Inner glow */}
            <motion.div
              className="absolute"
              style={{
                left: '50%',
                bottom: '20%',
                width: 'clamp(8px, 1.5vw, 14px)',
                height: 'clamp(8px, 1.5vw, 14px)',
                marginLeft: 'calc(-1 * clamp(4px, 0.75vw, 7px))',
                borderRadius: '50%',
                background: '#22d3ee',
                boxShadow: '0 0 18px #22d3ee, 0 0 40px rgba(34,211,238,0.5)',
              }}
              animate={{
                y: [0, -40, -80, -120],
                opacity: [0, 1, 1, 0],
                scale: [0.5, 1, 1.2, 0.4],
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {/* Live event ticker — top-right */}
      {phase >= 4 && (
        <div
          className="absolute z-30"
          style={{
            top: '12%',
            right: '3%',
            width: 'clamp(140px, 26vw, 240px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(2px, 0.4vw, 4px)',
          }}
        >
          {TICKER.map((row, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.18, duration: 0.32 }}
              style={{
                background: 'rgba(6,8,13,0.85)',
                border: `1px solid ${row.color}40`,
                borderLeft: `2px solid ${row.color}`,
                padding: 'clamp(3px, 0.4vw, 5px) clamp(5px, 0.7vw, 8px)',
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(4px, 0.6vw, 6px)',
                color: row.color,
                letterSpacing: '0.18em',
              }}
            >
              {row.t}
            </motion.div>
          ))}
        </div>
      )}

      {/* Caption */}
      <motion.div
        className="absolute bottom-[4%] left-[3%] z-30"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 5 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.45 }}
      >
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(11px, 2.2vw, 20px)',
            color: '#fff',
            letterSpacing: '0.06em',
            textShadow: '0 0 12px rgba(16,185,129,0.45)',
          }}
        >
          INVOICES · PAYROLL · TENANTS · LIVE.
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
          NOT A DEMO — REAL MONEY MOVES
        </div>
      </motion.div>
    </motion.div>
  );
}
