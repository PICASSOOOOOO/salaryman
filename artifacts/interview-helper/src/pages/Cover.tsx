import { useState, useEffect } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { motion } from 'framer-motion';
import { ChevronRight, Terminal } from 'lucide-react';
import { useLocation } from 'wouter';
import { CITY_NAME } from '@/gameSystems';

function LiveServerStatus() {
  const [serverOnline, setServerOnline] = useState<number | null>(null);
  const [serverMax, setServerMax] = useState(50);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(`${import.meta.env.BASE_URL}api/world/server-status`)
        .then(r => r.json())
        .then(d => { setServerOnline(d.online ?? 0); setServerMax(d.max ?? 50); setFetchFailed(false); })
        .catch(() => { setFetchFailed(true); });
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setBlinkOn(b => !b), 800);
    return () => clearInterval(id);
  }, []);

  const isOnline = !fetchFailed && serverOnline !== null;
  const pct = serverOnline !== null ? Math.round((serverOnline / serverMax) * 100) : 0;

  const ECONOMY_STATS = [
    { label: 'ƒ MIN SALARY', value: 'ƒ 15,000', color: 'rgba(0,255,65,0.65)' },
    { label: 'ƒ MAX SALARY', value: 'ƒ 250,000', color: 'rgba(180,255,100,0.75)' },
    { label: 'GOLD RATE', value: '1 oz = ƒ100K', color: 'rgba(255,204,0,0.8)' },
    { label: 'CURRENCY', value: 'ƒ FIAT', color: 'rgba(0,255,65,0.65)' },
    { label: 'SAVINGS APY', value: '1.2%', color: 'rgba(100,200,255,0.75)' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      style={{
        border: '1px solid rgba(0,255,65,0.22)',
        background: 'linear-gradient(135deg, rgba(0,255,65,0.03), rgba(0,180,50,0.015))',
        marginTop: '2.5rem',
        position: 'relative',
        overflow: 'hidden',
        maxWidth: '36rem',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          borderBottom: '1px solid rgba(0,255,65,0.12)',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          position: 'relative',
        }}
      >
        <Terminal size={13} style={{ color: 'rgba(0,255,65,0.45)' }} />
        <span
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '1.05rem',
            color: 'rgba(0,255,65,0.85)',
            letterSpacing: '0.2em',
          }}
        >
          {CITY_NAME}
        </span>
        <span
          style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: '0.48rem',
            color: 'rgba(0,255,65,0.3)',
            letterSpacing: '0.1em',
          }}
        >
          SERVER: PST · LIVE SERVER STATUS
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span
            style={{
              display: 'inline-block',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: isOnline ? '#00ff41' : 'rgba(0,255,65,0.2)',
              boxShadow: isOnline && blinkOn ? '0 0 6px #00ff41' : 'none',
              transition: 'box-shadow 0.2s',
            }}
          />
          <span
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '0.45rem',
              letterSpacing: '0.12em',
              color: isOnline ? 'rgba(0,255,65,0.65)' : 'rgba(0,255,65,0.25)',
            }}
          >
            {fetchFailed ? 'OFFLINE' : isOnline ? 'ONLINE' : 'CONNECTING...'}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '0.75rem 1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem 2.5rem',
          fontFamily: "'Share Tech Mono', monospace",
          position: 'relative',
        }}
      >
        <div>
          <div style={{ fontSize: '0.43rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.12em', marginBottom: '0.15rem' }}>POPULATION</div>
          <div style={{ fontSize: '0.68rem', color: 'rgba(0,255,65,0.65)' }}>
            {serverOnline !== null ? `${serverOnline} / ${serverMax}` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.43rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.12em', marginBottom: '0.15rem' }}>CAPACITY</div>
          <div style={{ fontSize: '0.68rem', color: 'rgba(0,255,65,0.65)' }}>
            {serverOnline !== null ? `${pct}%` : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.43rem', color: 'rgba(0,255,65,0.25)', letterSpacing: '0.12em', marginBottom: '0.15rem' }}>SERVER</div>
          <div style={{ fontSize: '0.68rem', color: 'rgba(0,255,65,0.65)' }}>PST · MINX CITY</div>
        </div>
        {ECONOMY_STATS.map(stat => (
          <div key={stat.label}>
            <div style={{ fontSize: '0.43rem', color: 'rgba(0,255,65,0.22)', letterSpacing: '0.12em', marginBottom: '0.15rem' }}>{stat.label}</div>
            <div style={{ fontSize: '0.68rem', color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {serverOnline !== null && (
        <div style={{ padding: '0 1.25rem 0.75rem', position: 'relative' }}>
          <div
            style={{
              height: '2px',
              background: 'rgba(0,255,65,0.08)',
              borderRadius: '1px',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, rgba(0,255,65,0.35), rgba(0,255,65,0.6))',
                boxShadow: '0 0 6px rgba(0,255,65,0.3)',
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

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
        padding: '5rem 1.5rem 2rem',
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

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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

        <LiveServerStatus />

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
