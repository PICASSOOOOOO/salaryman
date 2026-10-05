import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { SignInPage } from '@/components/SignInPrompt';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { MessageSquare, Users, Shield, Mic, VolumeX } from 'lucide-react';
import { useCommsSummary } from '@/hooks/use-comms-summary';
import { useAudioSettings } from '@/hooks/use-audio-settings';
import Colleagues from './Colleagues';
import { apiFetch } from '@/lib/api-client';
import { takePendingCommsDmUserId } from '@/lib/comms-navigation';
import { ChatPanel } from '@/components/ChatPanel';

export type CommsSection = 'chat' | 'sms' | 'associates' | 'responders';

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
  { id: 'responders', label: 'RESPONDERS', icon: Shield },
];

function PabloVoiceControl() {
  const { settings, set } = useAudioSettings();
  const enabled = !settings.muted && settings.voice > 0;
  return (
    <div className="flex items-center gap-4 py-2 w-full sm:w-[240px]" data-testid="comms-pablo-voice">
      <button
        type="button"
        onClick={() => set({ voice: enabled ? 0 : 1 })}
        disabled={settings.muted}
        className={`flex h-6 items-center justify-center gap-1.5 rounded-sm border px-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 transition-colors ${
          enabled ? 'border-emerald-600 bg-emerald-600/10 text-emerald-700' : 'border-black text-black hover:bg-black/5'
        }`}
        data-testid="comms-pablo-voice-toggle"
      >
        {enabled ? <Mic className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
        AUDIO
      </button>
      <div className="flex flex-1 items-center gap-2">
        <input
          aria-label="Pablo voice volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.voice}
          disabled={settings.muted || !enabled}
          onChange={(event) => set({ voice: Number(event.target.value) })}
          className="flex-1 accent-emerald-600 disabled:opacity-40"
          style={{ height: '4px' }}
          data-testid="comms-pablo-voice-volume"
        />
        <span className="w-8 text-right text-[10px] font-mono text-black/60">{Math.round(settings.voice * 100)}%</span>
      </div>
    </div>
  );
}

export function CommsEmbedded({
  section,
  initialDmUserId,
  initialDmRequestId,
}: {
  section: CommsSection;
  initialDmUserId?: string;
  initialDmRequestId?: number;
}) {
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
    return <div className="grid min-h-[240px] place-items-center font-mono text-[10px] uppercase tracking-widest text-black/40">Restoring session...</div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to use Payphone.' : 'Salaryman credentials required.'} />;
  }

  return (
    <div className="flex-1 flex flex-col bg-[#fffaf0] text-black">
      {section === 'chat' && (
        <ChatPanel
          embedded
          initiallyOpen
          initialDmUserId={initialDmUserId}
          initialDmRequestId={initialDmRequestId}
        />
      )}
      {section === 'sms' && (
        <div className="flex-1 grid place-items-center p-6">
          <a
            href="/phone/sms"
            className="border border-black px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-[#fffaf0]"
          >
            Open SMS
          </a>
        </div>
      )}
      {section === 'associates' && <Colleagues embedded />}
      {section === 'responders' && (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-black pb-2 mb-4 gap-2">
            <h2 className="text-[10px] font-bold tracking-widest uppercase text-black flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              First Responder Leaderboard
            </h2>
            <span className="text-[10px] font-mono text-emerald-700 font-bold">THIS WEEK</span>
          </div>

          {respondersLoading ? (
            <div className="text-center font-mono text-[10px] uppercase tracking-widest text-black/40 py-12">Loading...</div>
          ) : responders.length === 0 ? (
            <div className="text-center py-12 border border-black/10 bg-black/5">
              <div className="text-[10px] font-mono text-black/60 uppercase tracking-widest">No responses recorded</div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-2 py-1.5 border-b border-black/10 text-[9px] font-bold tracking-widest text-black/40 uppercase">
                <div className="w-6 text-center">RK</div>
                <div className="flex-1">Operative</div>
                <div className="w-16 text-right">RSP</div>
                <div className="w-24 text-right">Yield</div>
              </div>
              {responders.map((r, i) => (
                <div key={r.userId} className="flex items-center gap-3 px-2 py-1.5 border border-transparent hover:border-black/10 hover:bg-black/5 transition-colors">
                  <div className="w-6 text-center font-mono text-[10px] font-bold text-black/40">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-black truncate uppercase tracking-wide">{r.name}</div>
                  </div>
                  <div className="w-16 text-right font-mono text-[10px] text-black/60">
                    {r.responseCount}
                  </div>
                  <div className="w-24 text-right font-mono text-[10px] font-bold text-emerald-700">
                    ƒ{r.totalReward.toLocaleString()}
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
  const [initialDmUserId, setInitialDmUserId] = useState<string>();
  const [initialDmRequestId, setInitialDmRequestId] = useState(0);
  const { unreadMessages, unreadSms, pendingRequests } = useCommsSummary();

  useEffect(() => {
    const queuedUserId = takePendingCommsDmUserId();
    if (queuedUserId) {
      setInitialDmUserId(queuedUserId);
      setInitialDmRequestId((current) => current + 1);
      setSection('chat');
    }

    const onOpenChat = () => setSection('chat');
    const onOpenDm = (event: Event) => {
      const eventUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId?.trim();
      const queued = takePendingCommsDmUserId();
      const userId = eventUserId || queued;
      if (userId) {
        setInitialDmUserId(userId);
        setInitialDmRequestId((current) => current + 1);
      }
      setSection('chat');
    };

    window.addEventListener('salaryman:open-chat', onOpenChat);
    window.addEventListener('salaryman:open-dm', onOpenDm as EventListener);
    return () => {
      window.removeEventListener('salaryman:open-chat', onOpenChat);
      window.removeEventListener('salaryman:open-dm', onOpenDm as EventListener);
    };
  }, []);

  return (
    <div className="comms-page min-h-[100dvh] flex flex-col bg-[#fffaf0] text-black font-sans">
      <div className="border-b border-black shrink-0 bg-[#fffaf0]">
        <div className="max-w-5xl mx-auto w-full px-4 pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-black flex items-center gap-2 uppercase">
                <MessageSquare className="w-5 h-5" /> Comms
              </h1>
            </div>
            <div className="w-full sm:w-auto shrink-0 flex sm:justify-end">
              <PabloVoiceControl />
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto scrollbar-hide">
            {TABS.map(tab => {
              const badge =
                tab.id === 'chat'
                  ? unreadMessages
                  : tab.id === 'sms'
                    ? unreadSms
                    : tab.id === 'associates'
                      ? pendingRequests
                      : 0;
              const active = section === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSection(tab.id)}
                  className={`relative pb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
                    active ? 'text-black' : 'text-black/40 hover:text-black/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {badge > 0 && (
                    <span className="flex h-3.5 min-w-[14px] items-center justify-center rounded-sm bg-emerald-600 px-1 font-mono text-[9px] font-bold text-[#fffaf0]">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {active && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full relative">
        <CommsEmbedded
          section={section}
          initialDmUserId={initialDmUserId}
          initialDmRequestId={initialDmRequestId}
        />
      </div>
    </div>
  );
}
