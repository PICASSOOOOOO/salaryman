import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, ChevronDown, Send, Globe, Building2, Lock, Plus, ArrowLeft, Bot, Search, Sparkles, Loader2 } from "lucide-react";
import { MiniNebula } from "@/components/MiniNebula";
import { useAuth } from "@workspace/replit-auth-web";
import { useChatSocket, type ChatMessage } from "@/hooks/use-chat-socket";
import { useBoomerMode, useIsMobile } from "@/hooks/use-mobile";

const CRT = (a: number) => `rgba(0,255,65,${a})`;
const BLUE = (a: number) => `rgba(56,189,248,${a})`;
const AMBER = (a: number) => `rgba(251,191,36,${a})`;
const BG = "rgba(3,10,3,0.98)";
const BORDER = (a: number) => `rgba(0,255,65,${a})`;
const FONT = "'Share Tech Mono', monospace";

type Tab = "pablo" | "global" | "company" | "private";

interface UserSearchResult {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profileImageUrl: string | null;
}

function fontFor(boomer: boolean) {
  return boomer ? undefined : FONT;
}

function Avatar({ name, url, size = 28, boomer = false }: { name: string; url?: string | null; size?: number; boomer?: boolean }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: `1px solid ${CRT(0.2)}`,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${CRT(0.1)}, ${BLUE(0.08)})`,
        border: `1px solid ${CRT(0.2)}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        color: CRT(0.7),
        fontFamily: fontFor(boomer),
        flexShrink: 0,
        letterSpacing: "0.05em",
      }}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function MessageBubble({ msg, isOwn, boomer = false }: { msg: ChatMessage; isOwn: boolean; boomer?: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isOwn ? "row-reverse" : "row",
        gap: 8,
        marginBottom: 10,
        alignItems: "flex-end",
      }}
    >
      {!isOwn && (
        <Avatar
          name={msg.senderName}
          url={msg.senderProfileImageUrl}
          size={24}
          boomer={boomer}
        />
      )}
      <div style={{ maxWidth: "78%", minWidth: 0 }}>
        {!isOwn && (
          <div
            style={{
              fontSize: "0.52rem",
              color: msg.isBot ? AMBER(0.7) : BLUE(0.6),
              marginBottom: 3,
              letterSpacing: "0.1em",
              fontFamily: fontFor(boomer),
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {msg.isBot && <Bot size={10} />}
            {msg.senderName}
          </div>
        )}
        <div
          style={{
            background: isOwn
              ? `linear-gradient(135deg, ${CRT(0.12)}, ${CRT(0.06)})`
              : msg.isBot
              ? `linear-gradient(135deg, ${AMBER(0.08)}, ${AMBER(0.04)})`
              : "rgba(255,255,255,0.04)",
            border: `1px solid ${
              isOwn ? CRT(0.2) : msg.isBot ? AMBER(0.2) : BORDER(0.1)
            }`,
            borderRadius: isOwn ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
            padding: "7px 11px",
            fontSize: "0.72rem",
            color: isOwn ? CRT(0.9) : msg.isBot ? AMBER(0.85) : "rgba(220,220,220,0.9)",
            fontFamily: fontFor(boomer),
            lineHeight: 1.5,
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.content}
        </div>
        <div
          style={{
            fontSize: "0.45rem",
            color: "rgba(255,255,255,0.2)",
            marginTop: 3,
            textAlign: isOwn ? "right" : "left",
            fontFamily: fontFor(boomer),
            letterSpacing: "0.05em",
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  currentUserId,
  channelId,
  onLoadMore,
  boomer = false,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  channelId: number;
  onLoadMore: () => void;
  boomer?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(isNearBottom);
    if (el.scrollTop < 60) {
      onLoadMore();
    }
  };

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 14px 8px",
        display: "flex",
        flexDirection: "column",
        scrollBehavior: "smooth",
      }}
    >
      {messages.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: CRT(0.3),
            fontSize: "0.6rem",
            fontFamily: fontFor(boomer),
            letterSpacing: "0.12em",
            gap: 8,
            marginTop: 40,
          }}
        >
          <MessageSquare size={22} style={{ opacity: 0.3 }} />
          NO MESSAGES YET
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble
          key={msg.id}
          msg={msg}
          isOwn={msg.senderUserId === currentUserId}
          boomer={boomer}
        />
      ))}
    </div>
  );
}

