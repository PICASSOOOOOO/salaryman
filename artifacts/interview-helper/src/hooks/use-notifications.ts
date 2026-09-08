import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

interface Notification {
  id: number;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
}

let _cachedNotifications: NotificationState | null = null;
let _cacheListeners: Array<() => void> = [];

export function invalidateNotificationsCache() {
  _cachedNotifications = null;
  _cacheListeners.forEach(fn => fn());
}

export function useNotifications() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<NotificationState>(
    _cachedNotifications ?? { notifications: [], unreadCount: 0, loading: true }
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!isAuthenticated) {
      const s = { notifications: [], unreadCount: 0, loading: false };
      _cachedNotifications = s;
      setState(s);
      return;
    }
    try {
      const res = await apiFetch('/api/notifications', { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const s: NotificationState = {
        notifications: data.notifications ?? [],
        unreadCount: data.unreadCount ?? 0,
        loading: false,
      };
      _cachedNotifications = s;
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
      _cachedNotifications = null;
      fetch();
    };
    _cacheListeners.push(invalidate);
    return () => {
      _cacheListeners = _cacheListeners.filter(fn => fn !== invalidate);
    };
  }, [fetch]);

  const dismiss = useCallback(async (id: number) => {
    setState(prev => ({
      notifications: prev.notifications.filter(n => n.id !== id),
      unreadCount: Math.max(0, prev.unreadCount - (prev.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
      loading: prev.loading,
    }));
    try {
      await apiFetch(`/api/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      _cachedNotifications = null;
      fetch();
    } catch { }
  }, [fetch]);

  const clearAll = useCallback(async () => {
    setState(prev => ({ notifications: [], unreadCount: 0, loading: prev.loading }));
    try {
      await apiFetch('/api/notifications/clear', {
        method: "POST",
        credentials: "include",
      });
      _cachedNotifications = null;
      fetch();
    } catch { }
  }, [fetch]);

  const markRead = useCallback(async (ids?: number[]) => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      _cachedNotifications = null;
      fetch();
    } catch { }
  }, [fetch]);

  return { ...state, markRead, dismiss, clearAll };
}
