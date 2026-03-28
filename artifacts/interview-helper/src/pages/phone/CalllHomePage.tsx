import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Phone, Users, Zap, Clock, Voicemail, Radio, Bot, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { SignInPage } from '@/components/SignInPrompt';
import { crt, amber } from '@/lib/phone-utils';
import { usePlan } from '@/hooks/use-plan';
import { CalllHomeProvider, type TabKey } from './CalllHomeContext';

const PhoneContactsPage = lazy(() => import('./PhoneContactsPage'));
const PhoneDialerPage = lazy(() => import('./PhoneDialerPage'));
const PhoneActivePage = lazy(() => import('./PhoneActivePage'));
const PhoneHistoryPage = lazy(() => import('./PhoneHistoryPage'));
const PhoneVoicemailPage = lazy(() => import('./PhoneVoicemailPage'));
const PhoneConferencePage = lazy(() => import('./PhoneConferencePage'));
const PhoneSessionsPage = lazy(() => import('./PhoneSessionsPage'));
const PhoneCoachPage = lazy(() => import('./PhoneCoachPage'));
const PhoneSecretaryPage = lazy(() => import('./PhoneSecretaryPage'));

type AiSubMode = 'coach' | 'secretary';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'contacts', label: 'CRM', icon: <Users size={12} /> },
  { key: 'dial', label: 'DIAL', icon: <Phone size={12} /> },
  { key: 'live', label: 'LIVE', icon: <Zap size={12} /> },
  { key: 'log', label: 'LOG', icon: <Clock size={12} /> },
  { key: 'vm', label: 'VM', icon: <Voicemail size={12} /> },
  { key: 'conf', label: 'CONF', icon: <Users size={12} /> },
  { key: 'auto', label: 'AUTO', icon: <Radio size={12} /> },
  { key: 'ai', label: 'AI', icon: <Bot size={12} /> },
];

