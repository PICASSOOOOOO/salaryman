import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useBoomerMode } from '@/hooks/use-mobile';
import { Phone, Users, Zap, Clock, Voicemail, Radio, Bot, AlertTriangle, Lock, Headphones, Activity, Mic, EyeOff, Eye, Settings2, MessageSquare, Hash } from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { useLocation } from 'wouter';
import { SignInPage } from '@/components/SignInPrompt';
import { slate, warning } from '@/lib/phone-utils';
import { usePlan } from '@/hooks/use-plan';
import { CalllHomeProvider, type TabKey } from './CalllHomeContext';

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
  { key: 'cmd', label: 'CMD', icon: <Activity size={12} /> },
  { key: 'contacts', label: 'CRM', icon: <Users size={12} /> },
  { key: 'sms', label: 'SMS', icon: <MessageSquare size={12} /> },
  { key: 'numbers', label: 'NUMBERS', icon: <Hash size={12} /> },
  { key: 'rec', label: 'RECORDINGS', icon: <Mic size={12} /> },
  { key: 'log', label: 'LOG', icon: <Clock size={12} /> },
  { key: 'vm', label: 'VM', icon: <Voicemail size={12} /> },
  { key: 'conf', label: 'CONF', icon: <Users size={12} /> },
  { key: 'ai', label: 'AI', icon: <Bot size={12} /> },
  { key: 'cc', label: 'CC', icon: <Headphones size={12} /> },
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

// CMD is the home tab and can never be hidden — it's the always-on landing
// surface for the phone hub and the fallback when a hidden tab was active.
const ALWAYS_VISIBLE_TABS = new Set<TabKey>(['cmd']);
const HIDDEN_TABS_STORAGE_KEY = 'phone.hiddenTabs.v1';

function loadHiddenTabs(): Set<TabKey> {
  try {
    const raw = localStorage.getItem(HIDDEN_TABS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is TabKey => typeof k === 'string' && VALID_TABS.has(k as TabKey) && !ALWAYS_VISIBLE_TABS.has(k as TabKey)));
  } catch {
    return new Set();
  }
}

