import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Phone, Users, Zap, Clock, Voicemail, Radio, Bot, AlertTriangle, Lock, Headphones, Activity, Mic, Settings2, MessageSquare, Hash } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { slate, warning } from '@/lib/phone-utils';
import { usePlan } from '@/hooks/use-plan';
import { CalllHomeProvider, type TabKey } from './CalllHomeContext';
import { usePledgePopup } from '@/components/PledgeStorePopup';
import { useTwilioDeviceContext } from '@/contexts/TwilioDeviceContext';

const PhoneContactsPage = lazy(() => import('./PhoneContactsPage'));
const PhoneCommandCenter = lazy(() => import('./PhoneCommandCenter'));
const PhoneDialerPage = lazy(() => import('./PhoneDialerPage'));
const PhoneActivePage = lazy(() => import('./PhoneActivePage'));
const PhoneHistoryPage = lazy(() => import('./PhoneHistoryPage'));
const PhoneRecordingsPage = lazy(() => import('./PhoneRecordingsPage'));
const PhoneVoicemailPage = lazy(() => import('./PhoneVoicemailPage'));
const PhoneConferencePage = lazy(() => import('./PhoneConferencePage'));
const PhoneSessionsPage = lazy(() => import('./PhoneSessionsPage'));
const PhoneCoachPage = lazy(() => import('./PhoneCoachPage'));
const PhoneSecretaryPage = lazy(() => import('./PhoneSecretaryPage'));
const PhoneCallCenterPage = lazy(() => import('./PhoneCallCenterPage'));
const PhoneSmsPage = lazy(() => import('./PhoneSmsPage'));
const PhoneNumbersPage = lazy(() => import('./PhoneNumbersPage'));

type AiSubMode = 'coach' | 'secretary';

const TABS: { key: TabKey; label: string; icon: React.ReactNode; emphasized?: boolean }[] = [
  { key: 'cmd', label: 'PHONE', icon: <Phone size={12} />, emphasized: true },
  { key: 'dial', label: 'AUTODIALER', icon: <Zap size={12} />, emphasized: true },
  { key: 'auto', label: 'DIALING SESSIONS', icon: <Activity size={12} />, emphasized: true },
  { key: 'cc', label: 'OUTBOUND CENTER', icon: <Headphones size={12} />, emphasized: true },
  { key: 'contacts', label: 'CONTACTS', icon: <Users size={12} /> },
  { key: 'sms', label: 'SMS', icon: <MessageSquare size={12} /> },
  { key: 'numbers', label: 'NUMBERS', icon: <Hash size={12} /> },
  { key: 'log', label: 'CALL LOG', icon: <Clock size={12} /> },
  { key: 'rec', label: 'RECORDINGS', icon: <Mic size={12} /> },
  { key: 'vm', label: 'VM', icon: <Voicemail size={12} /> },
  { key: 'conf', label: 'CONF', icon: <Users size={12} /> },
  { key: 'ai', label: 'ASSIST', icon: <Bot size={12} /> },
];

function AiTabContent({ subMode, setSubMode }: { subMode: AiSubMode; setSubMode: (m: AiSubMode) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: `1px solid ${slate(0.06)}` }}>
        {([['coach', 'COACH'], ['secretary', 'SECRETARY']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubMode(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 16px', fontSize: '0.42rem', letterSpacing: '0.15em',
              color: subMode === key ? warning(0.9) : slate(0.3),
              borderBottom: subMode === key ? `2px solid ${warning(0.6)}` : '2px solid transparent' }}
          >{label}</button>
        ))}
      </div>
      {subMode === 'coach' ? <PhoneCoachPage /> : <PhoneSecretaryPage />}
    </div>
  );
}

function TabContent({ tab, aiSubMode, setAiSubMode }: { tab: TabKey; aiSubMode: AiSubMode; setAiSubMode: (m: AiSubMode) => void }) {
  switch (tab) {
    case 'cmd': return <PhoneCommandCenter />;
    case 'contacts': return <PhoneContactsPage />;
    case 'dial': return <PhoneDialerPage />;
    case 'live': return <PhoneActivePage />;
    case 'log': return <PhoneHistoryPage />;
    case 'rec': return <PhoneRecordingsPage />;
    case 'vm': return <PhoneVoicemailPage />;
    case 'conf': return <PhoneConferencePage />;
    case 'auto': return <PhoneSessionsPage />;
    case 'ai': return <AiTabContent subMode={aiSubMode} setSubMode={setAiSubMode} />;
    case 'cc': return <PhoneCallCenterPage />;
    case 'sms': return <PhoneSmsPage />;
    case 'numbers': return <PhoneNumbersPage />;
    default: return null;
  }
}

