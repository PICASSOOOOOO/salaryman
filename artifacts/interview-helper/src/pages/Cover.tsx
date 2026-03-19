import { useAuth } from '@workspace/replit-auth-web';
import { motion } from 'framer-motion';
import {
  Terminal, Mic, Presentation, Users, LayoutDashboard, Briefcase, MessageSquare, ChevronRight,
} from 'lucide-react';

const TOOLS = [
  { icon: Mic, label: 'AI Interview Assistant' },
  { icon: Presentation, label: 'Slide Builder' },
  { icon: Users, label: 'Contact Management' },
  { icon: Briefcase, label: 'Hiring Pipeline' },
  { icon: LayoutDashboard, label: 'Project Dashboard' },
  { icon: MessageSquare, label: 'AI Advisor' },
];

export default function Cover() {
  const { login } = useAuth();

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
          Every App in One.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.5rem 1.25rem',
            marginBottom: '3rem',
          }}
        >
          {TOOLS.map((t) => (
            <div
              key={t.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.7rem',
                color: 'rgba(0,255,65,0.4)',
                letterSpacing: '0.06em',
              }}
            >
              <t.icon size={12} />
              {t.label}
            </div>
          ))}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
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

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          style={{
            marginTop: '1.5rem',
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: 'rgba(0,255,65,0.2)',
          }}
        >
          FREE ON STEAM
        </motion.p>
      </div>
    </div>
  );
}