function saveHiddenTabs(hidden: Set<TabKey>) {
  try {
    localStorage.setItem(HIDDEN_TABS_STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {}
}

function getInitialTab(): TabKey {
  const p = new URLSearchParams(window.location.search).get('tab');
  if (p === 'dial' || p === 'live' || p === 'auto') return 'cmd';
  return p && VALID_TABS.has(p as TabKey) ? (p as TabKey) : 'cmd';
}

export default function CalllHomePage() {

  const [boomerMode] = useBoomerMode();
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const [aiSubMode, setAiSubMode] = useState<AiSubMode>('coach');
  const [hiddenTabs, setHiddenTabs] = useState<Set<TabKey>>(loadHiddenTabs);
  const [showTabSettings, setShowTabSettings] = useState(false);
  const tabSettingsRef = useRef<HTMLDivElement | null>(null);

  const visibleTabs = useMemo(
    () => TABS.filter(t => !hiddenTabs.has(t.key) || ALWAYS_VISIBLE_TABS.has(t.key)),
    [hiddenTabs]
  );

  const toggleTabHidden = useCallback((key: TabKey) => {
    if (ALWAYS_VISIBLE_TABS.has(key)) return;
    setHiddenTabs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveHiddenTabs(next);
      return next;
    });
  }, []);

  const resetTabVisibility = useCallback(() => {
    setHiddenTabs(new Set());
    saveHiddenTabs(new Set());
  }, []);

  // If the active tab gets hidden, slide the user back to CMD so they
  // never end up staring at content that's no longer reachable from the
  // tab bar.
  useEffect(() => {
    if (hiddenTabs.has(activeTab) && !ALWAYS_VISIBLE_TABS.has(activeTab)) {
      setActiveTab('cmd');
    }
  }, [hiddenTabs, activeTab]);

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
    fetch(apiUrl('twilio/phone-numbers'), { credentials: 'include' })
      .then(r => {
        if (r.ok) setSystemStatus('online');
        else if (r.status === 403) setSystemStatus('no_subscription');
        else if (r.status === 503 || r.status === 500) setSystemStatus('unconfigured');
        else setSystemStatus('unconfigured');
      })
      .catch(() => setSystemStatus('unconfigured'));
  }, [apiUrl, hasPhoneAccess, planLoading]);

  if (!isAuthenticated) {
    return <SignInPage context="Salaryman credentials required. PHONE SYSTEM access locked." />;
  }

  if (planLoading) {
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

  if (!hasPhoneAccess) {
    return (
      <div style={{
        minHeight: '100vh',
        background: slate(0.02),
        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          maxWidth: 480, width: '100%', margin: '0 auto', padding: 32, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: slate(0.02),
            border: `1px solid ${warning(0.25)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px' }}>
            <Lock size={28} style={{ color: warning(0.7) }} />
          </div>
          <div style={{ fontSize: '1.1rem', color: slate(0.85), marginBottom: 8, letterSpacing: '0.1em' }}>
            CALLL HOME — ACCESS REQUIRED
          </div>
          <div style={{ fontSize: '0.55rem', color: slate(0.55), lineHeight: 1.7, marginBottom: 24 }}>
            The Calll Home phone system requires an active subscription or free trial.
            Start your 7-day free trial to get full access to the dialer, call history, voicemail, and all phone features.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => navigate('/upgrade')}
              style={{
                padding: '12px 24px', fontSize: '0.6rem', letterSpacing: '0.15em',
                background: slate(0.02),
                border: `1px solid ${warning(0.35)}`,
                color: warning(0.9), borderRadius: 8, cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),

                transition: 'all 0.2s' }}
            >
              START 7-DAY FREE TRIAL
            </button>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                padding: '10px 24px', fontSize: '0.55rem', letterSpacing: '0.12em',
                background: 'transparent',
                border: `1px solid ${slate(0.15)}`,
                color: slate(0.55), borderRadius: 8, cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                transition: 'all 0.2s' }}
            >
              VIEW SUBSCRIPTION PLANS
            </button>
          </div>
          <div style={{ marginTop: 20, fontSize: '0.42rem', color: slate(0.55) }}>
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
      background: slate(0.02),
      ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
      color: slate(0.85),
      position: 'relative' }}>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, margin: '0 auto', padding: '0 16px' }}>
        <div style={{
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
            Twilio not configured — contact admin to set up Twilio credentials.
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

        <div style={{
          display: 'flex', gap: 0, borderBottom: `1px solid ${slate(0.08)}`,
          overflowX: 'auto', scrollbarWidth: 'none',
          margin: '0 -16px', padding: '0 16px',
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
                  padding: '9px 14px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: isActive
                    ? (emphasized ? slate(0.1) : slate(0.05))
                    : (emphasized ? slate(0.025) : 'transparent'),
                  borderBottom: `2px solid ${isActive ? slate(0.5) : (emphasized ? slate(0.18) : 'transparent')}`,
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  color: isActive ? slate(0.95) : (emphasized ? slate(0.7) : slate(0.3)),
                  fontSize: '0.45rem', letterSpacing: '0.12em',
                  cursor: 'pointer',
                  ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                   }}
              >
                {t.icon} {t.label}
              </button>
            );
          })}

          {/* Tab visibility settings — gear at the right end of the tab bar.
              Lets the user hide tabs they don't use. CMD is always visible. */}
          <div ref={tabSettingsRef} style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setShowTabSettings(s => !s)}
              data-testid="button-tab-settings"
              title="Show / hide tabs"
              style={{
                padding: '9px 12px',
                display: 'flex', alignItems: 'center', gap: 4,
                background: showTabSettings ? slate(0.05) : 'transparent',
                border: 'none',
                color: showTabSettings ? slate(0.85) : slate(0.35),
                fontSize: '0.45rem', letterSpacing: '0.12em',
                cursor: 'pointer',
                ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }),
                transition: 'color 0.15s, background 0.15s',
                whiteSpace: 'nowrap' }}
            >
              <Settings2 size={12} /> TABS
              {hiddenTabs.size > 0 && (
                <span style={{
                  marginLeft: 4,
                  fontSize: '0.4rem', color: warning(0.85),
                  padding: '1px 5px', borderRadius: 3,
                  background: warning(0.08), border: `1px solid ${warning(0.2)}` }}>
                  {hiddenTabs.size} HIDDEN
                </span>
              )}
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
                  SHOW / HIDE TABS
                </div>
                {TABS.map(t => {
                  const hidden = hiddenTabs.has(t.key);
                  const locked = ALWAYS_VISIBLE_TABS.has(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleTabHidden(t.key)}
                      disabled={locked}
                      data-testid={`tab-toggle-${t.key}`}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px',
                        background: 'transparent', border: 'none',
                        color: locked ? slate(0.25) : (hidden ? slate(0.35) : slate(0.85)),
                        fontSize: '0.5rem', letterSpacing: '0.1em',
                        cursor: locked ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        opacity: hidden ? 0.6 : 1,
                        transition: 'background 0.1s, color 0.1s',
                        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
                      onMouseEnter={e => { if (!locked) e.currentTarget.style.background = slate(0.04); }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ width: 14, display: 'flex', alignItems: 'center', color: hidden ? slate(0.3) : slate(0.6) }}>
                        {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                        {t.icon} {t.label}
                      </span>
                      {locked && (
                        <span style={{ fontSize: '0.38rem', color: slate(0.55), letterSpacing: '0.15em' }}>LOCKED</span>
                      )}
                    </button>
                  );
                })}
                {hiddenTabs.size > 0 && (
                  <div style={{ borderTop: `1px solid ${slate(0.08)}`, marginTop: 6, paddingTop: 6 }}>
                    <button
                      onClick={resetTabVisibility}
                      data-testid="button-tab-reset"
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        background: 'transparent', border: 'none',
                        color: warning(0.7),
                        fontSize: '0.45rem', letterSpacing: '0.12em',
                        cursor: 'pointer', textAlign: 'left',
                        ...(boomerMode ? {} : { fontFamily: "var(--font-sans)" }) }}
                      onMouseEnter={e => { e.currentTarget.style.background = slate(0.04); }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      ↺ SHOW ALL TABS
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ paddingBottom: 48 }}>
            <CalllHomeProvider switchTab={setActiveTab}>
              <Suspense fallback={
                <div style={{
                  padding: '80px 0', textAlign: 'center',
                  fontSize: '0.55rem', color: slate(0.55), letterSpacing: '0.15em' }}>
                  LOADING {TABS.find(t => t.key === activeTab)?.label}...
                </div>
              }>
                <TabContent tab={activeTab} aiSubMode={aiSubMode} setAiSubMode={setAiSubMode} />
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
      `}</style>
    </div>
  );
}
