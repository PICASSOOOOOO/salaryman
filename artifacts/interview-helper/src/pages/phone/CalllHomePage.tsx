import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Phone, Users, Zap, Clock, Voicemail, Radio, Bot, AlertTriangle, Lock, Headphones, Activity, Mic, Settings2, MessageSquare, Hash } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { SignInPage } from '@/components/SignInPrompt';
import { slate, warning } from '@/lib/phone-utils';
import { usePlan } from '@/hooks/use-plan';
import { CalllHomeProvider, type TabKey } from './CalllHomeContext';
import { CommsEmbedded, type CommsSection } from '@/pages/Comms';
import { useCommsSummary } from '@/hooks/use-comms-summary';
import { usePledgePopup } from '@/components/PledgeStorePopup';
import { useAlpha } from '@/hooks/use-alpha';

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
  { key: 'contacts', label: 'CRM', icon: <Users size={12} /> },
  { key: 'sms', label: 'SMS', icon: <MessageSquare size={12} /> },
  { key: 'numbers', label: 'NUMBERS', icon: <Hash size={12} /> },
  { key: 'log', label: 'CALL LOG', icon: <Clock size={12} /> },
  { key: 'rec', label: 'RECORDINGS', icon: <Mic size={12} /> },
  { key: 'chat', label: 'CHAT', icon: <MessageSquare size={12} /> },
  { key: 'associates', label: 'ASSOCIATES', icon: <Users size={12} /> },
  { key: 'orgs', label: 'ORGS', icon: <Hash size={12} /> },
  { key: 'responders', label: 'RESPONDERS', icon: <Radio size={12} /> },
  { key: 'vm', label: 'VM', icon: <Voicemail size={12} /> },
  { key: 'conf', label: 'CONF', icon: <Users size={12} /> },
  { key: 'ai', label: 'AI', icon: <Bot size={12} /> },
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
    case 'chat':
    case 'associates':
    case 'orgs':
    case 'responders':
      return <CommsEmbedded section={tab as CommsSection} />;
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

const VALID_TABS = new Set<TabKey>(['chat','associates','orgs','responders','cmd','contacts','dial','live','log','rec','vm','conf','auto','ai','cc','sms','numbers']);
const FREE_TABS = new Set<TabKey>(['chat', 'associates', 'orgs', 'responders']);

const PRIMARY_TABS = new Set<TabKey>(['cmd', 'contacts', 'dial', 'chat']);

function getInitialTab(): TabKey {
  const p = new URLSearchParams(window.location.search).get('tab');
  if (p === 'live') return 'cmd';
  return p && VALID_TABS.has(p as TabKey) ? (p as TabKey) : 'cmd';
}

export function isFreePayphoneTab(tab: TabKey): boolean {
  return FREE_TABS.has(tab);
}

