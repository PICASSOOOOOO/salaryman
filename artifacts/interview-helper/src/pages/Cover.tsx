import { useAuth } from '@workspace/replit-auth-web';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Cover() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

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
            letterSpacing: '0.18em',
            marginBottom: '2.5rem',
            maxWidth: '28rem',
            textTransform: 'uppercase',
          }}
        >
          Attention is All You Need
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
            onClick={() => navigate('/features')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.12em',
              color: 'rgba(0,255,65,0.7)',
              background: 'none',
              border: '1px solid rgba(0,255,65,0.35)',
              padding: '0.7rem 1.5rem',
              cursor: 'pointer',
              fontFamily: "'Share Tech Mono', monospace",
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            EVERY APP IN ONE <ChevronRight size={13} />
          </motion.button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          style={{
            marginTop: '2.5rem',
            fontSize: '0.5rem',
            letterSpacing: '0.16em',
            color: 'rgba(0,255,65,0.55)',
            textTransform: 'uppercase',
            fontFamily: "'Share Tech Mono', monospace",
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          POWERED BY CLAUDE SONNET · GPT-4O · OPENCLAW · CLAUDE CODE · KARPATHY 243-LINE GPT · REACT · NODE · POSTGRES · STRIPE
        </motion.div>
      </div>
    </div>
  );
}
