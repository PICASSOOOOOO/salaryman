import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 30% 50%, #0a1628 0%, #06080d 70%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative z-10 flex items-center gap-[4vw] px-[6%]">
        <div className="flex flex-col items-start">
          <motion.span
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1vw, 10px)', letterSpacing: '0.3em' }}
            className="text-[#10b981] mb-1 uppercase"
            initial={{ opacity: 0, x: -10 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.3 }}
          >
            INTRODUCING
          </motion.span>
          <motion.h2
            style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(20px, 5vw, 40px)', lineHeight: 1.05 }}
            className="font-bold text-white uppercase"
          >
            <motion.span
              className="block text-[#10b981]"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              THE PICASSO
            </motion.span>
            <motion.span
              className="block tracking-widest"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              PLATFORM
            </motion.span>
          </motion.h2>
          <motion.p
            style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(6px, 1.1vw, 11px)', lineHeight: 1.6 }}
            className="text-white/40 mt-2 max-w-[22vw]"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
            transition={{ duration: 0.4 }}
          >
            AI AGENTS · PHONE SYSTEM · CRM
            <br />
            CREATIVE STUDIO · BOT FACTORY
          </motion.p>
        </div>

        <motion.div
          className="relative flex-shrink-0"
          style={{ width: 'clamp(120px, 30vw, 260px)', height: 'clamp(72px, 18vw, 156px)' }}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: 'backOut' }}
        >
          <div className="absolute inset-0 rounded-md border border-sky-500/20 bg-[#0b1121] overflow-hidden">
            <div className="h-[12%] bg-[#0d1529] border-b border-sky-500/10 flex items-center px-[6%] gap-[3%]">
              {['#ef4444','#f59e0b','#10b981'].map((c,i) => (
                <div key={i} style={{ width: '3%', paddingBottom: '3%', borderRadius: '50%', background: c, opacity: 0.6 }} />
              ))}
              <div className="flex-1" />
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(3px, 0.6vw, 6px)', color: '#38bdf8', opacity: 0.5, letterSpacing: '0.1em' }}>SALARYMAN</div>
            </div>
            <div className="flex h-[88%]">
              <div className="w-[18%] bg-[#080e1c] border-r border-sky-500/8 flex flex-col items-center pt-[8%] gap-[6%]">
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    style={{ width: '40%', paddingBottom: '40%', borderRadius: 2, background: i === 0 ? '#38bdf8' : '#1e293b' }}
                    initial={{ opacity: 0 }}
                    animate={phase >= 2 ? { opacity: i === 0 ? 0.9 : 0.4 } : {}}
                    transition={{ delay: 0.1 + i * 0.05, duration: 0.2 }}
                  />
                ))}
              </div>
              <div className="flex-1 p-[4%] flex flex-col gap-[4%]">
                <div className="flex gap-[3%]">
                  {[{ bg: '#10b981', w: '30%' }, { bg: '#3b82f6', w: '30%' }, { bg: '#a855f7', w: '30%' }].map((s, i) => (
                    <motion.div
                      key={i}
                      className="rounded-sm"
                      style={{ width: s.w, paddingBottom: '18%', background: `${s.bg}15`, border: `1px solid ${s.bg}30` }}
                      initial={{ opacity: 0, y: 5 }}
                      animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
                      transition={{ delay: 0.3 + i * 0.08, duration: 0.3 }}
                    />
                  ))}
                </div>
                <motion.div
                  className="flex-1 rounded-sm"
                  style={{ background: '#38bdf810', border: '1px solid #38bdf815' }}
                  initial={{ opacity: 0 }}
                  animate={phase >= 3 ? { opacity: 1 } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <div className="p-[4%] flex flex-col gap-[6%]">
                    {[80, 60, 45, 70].map((w, i) => (
                      <div key={i} style={{ width: `${w}%`, height: 2, background: '#1e293b', borderRadius: 1 }} />
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
          <motion.div
            className="absolute -inset-[1px] rounded-md pointer-events-none"
            style={{ boxShadow: '0 0 20px rgba(56,189,248,0.1), 0 0 40px rgba(16,185,129,0.05)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