export default function CalllHomePage() {

  const [boomerMode] = useBoomerMode();
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const [aiSubMode, setAiSubMode] = useState<AiSubMode>('coach');
  const [showTabSettings, setShowTabSettings] = useState(false);
  const tabSettingsRef = useRef<HTMLDivElement | null>(null);
  const { unreadMessages, pendingRequests } = useCommsSummary();

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

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
  const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'no_subscription' | 'unconfigured'>('checking');
  const BASE = import.meta.env.BASE_URL;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { features, trials, isOwner, loading: planLoading } = usePlan();
  const alpha = useAlpha();
  const { openPledgePopup } = usePledgePopup();

  const hasPhoneAccess = isOwner || features.has('phone_system') || trials.some(t => t.featureKey === 'phone_system');
  const activeTabIsFree = isFreePayphoneTab(activeTab);
  const telephonyLocked = !hasPhoneAccess && !activeTabIsFree;
  const accessSource = new URLSearchParams(window.location.search).get('from');
  const hasPhysicalCommsAccess = accessSource === 'public-floor' || accessSource === 'public-terminal' || accessSource === 'terminal';
  const hasMobileTerminalAccess = accessSource === 'mobile-terminal' &&
    (alpha.isAdmin || alpha.isApprovedDev || alpha.isApprovedTester);
  const hasCommsTerminalAccess = hasPhysicalCommsAccess || hasMobileTerminalAccess;

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })), 1000);
    return () => clearInterval(id);
  }, []);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  useEffect(() => {
    if (!hasPhoneAccess || planLoading) return;
    apiFetch(apiUrl('twilio/system-status'), { credentials: 'include' })
      .then(r => {
        if (r.ok) setSystemStatus('online');
        else if (r.status === 403) setSystemStatus('no_subscription');
        else if (r.status === 503 || r.status === 500) setSystemStatus('unconfigured');
        else setSystemStatus('unconfigured');
      })
      .catch(() => setSystemStatus('unconfigured'));
  }, [apiUrl, hasPhoneAccess, planLoading]);

  if (authLoading) {
    return <div style={{ minHeight: '100vh', background: slate(0.02), display: 'grid', placeItems: 'center', color: slate(0.55) }}>RESTORING SESSION...</div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context="Salaryman credentials required. PHONE SYSTEM access locked." />;
  }

  if (activeTabIsFree && (alpha.loading || planLoading)) {
    return (
      <div style={{ minHeight: '100vh', background: slate(0.02), display: 'grid', placeItems: 'center', color: slate(0.55) }}>
        VERIFYING TERMINAL ACCESS...
      </div>
    );
  }

  if (activeTabIsFree && !hasCommsTerminalAccess) {
    return (
      <div style={{ minHeight: '100vh', background: slate(0.02), display: 'grid', placeItems: 'center', padding: 24, color: slate(0.85) }}>
        <section style={{ width: '100%', maxWidth: 520, border: `1px solid ${slate(0.22)}`, padding: 24, textAlign: 'center' }}>
          <Lock size={28} style={{ margin: '0 auto 12px', color: slate(0.65) }} />
          <h1 style={{ fontSize: '0.9rem', letterSpacing: '0.2em', margin: 0 }}>COMMS TERMINAL REQUIRED</h1>
          <p style={{ fontSize: '0.62rem', color: slate(0.55), lineHeight: 1.7, margin: '12px 0 18px' }}>
            Open Comms from a public payphone or terminal. Remote access is reserved for ADMIN and MOD mobile terminals.
          </p>
          <button
            type="button"
            onClick={() => navigate('/tower/mezzanine?focus=phone')}
            style={{ border: `1px solid ${slate(0.45)}`, background: slate(0.08), color: slate(0.9), padding: '10px 16px', cursor: 'pointer', letterSpacing: '0.12em' }}
          >
            GO TO PUBLIC TERMINAL
          </button>
        </section>
      </div>
    );
  }

  if (planLoading && !activeTabIsFree) {
    return (
      <div style={{
        minHeight: '100vh',
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
      minHeight: '100vh',
      background: slate(0.02),
      ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
      color: slate(0.85),
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
            <span style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.15em' }}>│</span>
            <span style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.15em' }}>EST. 1987</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: systemStatus === 'online' ? slate(0.7) : (systemStatus === 'unconfigured' || systemStatus === 'no_subscription') ? warning(0.7) : slate(0.2),

                animation: systemStatus === 'online' ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.12em' }}>
                {systemStatus === 'online' ? 'ONLINE' : systemStatus === 'unconfigured' ? 'NO CONFIG' : systemStatus === 'no_subscription' ? 'NO ACCESS' : '...'}
              </span>
            </div>
            <span style={{ fontSize: '0.42rem', color: slate(0.55) }}>│</span>
            <span style={{
              fontSize: '0.42rem', color: slate(0.55), letterSpacing: '0.1em',
              padding: '2px 8px', border: `1px solid ${slate(0.12)}`, borderRadius: 3,
              background: slate(0.02) }}>PSO v3</span>
            <span style={{ fontSize: '0.42rem', color: slate(0.55), fontVariantNumeric: 'tabular-nums', letterSpacing: '0.08em' }}>{clock}</span>
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
            const badge = t.key === 'chat' ? unreadMessages : t.key === 'associates' ? pendingRequests : 0;
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
                {badge > 0 && (
                  <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#ef4444', color: '#fff', fontSize: '0.48rem', fontWeight: 700 }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
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
                      Chat and community tools are free. This phone feature requires an active subscription or free trial.
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

        <div style={{
          borderTop: `1px solid ${slate(0.06)}`,
          padding: '8px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.12em' }}>
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
              background: systemStatus === 'online' ? slate(0.4) : warning(0.3) }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes waveform { 0% { height: 20%; } 25% { height: 60%; } 50% { height: 35%; } 75% { height: 80%; } 100% { height: 20%; } }
        .calll-home-shell { padding: 0 clamp(10px, 3.5vw, 16px); }
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
            display: flex !important;
            overflow-x: auto;
            overscroll-behavior-x: contain;
            scroll-snap-type: x proximity;
            scrollbar-width: none;
            padding: 6px !important;
          }
          .calll-home-tabs::-webkit-scrollbar { display: none; }
          .calll-home-tabs > button {
            flex: 0 0 auto !important;
            min-height: 44px !important;
            scroll-snap-align: start;
          }
          .calll-home-tabs > div:last-child {
            position: sticky !important;
            right: 0;
            margin-left: auto !important;
            background: ${slate(0.96)};
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .calll-home-shell * { animation: none !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}
