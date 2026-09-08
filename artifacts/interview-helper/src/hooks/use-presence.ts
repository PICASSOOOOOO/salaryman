import { apiFetch } from '@/lib/api-client';
import { useEffect, useState, useRef, useCallback } from 'react';

export interface MemberPresence {
  userId: string;
  lastSeenAt: string | null;
  online: boolean;
}

export interface BotPresence {
  id: number;
  name: string;
  status: string;
  online: boolean;
  available: boolean;
}

export interface PresenceData {
  members: MemberPresence[];
  bots: BotPresence[];
  onlineMemberCount: number;
  onlineBotCount: number;
  availableBotCount: number;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const PRESENCE_POLL_MS = 20_000;

export function usePresence(orgId: number | null | undefined) {
  const [data, setData] = useState<PresenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  const sendHeartbeat = useCallback(async () => {
    const id = orgIdRef.current;
    if (!id) return;
    try {
      await apiFetch(`/api/orgs/${id}/heartbeat`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // best-effort
    }
  }, []);

  const fetchPresence = useCallback(async () => {
    const id = orgIdRef.current;
    if (!id) return;
    try {
      const res = await apiFetch(`/api/orgs/${id}/presence`, { credentials: 'include' });
      if (!res.ok) {
        setError(`Presence ${res.status}`);
        return;
      }
      const json = (await res.json()) as PresenceData;
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'presence error');
    }
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    sendHeartbeat();
    fetchPresence();
    const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    const presenceTimer = setInterval(() => {
      if (!cancelled) fetchPresence();
    }, PRESENCE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        fetchPresence();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(heartbeatTimer);
      clearInterval(presenceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [orgId, sendHeartbeat, fetchPresence]);

  return { data, error, refresh: fetchPresence };
}
