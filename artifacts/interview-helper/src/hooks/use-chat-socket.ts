import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { getActiveCityId } from "@/lib/city-defs";
import { apiFetch, notifyFiatChangedSoon } from "@/lib/api-client";

export interface ChatMessage {
  id: number;
  channelId: number;
  senderUserId: string | null;
  senderName: string;
  senderUsername?: string | null;
  senderProfileImageUrl: string | null;
  senderCity?: string | null;
  isBot: boolean;
  content: string;
  attachmentFileId?: number | null;
  attachmentObjectPath?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSizeBytes?: number | null;
  createdAt: string;
}

interface ChannelMeta {
  globalChannelId: number | null;
  pabloChannelId: number | null;
  companyChannelId: number | null;
  companyName: string | null;
  privateChannels: Array<{
    channelId: number;
    otherUser: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      lastSeenAt?: string | null;
      online?: boolean;
    } | null;
  }>;
  unreadCounts: Record<number, number>;
}

interface ChatState {
  connected: boolean;
  channelMeta: ChannelMeta | null;
  messages: Record<number, ChatMessage[]>;
  unreadCounts: Record<number, number>;
  totalUnread: number;
}

type SendFn = (channelId: number, content: string, attachmentFileId?: number) => void;
type MarkReadFn = (channelId: number, lastMessageId: number) => void;
type MarkAllReadFn = () => Promise<void>;
type LoadHistoryFn = (channelId: number, before?: number) => Promise<boolean>;
type StartPrivateFn = (targetUserId: string) => Promise<number | null>;
type SendToPabloFn = (content: string) => Promise<void>;

interface UseChatSocket extends ChatState {
  send: SendFn;
  markRead: MarkReadFn;
  markAllRead: MarkAllReadFn;
  loadHistory: LoadHistoryFn;
  startPrivateChat: StartPrivateFn;
  sendToPablo: SendToPabloFn;
  refreshChannels: () => Promise<void>;
}

