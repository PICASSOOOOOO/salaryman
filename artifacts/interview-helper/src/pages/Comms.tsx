import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { MessageSquare, Users, Shield, Mic, VolumeX } from 'lucide-react';
import { useCommsSummary } from '@/hooks/use-comms-summary';
import { useAudioSettings } from '@/hooks/use-audio-settings';
import Colleagues from './Colleagues';
import { apiFetch } from '@/lib/api-client';
import { ChatPanel } from '@/components/ChatPanel';

export type CommsSection = 'chat' | 'associates' | 'responders';

interface ResponderEntry {
  rank: number;
  userId: string;
  name: string;
  responseCount: number;
  totalReward: number;
}

const TABS: { id: CommsSection; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'CHAT', icon: MessageSquare },
  { id: 'associates', label: 'ASSOCIATES', icon: Users },
  { id: 'responders', label: 'RESPONDERS', icon: Shield },
];

const EVENT_TYPE_LABEL: Record<string, string> = {
  evt_blackout: '⚡ BLACKOUT',
  evt_fire: '🔥 FIRE',
  evt_medical: '⛑ MEDICAL',
};

function PabloVoiceControl() {
  const { settings, set } = useAudioSettings();
  const enabled = !settings.muted && settings.voice > 0;
  return (
    <section className="mx-4 sm:mx-6 mt-4 rounded-lg border border-black bg-[#fffaf0] px-3 py-2.5" data-testid="comms-pablo-voice">
      <div className="flex items-center gap-2">
        {enabled ? <Mic className="h-3.5 w-3.5 text-black" /> : <VolumeX className="h-3.5 w-3.5 text-black" />}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[.08em] text-black">AUDIO REPLIES</div>
        </div>
        <button
          type="button"
          onClick={() => set({ voice: enabled ? 0 : 1 })}
          disabled={settings.muted}
          className="rounded border border-black bg-[#fffaf0] px-2 py-1 text-[11px] font-bold tracking-widest text-black disabled:opacity-40"
          data-testid="comms-pablo-voice-toggle"
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          aria-label="Pablo voice volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.voice}
          disabled={settings.muted}
          onChange={(event) => set({ voice: Number(event.target.value) })}
          className="min-w-0 flex-1 accent-black disabled:opacity-40"
          data-testid="comms-pablo-voice-volume"
        />
        <span className="w-8 text-right text-[11px] tabular-nums text-black">{Math.round(settings.voice * 100)}%</span>
      </div>
    </section>
  );
}

export function CommsEmbedded({ section }: { section: CommsSection }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const boomerMode = getDefaultBoomerMode();
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

  if (authLoading) {
    return <div className="grid min-h-[240px] place-items-center font-mono text-xs tracking-[0.2em] text-black">RESTORING SESSION...</div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to use Payphone.' : 'Salaryman credentials required.'} />;
  }

  return (
    <div className="bg-[#fffaf0] text-black font-mono">
      {section === 'chat' && (
          <div className="px-2 sm:px-4"><ChatPanel embedded initiallyOpen /></div>
        )}
        {section === 'associates' && <Colleagues embedded />}

        {section === 'responders' && (
          <div className="px-4 sm:px-6 py-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-black" />
              <h2 className="text-sm tracking-widest uppercase text-black">FIRST RESPONDER LEADERBOARD</h2>
              <span className="text-[10px] tracking-widest text-black uppercase ml-auto">THIS WEEK</span>
            </div>
            <p className="text-xs text-black mb-5 tracking-wider">
              PLAYERS WHO RESPONDED TO WORLD EMERGENCIES — BLACKOUTS, FIRES, AND MEDICAL CRISES.
            </p>

            {respondersLoading ? (
              <div className="text-center text-black text-xs tracking-widest py-12 animate-pulse">LOADING…</div>
            ) : responders.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-10 h-10 text-black mx-auto mb-3" />
                <div className="text-[11px] text-black tracking-widest">NO RESPONSES RECORDED THIS WEEK.</div>
                <div className="text-[10px] text-black tracking-wider mt-1">EMERGENCIES SPAWN IN THE CITY. PRESS [E] NEAR AN EVENT BEACON TO RESPOND.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {responders.map((r, i) => (
                  <div key={r.userId} className="flex items-center gap-3 p-3 rounded-lg border border-black bg-[#fffaf0]">
                    <div className="text-lg font-mono font-bold text-black" style={{ minWidth: 28, fontFamily: "var(--font-sans)", fontSize: '1.3rem' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-black tracking-widest truncate" style={{ fontFamily: "var(--font-sans)", fontSize: '1rem' }}>{r.name}</div>
                      <div className="text-[10px] text-black tracking-wider mt-0.5">
                        {r.responseCount} RESPONSE{r.responseCount !== 1 ? 'S' : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-black font-mono tracking-widest">
                        ƒ{r.totalReward.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-black tracking-wider">EARNED</div>
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
  const { unreadMessages, pendingRequests } = useCommsSummary();
  const tabs = TABS;
  return (
    <div className="comms-page min-h-screen bg-[#fffaf0] text-black font-sans">
      <div className="max-w-4xl mx-auto w-full">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black" style={{ fontFamily: "var(--font-sans)" }}>
            <MessageSquare className="inline w-5 h-5 mr-2" /> COMMS
          </h1>
          <p className="text-xs tracking-wider text-black uppercase mt-1">
            Chat and associates.
          </p>
          <div className="flex gap-1 mt-4 border-b border-black overflow-x-auto scrollbar-hide">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const badge = tab.id === 'chat' ? unreadMessages : tab.id === 'associates' ? pendingRequests : 0;
              return (
                <button key={tab.id} onClick={() => setSection(tab.id)}
                  className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 text-xs font-mono tracking-widest uppercase border-b-2 -mb-px transition-colors ${section === tab.id ? 'border-black text-black font-bold' : 'border-transparent text-black'}`}>
                  <Icon className="w-3.5 h-3.5" /> {tab.label}
                  {badge > 0 && <span className="min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1">{badge > 99 ? '99+' : badge}</span>}
                </button>
              );
            })}
          </div>
          <PabloVoiceControl />
        </div>
        <CommsEmbedded section={section} />
      </div>
    </div>
  );
}
