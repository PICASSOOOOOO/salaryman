import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useArtKit } from '@/lib/video/useArtKit';

export function Scene3() {
  const art = useArtKit(['scene_lobby', 'cutscene_player_default', 'prop_door']);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 60%, #0a1220 0%, #06080d 80%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.45 }}
    >
      {/* Procedural lobby plate fallback — neon-noir floor + ceiling lights */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(34,211,238,0.10) 0%, transparent 18%, transparent 60%, rgba(244,114,182,0.08) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 64px)',
        }}
      />
      {/* Living lobby plate — slow camera push-in */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.04, opacity: 0 }}
        animate={{ scale: 1.12, opacity: art.scene_lobby ? 0.78 : 0 }}
        transition={{ duration: 5, ease: 'easeOut' }}
        style={{
          backgroundImage: art.scene_lobby ? `url(${art.scene_lobby})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center 55%',
          filter: 'saturate(1.1) contrast(1.05)',
        }}
      />
      {/* Atmospheric vignette + cyan rim */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 55%, transparent 30%, rgba(6,8,13,0.85) 90%), linear-gradient(180deg, rgba(34,211,238,0.06) 0%, transparent 25%)',
        }}
      />

      {/* HUD — top-left "you're playing" chrome */}
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
            background: '#22d3ee',
          }}
          animate={{ boxShadow: ['0 0 0px #22d3ee', '0 0 8px #22d3ee', '0 0 0px #22d3ee'] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(7px, 1vw, 11px)',
            letterSpacing: '0.3em',
            color: '#22d3ee',
          }}
        >
          STEP INSIDE
        </span>
      </motion.div>

      {/* HUD — top-right floor/cash */}
      <motion.div
        className="absolute top-[3%] right-[3%] flex flex-col items-end gap-[0.3vh] z-30"
        initial={{ opacity: 0, x: 10 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(8px, 1.4vw, 13px)',
            color: '#f472b6',
            letterSpacing: '0.1em',
          }}
        >
          FLR 14 · MINX TOWER
        </span>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(5px, 0.7vw, 7px)',
            color: '#94a3b8',
            letterSpacing: '0.25em',
          }}
        >
          TENANT · YOU
        </span>
      </motion.div>

      {/* Player walks in from left */}
      {art.cutscene_player_default && (
        <motion.img
          src={art.cutscene_player_default}
          alt=""
          className="absolute"
          style={{
            bottom: '6%',
            height: '52%',
            filter: 'drop-shadow(0 0 12px rgba(244,114,182,0.35)) drop-shadow(0 6px 18px rgba(0,0,0,0.6))',
            imageRendering: 'pixelated',
          }}
          initial={{ left: '-25%', opacity: 0 }}
          animate={phase >= 2 ? { left: '38%', opacity: 1 } : { left: '-25%', opacity: 0 }}
          transition={{ duration: 2.2, ease: [0.4, 0, 0.2, 1] }}
        />
      )}

      {/* Door highlight + tap ripple */}
      {phase >= 3 && (
        <>
          {art.prop_door && (
            <motion.img
              src={art.prop_door}
              alt=""
              className="absolute"
              style={{
                right: '12%',
                bottom: '15%',
                height: '48%',
                imageRendering: 'pixelated',
                filter: 'drop-shadow(0 0 18px rgba(34,211,238,0.55))',
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            />
          )}
          {/* Cursor + ripple */}
          <motion.div
            className="absolute"
            style={{ right: '20%', top: '40%', zIndex: 25 }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M2 2 L2 16 L6 12 L9 19 L12 18 L9 11 L15 11 Z" fill="#fff" stroke="#22d3ee" strokeWidth="1" />
            </svg>
            {[0, 0.6, 1.2].map((d) => (
              <motion.div
                key={d}
                className="absolute"
                style={{
                  top: 6,
                  left: 6,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: '1px solid #22d3ee',
                }}
                initial={{ scale: 0.5, opacity: 0.9 }}
                animate={{ scale: 5, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, delay: d, ease: 'easeOut' }}
              />
            ))}
          </motion.div>

          {/* Tooltip */}
          <motion.div
            className="absolute"
            style={{
              right: '8%',
              top: '52%',
              fontFamily: "var(--font-sans)",
              fontSize: 'clamp(5px, 0.7vw, 7px)',
              color: '#22d3ee',
              letterSpacing: '0.25em',
              padding: 'clamp(3px, 0.4vw, 5px) clamp(5px, 0.7vw, 8px)',
              border: '1px solid #22d3ee40',
              background: 'rgba(6,8,13,0.85)',
              borderRadius: 3,
              zIndex: 25,
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            ENTER · FLR 14
          </motion.div>
        </>
      )}

      {/* Bottom caption */}
      <motion.div
        className="absolute bottom-[4%] left-[3%] z-30"
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
            textShadow: '0 0 12px rgba(34,211,238,0.4)',
          }}
        >
          A REAL OFFICE. NOT A DASHBOARD.
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
          WALK IN · LOOK AROUND · OWN IT
        </div>
      </motion.div>
    </motion.div>
  );
}
