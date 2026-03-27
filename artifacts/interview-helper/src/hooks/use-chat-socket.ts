import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useOrg } from "@/hooks/use-org";

export interface ChatMessage {
  id: number;
  channelId: number;
  senderUserId: string | null;
  senderName: string;
  senderProfileImageUrl: string | null;
  isBot: boolean;
  content: string;
  createdAt: string;
}

interface ChannelMeta {
  globalChannelId: number | null;
  companyChannelId: number | null;
  companyName: string | null;
  privateChannels: Array<{
    channelId: number;
    otherUser: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
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

type SendFn = (channelId: number, content: string) => void;
type MarkReadFn = (channelId: number, lastMessageId: number) => void;
type LoadHistoryFn = (channelId: number, before?: number) => Promise<boolean>;
type StartPrivateFn = (targetUserId: string) => Promise<number | null>;

interface UseChatSocket extends ChatState {
  send: SendFn;
  markRead: MarkReadFn;
  loadHistory: LoadHistoryFn;
  startPrivateChat: StartPrivateFn;
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
  const isMounted = useRef(true);

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
      const res = await fetch(`${import.meta.env.BASE_URL}api/chat/channels`, { credentials: "include" });
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
    });

    const wsUrl = `${proto}//${host}${base}/ws/chat?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
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
      reconnectTimerRef.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [isAuthenticated, user, org, appendMessage, refreshChannels]);

  useEffect(() => {
    isMounted.current = true;
    if (isAuthenticated && user) {
      connect();
    }
    return () => {
      isMounted.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, user, connect]);

  const send: SendFn = useCallback((channelId, content) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "send_message", channelId, content }));
  }, []);

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

  const loadHistory: LoadHistoryFn = useCallback(async (channelId, before) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (before) params.set("before", String(before));
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/chat/channels/${channelId}/messages?${params}`,
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
      const res = await fetch(`${import.meta.env.BASE_URL}api/chat/private`, {
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

  return { ...state, send, markRead, loadHistory, startPrivateChat, refreshChannels };
}
