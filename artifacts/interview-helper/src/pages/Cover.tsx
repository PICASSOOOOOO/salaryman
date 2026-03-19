import { useAuth } from '@workspace/replit-auth-web';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Info, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const FEATURE_CATEGORIES = [
  {
    id: 'pablo',
    label: 'PABLO AI',
    sub: 'Neural Core v5.0',
    features: [
      'AI Advisor Chat',
      'Voice Mode',
      'Translator',
      'Website Analyzer',
    ],
  },
  {
    id: 'console',
    label: 'CONSOLE',
    sub: 'Cipher-X Suite',
    features: [
      'Interview Solver',
      '  · Get Hint',
      '  · Full Solution',
      '  · Explain Approach',
      '  · Analyze Complexity',
      'Live Listen',
      'Screen Scan',
      'Ghost Hands',
    ],
  },
  {
    id: 'contacts',
    label: 'CONTACTS',
    sub: 'Recall-6 Registry',
    features: [
      'Contact Registry',
      'Meeting Logs',
    ],
  },
  {
    id: 'hiring',
    label: 'HIRING',
    sub: 'Recruit-8 Field Ops',
    features: [
      'Job Board',
      'Applicant Pipeline',
      'Staff Management',
      'Interview Conductor',
      'Presentations',
    ],
  },
  {
    id: 'documents',
    label: 'DOCUMENTS',
    sub: 'Ink-6 Phantom Printer',
    features: [
      'Invoices',
      'Contracts',
      'File Storage',
    ],
  },
  {
    id: 'calendar',
    label: 'CALENDAR',
    sub: 'Chrono-4 Array',
    features: [
      'Month / Week / Day Views',
      'Appointments',
      'Email Reminders',
    ],
  },
  {
    id: 'dashboard',
    label: 'DASHBOARD',
    sub: 'Command Deck v4.0',
    features: [
      'Projects',
      'Knowledge Vault',
      'Brand Kit',
    ],
  },
  {
    id: 'studio',
    label: 'STUDIO',
    sub: 'Forge-7 Content Matrix',
    features: [
      'Graphics Studio',
      'AI Image Generation',
      'Copywriting Studio',
    ],
  },
  {
    id: 'reports',
    label: 'REPORTS',
    sub: 'Intel-9 Command Brief',
    features: [
      'Business Intelligence',
      'Zapier Integration',
    ],
  },
  {
    id: 'salaryman',
    label: 'SALARYMAN',
    sub: 'Open World RPG',
    features: [
      'Open World RPG',
      'Combat System',
      'Factions',
      'Economy',
    ],
  },
];

function FeatureCard({ category, index }: { category: typeof FEATURE_CATEGORIES[number]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05 }}
      style={{
        border: '1px solid rgba(0,255,65,0.15)',
        background: 'rgba(0,255,65,0.025)',
        padding: '1rem 1.1rem',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: '0.6rem',
          letterSpacing: '0.22em',
          color: 'rgba(0,255,65,0.35)',
          marginBottom: '0.15rem',
          textTransform: 'uppercase',
        }}
      >
        {category.sub}
      </div>
      <div
        style={{
          fontSize: '0.78rem',
          letterSpacing: '0.14em',
          color: '#00ff41',
          marginBottom: '0.65rem',
          textTransform: 'uppercase',
          fontWeight: 'bold',
        }}
      >
        {category.label}
      </div>
      <div
        style={{
          width: '100%',
          height: '1px',
          background: 'rgba(0,255,65,0.12)',
          marginBottom: '0.65rem',
        }}
      />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {category.features.map((f) => (
          <li
            key={f}
            style={{
              fontSize: '0.63rem',
              color: 'rgba(0,255,65,0.45)',
              letterSpacing: '0.06em',
              paddingBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span style={{ color: 'rgba(0,255,65,0.25)', fontSize: '0.55rem' }}>▸</span>
            {f}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function InfoOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(3,8,3,0.96)',
        fontFamily: "'Share Tech Mono', monospace",
        overflowY: 'auto',
        padding: '2rem 1.5rem',
      }}
    >
      <style>{`
        .info-grid { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 1024px) { .info-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px) { .info-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .info-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 101,
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      <div style={{ position: 'relative', zIndex: 102, maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <div
              style={{
                fontSize: '0.6rem',
                letterSpacing: '0.2em',
                color: 'rgba(0,255,65,0.35)',
                marginBottom: '0.4rem',
              }}
            >
              SYSTEM MANIFEST
            </div>
            <div
              style={{
                fontSize: '1.1rem',
                letterSpacing: '0.14em',
                color: '#00ff41',
                textShadow: '0 0 20px rgba(0,255,65,0.3)',
              }}
            >
              ALL MODULES
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              background: 'none',
              border: '1px solid rgba(0,255,65,0.25)',
              color: 'rgba(0,255,65,0.6)',
              cursor: 'pointer',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </motion.button>
        </div>

        <div
          className="info-grid"
          style={{
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          {FEATURE_CATEGORIES.map((cat, i) => (
            <FeatureCard key={cat.id} category={cat} index={i} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function Cover() {
  const { login } = useAuth();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030803',
        fontFamily: "'Share Tech Mono', monospace",
        position: 'relative',
        overflowX: 'hidden',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 50,
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.2em',
            color: 'rgba(0,255,65,0.35)',
            marginBottom: '1.5rem',
          }}
        >
          PICASSOO.AI
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
            letterSpacing: '0.08em',
            color: '#00ff41',
            textShadow: '0 0 30px rgba(0,255,65,0.4)',
            marginBottom: '1rem',
            lineHeight: 1,
          }}
        >
          SALARYMAN
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          style={{
            fontSize: '0.8rem',
            color: 'rgba(0,255,65,0.5)',
            letterSpacing: '0.06em',
            marginBottom: '2.5rem',
            maxWidth: '28rem',
          }}
        >
          Attention is All You Need.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '1rem',
            marginBottom: '3rem',
          }}
        >
          <motion.button
            onClick={login}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{
              fontSize: '0.8rem',
              letterSpacing: '0.14em',
              color: '#030803',
              background: '#00ff41',
              border: 'none',
              padding: '0.7rem 2rem',
              cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace",
              boxShadow: '0 0 24px rgba(0,255,65,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            GET STARTED FREE <ChevronRight size={14} />
          </motion.button>

          <motion.button
            onClick={() => setShowInfo(true)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              color: 'rgba(0,255,65,0.6)',
              background: 'none',
              border: '1px solid rgba(0,255,65,0.25)',
              padding: '0.7rem 1rem',
              cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace",
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Info size={14} /> EVERY APP IN ONE
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: 'rgba(0,255,65,0.2)',
          }}
        >
          FREE ON STEAM
        </motion.p>
      </div>

      <AnimatePresence>
        {showInfo && <InfoOverlay onClose={() => setShowInfo(false)} />}
      </AnimatePresence>
    </div>
  );
}
