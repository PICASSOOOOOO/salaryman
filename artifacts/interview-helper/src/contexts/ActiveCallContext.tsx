import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import {
  loadActiveCalls, saveActiveCalls,
  type ActiveCall, ENDED_STATUSES, callStatusToSignalLevel,
} from '@/lib/phone-utils';
import { apiFetch } from '@/lib/api-client';
import { disconnectLocalDeviceCalls } from '@/lib/twilio-device-bridge';
import { reconcilePolledCalls } from '@/lib/phone-outbound';
import { setPhoneBusy } from '@/lib/phone-busy';

export interface CallActionResult {
  ok: boolean;
  status?: number;
  error?: string;
}

interface ActiveCallContextValue {
  activeCalls: ActiveCall[];
  setActiveCalls: React.Dispatch<React.SetStateAction<ActiveCall[]>>;
  toggleMute: (sid: string, currentMuted: boolean) => Promise<CallActionResult>;
  toggleHold: (sid: string, currentHold: boolean) => Promise<CallActionResult>;
  transferCall: (sid: string, transferNumber: string) => Promise<CallActionResult>;
  hangupOne: (sid: string) => Promise<CallActionResult>;
  hangupAll: () => Promise<CallActionResult>;
}

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null);

export function useActiveCallContext() {
  const ctx = useContext(ActiveCallContext);
  if (!ctx) throw new Error('useActiveCallContext must be used within ActiveCallProvider');
  return ctx;
}

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>(() => loadActiveCalls());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const activeCallsRef = useRef<ActiveCall[]>(activeCalls);
  activeCallsRef.current = activeCalls;

  useEffect(() => { saveActiveCalls(activeCalls); }, [activeCalls]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollInFlightRef.current = false;
  }, []);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      setActiveCalls(prev => prev.map(c => ({
        ...c,
        elapsed: Math.floor((Date.now() - c.startTime) / 1000),
      })));
    }, 1000);

    pollRef.current = setInterval(async () => {
      if (pollInFlightRef.current) return;
      const current = activeCallsRef.current.filter(c => c.callSid && !ENDED_STATUSES.includes(c.status));
      if (current.length === 0) {
        stopPolling();
        return;
      }
      pollInFlightRef.current = true;
      try {
        const callSids = current.map(c => c.callSid);
        const r = await apiFetch('/api/twilio/call-status-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSids }),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.statuses) {
          setActiveCalls(prev => reconcilePolledCalls(prev, d.statuses, ENDED_STATUSES).map(ac => ({
            ...ac,
            signalLevel: callStatusToSignalLevel(ac.status),
          })));
        }
      } catch (e) {
        console.warn('[ActiveCallContext] poll error:', e instanceof Error ? e.message : e);
      } finally {
        pollInFlightRef.current = false;
      }
    }, 3000);
  }, [stopPolling]);

  const liveCount = activeCalls.filter(c => !ENDED_STATUSES.includes(c.status)).length;

  // Phone takes precedence over the media player. Whenever any call is live,
  // tell the global phone-busy bus so the music player pauses.
  useEffect(() => {
    setPhoneBusy('active-call', liveCount > 0);
    return () => { setPhoneBusy('active-call', false); };
  }, [liveCount]);

  useEffect(() => {
    if (liveCount > 0 && !timerRef.current) {
      startPolling();
    } else if (liveCount === 0 && timerRef.current) {
      stopPolling();
    }
  }, [liveCount, startPolling, stopPolling]);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  const handleResponse = useCallback(async (r: Response, label: string): Promise<CallActionResult> => {
    if (r.ok) return { ok: true };
    const d = await r.json().catch(() => ({}));
    const error = d.error || `${label} failed (${r.status})`;
    console.warn(`[ActiveCallContext] ${label}:`, error);
    return { ok: false, status: r.status, error };
  }, []);

  const toggleMute = useCallback(async (sid: string, currentMuted: boolean): Promise<CallActionResult> => {
    try {
      const r = await apiFetch(`/api/twilio/call/${sid}/mute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: !currentMuted }),
      });
      if (r.ok) {
        setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, muted: !currentMuted } : c));
      }
      return handleResponse(r, 'mute');
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      console.warn('[ActiveCallContext] mute error:', error);
      return { ok: false, error };
    }
  }, [handleResponse]);

  const toggleHold = useCallback(async (sid: string, currentHold: boolean): Promise<CallActionResult> => {
    try {
      const r = await apiFetch(`/api/twilio/call/${sid}/hold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold: !currentHold }),
      });
      if (r.ok) {
        setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, onHold: !currentHold } : c));
      }
      return handleResponse(r, 'hold');
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      console.warn('[ActiveCallContext] hold error:', error);
      return { ok: false, error };
    }
  }, [handleResponse]);

  const transferCall = useCallback(async (sid: string, transferNumber: string): Promise<CallActionResult> => {
    if (!transferNumber.trim()) return { ok: false, error: 'No transfer number' };
    try {
      const r = await apiFetch(`/api/twilio/call/${sid}/transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferTo: transferNumber }),
      });
      if (r.ok) {
        setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'transferred' } : c));
      }
      return handleResponse(r, 'transfer');
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      console.warn('[ActiveCallContext] transfer error:', error);
      return { ok: false, error };
    }
  }, [handleResponse]);

  const hangupOne = useCallback(async (sid: string): Promise<CallActionResult> => {
    try {
      // Tear down browser-side WebRTC leg first so the user's mic releases
      // immediately even if the API call is slow.
      const wasLastLive = activeCallsRef.current.filter(c => !ENDED_STATUSES.includes(c.status)).length <= 1;
      if (wasLastLive) disconnectLocalDeviceCalls();
      const r = await apiFetch(`/api/twilio/hangup/${sid}`, { method: 'POST' });
      if (r.ok) {
        setActiveCalls(prev => prev.map(c => c.callSid === sid ? { ...c, status: 'completed' } : c));
      }
      return handleResponse(r, 'hangup');
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      console.warn('[ActiveCallContext] hangup error:', error);
      return { ok: false, error };
    }
  }, [handleResponse]);

  const hangupAll = useCallback(async (): Promise<CallActionResult> => {
    const sids = activeCallsRef.current.filter(c => !ENDED_STATUSES.includes(c.status)).map(c => c.callSid);
    if (sids.length === 0) return { ok: true };
    // Always disconnect the local WebRTC leg on hangup-all.
    disconnectLocalDeviceCalls();
    try {
      const r = await apiFetch('/api/twilio/hangup-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callSids: sids }),
      });
      if (r.ok) {
        setActiveCalls(prev => prev.map(c => ({ ...c, status: 'completed' })));
      }
      return handleResponse(r, 'hangup-all');
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Network error';
      console.warn('[ActiveCallContext] hangup-all error:', error);
      return { ok: false, error };
    }
  }, [handleResponse]);

  return (
    <ActiveCallContext.Provider value={{
      activeCalls, setActiveCalls,
      toggleMute, toggleHold, transferCall, hangupOne, hangupAll,
    }}>
      {children}
    </ActiveCallContext.Provider>
  );
}
