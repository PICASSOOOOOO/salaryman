import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useArtKit } from '@/lib/video/useArtKit';

const TOOLTIPS = [
  { x: '22%', y: '52%', label: 'CUSTOMIZE DESK', color: '#22d3ee', delay: 0.0 },
  { x: '52%', y: '38%', label: 'POST FILES', color: '#f472b6', delay: 0.7 },
  { x: '76%', y: '54%', label: 'HIRE +1 BOT', color: '#10b981', delay: 1.4 },
];

const HUD_BOTS = [
  { code: 'CLW-0042', tag: 'OFFICE', color: '#22d3ee' },
  { code: 'CLW-1108', tag: 'OFFICE', color: '#22d3ee' },
  { code: 'CLW-2204', tag: 'FLOOR',  color: '#f59e0b' },
];

export function Scene4() {
  const art = useArtKit(['scene_office', 'prop_desk', 'prop_filing_cabinet', 'cutscene_player_default']);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#06080d' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.45 }}
    >
      {/* Procedural office plate fallback — iso desk grid suggestion */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 60%, rgba(244,114,182,0.10) 0%, transparent 65%), repeating-linear-gradient(60deg, rgba(34,211,238,0.04) 0 1px, transparent 1px 56px), repeating-linear-gradient(-60deg, rgba(244,114,182,0.04) 0 1px, transparent 1px 56px)',
        }}
      />
      {/* Office plate — slow lateral pan */}
      <motion.div
        className="absolute inset-0"
        initial={{ x: -20, scale: 1.06, opacity: 0 }}
        animate={{ x: 20, scale: 1.06, opacity: art.scene_office ? 0.85 : 0 }}
        transition={{ duration: 5.5, ease: 'easeInOut' }}
        style={{
          backgroundImage: art.scene_office ? `url(${art.scene_office})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center 50%',
          filter: 'saturate(1.05) contrast(1.05)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 95% 75% at 50% 50%, transparent 35%, rgba(6,8,13,0.85) 95%)',
        }}
      />

      {/* HUD top bar */}
      <motion.div
        className="absolute top-[3%] left-[3%] right-[3%] flex items-center justify-between z-30"
        initial={{ opacity: 0, y: -8 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-[0.7vw]">
          <motion.div
            style={{
              width: 'clamp(5px, 0.6vw, 7px)',
              height: 'clamp(5px, 0.6vw, 7px)',
              borderRadius: '50%',
              background: '#f472b6',
            }}
            animate={{ boxShadow: ['0 0 0px #f472b6', '0 0 8px #f472b6', '0 0 0px #f472b6'] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 'clamp(7px, 1vw, 11px)',
              letterSpacing: '0.3em',
              color: '#f472b6',
            }}
          >
            YOUR OFFICE
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 'clamp(8px, 1.3vw, 13px)',
            color: '#22d3ee',
            letterSpacing: '0.1em',
          }}
        >
          $48,250 FIAT
        </span>
      </motion.div>

      {/* Bot roster strip */}
      {phase >= 2 && (
        <motion.div
          className="absolute z-30"
          style={{
            top: '12%',
            right: '3%',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(2px, 0.4vw, 4px)',
          }}
        >
          {HUD_BOTS.map((b, i) => (
            <motion.div
              key={b.code}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12, duration: 0.3 }}
              style={{
                background: 'rgba(6,8,13,0.78)',
                border: `1px solid ${b.color}40`,
                borderRadius: 3,
                padding: 'clamp(3px, 0.4vw, 5px) clamp(5px, 0.7vw, 8px)',
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(4px, 0.55vw, 6px)',
                color: b.color,
                letterSpacing: '0.2em',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#fff' }}>{b.code}</span>
              <span style={{ opacity: 0.7 }}>{b.tag}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Floating prop highlights — desk + cabinet (the things you actually own) */}
      {phase >= 2 && art.prop_desk && (
        <motion.img
          src={art.prop_desk}
          alt=""
          className="absolute"
          style={{
            left: '14%',
            bottom: '18%',
            height: '34%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.45))',
            zIndex: 15,
          }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        />
      )}
      {phase >= 2 && art.prop_filing_cabinet && (
        <motion.img
          src={art.prop_filing_cabinet}
          alt=""
          className="absolute"
          style={{
            left: '46%',
            bottom: '24%',
            height: '40%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 0 16px rgba(244,114,182,0.45))',
            zIndex: 15,
          }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55 }}
        />
      )}

      {/* Player at desk */}
      {phase >= 2 && art.cutscene_player_default && (
        <motion.img
          src={art.cutscene_player_default}
          alt=""
          className="absolute"
          style={{
            right: '8%',
            bottom: '8%',
            height: '50%',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))',
            zIndex: 16,
          }}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25, duration: 0.55 }}
        />
      )}

      {/* Click tooltips popping over interactable objects */}
      {phase >= 3 &&
        TOOLTIPS.map((t) => (
          <motion.div
            key={t.label}
            className="absolute z-30"
            style={{ left: t.x, top: t.y }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: t.delay, duration: 0.3 }}
          >
            <div
              style={{
                position: 'relative',
                padding: 'clamp(3px, 0.4vw, 5px) clamp(5px, 0.7vw, 8px)',
                background: 'rgba(6,8,13,0.85)',
                border: `1px solid ${t.color}80`,
                borderRadius: 3,
                fontFamily: "var(--font-sans)",
                fontSize: 'clamp(4px, 0.6vw, 6px)',
                color: t.color,
                letterSpacing: '0.25em',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              <motion.div
                style={{
                  position: 'absolute',
                  inset: -4,
                  border: `1px solid ${t.color}`,
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
                animate={{ opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: t.delay }}
              />
            </div>
          </motion.div>
        ))}

      {/* Caption */}
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
            textShadow: '0 0 12px rgba(244,114,182,0.4)',
          }}
        >
          BUILD IT. STAFF IT. RUN IT.
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
          EVERY DESK · EVERY DOOR · EVERY HIRE
        </div>
      </motion.div>
    </motion.div>
  );
}
