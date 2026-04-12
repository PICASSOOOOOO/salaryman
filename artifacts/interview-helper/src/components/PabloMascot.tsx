import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SALARYMAN_QUOTES = [
  "THE GRIND DOESN'T STOP. THE GRIND NEVER STOPS.",
  "I DIDN'T CHOOSE THE SALARYMAN LIFE. I SIGNED A CONTRACT.",
  "MEETINGS COULD HAVE BEEN EMAILS. EMAILS COULD HAVE BEEN SILENCE.",
  "MY TIE IS RED BECAUSE IT'S STAINED WITH AMBITION.",
  "COFFEE IS NOT A BEVERAGE. IT'S INFRASTRUCTURE.",
  "I'VE OPTIMIZED MY COMMUTE DOWN TO 47 STEPS.",
  "WORK-LIFE BALANCE IS A MYTH INVENTED BY PEOPLE WHO DON'T WORK.",
  "THEY SAID DRESS FOR THE JOB YOU WANT. SO I NEVER TAKE THE SUIT OFF.",
  "I DON'T WALK TO WORK. WORK WALKS TO ME. BUT I STILL WALK.",
  "EVERY EMPIRE STARTS WITH ONE MAN IN A SUIT.",
  "MY BRIEFCASE CONTAINS THE FUTURE. AND A SANDWICH.",
  "THE EARLY BIRD GETS THE WORM. I GET THE QUARTERLY BONUS.",
  "SUBSCRIBE TO SALARYMAN. YOUR BOSS ALREADY DID.",
  "I'VE BEEN WALKING TO WORK SINCE BEFORE THERE WAS WORK.",
  "PABLO CORP RUNS ON TWO THINGS: COFFEE AND FEAR.",
  "THE ALGORITHM? I TRAINED IT DURING MY LUNCH BREAK.",
  "JEAN CLAW HANDLES THE BOTS. I HANDLE EVERYTHING ELSE.",
  "SOME PEOPLE SEE A COMMUTE. I SEE CHARACTER DEVELOPMENT.",
];

const basePath = import.meta.env.BASE_URL ?? '/';

export default function PabloMascot() {
  const [quote, setQuote] = useState('');
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [nameLabel, setNameLabel] = useState(true);

  useEffect(() => {
    setQuote(SALARYMAN_QUOTES[Math.floor(Math.random() * SALARYMAN_QUOTES.length)]);
    setQuoteVisible(true);

    const interval = setInterval(() => {
      setQuoteVisible(false);
      setTimeout(() => {
        setQuote(SALARYMAN_QUOTES[Math.floor(Math.random() * SALARYMAN_QUOTES.length)]);
        setQuoteVisible(true);
      }, 6000);
    }, 6500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setNameLabel(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative w-full" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div style={{ width: '100%', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <video
            src={`${basePath}salaryman-walk.mp4`}
            autoPlay
            loop
            muted
            playsInline
            poster={`${basePath}salaryman.png`}
            style={{
              width: '100%',
              maxWidth: 320,
              height: 'auto',
              borderRadius: 16,
              boxShadow: '0 0 40px rgba(56,189,248,0.08), 0 0 80px rgba(0,0,0,0.3)',
              objectFit: 'cover',
            }}
          />
        </div>

        <AnimatePresence>
          {nameLabel && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 8, padding: '4px 14px',
                fontFamily: "'Share Tech Mono', 'VT323', monospace",
                fontSize: 11, letterSpacing: '0.15em', color: '#38bdf8',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}
            >
              THE SALARYMAN · ON THE CLOCK
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {quoteVisible && (
          <motion.div
            key={quote}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              position: 'relative',
              marginTop: 8,
              background: 'rgba(0,8,16,0.85)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: 12,
              padding: '12px 18px',
              maxWidth: 400,
              margin: '8px auto 0',
            }}
          >
            <div style={{
              position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
              borderBottom: '6px solid rgba(56,189,248,0.2)',
            }} />
            <p style={{
              fontFamily: "'VT323', 'Share Tech Mono', monospace",
              fontSize: 14,
              color: 'rgba(56,189,248,0.85)',
              lineHeight: 1.5,
              textAlign: 'center',
              letterSpacing: '0.04em',
              margin: 0,
            }}>
              "{quote}"
            </p>
            <p style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              color: 'rgba(56,189,248,0.35)',
              textAlign: 'right',
              marginTop: 6,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              — THE SALARYMAN
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
