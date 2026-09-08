import { apiFetch } from '@/lib/api-client';
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { MessageSquare, X, ChevronDown, Send, Globe, Building2, Lock, Plus, ArrowLeft, Bot, Search, Sparkles, Loader2, Paperclip, FileText, Download, Folder } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChatSocket, type ChatMessage } from "@/hooks/use-chat-socket";
import { useBoomerMode, useIsMobile } from "@/hooks/use-mobile";
import { invalidateCommsSummary, useCommsSummary } from "@/hooks/use-comms-summary";
import { resolveAvatarUrl } from "@/lib/avatar";
import { getCityById } from "@/lib/world-servers";
import { useCommsAlerts, useCommsCityDnd, useImmersiveViewActive } from "@/lib/commsAlerts";
import { playNotify } from "@/lib/ui-sound";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const CRT = (a: number) => `rgba(0,255,65,${a})`;
const BLUE = (a: number) => `rgba(56,189,248,${a})`;
const AMBER = (a: number) => `rgba(251,191,36,${a})`;
const BG = "rgba(3,10,3,0.98)";
const BORDER = (a: number) => `rgba(0,255,65,${a})`;
const FONT = "var(--font-sans)";

type Tab = "pablo" | "global" | "company" | "private";

interface UserSearchResult {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  username: string | null;
  profileImageUrl: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
}

