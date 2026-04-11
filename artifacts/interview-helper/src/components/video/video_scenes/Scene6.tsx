import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const CALL_LOG = [
  { name: 'Sarah Mitchell', time: '2:34', status: 'completed', color: '#10b981' },
  { name: 'Corp Inc HQ', time: '5:12', status: 'completed', color: '#10b981' },
  { name: 'Jake Rivera', time: '0:45', status: 'missed', color: '#ef4444' },
  { name: 'New Lead — Marcus', time: '—', status: 'incoming', color: '#f59e0b' },
];

const DIAL_PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function Scene6() {
  const [phase, setPhase] = useState(0);
  const [ringPulse, setRingPulse] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase >= 3) {
      const iv = setInterval(() => setRingPulse(p => !p), 600);
      return () => clearInterval(iv);
    }
    return undefined;
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(ellipse at 60% 40%, #0a1a0f 0%, #0a0e1a 50%, #06080d 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        style={{
          position: 'absolute', top: '3%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)',
          letterSpacing: '0.25em', color: '#10b981',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.7 } : {}}
      >
        PHONE SYSTEM
      </motion.div>

      {phase >= 1 && (
        <motion.div
          style={{
            position: 'absolute', top: '10%', left: '5%', width: '45%', height: '75%',
            background: '#0a1210',
            border: '1px solid #10b98120',
            borderRadius: 4,
          }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            padding: 'clamp(4px, 0.7vw, 6px)', borderBottom: '1px solid #10b98115',
          }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 5px)',
              color: '#10b98180', letterSpacing: '0.15em',
            }}>
              RECENT CALLS
            </span>
          </div>

          {CALL_LOG.map((call, i) => (
            <motion.div
              key={i}
              style={{
                padding: 'clamp(3px, 0.5vw, 5px) clamp(4px, 0.7vw, 6px)',
                borderBottom: '1px solid #ffffff08',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              initial={{ opacity: 0, x: -5 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.1, duration: 0.2 }}
            >
              <div>
                <div style={{
                  fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)',
                  color: '#e2e8f0',
                }}>
                  {call.name}
                </div>
                <div style={{
                  fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)',
                  color: call.color, opacity: 0.7,
                }}>
                  {call.status.toUpperCase()} · {call.time}
                </div>
              </div>
              <div style={{
                width: 'clamp(3px, 0.5vw, 5px)', height: 'clamp(3px, 0.5vw, 5px)',
                borderRadius: '50%', background: call.color, opacity: 0.5,
              }} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div
          style={{
            position: 'absolute', top: '10%', right: '5%', width: '42%', height: '50%',
            background: '#0f1a14',
            border: '1px solid #10b98118',
            borderRadius: 4, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: 'clamp(4px, 0.7vw, 8px)',
          }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.5vw, 5px)',
            color: '#10b98160', letterSpacing: '0.15em', marginBottom: 'clamp(3px, 0.5vw, 6px)',
          }}>
            DIAL PAD
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'clamp(2px, 0.3vw, 3px)', width: '70%',
          }}>
            {DIAL_PAD.map((key, i) => (
              <motion.div
                key={i}
                style={{
                  aspectRatio: '1.3', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#10b98110',
                  border: '1px solid #10b98118',
                  borderRadius: 2,
                  fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.7vw, 7px)',
                  color: '#10b981', cursor: 'pointer',
                }}
                initial={{ opacity: 0 }}
                animate={phase >= 2 ? { opacity: 1 } : {}}
                transition={{ delay: i * 0.03, duration: 0.15 }}
              >
                {key}
              </motion.div>
            ))}
          </div>

          <motion.div
            style={{
              marginTop: 'clamp(4px, 0.7vw, 8px)',
              width: '60%', height: 'clamp(8px, 1.3vw, 12px)',
              background: '#10b98130',
              border: '1px solid #10b98140',
              borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            animate={phase >= 3 ? { background: ['#10b98130', '#10b98150', '#10b98130'] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span style={{
              fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
              color: '#10b981', letterSpacing: '0.1em',
            }}>
              CALL
            </span>
          </motion.div>
        </motion.div>
      )}

      {phase >= 3 && (
        <motion.div
          style={{
            position: 'absolute', bottom: '18%', right: '5%', width: '42%',
            background: ringPulse ? '#f59e0b15' : '#f59e0b08',
            border: `1px solid ${ringPulse ? '#f59e0b40' : '#f59e0b20'}`,
            borderRadius: 4, padding: 'clamp(4px, 0.7vw, 8px)',
            transition: 'all 0.3s',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'backOut' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(3px, 0.5vw, 6px)' }}>
            <motion.div
              style={{
                width: 'clamp(6px, 1vw, 10px)', height: 'clamp(6px, 1vw, 10px)',
                borderRadius: '50%', background: '#f59e0b',
              }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
            <div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.6vw, 6px)',
                color: '#f59e0b', letterSpacing: '0.1em',
              }}>
                INCOMING CALL
              </div>
              <div style={{
                fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.4vw, 4px)',
                color: '#f59e0b80',
              }}>
                AI Secretary answering...
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        style={{
          position: 'absolute', bottom: '3%', left: '4%',
          fontFamily: '"VT323", monospace', fontSize: 'clamp(8px, 1.6vw, 14px)',
          color: '#10b981', letterSpacing: '0.06em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 1 } : {}}
      >
        CALLS · AI SECRETARY · VOICEMAIL
      </motion.div>
      <motion.div
        style={{
          position: 'absolute', bottom: '1%', left: '4%',
          fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.7vw, 6px)',
          color: '#38bdf8', letterSpacing: '0.15em',
        }}
        initial={{ opacity: 0 }}
        animate={phase >= 4 ? { opacity: 0.5 } : {}}
      >
        YOUR BUSINESS PHONE · BUILT IN
      </motion.div>
    </motion.div>
  );
}
