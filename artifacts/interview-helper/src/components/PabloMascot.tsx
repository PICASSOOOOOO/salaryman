import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const walkingKeyframes = `
@keyframes salarymanWalk {
  0%   { transform: translateY(0px) rotate(0deg); }
  15%  { transform: translateY(-6px) rotate(0.8deg); }
  30%  { transform: translateY(-2px) rotate(0deg); }
  50%  { transform: translateY(0px) rotate(0deg); }
  65%  { transform: translateY(-6px) rotate(-0.8deg); }
  80%  { transform: translateY(-2px) rotate(0deg); }
  100% { transform: translateY(0px) rotate(0deg); }
}
@keyframes salarymanShadow {
  0%   { transform: scaleX(1) scaleY(1); opacity: 0.15; }
  15%  { transform: scaleX(0.9) scaleY(0.8); opacity: 0.1; }
  30%  { transform: scaleX(0.95) scaleY(0.9); opacity: 0.12; }
  50%  { transform: scaleX(1) scaleY(1); opacity: 0.15; }
  65%  { transform: scaleX(0.9) scaleY(0.8); opacity: 0.1; }
  80%  { transform: scaleX(0.95) scaleY(0.9); opacity: 0.12; }
  100% { transform: scaleX(1) scaleY(1); opacity: 0.15; }
}
`;

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
        <style dangerouslySetInnerHTML={{ __html: walkingKeyframes }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img
            src={`${basePath}salaryman.png`}
            alt="The Salaryman"
            style={{
              width: '100%',
              maxWidth: 300,
              height: 'auto',
              animation: 'salarymanWalk 0.7s ease-in-out infinite',
            }}
          />
          <div style={{
            width: 80,
            height: 12,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(56,189,248,0.15), transparent 70%)',
            animation: 'salarymanShadow 0.7s ease-in-out infinite',
            marginTop: -6,
          }} />
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