// Cross-city chat: a tiny "location" chip showing which realm/city the sender
// was in when they spoke. Chat spans all cities, so this tells you where each
// voice is coming from. Hidden when the city is unknown (bots/system/legacy).
function CityBadge({ cityId, boomer }: { cityId?: string | null; boomer?: boolean }) {
  if (!cityId) return null;
  const city = getCityById(cityId);
  if (!city) return null;
  return (
    <span
      title={`${city.cityName} · ${city.region}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 5px",
        borderRadius: 999,
        fontSize: "0.42rem",
        letterSpacing: "0.08em",
        lineHeight: 1.4,
        color: city.accentColor,
        background: `${city.accentColor}1f`,
        border: `1px solid ${city.accentColor}55`,
        fontFamily: fontFor(!!boomer),
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "0.6rem", lineHeight: 1 }}>{city.icon}</span>
      {city.cityName}
    </span>
  );
}

// Small green/grey presence dot reused across the comms hub.
function PresenceDot({ online, size = 8 }: { online?: boolean; size?: number }) {
  return (
    <span
      title={online ? "Online" : "Offline"}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: online ? "rgb(74,222,128)" : "rgba(120,120,120,0.5)",
        boxShadow: online ? "0 0 6px rgba(74,222,128,0.8)" : "none",
        display: "inline-block",
      }}
    />
  );
}

function fontFor(boomer: boolean) {
  return boomer ? undefined : FONT;
}

function Avatar({ name, url, size = 28, boomer = false }: { name: string; url?: string | null; size?: number; boomer?: boolean }) {
  const resolved = resolveAvatarUrl(url);
  if (resolved) {
    return (
      <img
        src={resolved}
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

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentBlock({ msg, channelId, isOwn }: { msg: ChatMessage; channelId: number; isOwn: boolean }) {
  if (!msg.attachmentName) return null;
  const downloadUrl = `${import.meta.env.BASE_URL}api/chat/channels/${channelId}/attachments/${msg.id}/download`;
  const isImage = (msg.attachmentMimeType ?? "").startsWith("image/");
  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 5,
        padding: "7px 9px",
        background: isOwn ? CRT(0.06) : "rgba(255,255,255,0.04)",
        border: `1px solid ${isOwn ? CRT(0.2) : BORDER(0.12)}`,
        borderRadius: 7,
        textDecoration: "none",
        color: isOwn ? CRT(0.85) : "rgba(220,220,220,0.9)",
        maxWidth: "100%",
      }}
    >
      {isImage
        ? <FileText size={15} style={{ flexShrink: 0, color: BLUE(0.7) }} />
        : <FileText size={15} style={{ flexShrink: 0, color: CRT(0.6) }} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: "0.62rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {msg.attachmentName}
        </span>
        {formatBytes(msg.attachmentSizeBytes) && (
          <span style={{ display: "block", fontSize: "0.46rem", opacity: 0.55 }}>
            {formatBytes(msg.attachmentSizeBytes)}
          </span>
        )}
      </span>
      <Download size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
    </a>
  );
}

function MessageBubble({ msg, isOwn, channelId, boomer = false }: { msg: ChatMessage; isOwn: boolean; channelId: number; boomer?: boolean }) {
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
            {msg.senderUsername && (
              <span style={{ color: CRT(0.45), letterSpacing: "0.04em" }}>@{msg.senderUsername}</span>
            )}
            <CityBadge cityId={msg.senderCity} boomer={boomer} />
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
          {msg.content && <div>{msg.content}</div>}
          <AttachmentBlock msg={msg} channelId={channelId} isOwn={isOwn} />
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
  // Whether this (re)mounted list has already snapped to the latest message.
  // Reset per channel because MessageList is keyed by channelId, so opening a
  // channel always lands on the most recent interaction, never the oldest.
  const didInitialScroll = useRef(false);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!didInitialScroll.current) {
      if (messages.length === 0) return;
      // First paint for this channel: jump straight to the bottom with no
      // smooth animation so it STARTS at the latest, not scrolling up from
      // the first message.
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop = el.scrollHeight;
      el.style.scrollBehavior = prev;
      didInitialScroll.current = true;
      return;
    }
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
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
          channelId={channelId}
          boomer={boomer}
        />
      ))}
    </div>
  );
}

interface MediaItem {
  id: number;
  name: string;
  isFolder: boolean;
  mimeType?: string | null;
  fileSize?: number | null;
}

function AttachPicker({
  onPick,
  onClose,
  boomer = false,
}: {
  onPick: (item: MediaItem) => void;
  onClose: () => void;
  boomer?: boolean;
}) {
  const [stack, setStack] = useState<Array<{ id: number | null; name: string }>>([{ id: null, name: "Library" }]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const parentId = stack[stack.length - 1].id;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const url = parentId == null
      ? `${import.meta.env.BASE_URL}api/tools/documents/files`
      : `${import.meta.env.BASE_URL}api/tools/documents/files?parentId=${parentId}`;
    apiFetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => { if (active) setItems(data.items ?? []); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parentId]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: BG,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER(0.1)}`, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => { if (stack.length > 1) setStack(s => s.slice(0, -1)); else onClose(); }}
          style={{ background: "none", border: "none", color: CRT(0.5), cursor: "pointer", padding: 2 }}
        >
          <ArrowLeft size={15} />
        </button>
        <span style={{ fontSize: "0.62rem", color: CRT(0.6), fontFamily: fontFor(boomer), letterSpacing: "0.1em", flex: 1 }}>
          ATTACH FROM LIBRARY · {stack[stack.length - 1].name.toUpperCase()}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: CRT(0.5), cursor: "pointer", padding: 2 }}>
          <X size={15} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
        {loading && (
          <div style={{ textAlign: "center", color: CRT(0.3), fontSize: "0.58rem", fontFamily: fontFor(boomer), padding: "20px 0" }}>
            LOADING...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: "center", color: CRT(0.3), fontSize: "0.58rem", fontFamily: fontFor(boomer), padding: "20px 0" }}>
            NO FILES HERE — UPLOAD IN MEDIA LIBRARY FIRST
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => item.isFolder ? setStack(s => [...s, { id: item.id, name: item.name }]) : onPick(item)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 6px",
              cursor: "pointer", borderBottom: `1px solid ${BORDER(0.06)}`, borderRadius: 6,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = CRT(0.05))}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {item.isFolder
              ? <Folder size={16} style={{ color: CRT(0.5), flexShrink: 0 }} />
              : <FileText size={16} style={{ color: BLUE(0.6), flexShrink: 0 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.66rem", color: "rgba(220,220,220,0.9)", fontFamily: fontFor(boomer), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.name}
              </div>
              {!item.isFolder && formatBytes(item.fileSize) && (
                <div style={{ fontSize: "0.48rem", color: CRT(0.35), fontFamily: fontFor(boomer) }}>{formatBytes(item.fileSize)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InputBar({
  onSend,
  disabled,
  allowAttach = false,
  boomer = false,
}: {
  onSend: (text: string, attachmentFileId?: number) => void;
  disabled?: boolean;
  allowAttach?: boolean;
  boomer?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<MediaItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text && !attachment) return;
    onSend(text, attachment?.id);
    setValue("");
    setAttachment(null);
    ref.current?.focus();
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {pickerOpen && (
        <AttachPicker
          boomer={boomer}
          onClose={() => setPickerOpen(false)}
          onPick={(item) => { setAttachment(item); setPickerOpen(false); ref.current?.focus(); }}
        />
      )}
      {attachment && (
        <div style={{ padding: "6px 10px 0", display: "flex" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
            background: CRT(0.06), border: `1px solid ${CRT(0.2)}`, borderRadius: 6,
            fontSize: "0.58rem", color: CRT(0.8), fontFamily: fontFor(boomer), maxWidth: "100%",
          }}>
            <FileText size={12} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{attachment.name}</span>
            <button onClick={() => setAttachment(null)} style={{ background: "none", border: "none", color: CRT(0.5), cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}
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
      {allowAttach && (
        <button
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          title="Attach from library"
          style={{
            background: "transparent",
            border: `1px solid ${CRT(disabled ? 0.1 : 0.25)}`,
            borderRadius: 6,
            color: CRT(disabled ? 0.2 : 0.7),
            cursor: disabled ? "default" : "pointer",
            padding: "7px 9px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <Paperclip size={14} />
        </button>
      )}
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
        disabled={disabled || (!value.trim() && !attachment)}
        style={{
          background: disabled || (!value.trim() && !attachment) ? "transparent" : CRT(0.1),
          border: `1px solid ${CRT(disabled || (!value.trim() && !attachment) ? 0.1 : 0.35)}`,
          borderRadius: 6,
          color: CRT(disabled || (!value.trim() && !attachment) ? 0.2 : 0.9),
          cursor: disabled || (!value.trim() && !attachment) ? "default" : "pointer",
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
  const [contacts, setContacts] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Load the full associates directory up front so the picker is useful with
  // zero typing — coworkers (same org) ∪ accepted colleagues (cross-org),
  // online ones first. Search just filters this list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(
          `${import.meta.env.BASE_URL}api/colleagues/contacts`,
          { credentials: "include" }
        );
        if (res.ok && !cancelled) {
          const data: {
            contacts: Array<{
              userId: string;
              name: string;
              email: string | null;
              username?: string | null;
              profileImageUrl: string | null;
              relation: "coworker" | "colleague";
              online?: boolean;
              lastSeenAt?: string | null;
            }>;
          } = await res.json();
          const adapted: UserSearchResult[] = data.contacts.map(c => {
            const parts = (c.name || "").trim().split(/\s+/);
            return {
              userId: c.userId,
              firstName: parts[0] ?? null,
              lastName: parts.slice(1).join(" ") || null,
              email: c.email,
              username: c.username ?? null,
              profileImageUrl: c.profileImageUrl,
              online: c.online,
              lastSeenAt: c.lastSeenAt,
            } as UserSearchResult;
          });
          adapted.sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1));
          setContacts(adapted);
        }
      } catch { }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? contacts.filter(m => {
        const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase();
        return name.includes(q) || (m.email ?? "").toLowerCase().includes(q) || (m.username ?? "").toLowerCase().includes(q);
      })
    : contacts;

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
            LOADING ASSOCIATES...
          </div>
        )}
        {!loading && !query.trim() && results.length > 0 && (
          <div
            style={{
              color: CRT(0.3),
              fontSize: "0.5rem",
              fontFamily: fontFor(boomer),
              letterSpacing: "0.12em",
              padding: "8px 4px 4px",
            }}
          >
            ASSOCIATES · {results.filter(m => m.online).length} ONLINE
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.68rem", color: "rgba(220,220,220,0.9)", fontFamily: fontFor(boomer), display: "flex", alignItems: "center", gap: 6 }}>
                  <PresenceDot online={m.online} size={7} />
                  {name}
                  {m.username && (
                    <span style={{ color: CRT(0.4), marginLeft: 6 }}>@{m.username}</span>
                  )}
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
        {!loading && results.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: CRT(0.3),
              fontSize: "0.58rem",
              fontFamily: fontFor(boomer),
              padding: "20px 0",
            }}
          >
            {query.trim() ? "NO RESULTS" : "NO ASSOCIATES YET"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notification persistence helpers ─────────────────────────────────────────
// Storing seen-IDs and the associate-request baseline in localStorage prevents
// the same toast from re-firing on page reload / component remount.

function _seenMsgKey(uid: string) { return `sm_notif_seen_msgs_${uid}`; }
function _assocBaselineKey(uid: string) { return `sm_notif_assoc_baseline_${uid}`; }

function _loadSeenMsgs(uid: string): Set<number> {
  if (!uid) return new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(_seenMsgKey(uid)) ?? "[]") as number[];
    return new Set(arr);
  } catch { return new Set(); }
}

function _saveSeenMsgs(uid: string, set: Set<number>): void {
  if (!uid) return;
  try {
    localStorage.setItem(_seenMsgKey(uid), JSON.stringify(Array.from(set).slice(-200)));
  } catch { /* storage quota */ }
}

function _readAssocBaseline(uid: string): number | null {
  if (!uid) return null;
  const v = localStorage.getItem(_assocBaselineKey(uid));
  return v === null ? null : Number(v);
}

function _writeAssocBaseline(uid: string, n: number): void {
  if (!uid) return;
  try {
    if (n <= 0) localStorage.removeItem(_assocBaselineKey(uid));
    else localStorage.setItem(_assocBaselineKey(uid), String(n));
  } catch { /* storage quota */ }
}

export function ChatPanel({
  initiallyOpen = false,
  initialDmUserId,
  embedded = false,
}: {
  initiallyOpen?: boolean;
  initialDmUserId?: string;
  embedded?: boolean;
} = {}) {
  const { user, isAuthenticated } = useAuth();
  const [boomerMode] = useBoomerMode();
  const boomer = boomerMode;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(embedded || initiallyOpen);
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
    markAllRead,
    loadHistory,
    startPrivateChat,
    sendToPablo,
    refreshChannels,
  } = useChatSocket();

  const currentUserId = (user as any)?.id ?? "";

  // When user identity resolves, hydrate the seen-msg set and the assoc baseline
  // from localStorage so remounts never re-toast old notifications.
  useEffect(() => {
    if (!currentUserId) return;
    seenMsgIdsRef.current = _loadSeenMsgs(currentUserId);
    msgInitRef.current = false; // re-baseline for this user
    prevPendingRef.current = null; // associate effect will read localStorage as fallback
  }, [currentUserId]);

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
      // Reading a channel may clear unread that feeds the COMMS nav badge.
      invalidateCommsSummary();
    }
  }, [open, activeChannelId, messages]);

  // Opening the chat panel = the user has seen their comms inbox. Clear EVERY
  // counted channel (not just the active tab) so the COMMS badge goes away once
  // seen/clicked instead of lingering for channels the user never opened. Wait
  // for the cursor write to finish before refetching the badge summary, or the
  // GET races the POST and the badge stays stale until the next poll.
  useEffect(() => {
    if (!open) return;
    markAllRead().finally(() => invalidateCommsSummary());
  }, [open, markAllRead]);

  const handleSend = async (text: string, attachmentFileId?: number) => {
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
    send(activeChannelId, text, attachmentFileId);
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

  // A direct-message intent may be what caused the lazy ChatPanel chunk to
  // load. Consume the payload directly after mount rather than racing a
  // re-dispatched window event against dynamic import completion.
  useEffect(() => {
    if (!initialDmUserId || initialDmUserId === currentUserId) return;
    let active = true;
    void startPrivateChat(initialDmUserId).then((channelId) => {
      if (!active || !channelId) return;
      setOpen(true);
      setActivePrivateChannelId(channelId);
      setActiveTab("private");
      setShowUserSearch(false);
    });
    return () => { active = false; };
  }, [initialDmUserId, currentUserId, startPrivateChat]);

  // Esc-to-close — basic dialog accessibility for the bottom-sheet on
  // mobile and the floating panel on desktop. Keyboard users can also
  // back out instead of being trapped.
  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, embedded]);

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
    const onOpenChat = () => setOpen(true);
    window.addEventListener("salaryman:open-dm", onOpenDm as EventListener);
    window.addEventListener("salaryman:open-chat", onOpenChat as EventListener);
    return () => {
      window.removeEventListener("salaryman:open-dm", onOpenDm as EventListener);
      window.removeEventListener("salaryman:open-chat", onOpenChat as EventListener);
    };
  }, [currentUserId, startPrivateChat]);

  // --- Proactive toast notifications -------------------------------------
  // Surface new comms (incoming DM/company/Pablo messages + associate
  // requests) the moment they arrive so the user notices without having to
  // glance at the nav badge. The public GLOBAL firehose is intentionally
  // excluded — it's high-volume and not directed at the user.
  const [, navigate] = useLocation();
  const [commsAlertsOn] = useCommsAlerts();
  // "Do Not Disturb while playing": when on AND the user is currently inside an
  // immersive city/full-screen view (e.g. WorldPlay), pop-up toasts are
  // suppressed. Badge/unread counts still update — we only skip the toast.
  const [commsCityDndOn] = useCommsCityDnd();
  const immersiveViewActive = useImmersiveViewActive();
  const suppressForCityDnd = commsCityDndOn && immersiveViewActive;
  const { pendingRequests, loading: commsLoading } = useCommsSummary();

  // Open the panel focused on a specific channel (used by the toast VIEW
  // action). Stable so the message effect below doesn't re-run on every
  // render.
  const openChannelById = useCallback((channelId: number) => {
    setShowUserSearch(false);
    if (channelId === pabloChannelId) setActiveTab("pablo");
    else if (channelId === companyChannelId) setActiveTab("company");
    else {
      setActiveTab("private");
      setActivePrivateChannelId(channelId);
    }
    setOpen(true);
  }, [pabloChannelId, companyChannelId]);

  // Message-arrival toasts. We track which message ids we've already
  // considered so re-renders never re-toast, and use createdAt recency to
  // ignore history backfill (loadHistory dumps old messages all at once).
  // A short coalescing window collapses a burst into a single toast.
  const seenMsgIdsRef = useRef<Set<number>>(new Set());
  const msgInitRef = useRef(false);
  const chatToastRef = useRef<ReturnType<typeof toast> | null>(null);
  const chatToastCountRef = useRef(0);
  const chatToastTimeRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const COALESCE_WINDOW = 5000;
    const RECENT_MS = 20000;
    const candidates: ChatMessage[] = [];

    // Still walk every message so seen-ids and the init baseline stay current;
    // we just suppress the toast at the end when alerts are disabled. This
    // keeps badge/unread counts correct and avoids a burst of stale toasts if
    // the user re-enables alerts mid-session.
    let didAddSeenId = false;
    for (const [cidStr, msgs] of Object.entries(messages)) {
      const cid = Number(cidStr);
      for (const m of msgs) {
        if (seenMsgIdsRef.current.has(m.id)) continue;
        seenMsgIdsRef.current.add(m.id);
        didAddSeenId = true;
        if (!msgInitRef.current) continue; // baseline: don't toast pre-existing
        if (globalChannelId != null && cid === globalChannelId) continue; // exclude firehose
        if (channelMeta == null) continue; // wait for channel scope to load
        if (m.senderUserId === currentUserId) continue; // not your own message
        if (now - new Date(m.createdAt).getTime() > RECENT_MS) continue; // skip backfill
        if (open && cid === activeChannelId) continue; // already reading it
        candidates.push(m);
      }
    }
    // Persist any newly-seen IDs so they survive remounts/navigation.
    if (didAddSeenId) _saveSeenMsgs(currentUserId, seenMsgIdsRef.current);

    if (!msgInitRef.current) {
      msgInitRef.current = true;
      return;
    }
    if (candidates.length === 0) return;
    if (!commsAlertsOn) return; // pop-up alerts disabled in settings
    if (suppressForCityDnd) return; // DND while in city/full-screen view

    const latest = candidates[candidates.length - 1];
    const targetChannelId = latest.channelId;
    const snippet = (m: ChatMessage) => {
      const body = (m.content ?? "").trim();
      if (body) return body.length > 60 ? `${body.slice(0, 60)}…` : body;
      if (m.attachmentName) return "Sent an attachment";
      return "New message";
    };
    const action = (
      <ToastAction altText="View message" onClick={() => openChannelById(targetChannelId)}>
        VIEW
      </ToastAction>
    );

    if (chatToastRef.current && now - chatToastTimeRef.current < COALESCE_WINDOW) {
      chatToastCountRef.current += candidates.length;
      const n = chatToastCountRef.current;
      chatToastRef.current.update({
        id: chatToastRef.current.id,
        title: "New messages",
        description: `${n} new messages in PAYPHONE`,
        action,
      });
    } else {
      chatToastCountRef.current = candidates.length;
      const description =
        candidates.length === 1
          ? `${latest.senderName}: ${snippet(latest)}`
          : `${candidates.length} new messages in PAYPHONE`;
      chatToastRef.current = toast({
        title: candidates.length === 1 ? "New message" : "New messages",
        description,
        duration: 6000,
        action,
      });
      playNotify();
    }
    chatToastTimeRef.current = now;
  }, [messages, globalChannelId, channelMeta, currentUserId, open, activeChannelId, openChannelById, commsAlertsOn, suppressForCityDnd]);

  // Associate-request toasts. The comms summary is polled, so we watch its
  // pendingRequests count and fire when it climbs. The first non-loading
  // value is treated as a baseline so we don't toast for requests that were
  // already waiting when the app loaded. The baseline is persisted to
  // localStorage so it survives page reloads and remounts.
  const prevPendingRef = useRef<number | null>(null);
  useEffect(() => {
    if (commsLoading) return;
    // Use the persisted localStorage baseline when in-memory ref is unset
    // (first run this session for this user). Falls back to null (no stored
    // value) on a genuinely first-ever login, which triggers the baseline pass.
    const prev = prevPendingRef.current ?? _readAssocBaseline(currentUserId);
    prevPendingRef.current = pendingRequests;
    _writeAssocBaseline(currentUserId, pendingRequests);
    if (prev === null) return; // first ever — establish baseline, no toast
    if (!commsAlertsOn) return; // pop-up alerts disabled in settings
    if (suppressForCityDnd) return; // DND while in city/full-screen view
    if (pendingRequests > prev) {
      const delta = pendingRequests - prev;
      playNotify();
      toast({
        title: "New associate request",
        description:
          delta === 1
            ? "Someone wants to connect with you."
            : `${delta} new associate requests.`,
        duration: 6000,
        action: (
          <ToastAction
            altText="View associate requests"
            onClick={() => {
              // Persist the count immediately so tapping VIEW marks it handled forever.
              _writeAssocBaseline(currentUserId, pendingRequests);
              navigate("/comms");
            }}
          >
            VIEW
          </ToastAction>
        ),
      });
    }
  }, [pendingRequests, commsLoading, navigate, commsAlertsOn, suppressForCityDnd, currentUserId]);

  if (!isAuthenticated) return null;

  const PANEL_W = embedded ? "100%" : isMobile ? "100vw" : 340;
  // Mobile: bottom-sheet sized to ~78% of the viewport so the user can
  // (a) tap the backdrop above to dismiss / see the page behind, and
  // (b) keep the input bar comfortably clear of the on-screen keyboard.
  // Desktop: fixed 480px floating panel.
  const PANEL_H = embedded ? (isMobile ? "calc(100dvh - 210px)" : 600) : isMobile ? "78dvh" : 480;

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
      {open && isMobile && !embedded && (
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
            position: embedded ? "relative" : "fixed",
            ...(embedded
              ? { borderRadius: 10, margin: "16px auto 0" }
              : isMobile
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
            zIndex: embedded ? 1 : 9999,
            boxShadow: isMobile
              ? "0 -8px 32px rgba(0,0,0,0.7)"
              : `0 8px 40px rgba(0,0,0,0.8), 0 0 20px ${CRT(0.05)}`,
            fontFamily: fontFor(boomer),
            overflow: "hidden",
            animation: embedded ? "none" : isMobile ? "chatSheetUp 0.22s ease-out" : "chatSlideUp 0.2s ease-out",
            // Mobile: respect the iOS home indicator + landscape rounded
            // corners. Top inset is unneeded now that the sheet doesn't
            // reach the notch.
            ...(isMobile
              ? {
                  paddingBottom: "var(--app-safe-bottom)",
                  paddingLeft: "var(--app-safe-left)",
                  paddingRight: "var(--app-safe-right)",
                  boxSizing: "border-box",
                }
              : null),
          }}
        >
          {isMobile && !embedded && (
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
                PAYPHONE
              </span>
            </div>
            {!embedded && <button
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
            </button>}
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
                {
                  id: "pablo" as Tab,
                  label: "PABLO",
                  icon: (
                    <span
                      aria-hidden
                      className="block h-4 w-4 rounded-full"
                      style={{
                        background: "radial-gradient(circle, #e879f9 0%, #8b5cf6 42%, #312e81 72%, transparent 78%)",
                        boxShadow: "0 0 6px rgba(236,72,153,.55)",
                      }}
                    />
                  ),
                  unread: tabPabloUnread,
                },
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
                    <PresenceDot online={p.otherUser?.online} size={6} />
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
                key={activeChannelId ?? 0}
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
                allowAttach={(activeTab === "private" || activeTab === "company") && activeChannelId != null}
                boomer={boomer}
              />
            </>
          )}
        </div>
      )}

      {!embedded && <button
        onClick={() => setOpen(o => !o)}
        data-testid="button-comms-toggle"
        style={{
          position: "fixed",
          // ChatPanel is hidden on GAME_ROUTES (WorldPlay, /game, /mobile) so
          // we don't need to dodge the in-game action stack. Sit in the
          // bottom-RIGHT corner with comfortable padding — that area is
          // usually clear, and it keeps the ask-bot prompt off the user's
          // profile. Respect the iOS home-indicator safe-area inset on mobile.
          bottom: isMobile ? `calc(var(--app-safe-bottom) + 24px + var(--fab-bottom-offset, 0px))` : `calc(16px + var(--fab-bottom-offset, 0px))`,
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
              // Badge moves with the FAB to bottom-right, so anchor it on
              // the FAB's inner (left) edge — visible without colliding
              // with the screen edge on the right.
              left: isMobile ? -4 : -3,
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
      </button>}

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