export function useChatSocket(): UseChatSocket {
  const { user, isAuthenticated } = useAuth();
  const { org } = useOrg();
  const [state, setState] = useState<ChatState>({
    connected: false,
    channelMeta: null,
    messages: {},
    unreadCounts: {},
    totalUnread: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const retriesRef = useRef(0);
  const MAX_RETRIES = 10;
  const BASE_DELAY = 2000;

  const appendMessage = useCallback((msg: ChatMessage) => {
    setState(prev => {
      const channelMsgs = prev.messages[msg.channelId] ?? [];
      if (channelMsgs.find(m => m.id === msg.id)) return prev;
      const updated = [...channelMsgs, msg];
      const newUnread = { ...prev.unreadCounts };
      newUnread[msg.channelId] = (newUnread[msg.channelId] ?? 0) + 1;
      return {
        ...prev,
        messages: { ...prev.messages, [msg.channelId]: updated },
        unreadCounts: newUnread,
        totalUnread: Object.values(newUnread).reduce((a, b) => a + b, 0),
      };
    });
  }, []);

  const refreshChannels = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiFetch('/api/chat/channels', { credentials: "include" });
      if (!res.ok) return;
      const data: ChannelMeta = await res.json();
      setState(prev => ({
        ...prev,
        channelMeta: data,
        unreadCounts: data.unreadCounts ?? {},
        totalUnread: Object.values(data.unreadCounts ?? {}).reduce((a, b) => a + b, 0),
      }));
    } catch { }
  }, [isAuthenticated]);

  const connect = useCallback(() => {
    if (!isAuthenticated || !user) return;
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");

    const orgId = org?.id ?? "";
    const firstName = (user as any).firstName ?? "";
    const lastName = (user as any).lastName ?? "";
    const name = `${firstName} ${lastName}`.trim() || (user as any).email || "User";
    const profileImageUrl = (user as any).profileImageUrl ?? "";

    const params = new URLSearchParams({
      userId: (user as any).id ?? "",
      userName: name,
      profileImageUrl,
      orgId: String(orgId),
      cityId: getActiveCityId(),
    });

    const wsUrl = `${proto}//${host}${base}/ws/chat?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      retriesRef.current = 0;
      setState(prev => ({ ...prev, connected: true }));
      refreshChannels();
    };

    ws.onmessage = (evt) => {
      if (!isMounted.current) return;
      let msg: any;
      try {
        msg = JSON.parse(evt.data);
      } catch { return; }

      if (msg.type === "chat_message") {
        appendMessage(msg.message as ChatMessage);
      } else if (msg.type === "new_private_channel") {
        refreshChannels();
      } else if (msg.type === "ready" || msg.type === "company_channel") {
        refreshChannels();
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setState(prev => ({ ...prev, connected: false }));
      wsRef.current = null;
      if (retriesRef.current >= MAX_RETRIES) return;
      const delay = Math.min(BASE_DELAY * Math.pow(2, retriesRef.current), 60000);
      retriesRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isAuthenticated, user, org, appendMessage, refreshChannels]);

  useEffect(() => {
    isMounted.current = true;
    if (isAuthenticated && user) {
      refreshChannels();
      connect();
      let presenceTick = 0;
      pollTimerRef.current = setInterval(() => {
        if (!isMounted.current) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          presenceTick = 0;
          refreshChannels();
          return;
        }
        presenceTick += 1;
        if (presenceTick >= 4) {
          presenceTick = 0;
          refreshChannels();
        }
      }, 8000);
    }
    return () => {
      isMounted.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, user, connect]);

  const send: SendFn = useCallback((channelId, content, attachmentFileId) => {
    const hasAttachment = typeof attachmentFileId === "number" && Number.isFinite(attachmentFileId);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "send_message", channelId, content, ...(hasAttachment ? { attachmentFileId } : {}) }));
      return;
    }
    apiFetch(`/api/chat/channels/${channelId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content, cityId: getActiveCityId(), ...(hasAttachment ? { attachmentFileId } : {}) }),
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        if (data.message) appendMessage(data.message);
      }
    }).catch(() => {});
  }, [appendMessage]);

  const markRead: MarkReadFn = useCallback((channelId, lastMessageId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "mark_read", channelId, lastMessageId }));
    }
    setState(prev => {
      const newUnread = { ...prev.unreadCounts, [channelId]: 0 };
      return {
        ...prev,
        unreadCounts: newUnread,
        totalUnread: Object.values(newUnread).reduce((a, b) => a + b, 0),
      };
    });
  }, []);

  // Clear every COUNTED comms channel at once (used when the chat panel opens).
  // The server advances all those read cursors to the latest message; we mirror
  // it locally by zeroing the matching unread counts so in-panel tab badges
  // clear too. The public Global channel is intentionally preserved — it isn't
  // part of the comms badge and shouldn't be silently marked read here.
  // Resolves only after the POST completes so callers can refetch the badge
  // summary without racing the cursor write.
  const markAllRead: MarkAllReadFn = useCallback(async () => {
    setState(prev => {
      const globalId = prev.channelMeta?.globalChannelId ?? null;
      const newUnread: Record<number, number> = {};
      for (const [key, value] of Object.entries(prev.unreadCounts)) {
        const id = Number(key);
        newUnread[id] = id === globalId ? value : 0;
      }
      return {
        ...prev,
        unreadCounts: newUnread,
        totalUnread: Object.values(newUnread).reduce((a, b) => a + b, 0),
      };
    });
    try {
      await apiFetch('/api/comms/read-all', {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // network failure is non-fatal; the next summary poll will reconcile.
    }
  }, []);

  const loadHistory: LoadHistoryFn = useCallback(async (channelId, before) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (before) params.set("before", String(before));
      const res = await apiFetch(
        `/api/chat/channels/${channelId}/messages?${params}`,
        { credentials: "include" }
      );
      if (!res.ok) return false;
      const data: { messages: ChatMessage[]; hasMore: boolean } = await res.json();
      setState(prev => {
        const existing = prev.messages[channelId] ?? [];
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
        const combined = before ? [...newMsgs, ...existing] : [...existing, ...newMsgs];
        combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return { ...prev, messages: { ...prev.messages, [channelId]: combined } };
      });
      return data.hasMore;
    } catch {
      return false;
    }
  }, []);

  const startPrivateChat: StartPrivateFn = useCallback(async (targetUserId) => {
    try {
      const res = await apiFetch('/api/chat/private', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId }),
      });
      if (!res.ok) return null;
      const data: { channelId: number } = await res.json();
      await refreshChannels();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "subscribe", channelId: data.channelId }));
      }
      return data.channelId;
    } catch {
      return null;
    }
  }, [refreshChannels]);

  const sendToPablo: SendToPabloFn = useCallback(async (content) => {
    try {
      const pabloChannelId = state.channelMeta?.pabloChannelId ?? null;
      const existingMsgs = pabloChannelId ? state.messages[pabloChannelId] ?? [] : [];
      const context = existingMsgs.slice(-20).map(m => ({
        role: m.isBot ? "assistant" : "user",
        content: m.content,
        isBot: m.isBot,
      }));

      const res = await apiFetch('/api/chat/pablo/message', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, context }),
      });
      if (!res.ok) return;
      // This raw fetch bypasses apiFetch, so trigger the delayed HUD refresh
      // ourselves: Pablo chat is billed via the fire-and-forget Pablo-Tax meter,
      // whose ƒ draw commits just after this response.
      notifyFiatChangedSoon();
      const data = await res.json();
      if (data.userMessage) appendMessage(data.userMessage);
      if (data.pabloMessage) appendMessage(data.pabloMessage);
    } catch {}
  }, [appendMessage, state.channelMeta, state.messages]);

  return { ...state, send, markRead, markAllRead, loadHistory, startPrivateChat, sendToPablo, refreshChannels };
}
