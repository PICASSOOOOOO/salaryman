import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const CHAT_MSGS = [
  { from: 'YOU', text: 'WRITE A COLD EMAIL FOR THE ACME CORP DEAL', color: '#38bdf8' },
  { from: 'HEMINGWAY', text: 'DRAFTING... ANALYZING THEIR RECENT FUNDING ROUND AND PAIN POINTS...', color: '#10b981' },
  { from: 'HEMINGWAY', text: 'DONE. 3 VARIANTS READY. OPEN RATE PREDICTION: 34%', color: '#10b981' },
  { from: 'YOU', text: 'SEND VARIANT B. ALSO CHECK IF SCOUT HAS NEW LEADS', color: '#38bdf8' },
  { from: 'SCOUT', text: '12 NEW LEADS FOUND. 4 HIGH-VALUE MATCHES. FORWARDING TO CLOSER.', color: '#f59e0b' },
  { from: 'CLOSER', text: 'RECEIVED. INITIATING OUTREACH SEQUENCE FOR 4 PRIORITY LEADS.', color: '#ef4444' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);
  const [visibleMsgs, setVisibleMsgs] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 150),
      setTimeout(() => setPhase(2), 500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase >= 2 && visibleMsgs < CHAT_MSGS.length) {
      const t = setTimeout(() => setVisibleMsgs(v => v + 1), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, visibleMsgs]);

  return (
    <motion.div className="absolute inset-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #060810 0%, #0a0e1a 100%)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>

      <motion.div className="absolute top-[2.5%] left-[3%] z-20 flex items-center gap-[0.8vw]"
        initial={{ opacity: 0, x: -10 }} animate={phase >= 1 ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.4 }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(7px, 1.1vw, 11px)', letterSpacing: '0.3em', color: '#10b981' }}>
          BOTS AT WORK
        </span>
      </motion.div>

      <motion.div className="absolute top-[2.5%] right-[3%] z-20"
        initial={{ opacity: 0 }} animate={phase >= 1 ? { opacity: 0.5 } : {}}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#ef4444', letterSpacing: '0.12em' }}>
          3 BOTS ACTIVE IN CHAIN
        </span>
      </motion.div>

      {phase >= 1 && (
        <motion.div style={{
          position: 'absolute', top: '9%', left: '5%', right: '5%', bottom: '12%',
          background: '#0a0d15', border: '1px solid #ffffff10', borderRadius: 6,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: 'backOut' }}>

          <div style={{ padding: 'clamp(4px, 0.6vw, 6px) clamp(6px, 0.8vw, 8px)', borderBottom: '1px solid #ffffff08', display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.6vw, 6px)' }}>
            <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)' }}>🤖</span>
            <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(4px, 0.55vw, 5px)', color: '#ef444480', letterSpacing: '0.12em' }}>
              JEAN CLAW TERMINAL
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 'clamp(2px, 0.3vw, 3px)' }}>
              {['HEMINGWAY', 'SCOUT', 'CLOSER'].map((b, i) => (
                <span key={i} style={{
                  fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(2px, 0.35vw, 3px)',
                  color: ['#10b981', '#f59e0b', '#ef4444'][i], letterSpacing: '0.08em',
                  padding: 'clamp(1px, 0.15vw, 2px) clamp(2px, 0.3vw, 4px)',
                  border: `1px solid ${['#10b981', '#f59e0b', '#ef4444'][i]}25`, borderRadius: 2,
                }}>● {b}</span>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, padding: 'clamp(4px, 0.6vw, 8px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 'clamp(3px, 0.5vw, 6px)' }}>
            {CHAT_MSGS.slice(0, visibleMsgs).map((msg, i) => (
              <motion.div key={i}
                style={{
                  display: 'flex', gap: 'clamp(4px, 0.6vw, 6px)', alignItems: 'flex-start',
                }}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}>
                <span style={{
                  fontFamily: '"VT323", monospace', fontSize: 'clamp(4px, 0.55vw, 5px)',
                  color: msg.color, minWidth: 'clamp(30px, 5vw, 50px)', fontWeight: 600,
                }}>
                  {msg.from}
                </span>
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.45vw, 4px)',
                  color: msg.from === 'YOU' ? '#e2e8f0' : msg.color, opacity: msg.from === 'YOU' ? 0.9 : 0.7,
                  lineHeight: 1.4,
                }}>
                  {msg.text}
                </span>
              </motion.div>
            ))}
            {visibleMsgs < CHAT_MSGS.length && phase >= 2 && (
              <motion.div style={{ display: 'flex', gap: 'clamp(2px, 0.3vw, 3px)' }}
                animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 0.6, repeat: Infinity }}>
                {[0, 1, 2].map(d => (
                  <div key={d} style={{ width: 'clamp(2px, 0.3vw, 3px)', height: 'clamp(2px, 0.3vw, 3px)', borderRadius: '50%', background: '#ef4444' }} />
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      <motion.div className="absolute bottom-[3%] left-[3%] z-20"
        initial={{ opacity: 0, y: 8 }} animate={visibleMsgs >= CHAT_MSGS.length ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4 }}>
        <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(10px, 2vw, 18px)', color: '#10b981', letterSpacing: '0.08em', textShadow: '0 0 10px #10b98130' }}>
          BOTS TALK TO EACH OTHER
        </div>
        <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(5px, 0.75vw, 7px)', color: '#ef4444', letterSpacing: '0.2em', opacity: 0.4, marginTop: 3 }}>
          CHAIN COMMANDS · AUTOMATED WORKFLOWS
        </div>
      </motion.div>
    </motion.div>
  );
}
