import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { MessageSquare, Users, Building2, ArrowRight } from 'lucide-react';
import { useCommsSummary } from '@/hooks/use-comms-summary';
import Colleagues from './Colleagues';
import ColleaguesPanel from './ColleaguesPanel';

type Section = 'chat' | 'associates' | 'orgs';

const TABS: { id: Section; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'CHAT', icon: MessageSquare },
  { id: 'associates', label: 'ASSOCIATES', icon: Users },
  { id: 'orgs', label: 'ORGS', icon: Building2 },
];

export default function Comms() {
  const { isAuthenticated } = useAuth();
  const boomerMode = getDefaultBoomerMode();
  const [, navigate] = useLocation();
  const [section, setSection] = useState<Section>('chat');
  const { unreadMessages, pendingRequests } = useCommsSummary();

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to use Comms.' : 'Salaryman credentials required.'} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0d0a] text-cyan-300 font-mono">
      <div className="max-w-4xl mx-auto w-full">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyan-400" style={{ fontFamily: "'VT323',monospace" }}>
            <MessageSquare className="inline w-5 h-5 mr-2" />
            COMMS HUB
          </h1>
          <p className="text-[10px] tracking-wider text-cyan-400/30 uppercase mt-1">
            CHAT, ASSOCIATES, AND ORGS — ALL YOUR PEOPLE IN ONE PLACE.
          </p>

          <div className="flex gap-1 mt-4 border-b border-cyan-500/10">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = section === tab.id;
              const badge = tab.id === 'chat' ? unreadMessages : tab.id === 'associates' ? pendingRequests : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSection(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs font-mono tracking-widest uppercase border-b-2 -mb-px transition-colors ${
                    active
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-cyan-400/40 hover:text-cyan-300/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {badge > 0 && (
                    <span className="min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {section === 'chat' && (
          <div className="p-6 sm:p-10 text-center">
            <MessageSquare className="w-12 h-12 text-cyan-400/20 mx-auto mb-4" />
            <p className="text-sm text-cyan-200/80 mb-2">Your conversations live in the chat panel.</p>
            <p className="text-[11px] text-cyan-400/40 mb-6 max-w-md mx-auto">
              Talk to coworkers and associates, message Pablo, and attach files from your media library — all in one slide-out panel available anywhere.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('salaryman:open-chat'))}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs tracking-widest uppercase rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              OPEN CHAT <ArrowRight className="w-4 h-4" />
            </button>
          </div>
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
      </div>
    </div>
  );
}
