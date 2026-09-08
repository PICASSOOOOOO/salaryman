import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

interface CommsSummary {
  unreadMessages: number;
  unreadSms: number;
  pendingRequests: number;
  total: number;
  loading: boolean;
}

let _cached: CommsSummary | null = null;
let _listeners: Array<() => void> = [];

// Call after the user reads chat or handles an associate request so the badge
// clears promptly instead of waiting for the next poll.
export function invalidateCommsSummary() {
  _cached = null;
  _listeners.forEach(fn => fn());
}

export function useCommsSummary() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<CommsSummary>(
    _cached ?? { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0, loading: true }
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      const s: CommsSummary = { unreadMessages: 0, unreadSms: 0, pendingRequests: 0, total: 0, loading: false };
      _cached = s;
      setState(s);
      return;
    }
    try {
      const res = await apiFetch('/api/comms/summary', { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const s: CommsSummary = {
        unreadMessages: data.unreadMessages ?? 0,
        unreadSms: data.unreadSms ?? 0,
        pendingRequests: data.pendingRequests ?? 0,
        total: data.total ?? 0,
        loading: false,
      };
      _cached = s;
      setState(s);
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === undefined) return;
    fetch();
    intervalRef.current = setInterval(fetch, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, fetch]);

  useEffect(() => {
    const invalidate = () => {
      _cached = null;
      fetch();
    };
    _listeners.push(invalidate);
    return () => {
      _listeners = _listeners.filter(fn => fn !== invalidate);
    };
  }, [fetch]);

  return state;
}
