import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { MessageSquare, Users, Building2, ArrowRight, Shield } from 'lucide-react';
import { useCommsSummary } from '@/hooks/use-comms-summary';
import Colleagues from './Colleagues';
import ColleaguesPanel from './ColleaguesPanel';
import { apiFetch } from '@/lib/api-client';
import { ChatPanel } from '@/components/ChatPanel';
import PhoneSmsPage from './phone/PhoneSmsPage';

export type CommsSection = 'chat' | 'sms' | 'associates' | 'orgs' | 'responders';

interface ResponderEntry {
  rank: number;
  userId: string;
  name: string;
  responseCount: number;
  totalReward: number;
}

const TABS: { id: CommsSection; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'CHAT', icon: MessageSquare },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'associates', label: 'ASSOCIATES', icon: Users },
  { id: 'orgs', label: 'ORGS', icon: Building2 },
  { id: 'responders', label: 'RESPONDERS', icon: Shield },
];

const EVENT_TYPE_LABEL: Record<string, string> = {
  evt_blackout: '⚡ BLACKOUT',
  evt_fire: '🔥 FIRE',
  evt_medical: '⛑ MEDICAL',
};

export function CommsEmbedded({ section }: { section: CommsSection }) {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const [, navigate] = useLocation();
  const [responders, setResponders] = useState<ResponderEntry[]>([]);
  const [respondersLoading, setRespondersLoading] = useState(false);

  useEffect(() => {
    if (section !== 'responders' || !isAuthenticated) return;
    setRespondersLoading(true);
    apiFetch('/api/events/responders/weekly')
      .then(r => r.ok ? r.json() : { responders: [] })
      .then(d => setResponders(d.leaderboard ?? []))
      .catch(() => setResponders([]))
      .finally(() => setRespondersLoading(false));
  }, [section, isAuthenticated]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to use Payphone.' : 'Salaryman credentials required.'} />;
  }

  return (
    <div className="text-cyan-300 font-mono">
      {section === 'chat' && (
          <div className="px-2 sm:px-4"><ChatPanel embedded initiallyOpen /></div>
        )}
        {section === 'sms' && (
          <div className="px-2 sm:px-4 py-3"><PhoneSmsPage /></div>
        )}

        {section === 'associates' && <Colleagues embedded />}

        {section === 'orgs' && (
          <div>
            <ColleaguesPanel />
            <div className="px-4 pb-8 max-w-4xl mx-auto w-full">
              <button
                onClick={() => navigate('/business/team')}
                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] tracking-widest uppercase rounded-lg border border-cyan-500/20 text-cyan-300/70 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors"
              >
                GO TO BUSINESS <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {section === 'responders' && (
          <div className="px-4 sm:px-6 py-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-cyan-400/60" />
              <h2 className="text-sm tracking-widest uppercase text-cyan-300">FIRST RESPONDER LEADERBOARD</h2>
              <span className="text-[9px] tracking-widest text-cyan-400/30 uppercase ml-auto">THIS WEEK</span>
            </div>
            <p className="text-[10px] text-cyan-400/30 mb-5 tracking-wider">
              PLAYERS WHO RESPONDED TO WORLD EMERGENCIES — BLACKOUTS, FIRES, AND MEDICAL CRISES.
            </p>

            {respondersLoading ? (
              <div className="text-center text-cyan-400/30 text-xs tracking-widest py-12 animate-pulse">LOADING…</div>
            ) : responders.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-10 h-10 text-cyan-400/10 mx-auto mb-3" />
                <div className="text-[11px] text-cyan-400/30 tracking-widest">NO RESPONSES RECORDED THIS WEEK.</div>
                <div className="text-[10px] text-cyan-400/20 tracking-wider mt-1">EMERGENCIES SPAWN IN THE CITY. PRESS [E] NEAR AN EVENT BEACON TO RESPOND.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {responders.map((r, i) => (
                  <div key={r.userId} className={`flex items-center gap-3 p-3 rounded-lg border ${i === 0 ? 'border-yellow-500/30 bg-yellow-500/5' : i === 1 ? 'border-cyan-400/20 bg-cyan-400/5' : i === 2 ? 'border-orange-500/20 bg-orange-500/5' : 'border-white/5 bg-white/2'}`}>
                    <div className={`text-lg font-mono font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-cyan-300' : i === 2 ? 'text-orange-400' : 'text-cyan-400/40'}`} style={{ minWidth: 28, fontFamily: "var(--font-sans)", fontSize: '1.3rem' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-cyan-200 tracking-widest truncate" style={{ fontFamily: "var(--font-sans)", fontSize: '1rem' }}>{r.name}</div>
                      <div className="text-[9px] text-cyan-400/40 tracking-wider mt-0.5">
                        {r.responseCount} RESPONSE{r.responseCount !== 1 ? 'S' : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-green-400 font-mono tracking-widest">
                        ƒ{r.totalReward.toLocaleString()}
                      </div>
                      <div className="text-[8px] text-cyan-400/25 tracking-wider">EARNED</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
}

export default function Comms() {
  const [section, setSection] = useState<CommsSection>('chat');
  const { unreadMessages, unreadSms, pendingRequests } = useCommsSummary();
  const tabs = TABS;
  return (
    <div className="min-h-screen bg-[#0a0d0a] text-cyan-300 font-mono">
      <div className="max-w-4xl mx-auto w-full">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyan-400" style={{ fontFamily: "var(--font-sans)" }}>
            <MessageSquare className="inline w-5 h-5 mr-2" /> PAYPHONE TERMINAL
          </h1>
          <p className="text-[10px] tracking-wider text-cyan-400/30 uppercase mt-1">
            CHAT, ASSOCIATES, AND ORGS — ALL YOUR PEOPLE IN ONE PLACE.
          </p>
          <div className="flex gap-1 mt-4 border-b border-cyan-500/10 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const badge = tab.id === 'chat' ? unreadMessages : tab.id === 'sms' ? unreadSms : tab.id === 'associates' ? pendingRequests : 0;
              return (
                <button key={tab.id} onClick={() => setSection(tab.id)}
                  className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 text-xs font-mono tracking-widest uppercase border-b-2 -mb-px transition-colors ${section === tab.id ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-cyan-400/40 hover:text-cyan-300/70'}`}>
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                  {badge > 0 && <span className="min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">{badge > 99 ? '99+' : badge}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <CommsEmbedded section={section} />
      </div>
    </div>
  );
}
