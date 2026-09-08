import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { getActiveCityId } from "@/lib/city-defs";

const SEAT_ROWS = [
  { y: "76%", count: 18, seatW: 26, gap: 4, height: 18 },
  { y: "83%", count: 16, seatW: 28, gap: 5, height: 20 },
  { y: "90%", count: 14, seatW: 30, gap: 6, height: 22 },
];

const THEATER_INTERIOR_BID = "theater";
const THEATER_EMOJIS = ["👏", "😂", "😱", "❤️", "🔥"];

interface CoWatcher {
  id: string;
  name: string;
  class: string;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  fromName: string;
  x: number;
}

let _reactionId = 0;

function SeatRow({ y, count, seatW, gap, height }: { y: string; count: number; seatW: number; gap: number; height: number }) {
  const totalW = count * seatW + (count - 1) * gap;
  return (
    <div
      style={{
        position: "absolute",
        bottom: `calc(100% - ${y})`,
        top: y,
        left: "50%",
        transform: "translateX(-50%)",
        width: totalW,
        height,
        display: "flex",
        gap,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            width: seatW,
            height,
            background: "rgba(8,3,3,0.97)",
            borderRadius: "3px 3px 0 0",
            boxShadow: "0 -2px 4px rgba(0,0,0,0.8)",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function CoWatcherDot({ name, cls }: { name: string; cls: string }) {
  const COLOR: Record<string, string> = {
    executive: "#f5c842",
    replicant: "#4fc3f7",
    ghost:     "#b39ddb",
    vagrant:   "#ef9a9a",
    courier:   "#a5d6a7",
  };
  const color = COLOR[cls.toLowerCase()] ?? "#aaa";
  return (
    <div
      title={name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px 2px 5px",
        background: "rgba(10,2,3,0.82)",
        border: `1px solid ${color}44`,
        borderRadius: 3,
        maxWidth: 140,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 5px 1px ${color}88`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: "#d4b896",
          fontSize: "0.7rem",
          letterSpacing: "0.06em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function FloatingReactionEl({ reaction }: { reaction: FloatingReaction }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "18%",
        left: `${reaction.x}%`,
        zIndex: 60,
        pointerEvents: "none",
        animation: "reactionFloat 2.2s ease-out forwards",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: "2rem", filter: "drop-shadow(0 0 8px rgba(255,200,80,0.7))" }}>
        {reaction.emoji}
      </span>
      <span
        style={{
          color: "rgba(212,184,150,0.85)",
          fontSize: "0.55rem",
          letterSpacing: "0.08em",
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
        }}
      >
        {reaction.fromName}
      </span>
    </div>
  );
}

export default function TheaterPage() {
  const [, navigate] = useLocation();
  const wsRef = useRef<WebSocket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const [coWatchers, setCoWatchers] = useState<CoWatcher[]>([]);
  const peersRef = useRef<Map<string, CoWatcher & { interiorBid?: string }>>(new Map());
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    document.title = "THE THEATER";
    return () => {
      document.title = "SALARYMAN";
    };
  }, []);

  useEffect(() => {
    let char: { name?: string; class?: string; company?: string } = {};
    try {
      const raw = localStorage.getItem("sm_char");
      if (raw) char = JSON.parse(raw);
    } catch { /* ignore */ }

    const name    = (char.name    ?? "VISITOR").toUpperCase();
    const cls     = char.class    ?? "vagrant";
    const company = char.company  ?? "";
    const cityId  = getActiveCityId();

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws?name=${encodeURIComponent(name)}&class=${encodeURIComponent(cls)}&company=${encodeURIComponent(company)}&x=6800&y=6500&city=${encodeURIComponent(cityId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    const syncCoWatchers = () => {
      const myId = myIdRef.current;
      const list: CoWatcher[] = [];
      for (const [id, p] of peersRef.current) {
        if (id === myId) continue;
        if (p.interiorBid === THEATER_INTERIOR_BID) {
          list.push({ id: p.id, name: p.name, class: p.class });
        }
      }
      setCoWatchers(list);
    };

    const announcePresence = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "move",
          x: 6800,
          y: 6500,
          paused: true,
          interiorBid: THEATER_INTERIOR_BID,
        }));
      }
    };

    ws.onopen = () => {
      announcePresence();
    };

    ws.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }

      if (m.type === "welcome") {
        myIdRef.current = m.id;
        syncCoWatchers();
      } else if (m.type === "player_list") {
        peersRef.current.clear();
        for (const p of (m.players ?? [])) {
          peersRef.current.set(p.id, {
            id: p.id,
            name: p.name,
            class: p.class,
            interiorBid: p.interiorBid,
          });
        }
        syncCoWatchers();
      } else if (m.type === "player_move") {
        const existing = peersRef.current.get(m.id);
        if (existing) {
          existing.interiorBid = m.interiorBid;
          syncCoWatchers();
        }
      } else if (m.type === "player_left") {
        peersRef.current.delete(m.id);
        syncCoWatchers();
      } else if (m.type === "theater_reaction") {
        const rid = ++_reactionId;
        const x = 15 + Math.random() * 70;
        setFloatingReactions(prev => [...prev, { id: rid, emoji: m.emoji, fromName: m.fromName, x }]);
        setTimeout(() => {
          setFloatingReactions(prev => prev.filter(r => r.id !== rid));
        }, 2400);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    const heartbeat = setInterval(announcePresence, 8000);

    return () => {
      clearInterval(heartbeat);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const sendReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastSentRef.current < 500) return;
    lastSentRef.current = now;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "theater_reaction", emoji }));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0203",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
        userSelect: "none",
      }}
    >
      {/* ── Ceiling / cornice ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 54,
          background: "linear-gradient(180deg, #1a0305 0%, #0d0203 100%)",
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "2px solid rgba(180,120,30,0.35)",
        }}
      >
        {/* Marquee bulbs row */}
        <div style={{ display: "flex", gap: 18, position: "absolute", top: 0, left: 0, right: 0, justifyContent: "center", paddingTop: 6 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? "#e8a020" : "#c87010",
                boxShadow: `0 0 6px 2px ${i % 3 === 0 ? "rgba(245,200,66,0.7)" : "rgba(200,130,20,0.5)"}`,
                animation: `bulbPulse ${1.2 + (i % 5) * 0.3}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* Title */}
        <div
          style={{
            color: "#f5c842",
            fontSize: "1.5rem",
            letterSpacing: "0.35em",
            textShadow: "0 0 12px rgba(245,200,66,0.8), 0 0 30px rgba(245,160,20,0.4)",
            marginTop: 18,
            zIndex: 1,
          }}
        >
          ★ THE THEATER ★
        </div>
      </div>

      {/* ── Side walls — dark panels ── */}
      <div
        style={{
          position: "absolute",
          inset: "54px 0 0 0",
          background: "linear-gradient(90deg, #160406 0%, #0a0203 12%, #0a0203 88%, #160406 100%)",
          zIndex: 0,
        }}
      />

      {/* ── Left curtain ── */}
      <div
        style={{
          position: "absolute",
          top: 54,
          left: 0,
          width: "13%",
          bottom: 0,
          zIndex: 15,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 130 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="curtainL" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#2a0008" />
              <stop offset="40%" stopColor="#6b0015" />
              <stop offset="70%" stopColor="#8b0020" />
              <stop offset="100%" stopColor="#1a0005" />
            </linearGradient>
            <linearGradient id="goldFringL" x1="1" x2="0" y1="0" y2="0">
              <stop offset="0%" stopColor="#c8900a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8a5a00" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {/* Folds */}
          <path d="M0,0 C30,0 20,80 40,120 C55,155 35,220 50,280 C65,340 40,400 55,460 C70,520 45,560 60,600 L0,600 Z" fill="url(#curtainL)" />
          <path d="M40,0 C65,0 55,70 70,110 C82,148 65,215 78,275 C90,335 70,395 85,455 C98,515 80,558 90,600 L40,600 Z" fill="#5a0012" opacity="0.6" />
          <path d="M75,0 C95,0 88,60 100,95 C110,130 98,200 108,255 C118,310 103,375 115,430 C126,485 110,540 120,600 L80,600 Z" fill="#3a000c" opacity="0.5" />
          {/* Gold fringe at the edge */}
          <rect x="118" y="0" width="12" height="600" fill="url(#goldFringL)" />
          {/* Decorative tassel loops */}
          {[60, 140, 220, 300, 380, 460, 540].map((y, i) => (
            <ellipse key={i} cx="122" cy={y} rx="6" ry="9" fill="#c8900a" opacity="0.8" />
          ))}
        </svg>
      </div>

      {/* ── Right curtain ── */}
      <div
        style={{
          position: "absolute",
          top: 54,
          right: 0,
          width: "13%",
          bottom: 0,
          zIndex: 15,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 130 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="curtainR" x1="1" x2="0" y1="0" y2="0">
              <stop offset="0%" stopColor="#2a0008" />
              <stop offset="40%" stopColor="#6b0015" />
              <stop offset="70%" stopColor="#8b0020" />
              <stop offset="100%" stopColor="#1a0005" />
            </linearGradient>
            <linearGradient id="goldFringR" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#c8900a" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8a5a00" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <path d="M130,0 C100,0 110,80 90,120 C75,155 95,220 80,280 C65,340 90,400 75,460 C60,520 85,560 70,600 L130,600 Z" fill="url(#curtainR)" />
          <path d="M90,0 C65,0 75,70 60,110 C48,148 65,215 52,275 C40,335 60,395 45,455 C32,515 50,558 40,600 L90,600 Z" fill="#5a0012" opacity="0.6" />
          <path d="M55,0 C35,0 42,60 30,95 C20,130 32,200 22,255 C12,310 27,375 15,430 C4,485 20,540 10,600 L50,600 Z" fill="#3a000c" opacity="0.5" />
          {/* Gold fringe at the edge */}
          <rect x="0" y="0" width="12" height="600" fill="url(#goldFringR)" />
          {[60, 140, 220, 300, 380, 460, 540].map((y, i) => (
            <ellipse key={i} cx="8" cy={y} rx="6" ry="9" fill="#c8900a" opacity="0.8" />
          ))}
        </svg>
      </div>

      {/* ── Screen frame & iframe ── */}
      <div
        style={{
          position: "absolute",
          top: 70,
          left: "13%",
          right: "13%",
          height: "68%",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        {/* Arch over screen */}
        <div
          style={{
            height: 10,
            background: "linear-gradient(90deg, #4a2800 0%, #c8900a 20%, #f5c842 50%, #c8900a 80%, #4a2800 100%)",
            borderRadius: "4px 4px 0 0",
            boxShadow: "0 0 18px rgba(245,200,66,0.35)",
            flexShrink: 0,
          }}
        />
        {/* Screen border */}
        <div
          style={{
            flex: 1,
            border: "3px solid #8a5a00",
            boxShadow: "0 0 40px rgba(0,0,0,0.9), inset 0 0 30px rgba(0,0,0,0.6), 0 0 80px rgba(180,100,20,0.15)",
            background: "#000",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <iframe
            src="https://ahomemovie.com"
            title="The Theater Screen"
            allowFullScreen
            allow="fullscreen; autoplay; picture-in-picture"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              background: "#000",
            }}
          />
        </div>
        {/* Bottom gold rail */}
        <div
          style={{
            height: 8,
            background: "linear-gradient(90deg, #4a2800 0%, #c8900a 20%, #f5c842 50%, #c8900a 80%, #4a2800 100%)",
            boxShadow: "0 0 10px rgba(245,200,66,0.2)",
            flexShrink: 0,
          }}
        />
      </div>

      {/* ── Silhouetted seat rows ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
        {SEAT_ROWS.map((row, i) => (
          <SeatRow key={i} {...row} />
        ))}
        {/* Floor gradient */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "28%",
            background: "linear-gradient(0deg, #060102 0%, rgba(6,1,2,0.85) 60%, transparent 100%)",
          }}
        />
        {/* Aisle carpet stripe */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "49%",
            width: "2%",
            height: "20%",
            background: "linear-gradient(0deg, #1a0a08 0%, #2a1008 100%)",
            borderRadius: "2px 2px 0 0",
          }}
        />
      </div>

      {/* ── Floating reactions ── */}
      {floatingReactions.map(r => (
        <FloatingReactionEl key={r.id} reaction={r} />
      ))}

      {/* ── Co-watcher overlay ── */}
      {coWatchers.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 64,
            right: 16,
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              color: "rgba(180,120,30,0.7)",
              fontSize: "0.6rem",
              letterSpacing: "0.18em",
              marginBottom: 2,
              textAlign: "right",
            }}
          >
            {coWatchers.length === 1 ? "1 ALSO WATCHING" : `${coWatchers.length} ALSO WATCHING`}
          </div>
          {coWatchers.slice(0, 8).map(w => (
            <CoWatcherDot key={w.id} name={w.name} cls={w.class} />
          ))}
        </div>
      )}

      {/* ── Emoji reaction bar ── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          display: "flex",
          gap: 8,
          background: "rgba(8,2,3,0.88)",
          border: "1px solid rgba(180,120,30,0.35)",
          borderRadius: 6,
          padding: "6px 12px",
        }}
      >
        {THEATER_EMOJIS.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            title={`React with ${emoji}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.4rem",
              padding: "2px 4px",
              borderRadius: 4,
              transition: "transform 0.1s, background 0.1s",
              lineHeight: 1,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,200,66,0.12)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.25)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
            onMouseDown={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.9)";
            }}
            onMouseUp={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.25)";
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* ── Back button ── */}
      <button
        onClick={() => navigate("/office")}
        style={{
          position: "absolute",
          top: 64,
          left: 16,
          zIndex: 40,
          background: "rgba(20,5,5,0.85)",
          border: "1px solid rgba(180,120,30,0.4)",
          color: "#c8900a",
          fontFamily: "var(--font-sans)",
          fontSize: "0.8rem",
          letterSpacing: "0.12em",
          padding: "4px 12px",
          cursor: "pointer",
          borderRadius: 2,
        }}
      >
        ← EXIT
      </button>

      <style>{`
        @keyframes bulbPulse {
          from { opacity: 0.6; }
          to   { opacity: 1; }
        }
        @keyframes reactionFloat {
          0%   { transform: translateY(0)   scale(1);    opacity: 1; }
          60%  { transform: translateY(-90px) scale(1.1); opacity: 0.9; }
          100% { transform: translateY(-140px) scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