const VALID_TABS = new Set<TabKey>(['cmd','contacts','dial','live','log','rec','vm','conf','auto','ai','cc','sms','numbers']);

const PRIMARY_TABS = new Set<TabKey>(['cmd', 'dial', 'contacts', 'sms']);

function getInitialTab(): TabKey {
  const p = new URLSearchParams(window.location.search).get('tab');
  if (p === 'live') return 'cmd';
  return p && VALID_TABS.has(p as TabKey) ? (p as TabKey) : 'cmd';
}

export default function CalllHomePage() {

  const [boomerMode] = useBoomerMode();
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const [aiSubMode, setAiSubMode] = useState<AiSubMode>('coach');
  const [showTabSettings, setShowTabSettings] = useState(false);
  const tabSettingsRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(
    () => TABS.filter(t => PRIMARY_TABS.has(t.key)),
    []
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.pathname = `${import.meta.env.BASE_URL}phone`.replace(/\/+/g, '/');
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
  }, [activeTab]);

  // Close the tab-settings popover on outside click / Escape.
  useEffect(() => {
    if (!showTabSettings) return;
    const onDown = (e: MouseEvent) => {
      if (!tabSettingsRef.current) return;
      if (!tabSettingsRef.current.contains(e.target as Node)) setShowTabSettings(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowTabSettings(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showTabSettings]);

  const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'no_subscription' | 'restricted' | 'unconfigured'>('checking');
  const BASE = import.meta.env.BASE_URL;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { features, trials, isOwner, loading: planLoading } = usePlan();
  const { openPledgePopup } = usePledgePopup();
  const { deviceState, deviceError, ensureDeviceReady, reconnect } = useTwilioDeviceContext();

  const hasPhoneAccess = isOwner || features.has('phone_system') || trials.some(t => t.featureKey === 'phone_system');
  const telephonyLocked = !hasPhoneAccess;

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => {
    if (!hasPhoneAccess || planLoading) return;
    apiFetch(apiUrl('twilio/system-status'), { credentials: 'include' })
      .then(r => {
        if (r.ok) {
          setSystemStatus('online');
          return;
        }
        return r.json().catch(() => ({})).then(data => {
          if (r.status === 403 && data.code === 'TWILIO_ORG_RESTRICTED') {
            setSystemStatus('restricted');
          } else if (r.status === 403) {
            setSystemStatus('no_subscription');
          } else {
            setSystemStatus('unconfigured');
          }
        });
      })
      .catch(() => setSystemStatus('unconfigured'));
  }, [apiUrl, hasPhoneAccess, planLoading]);

  useEffect(() => {
    if (!hasPhoneAccess || planLoading || systemStatus !== 'online') return;
    void ensureDeviceReady().catch(() => {});
  }, [ensureDeviceReady, hasPhoneAccess, planLoading, systemStatus]);

  const callingLabel = systemStatus !== 'online'
    ? (systemStatus === 'checking' ? 'CHECKING' : systemStatus === 'no_subscription' ? 'NO ACCESS' : systemStatus === 'restricted' ? 'RESTRICTED' : 'UNAVAILABLE')
    : deviceState === 'ready'
      ? 'CALLING READY'
      : deviceState === 'error'
        ? 'CALLING ERROR'
        : 'CONNECTING';

  if (authLoading) {
    return <div style={{ minHeight: 'var(--app-viewport-height, 100dvh)', background: '#fffaf0', display: 'grid', placeItems: 'center', color: '#050505' }}>RESTORING SESSION...</div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context="Salaryman credentials required. PHONE SYSTEM access locked." />;
  }

  if (planLoading) {
    return (
      <div style={{
         minHeight: 'var(--app-viewport-height, 100dvh)',
        background: slate(0.02),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}>
        <div style={{ textAlign: 'center', color: slate(0.55) }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.2em', marginBottom: 12 }}>VERIFYING ACCESS...</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: slate(0.3), animation: `pulse 1s infinite ${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: 'var(--app-viewport-height, 100dvh)',
      background: '#fffaf0',
      ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
      color: '#111111',
      position: 'relative' }}>

      <div className="calll-home-shell" style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto' }}>
        <div className="calll-home-status" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: `1px solid ${slate(0.08)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Phone size={18} style={{ color: slate(0.7) }} />
            <img
              src={`${BASE}brand/callhome/calll-home-brush.png`}
              alt="CALLL HOME"
              style={{ height: 18, width: 'auto', opacity: 0.7, filter: 'brightness(1.8) saturate(0)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                  background: systemStatus === 'online' && deviceState === 'ready' ? '#111111' : warning(0.7),

                animation: systemStatus === 'online' && deviceState === 'ready' ? 'pulse 2s infinite' : 'none' }} />
                <span style={{ fontSize: '0.52rem', color: '#111111', letterSpacing: '0.08em' }} title={deviceError || undefined}>
                  {callingLabel}
              </span>
            </div>
             {systemStatus === 'online' && deviceState !== 'ready' && (
               <button type="button" onClick={() => void reconnect()} disabled={deviceState === 'initializing'}>
                 {deviceState === 'initializing' ? 'CONNECTING' : 'RECONNECT'}
               </button>
             )}
          </div>
        </div>

        {systemStatus === 'unconfigured' && (
          <div style={{
            margin: '8px 0', padding: '8px 14px',
            background: slate(0.02),
            border: `1px solid ${warning(0.2)}`, borderRadius: 6,
            fontSize: '0.48rem', color: warning(0.7), letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={12} />
            Phone service is temporarily unavailable. The system will keep trying to reconnect.
          </div>
        )}
        {systemStatus === 'no_subscription' && (
          <div style={{
            margin: '8px 0', padding: '8px 14px',
            background: slate(0.02),
            border: `1px solid ${warning(0.2)}`, borderRadius: 6,
            fontSize: '0.48rem', color: warning(0.7), letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={12} />
            Subscription verification failed. Please check your plan or start a free trial.
          </div>
        )}
        {systemStatus === 'restricted' && (
          <div style={{
            margin: '8px 0', padding: '8px 14px',
            background: slate(0.02),
            border: `1px solid ${warning(0.2)}`, borderRadius: 6,
            fontSize: '0.48rem', color: warning(0.7), letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={12} />
            Platform phone access is restricted for this organization. Connect your own Twilio credentials in Settings to enable browser calling.
          </div>
        )}

        <div className="calll-home-tabs" style={{
           display: 'grid',
           gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
           gap: 6,
           margin: '10px 0 16px',
           padding: 8,
           border: `1px solid ${slate(0.12)}`,
           borderRadius: 8,
           background: slate(0.035),
           position: 'relative' }}>
          {visibleTabs.map(t => {
            const isActive = activeTab === t.key;
            const emphasized = t.emphasized;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                data-testid={`tab-${t.key}`}
                style={{
                   minHeight: 42,
                   padding: '9px 12px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: isActive
                     ? (emphasized ? 'rgba(56,189,248,.18)' : 'rgba(56,189,248,.12)')
                     : (emphasized ? slate(0.055) : slate(0.025)),
                   border: `1px solid ${isActive ? 'rgba(56,189,248,.42)' : slate(0.12)}`,
                   borderRadius: 6,
                   color: isActive ? '#dff8ff' : (emphasized ? slate(0.82) : slate(0.68)),
                   fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
                  cursor: 'pointer',
                  ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                  transition: 'all 0.15s',
                   whiteSpace: 'nowrap',
                   textAlign: 'left',
                   flexShrink: 0,
                   }}
              >
                {t.icon} {t.label}
              </button>
            );
          })}

           {/* Keep visibility controls in the same readable menu, away from
               the feature buttons. */}
          <div ref={tabSettingsRef} style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setShowTabSettings(s => !s)}
              data-testid="button-tab-settings"
              title="Show / hide tabs"
              style={{
                 minHeight: 42, padding: '9px 12px',
                display: 'flex', alignItems: 'center', gap: 4,
                background: showTabSettings ? slate(0.05) : 'transparent',
                border: 'none',
                 color: showTabSettings ? slate(0.95) : slate(0.7),
                 fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
                cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                transition: 'color 0.15s, background 0.15s',
                whiteSpace: 'nowrap' }}
            >
              <Settings2 size={12} /> MORE
            </button>

            {showTabSettings && (
              <div
                role="menu"
                data-testid="tab-settings-menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                  minWidth: 220,
                  background: slate(0.96),
                  border: `1px solid ${slate(0.18)}`,
                  borderRadius: 6,

                  padding: '8px 0',
                  ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                  backdropFilter: 'blur(8px)' }}
              >
                <div style={{
                  padding: '4px 12px 8px',
                  fontSize: '0.4rem', letterSpacing: '0.18em',
                  color: slate(0.5),
                  borderBottom: `1px solid ${slate(0.08)}`,
                  marginBottom: 6 }}>
                  MORE PHONE TOOLS
                </div>
                {TABS.filter(t => !PRIMARY_TABS.has(t.key)).map(t => {
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        setActiveTab(t.key);
                        setShowTabSettings(false);
                      }}
                      data-testid={`menu-tab-${t.key}`}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px',
                        background: 'transparent', border: 'none',
                        color: activeTab === t.key ? '#dff8ff' : slate(0.85),
                        fontSize: '0.5rem', letterSpacing: '0.1em',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s, color 0.1s',
                        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
                      onMouseEnter={e => { e.currentTarget.style.background = slate(0.04); }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                        {t.icon} {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ paddingBottom: 'calc(48px + var(--app-safe-bottom))' }}>
            <CalllHomeProvider switchTab={setActiveTab}>
              <Suspense fallback={
                <div style={{
                  padding: '80px 0', textAlign: 'center',
                  fontSize: '0.55rem', color: slate(0.55), letterSpacing: '0.15em' }}>
                  LOADING {TABS.find(t => t.key === activeTab)?.label}...
                </div>
              }>
                {telephonyLocked ? (
                  <div style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
                    <Lock size={28} style={{ color: warning(0.7), marginBottom: 16 }} />
                    <div style={{ fontSize: '0.9rem', color: slate(0.9), letterSpacing: '0.12em', marginBottom: 10 }}>CALLL HOME — ACCESS REQUIRED</div>
                    <div style={{ fontSize: '0.55rem', color: slate(0.55), lineHeight: 1.7, marginBottom: 22 }}>
                      Phone features require access.
                    </div>
                    <button onClick={() => openPledgePopup({ reason: 'Unlock the Phone System with a Stripe-backed pass or PABLO PRIME.' })} style={{ padding: '11px 22px', fontSize: '0.58rem', letterSpacing: '0.14em', background: slate(0.04), border: `1px solid ${warning(0.35)}`, color: warning(0.9), borderRadius: 8, cursor: 'pointer' }}>
                      VIEW PHONE ACCESS OPTIONS
                    </button>
                  </div>
                ) : (
                  <TabContent tab={activeTab} aiSubMode={aiSubMode} setAiSubMode={setAiSubMode} />
                )}
              </Suspense>
            </CalllHomeProvider>
        </div>

      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes waveform { 0% { height: 20%; } 25% { height: 60%; } 50% { height: 35%; } 75% { height: 80%; } 100% { height: 20%; } }
        .calll-home-shell { padding-left: max(12px, var(--app-safe-left)); padding-right: max(12px, var(--app-safe-right)); }
        @media (max-width: 640px) {
          .calll-home-status {
            align-items: flex-start !important;
            gap: 8px;
            flex-wrap: wrap;
          }
          .calll-home-status > div {
            min-width: 0;
            flex-wrap: wrap;
            gap: 8px !important;
          }
           .calll-home-tabs {
             display: grid !important;
             grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
             overflow: visible;
            padding: 6px !important;
          }
          .calll-home-tabs > button {
             width: 100%;
            min-height: 44px !important;
          }
          .calll-home-tabs > div:last-child {
             grid-column: 1 / -1;
             margin-left: 0 !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .calll-home-shell * { animation: none !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
