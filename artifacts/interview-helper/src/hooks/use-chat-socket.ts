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
  /** Local-only marker used while the HTTP send is being persisted. */
  pending?: boolean;
}

interface ChannelMeta {
  globalChannelId: number | null;
  pabloChannelId: number | null;
  companyChannelId: number | null;
  companyName: string | null;
  orgChannels: Array<{ channelId: number; name: string; isDefault: boolean }>;
  canManageOrgChannels: boolean;
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

type SendFn = (channelId: number, content: string, attachmentFileId?: number) => Promise<boolean>;
type MarkReadFn = (channelId: number, lastMessageId: number) => void;
type MarkAllReadFn = () => Promise<void>;
type LoadHistoryFn = (channelId: number, before?: number) => Promise<boolean>;
type StartPrivateFn = (targetUserId: string) => Promise<number | null>;
type SendToPabloFn = (content: string, uploadFile?: File) => Promise<boolean>;

export const CHAT_SEND_TIMEOUT_MS = 15_000;

interface UseChatSocket extends ChatState {
  send: SendFn;
  markRead: MarkReadFn;
  markAllRead: MarkAllReadFn;
  loadHistory: LoadHistoryFn;
  startPrivateChat: StartPrivateFn;
  sendToPablo: SendToPabloFn;
  refreshChannels: () => Promise<void>;
}

async function chatFetch(path: string, options: Parameters<typeof apiFetch>[1] = {}): Promise<Response> {
  // Clerk can report an authenticated browser a moment before the API session
  // cookie is visible to the server. Keep the first request from redirecting,
  // then retry once before treating the send/read as a real failure.
  const first = await apiFetch(path, { ...options, skipSessionExpiryRedirect: true });
  if (first.status !== 401) return first;
  await new Promise(resolve => setTimeout(resolve, 250));
  return apiFetch(path, options);
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

  const appendMessage = useCallback((msg: ChatMessage, countUnread = true) => {
    setState(prev => {
      const channelMsgs = prev.messages[msg.channelId] ?? [];
      if (channelMsgs.find(m => m.id === msg.id)) return prev;
      // The sender gets an optimistic local bubble before the POST completes.
      // Replace that bubble with the authoritative server row when either the
      // POST response or the WebSocket broadcast arrives. This prevents a
      // duplicate when both transports deliver the same persisted message.
      const pendingIndex = !msg.pending && msg.senderUserId === user?.id
        ? channelMsgs.findIndex(m =>
            m.pending &&
            m.senderUserId === msg.senderUserId &&
            m.content === msg.content &&
            (m.attachmentFileId ?? null) === (msg.attachmentFileId ?? null)
          )
        : -1;
      if (pendingIndex >= 0) {
        const updated = [...channelMsgs];
        updated[pendingIndex] = msg;
        return { ...prev, messages: { ...prev.messages, [msg.channelId]: updated } };
      }
      const updated = [...channelMsgs, msg];
      const newUnread = { ...prev.unreadCounts };
      if (countUnread) {
        newUnread[msg.channelId] = (newUnread[msg.channelId] ?? 0) + 1;
      }
      return {
        ...prev,
        messages: { ...prev.messages, [msg.channelId]: updated },
        unreadCounts: newUnread,
        totalUnread: Object.values(newUnread).reduce((a, b) => a + b, 0),
      };
    });
  }, [user?.id]);

  const removePendingMessage = useCallback((channelId: number, content: string, attachmentFileId?: number) => {
    setState(prev => {
      const existing = prev.messages[channelId] ?? [];
      const updated = existing.filter(msg =>
        !(msg.pending && msg.content === content && (msg.attachmentFileId ?? null) === (attachmentFileId ?? null))
      );
      if (updated.length === existing.length) return prev;
      return { ...prev, messages: { ...prev.messages, [channelId]: updated } };
    });
  }, []);

  const refreshChannels = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await chatFetch('/api/chat/channels', { credentials: "include" });
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

  // Pablo is a normal chat channel on the server. Subscribe whenever its
  // metadata arrives, and again after a reconnect, so channel events follow
  // the same live Comms path as the other chat tabs.
  useEffect(() => {
    const channelId = state.channelMeta?.pabloChannelId;
    const ws = wsRef.current;
    if (!state.connected || channelId == null || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "subscribe", channelId }));
  }, [state.connected, state.channelMeta?.pabloChannelId]);

  // Private channels are returned in the metadata snapshot, but the server
  // only auto-subscribes the global/company channels during connection. Join
  // every known DM here so an open Comms screen receives messages immediately,
  // even before the user clicks that particular thread.
  useEffect(() => {
    const ws = wsRef.current;
    const privateChannels = state.channelMeta?.privateChannels ?? [];
    if (!state.connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    for (const channel of privateChannels) {
      ws.send(JSON.stringify({ type: "subscribe", channelId: channel.channelId }));
    }
  }, [state.connected, state.channelMeta?.privateChannels]);

  useEffect(() => {
    const ws = wsRef.current;
    const orgChannels = state.channelMeta?.orgChannels ?? [];
    if (!state.connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    for (const channel of orgChannels) ws.send(JSON.stringify({ type: "subscribe", channelId: channel.channelId }));
  }, [state.connected, state.channelMeta?.orgChannels]);

  const send: SendFn = useCallback(async (channelId, content, attachmentFileId) => {
    const hasAttachment = typeof attachmentFileId === "number" && Number.isFinite(attachmentFileId);
    const trimmed = content.trim();
    if (!trimmed && !hasAttachment) return false;

    const optimistic: ChatMessage = {
      id: -Date.now(),
      channelId,
      senderUserId: user?.id ?? null,
      senderName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || (user as any)?.username || "You",
      senderProfileImageUrl: (user as any)?.profileImageUrl ?? null,
      isBot: false,
      content: trimmed,
      attachmentFileId: hasAttachment ? attachmentFileId : null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    appendMessage(optimistic, false);

    // Use the request/response transport for outgoing messages. The previous
    // WebSocket-only path had no acknowledgement, so a slow insert looked like
    // a dropped message and the composer cleared before delivery was known.
    // Bound the wait so an unresponsive request cannot leave the composer
    // disabled forever. The timeout aborts the browser request, not server work.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHAT_SEND_TIMEOUT_MS);
    try {
      const res = await chatFetch(`/api/chat/channels/${channelId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ content: trimmed, cityId: getActiveCityId(), ...(hasAttachment ? { attachmentFileId } : {}) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          appendMessage(data.message);
          return true;
        }
        removePendingMessage(channelId, trimmed, hasAttachment ? attachmentFileId : undefined);
      } else {
        removePendingMessage(channelId, trimmed, hasAttachment ? attachmentFileId : undefined);
      }
    } catch {
      removePendingMessage(channelId, trimmed, hasAttachment ? attachmentFileId : undefined);
    } finally {
      clearTimeout(timeout);
    }
    return false;
  }, [appendMessage, removePendingMessage, user]);

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
      const res = await chatFetch(
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
      const res = await chatFetch('/api/chat/private', {
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

  const sendToPablo: SendToPabloFn = useCallback(async (content, uploadFile) => {
    try {
      const pabloChannelId = state.channelMeta?.pabloChannelId ?? null;
      const existingMsgs = pabloChannelId ? state.messages[pabloChannelId] ?? [] : [];
      const context = existingMsgs.slice(-20).map(m => ({
        role: m.isBot ? "assistant" : "user",
        content: m.content,
        isBot: m.isBot,
      }));

      const body = uploadFile
        ? (() => {
            const form = new FormData();
            form.append("content", content);
            form.append("context", JSON.stringify(context));
            form.append("file", uploadFile, uploadFile.name);
            return form;
          })()
        : JSON.stringify({ content, context });
      const res = await chatFetch('/api/chat/pablo/message', {
        method: "POST",
        ...(uploadFile ? {} : { headers: { "Content-Type": "application/json" } }),
        credentials: "include",
        body,
      });
      if (!res.ok) return false;
      // This raw fetch bypasses apiFetch, so trigger the delayed HUD refresh
      // ourselves: Pablo chat is billed via the fire-and-forget Pablo-Tax meter,
      // whose ƒ draw commits just after this response.
      notifyFiatChangedSoon();
      const data = await res.json();
      if (data.userMessage) appendMessage(data.userMessage);
      if (data.pabloMessage) appendMessage(data.pabloMessage);
      return Boolean(data.userMessage || data.pabloMessage);
    } catch {
      return false;
    }
  }, [appendMessage, state.channelMeta, state.messages]);

  return { ...state, send, markRead, markAllRead, loadHistory, startPrivateChat, sendToPablo, refreshChannels };
}