function AiTabContent({ subMode, setSubMode }: { subMode: AiSubMode; setSubMode: (m: AiSubMode) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${crt(0.06)}` }}>
        {([['coach', 'COACH'], ['secretary', 'SECRETARY']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubMode(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 16px', fontSize: '0.42rem', letterSpacing: '0.15em',
              color: subMode === key ? amber(0.9) : crt(0.3),
              borderBottom: subMode === key ? `2px solid ${amber(0.6)}` : '2px solid transparent',
            }}
          >{label}</button>
        ))}
      </div>
      {subMode === 'coach' ? <PhoneCoachPage /> : <PhoneSecretaryPage />}
    </div>
  );
}

function TabContent({ tab, aiSubMode, setAiSubMode }: { tab: TabKey; aiSubMode: AiSubMode; setAiSubMode: (m: AiSubMode) => void }) {
  switch (tab) {
    case 'contacts': return <PhoneContactsPage />;
    case 'dial': return <PhoneDialerPage />;
    case 'live': return <PhoneActivePage />;
    case 'log': return <PhoneHistoryPage />;
    case 'vm': return <PhoneVoicemailPage />;
    case 'conf': return <PhoneConferencePage />;
    case 'auto': return <PhoneSessionsPage />;
    case 'ai': return <AiTabContent subMode={aiSubMode} setSubMode={setAiSubMode} />;
    default: return null;
  }
}

const VALID_TABS = new Set<TabKey>(['contacts','dial','live','log','vm','conf','auto','ai']);
function getInitialTab(): TabKey {
  const p = new URLSearchParams(window.location.search).get('tab');
  return p && VALID_TABS.has(p as TabKey) ? (p as TabKey) : 'contacts';
}

export default function CalllHomePage() {
  const [boomerMode] = useBoomerMode();
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const [aiSubMode, setAiSubMode] = useState<AiSubMode>('coach');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
  const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'no_subscription' | 'unconfigured'>('checking');
  const BASE = import.meta.env.BASE_URL;
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { features, trials, isOwner, loading: planLoading } = usePlan();

  const hasPhoneAccess = isOwner || features.has('phone_system') || trials.some(t => t.featureKey === 'phone_system');

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => {
    if (!hasPhoneAccess || planLoading) return;
    fetch(apiUrl('twilio/phone-numbers'))
      .then(r => {
        if (r.ok) setSystemStatus('online');
        else if (r.status === 403) setSystemStatus('no_subscription');
        else if (r.status === 503 || r.status === 500) setSystemStatus('unconfigured');
        else setSystemStatus('unconfigured');
      })
      .catch(() => setSystemStatus('unconfigured'));
  }, [apiUrl, hasPhoneAccess, planLoading]);

  if (!isAuthenticated) {
    return <SignInPage context="Operative credentials required. PHONE SYSTEM access locked." />;
  }

  if (planLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #010a01 0%, #020802 40%, #030a03 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
      }}>
        <div style={{ textAlign: 'center', color: crt(0.3) }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.2em', marginBottom: 12 }}>VERIFYING ACCESS...</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: crt(0.3), animation: `pulse 1s infinite ${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!hasPhoneAccess) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #010a01 0%, #020802 40%, #030a03 100%)',
        ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          maxWidth: 480, width: '100%', margin: '0 auto', padding: 32, textAlign: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: `linear-gradient(135deg, ${amber(0.12)}, ${amber(0.03)})`,
            border: `1px solid ${amber(0.25)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: `0 0 30px ${amber(0.08)}`,
          }}>
            <Lock size={28} style={{ color: amber(0.7) }} />
          </div>
          <div style={{ fontSize: '1.1rem', color: crt(0.85), marginBottom: 8, letterSpacing: '0.1em' }}>
            CALLL HOME — ACCESS REQUIRED
          </div>
          <div style={{ fontSize: '0.55rem', color: crt(0.4), lineHeight: 1.7, marginBottom: 24 }}>
            The Calll Home phone system requires an active subscription or free trial.
            Start your 7-day free trial to get full access to the dialer, call history, voicemail, and all phone features.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => navigate('/features')}
              style={{
                padding: '12px 24px', fontSize: '0.6rem', letterSpacing: '0.15em',
                background: `linear-gradient(135deg, ${amber(0.15)}, ${amber(0.05)})`,
                border: `1px solid ${amber(0.35)}`,
                color: amber(0.9), borderRadius: 8, cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
                boxShadow: `0 0 16px ${amber(0.08)}`,
                transition: 'all 0.2s',
              }}
            >
              START 7-DAY FREE TRIAL
            </button>
            <button
              onClick={() => navigate('/upgrade')}
              style={{
                padding: '10px 24px', fontSize: '0.55rem', letterSpacing: '0.12em',
                background: 'transparent',
                border: `1px solid ${crt(0.15)}`,
                color: crt(0.4), borderRadius: 8, cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
                transition: 'all 0.2s',
              }}
            >
              VIEW SUBSCRIPTION PLANS
            </button>
          </div>
          <div style={{ marginTop: 20, fontSize: '0.42rem', color: crt(0.2) }}>
            $95/mo after trial · Cancel anytime
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #010a01 0%, #020802 40%, #030a03 100%)',
      ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
      color: crt(0.85),
      position: 'relative',
    }}>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: `1px solid ${crt(0.08)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Phone size={18} style={{ color: crt(0.7) }} />
            <img
              src={`${BASE}brand/callhome/calll-home-brush.png`}
              alt="CALLL HOME"
              style={{ height: 18, width: 'auto', opacity: 0.7, filter: 'brightness(1.8) saturate(0)' }}
            />
            <span style={{ fontSize: '0.42rem', color: crt(0.2), letterSpacing: '0.15em' }}>│</span>
            <span style={{ fontSize: '0.42rem', color: crt(0.25), letterSpacing: '0.15em' }}>EST. 1987</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: systemStatus === 'online' ? crt(0.7) : (systemStatus === 'unconfigured' || systemStatus === 'no_subscription') ? amber(0.7) : crt(0.2),
                boxShadow: systemStatus === 'online' ? `0 0 6px ${crt(0.3)}` : 'none',
                animation: systemStatus === 'online' ? 'pulse 2s infinite' : 'none',
              }} />
              <span style={{ fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.12em' }}>
                {systemStatus === 'online' ? 'ONLINE' : systemStatus === 'unconfigured' ? 'NO CONFIG' : systemStatus === 'no_subscription' ? 'NO ACCESS' : '...'}
              </span>
            </div>
            <span style={{ fontSize: '0.42rem', color: crt(0.15) }}>│</span>
            <span style={{
              fontSize: '0.42rem', color: crt(0.3), letterSpacing: '0.1em',
              padding: '2px 8px', border: `1px solid ${crt(0.12)}`, borderRadius: 3,
              background: crt(0.02),
            }}>PSO v3</span>
            <span style={{ fontSize: '0.42rem', color: crt(0.25), fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}>{clock}</span>
          </div>
        </div>

        {systemStatus === 'unconfigured' && (
          <div style={{
            margin: '8px 0', padding: '8px 14px',
            background: 'linear-gradient(90deg, rgba(255,180,0,0.06), rgba(255,180,0,0.02))',
            border: `1px solid ${amber(0.2)}`, borderRadius: 6,
            fontSize: '0.48rem', color: amber(0.7), letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={12} />
            Twilio not configured — contact admin to set up Twilio credentials.
          </div>
        )}
        {systemStatus === 'no_subscription' && (
          <div style={{
            margin: '8px 0', padding: '8px 14px',
            background: 'linear-gradient(90deg, rgba(255,180,0,0.06), rgba(255,180,0,0.02))',
            border: `1px solid ${amber(0.2)}`, borderRadius: 6,
            fontSize: '0.48rem', color: amber(0.7), letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={12} />
            Subscription verification failed. Please check your plan or start a free trial.
          </div>
        )}

        <div style={{
          display: 'flex', gap: 0, borderBottom: `1px solid ${crt(0.08)}`,
          overflowX: 'auto', scrollbarWidth: 'none',
          margin: '0 -16px', padding: '0 16px',
        }}>
          {TABS.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '9px 14px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: isActive ? crt(0.05) : 'transparent',
                  borderBottom: `2px solid ${isActive ? crt(0.5) : 'transparent'}`,
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  color: isActive ? crt(0.85) : crt(0.3),
                  fontSize: '0.45rem', letterSpacing: '0.12em',
                  cursor: 'pointer',
                  ...(boomerMode ? {} : { fontFamily: "'Share Tech Mono', monospace" }),
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ paddingBottom: 48 }}>
          <CalllHomeProvider switchTab={setActiveTab}>
            <Suspense fallback={
              <div style={{
                padding: '80px 0', textAlign: 'center',
                fontSize: '0.55rem', color: crt(0.25), letterSpacing: '0.15em',
              }}>
                LOADING {TABS.find(t => t.key === activeTab)?.label}...
              </div>
            }>
              <TabContent tab={activeTab} aiSubMode={aiSubMode} setAiSubMode={setAiSubMode} />
            </Suspense>
          </CalllHomeProvider>
        </div>

        <div style={{
          borderTop: `1px solid ${crt(0.06)}`,
          padding: '8px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.38rem', color: crt(0.15), letterSpacing: '0.12em',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={`${BASE}brand/callhome/calll-home-brush.png`}
              alt=""
              style={{ height: 10, width: 'auto', opacity: 0.25, filter: 'brightness(2) saturate(0)' }}
            />
            <span>CALLL HOME v3 │ PSO</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Calll Poin: AI Ready</span>
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: systemStatus === 'online' ? crt(0.4) : amber(0.3),
            }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 8px rgba(56,189,248,0.1); } 50% { box-shadow: 0 0 16px rgba(56,189,248,0.2); } }
        @keyframes waveform { 0% { height: 20%; } 25% { height: 60%; } 50% { height: 35%; } 75% { height: 80%; } 100% { height: 20%; } }
      `}</style>
    </div>
  );
}