function InputBar({
  onSend,
  disabled,
  boomer = false,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  boomer?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    ref.current?.focus();
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${BORDER(0.12)}`,
        padding: "8px 10px",
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        background: "rgba(0,0,0,0.4)",
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={disabled ? "Select a channel to chat" : "Message... (Enter to send)"}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          background: "rgba(0,255,65,0.04)",
          border: `1px solid ${BORDER(0.15)}`,
          borderRadius: 6,
          color: CRT(0.9),
          fontSize: "0.72rem",
          padding: "7px 10px",
          outline: "none",
          fontFamily: fontFor(boomer),
          resize: "none",
          lineHeight: 1.4,
          maxHeight: 80,
          overflowY: "auto",
          opacity: disabled ? 0.4 : 1,
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        style={{
          background: disabled || !value.trim() ? "transparent" : CRT(0.1),
          border: `1px solid ${CRT(disabled || !value.trim() ? 0.1 : 0.35)}`,
          borderRadius: 6,
          color: CRT(disabled || !value.trim() ? 0.2 : 0.9),
          cursor: disabled || !value.trim() ? "default" : "pointer",
          padding: "7px 9px",
          display: "flex",
          alignItems: "center",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
      >
        <Send size={14} />
      </button>
    </div>
  );
}

function UserSearchPanel({
  onSelectUser,
  onCancel,
  boomer = false,
}: {
  onSelectUser: (userId: string) => void;
  onCancel: () => void;
  boomer?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.BASE_URL}api/chat/company/members`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data: { members: UserSearchResult[] } = await res.json();
          const q = query.toLowerCase();
          setResults(
            data.members.filter(m => {
              const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase();
              return name.includes(q) || (m.email ?? "").toLowerCase().includes(q);
            })
          );
        }
      } catch { }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${BORDER(0.1)}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: CRT(0.5),
            cursor: "pointer",
            padding: 2,
          }}
        >
          <ArrowLeft size={15} />
        </button>
        <span
          style={{
            fontSize: "0.62rem",
            color: CRT(0.6),
            fontFamily: fontFor(boomer),
            letterSpacing: "0.1em",
          }}
        >
          START PRIVATE CHAT
        </span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "rgba(0,255,65,0.04)",
            border: `1px solid ${BORDER(0.15)}`,
            borderRadius: 6,
            padding: "6px 10px",
          }}
        >
          <Search size={13} style={{ color: CRT(0.4) }} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search teammates..."
            style={{
              background: "none",
              border: "none",
              color: CRT(0.85),
              fontSize: "0.72rem",
              outline: "none",
              fontFamily: fontFor(boomer),
              flex: 1,
            }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        {loading && (
          <div
            style={{
              textAlign: "center",
              color: CRT(0.3),
              fontSize: "0.58rem",
              fontFamily: fontFor(boomer),
              padding: "20px 0",
            }}
          >
            SEARCHING...
          </div>
        )}
        {results.map(m => {
          const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || "User";
          return (
            <div
              key={m.userId}
              onClick={() => onSelectUser(m.userId)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 6px",
                cursor: "pointer",
                borderBottom: `1px solid ${BORDER(0.06)}`,
                borderRadius: 6,
                marginBottom: 2,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = CRT(0.05))}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar name={name} url={m.profileImageUrl} size={30} boomer={boomer} />
              <div>
                <div style={{ fontSize: "0.68rem", color: "rgba(220,220,220,0.9)", fontFamily: fontFor(boomer) }}>
                  {name}
                </div>
                {m.email && (
                  <div style={{ fontSize: "0.5rem", color: CRT(0.35), fontFamily: fontFor(boomer) }}>
                    {m.email}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!loading && query.trim() && results.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: CRT(0.3),
              fontSize: "0.58rem",
              fontFamily: fontFor(boomer),
              padding: "20px 0",
            }}
          >
            NO RESULTS
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { user, isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const boomer = boomerMode;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("pablo");
  const [activePrivateChannelId, setActivePrivateChannelId] = useState<number | null>(null);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [pabloLoading, setPabloLoading] = useState(false);

  const {
    connected,
    channelMeta,
    messages,
    unreadCounts,
    totalUnread,
    send,
    markRead,
    loadHistory,
    startPrivateChat,
    sendToPablo,
    refreshChannels,
  } = useChatSocket();

  const currentUserId = (user as any)?.id ?? "";

  const globalChannelId = channelMeta?.globalChannelId ?? null;
  const pabloChannelId = channelMeta?.pabloChannelId ?? null;
  const companyChannelId = channelMeta?.companyChannelId ?? null;

  const activeChannelId =
    activeTab === "pablo"
      ? pabloChannelId
      : activeTab === "global"
      ? globalChannelId
      : activeTab === "company"
      ? companyChannelId
      : activePrivateChannelId;

  useEffect(() => {
    if (!open || activeChannelId == null) return;
    const msgs = messages[activeChannelId] ?? [];
    if (msgs.length === 0) {
      loadHistory(activeChannelId);
    }
  }, [open, activeChannelId, loadHistory]);

  useEffect(() => {
    if (!open || activeChannelId == null) return;
    const msgs = messages[activeChannelId] ?? [];
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      markRead(activeChannelId, last.id);
    }
  }, [open, activeChannelId, messages]);

  const handleSend = async (text: string) => {
    if (activeTab === "pablo") {
      setPabloLoading(true);
      try {
        await sendToPablo(text);
      } finally {
        setPabloLoading(false);
      }
      return;
    }
    if (activeChannelId == null) return;
    send(activeChannelId, text);
  };

  const handleLoadMore = useCallback(() => {
    if (activeChannelId == null) return;
    const msgs = messages[activeChannelId] ?? [];
    if (msgs.length > 0) {
      loadHistory(activeChannelId, msgs[0].id);
    }
  }, [activeChannelId, messages, loadHistory]);

  const handleStartPrivate = async (targetUserId: string) => {
    const channelId = await startPrivateChat(targetUserId);
    if (channelId) {
      setActivePrivateChannelId(channelId);
      setActiveTab("private");
      setShowUserSearch(false);
    }
  };

  // Esc-to-close — basic dialog accessibility for the bottom-sheet on
  // mobile and the floating panel on desktop. Keyboard users can also
  // back out instead of being trapped.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onOpenDm = async (e: Event) => {
      const detail = (e as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId) return;
      if (detail.userId === currentUserId) return;
      setOpen(true);
      const channelId = await startPrivateChat(detail.userId);
      if (channelId) {
        setActivePrivateChannelId(channelId);
        setActiveTab("private");
        setShowUserSearch(false);
      }
    };
    window.addEventListener("salaryman:open-dm", onOpenDm as EventListener);
    return () => window.removeEventListener("salaryman:open-dm", onOpenDm as EventListener);
  }, [currentUserId, startPrivateChat]);

  if (!isAuthenticated) return null;

  const PANEL_W = isMobile ? "100vw" : 340;
  // Mobile: bottom-sheet sized to ~78% of the viewport so the user can
  // (a) tap the backdrop above to dismiss / see the page behind, and
  // (b) keep the input bar comfortably clear of the on-screen keyboard.
  // Desktop: fixed 480px floating panel.
  const PANEL_H = isMobile ? "78dvh" : 480;

  const tabPabloUnread = unreadCounts[pabloChannelId ?? -1] ?? 0;
  const tabGlobalUnread = unreadCounts[globalChannelId ?? -1] ?? 0;
  const tabCompanyUnread = unreadCounts[companyChannelId ?? -1] ?? 0;
  const tabPrivateUnread = channelMeta?.privateChannels.reduce(
    (sum, p) => sum + (unreadCounts[p.channelId] ?? 0),
    0
  ) ?? 0;

  const activePrivateInfo = activePrivateChannelId
    ? channelMeta?.privateChannels.find(p => p.channelId === activePrivateChannelId)
    : null;

  const currentMessages = activeChannelId != null ? (messages[activeChannelId] ?? []) : [];

  return (
    <>
      {open && isMobile && (
        // Tap-through backdrop above the bottom-sheet so the user can
        // dismiss Comms by tapping anywhere on the visible page area
        // ("go back on the page"). Sits just under the sheet itself.
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9998,
            animation: "chatBackdropFade 0.18s ease-out",
          }}
        />
      )}
      {open && (
        <div
          style={{
            position: "fixed",
            ...(isMobile
              ? {
                  // Bottom-sheet: leave the top of the screen tappable so
                  // the backdrop can be hit and the page behind stays
                  // partially visible.
                  left: 0, right: 0, bottom: 0,
                  borderRadius: "16px 16px 0 0",
                }
              : { bottom: 56, right: 16, borderRadius: 10 }),
            width: PANEL_W,
            height: PANEL_H,
            background: BG,
            border: isMobile ? `1px solid ${BORDER(0.2)}` : `1px solid ${BORDER(0.25)}`,
            borderBottom: isMobile ? "none" : undefined,
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            boxShadow: isMobile
              ? "0 -8px 32px rgba(0,0,0,0.7)"
              : `0 8px 40px rgba(0,0,0,0.8), 0 0 20px ${CRT(0.05)}`,
            fontFamily: fontFor(boomer),
            overflow: "hidden",
            animation: isMobile ? "chatSheetUp 0.22s ease-out" : "chatSlideUp 0.2s ease-out",
            // Mobile: respect the iOS home indicator + landscape rounded
            // corners. Top inset is unneeded now that the sheet doesn't
            // reach the notch.
            ...(isMobile
              ? {
                  paddingBottom: "env(safe-area-inset-bottom, 0px)",
                  paddingLeft: "env(safe-area-inset-left, 0px)",
                  paddingRight: "env(safe-area-inset-right, 0px)",
                  boxSizing: "border-box",
                }
              : null),
          }}
        >
          {isMobile && (
            // Drag-handle affordance — visual cue that the sheet is
            // dismissable. Tapping it also closes, same as the X.
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close comms"
              style={{
                position: "absolute",
                top: 6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 40,
                height: 4,
                borderRadius: 2,
                background: CRT(0.35),
                border: "none",
                padding: 0,
                cursor: "pointer",
                zIndex: 2,
              }}
            />
          )}
          <div
            style={{
              background: `linear-gradient(90deg, rgba(0,255,65,0.06), rgba(0,0,0,0))`,
              borderBottom: `1px solid ${BORDER(0.15)}`,
              padding: isMobile ? "12px 16px" : "8px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: connected ? CRT(0.9) : "rgba(255,60,60,0.8)",
                  boxShadow: connected ? `0 0 6px ${CRT(0.5)}` : "none",
                }}
              />
              <span
                style={{
                  fontSize: isMobile ? "0.75rem" : "0.62rem",
                  color: CRT(0.7),
                  letterSpacing: "0.12em",
                }}
              >
                COMMS
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CRT(0.5),
                cursor: "pointer",
                padding: isMobile ? 8 : 2,
                display: "flex",
              }}
            >
              <X size={isMobile ? 20 : 14} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${BORDER(0.12)}`,
              flexShrink: 0,
            }}
          >
            {(
              [
                { id: "pablo" as Tab, label: "PABLO", icon: <MiniNebula size={16} title="Zoom into Pablo nebula" />, unread: tabPabloUnread },
                { id: "global" as Tab, label: "GLOBAL", icon: <Globe size={11} />, unread: tabGlobalUnread },
                ...(companyChannelId
                  ? [{ id: "company" as Tab, label: channelMeta?.companyName?.toUpperCase().slice(0, 8) ?? "COMPANY", icon: <Building2 size={11} />, unread: tabCompanyUnread }]
                  : []),
                { id: "private" as Tab, label: "DM", icon: <Lock size={11} />, unread: tabPrivateUnread },
              ] as Array<{ id: Tab; label: string; icon: React.ReactNode; unread: number }>
            ).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setShowUserSearch(false);
                  }}
                  style={{
                    flex: 1,
                    background: isActive ? CRT(0.06) : "transparent",
                    border: "none",
                    borderBottom: isActive ? `2px solid ${CRT(0.8)}` : "2px solid transparent",
                    color: isActive ? CRT(0.9) : CRT(0.35),
                    cursor: "pointer",
                    padding: isMobile ? "12px 6px" : "8px 4px",
                    fontSize: isMobile ? "0.65rem" : "0.52rem",
                    letterSpacing: "0.1em",
                    fontFamily: fontFor(boomer),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    position: "relative",
                    transition: "all 0.15s",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.unread > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 5,
                        right: 6,
                        background: "rgba(255,60,60,0.85)",
                        color: "#fff",
                        borderRadius: "50%",
                        fontSize: "0.42rem",
                        minWidth: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: fontFor(boomer),
                        padding: "0 3px",
                      }}
                    >
                      {tab.unread > 99 ? "99+" : tab.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeTab === "private" && !showUserSearch && (
            <div
              style={{
                padding: "6px 10px",
                borderBottom: `1px solid ${BORDER(0.08)}`,
                display: "flex",
                gap: 6,
                overflowX: "auto",
                flexShrink: 0,
                alignItems: "center",
              }}
            >
              <button
                onClick={() => setShowUserSearch(true)}
                style={{
                  background: "none",
                  border: `1px dashed ${CRT(0.2)}`,
                  borderRadius: 5,
                  color: CRT(0.4),
                  cursor: "pointer",
                  padding: "4px 8px",
                  fontSize: "0.5rem",
                  fontFamily: fontFor(boomer),
                  letterSpacing: "0.1em",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <Plus size={10} /> NEW DM
              </button>
              {channelMeta?.privateChannels.map(p => {
                const otherName = p.otherUser
                  ? `${p.otherUser.firstName ?? ""} ${p.otherUser.lastName ?? ""}`.trim() || "User"
                  : "DM";
                const isActive = activePrivateChannelId === p.channelId;
                const dmUnread = unreadCounts[p.channelId] ?? 0;
                return (
                  <button
                    key={p.channelId}
                    onClick={() => setActivePrivateChannelId(p.channelId)}
                    style={{
                      background: isActive ? CRT(0.08) : "none",
                      border: `1px solid ${isActive ? CRT(0.3) : CRT(0.1)}`,
                      borderRadius: 5,
                      color: isActive ? CRT(0.9) : CRT(0.5),
                      cursor: "pointer",
                      padding: "4px 8px",
                      fontSize: "0.5rem",
                      fontFamily: fontFor(boomer),
                      letterSpacing: "0.08em",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                      position: "relative",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {otherName.slice(0, 10)}
                    {dmUnread > 0 && (
                      <span
                        style={{
                          background: "rgba(255,60,60,0.85)",
                          color: "#fff",
                          borderRadius: "50%",
                          fontSize: "0.42rem",
                          minWidth: 13,
                          height: 13,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 2px",
                        }}
                      >
                        {dmUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {showUserSearch ? (
            <UserSearchPanel
              onSelectUser={handleStartPrivate}
              onCancel={() => setShowUserSearch(false)}
              boomer={boomer}
            />
          ) : (
            <>
              {activeTab === "pablo" && currentMessages.length === 0 && !pabloLoading && (
                <div
                  style={{
                    padding: "20px 16px 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    color: AMBER(0.5),
                    fontFamily: fontFor(boomer),
                  }}
                >
                  <Sparkles size={20} style={{ opacity: 0.5 }} />
                  <div style={{ fontSize: "0.6rem", letterSpacing: "0.12em", textAlign: "center", lineHeight: 1.6 }}>
                    DIRECT LINE TO PABLO<br />
                    <span style={{ color: AMBER(0.3), fontSize: "0.5rem" }}>YOUR AI PARTNER · REMEMBERS EVERYTHING</span>
                  </div>
                </div>
              )}
              <MessageList
                messages={currentMessages}
                currentUserId={currentUserId}
                channelId={activeChannelId ?? 0}
                onLoadMore={handleLoadMore}
                boomer={boomer}
              />
              {pabloLoading && activeTab === "pablo" && (
                <div
                  style={{
                    padding: "6px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: AMBER(0.5),
                    fontFamily: fontFor(boomer),
                    fontSize: "0.52rem",
                    letterSpacing: "0.1em",
                  }}
                >
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  PABLO IS THINKING...
                </div>
              )}
              <InputBar
                onSend={handleSend}
                disabled={pabloLoading || activeChannelId == null || (activeTab === "private" && activePrivateChannelId == null)}
                boomer={boomer}
              />
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-comms-toggle"
        style={{
          position: "fixed",
          // ChatPanel is hidden on GAME_ROUTES (WorldPlay, /game, /mobile) so
          // we don't need to dodge the in-game action stack. Sit in the
          // bottom-right corner with comfortable padding, respecting the iOS
          // home-indicator safe-area inset on mobile.
          bottom: isMobile ? `calc(env(safe-area-inset-bottom, 0px) + 24px)` : 16,
          // Landscape iPhones push the home indicator / rounded corner
          // into the right edge — respect that inset so the FAB doesn't
          // hug the bezel.
          right: isMobile ? `calc(env(safe-area-inset-right, 0px) + 20px)` : 16,
          width: isMobile ? 60 : 42,
          height: isMobile ? 60 : 42,
          borderRadius: "50%",
          background: open
            ? `linear-gradient(135deg, ${CRT(0.15)}, ${BLUE(0.1)})`
            : `linear-gradient(135deg, rgba(0,20,0,0.95), rgba(0,10,15,0.95))`,
          border: `${isMobile ? 2 : 1.5}px solid ${open ? CRT(0.6) : CRT(0.35)}`,
          color: open ? CRT(0.95) : CRT(0.85),
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Sit above all in-world HUD (z 150–240) but below full-screen
          // modals (z 9000+) so it never hijacks dialogs.
          zIndex: isMobile ? 8500 : 901,
          boxShadow: open
            ? `0 0 18px ${CRT(0.3)}`
            : `0 4px 18px rgba(0,0,0,0.7), 0 0 12px ${CRT(0.18)}`,
          transition: "all 0.2s",
          flexShrink: 0,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
        title="Chat"
      >
        {open
          ? <ChevronDown size={isMobile ? 28 : 18} />
          : <MessageSquare size={isMobile ? 28 : 18} />}
        {!open && totalUnread > 0 && (
          <span
            style={{
              position: "absolute",
              top: isMobile ? -4 : -3,
              right: isMobile ? -4 : -3,
              background: "rgba(255,50,50,0.95)",
              color: "#fff",
              borderRadius: "50%",
              fontSize: isMobile ? "0.62rem" : "0.45rem",
              minWidth: isMobile ? 20 : 15,
              height: isMobile ? 20 : 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fontFor(boomer),
              fontWeight: "bold",
              padding: "0 4px",
              border: "1.5px solid rgba(3,10,3,1)",
            }}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes chatBackdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
