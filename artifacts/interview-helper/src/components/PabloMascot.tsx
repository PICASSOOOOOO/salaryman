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

function SalarymanSVG() {
  return (
    <svg viewBox="0 0 300 500" width="100%" style={{ maxWidth: 260, display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="suitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#282848" />
          <stop offset="100%" stopColor="#1a1a2e" />
        </linearGradient>
        <linearGradient id="hairGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a1018" />
          <stop offset="100%" stopColor="#0a0608" />
        </linearGradient>
        <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5dcc0" />
          <stop offset="100%" stopColor="#e8c8a0" />
        </linearGradient>
        <linearGradient id="tieGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dd3344" />
          <stop offset="100%" stopColor="#aa1828" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>

      <ellipse cx="150" cy="488" rx="50" ry="8" fill="rgba(0,0,0,0.15)" />

      <g filter="url(#shadow)">
        <path d="M128,340 Q124,380 120,420 Q118,440 118,455 L108,455 Q108,440 112,420 Q116,380 118,340 Z" fill="#181830" />
        <path d="M118,452 Q112,460 100,462 L100,468 Q114,466 122,458 Z" fill="#0e0e0e" />
        <path d="M100,462 L100,468 Q92,470 88,468 L88,464 Q92,466 100,462 Z" fill="#111" />

        <path d="M158,340 Q164,380 172,420 Q176,445 178,455 L188,455 Q186,440 180,420 Q174,380 168,340 Z" fill="#181830" />
        <path d="M178,452 Q184,460 196,462 L196,468 Q182,466 174,458 Z" fill="#0e0e0e" />
        <path d="M196,462 L196,468 Q204,470 208,468 L208,464 Q204,466 196,462 Z" fill="#111" />
      </g>

      <g filter="url(#shadow)">
        <path d="M120,190 Q112,200 108,220 Q104,250 108,340 L180,340 Q184,250 182,220 Q178,200 170,190 Z" fill="url(#suitGrad)" />

        <path d="M120,190 L122,195 Q118,220 118,260 L108,260 Q104,220 112,200 Z" fill="#222244" />
        <path d="M170,190 L168,195 Q172,220 172,260 L182,260 Q184,220 178,200 Z" fill="#222244" />

        <rect x="140" y="190" width="10" height="150" rx="2" fill="white" opacity="0.85" />

        <path d="M142,195 L148,195 L149,290 L141,290 Z" fill="url(#tieGrad)" />
        <polygon points="141,290 145,302 149,290" fill="#991828" />
        <path d="M140,193 L150,193 L149,197 L141,197 Z" fill="#dd3344" />

        <rect x="118" y="335" width="55" height="6" rx="2" fill="#111125" />
        <rect x="140" y="334" width="10" height="8" rx="1.5" fill="#c8a84e" />
      </g>

      <g filter="url(#shadow)">
        <path d="M114,195 Q104,200 98,220 Q94,245 96,290" stroke="none" fill="url(#suitGrad)" />
        <path d="M114,195 Q104,200 98,220 Q94,245 96,290 L106,290 Q106,250 108,225 Q112,205 120,198 Z" fill="url(#suitGrad)" />
        <circle cx="100" cy="296" r="8" fill="url(#skinGrad)" />
      </g>

      <g filter="url(#shadow)">
        <path d="M176,195 Q186,200 194,220 Q200,250 202,310" stroke="none" fill="#222244" />
        <path d="M176,195 Q186,200 194,220 Q200,250 202,310 L192,310 Q190,255 186,225 Q180,205 172,198 Z" fill="#222244" />
        <circle cx="198" cy="316" r="8" fill="url(#skinGrad)" />

        <g transform="translate(198,322)">
          <rect x="-16" y="0" width="32" height="24" rx="3" fill="#3a2418" />
          <rect x="-14" y="2" width="28" height="20" rx="2" fill="#2a1810" />
          <rect x="-6" y="-2" width="12" height="3" rx="1" fill="#c8a84e" />
          <rect x="-10" y="10" width="5" height="3" rx="0.5" fill="#c8a84e" />
          <rect x="5" y="10" width="5" height="3" rx="0.5" fill="#c8a84e" />
          <line x1="-14" y1="12" x2="14" y2="12" stroke="#3a2418" strokeWidth="2" />
        </g>
      </g>

      <rect x="138" y="172" width="14" height="22" rx="5" fill="url(#skinGrad)" />

      <g transform="translate(145,120)" filter="url(#shadow)">
        <ellipse cx="0" cy="8" rx="32" ry="38" fill="url(#skinGrad)" />

        <path d="M-28,14 Q-30,-8 -22,-24 Q-12,-40 4,-42 Q20,-44 28,-32 Q36,-20 34,-4 L30,-2 Q30,-16 24,-26 Q16,-36 4,-36 Q-8,-36 -18,-26 Q-24,-14 -24,10 Z" fill="url(#hairGrad)" />

        <path d="M-6,-36 Q4,-50 16,-40 Q10,-32 2,-34 Z" fill="url(#hairGrad)" />
        <path d="M8,-40 Q20,-50 28,-36 Q22,-30 14,-36 Z" fill="url(#hairGrad)" />
        <path d="M-12,-32 Q-4,-44 2,-36 Q-2,-30 -8,-30 Z" fill="url(#hairGrad)" />

        <path d="M-28,10 Q-32,22 -26,34 L-22,30 Q-26,20 -24,10 Z" fill="url(#hairGrad)" />
        <path d="M-28,10 Q-30,0 -28,-4 L-24,-2 Q-26,2 -24,10 Z" fill="url(#hairGrad)" />

        <ellipse cx="12" cy="4" rx="10" ry="12" fill="white" />
        <ellipse cx="14" cy="4" rx="6.5" ry="8" fill="#1a0a00" />
        <ellipse cx="15" cy="2" rx="4" ry="5" fill="#000" />
        <ellipse cx="17" cy="-1" rx="2.2" ry="2.8" fill="rgba(255,255,255,0.95)" />
        <ellipse cx="12" cy="5" rx="1.2" ry="1.2" fill="rgba(255,255,255,0.7)" />

        <path d="M2,-8 Q12,-12 24,-8" fill="none" stroke="#1a1018" strokeWidth="2.5" strokeLinecap="round" />

        <ellipse cx="14" cy="18" rx="5" ry="4" fill="url(#skinGrad)" />

        <path d="M8,26 Q14,28 18,25" fill="none" stroke="#906050" strokeWidth="1.5" strokeLinecap="round" />

        <ellipse cx="24" cy="12" rx="8" ry="10" fill="url(#skinGrad)" />

        <ellipse cx="20" cy="18" rx="6" ry="3.5" fill="rgba(230,150,140,0.15)" />
      </g>

      <g opacity="0.06">
        <circle cx="80" cy="200" r="2" fill="#38bdf8" />
        <circle cx="220" cy="300" r="1.5" fill="#38bdf8" />
        <circle cx="100" cy="400" r="1" fill="#38bdf8" />
        <circle cx="200" cy="150" r="1.5" fill="#38bdf8" />
      </g>
    </svg>
  );
}

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
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <SalarymanSVG />
        </motion.div>

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
