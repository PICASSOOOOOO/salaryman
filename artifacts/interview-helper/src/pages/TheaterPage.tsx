import { useEffect } from "react";
import { useLocation } from "wouter";

const SEAT_ROWS = [
  { y: "76%", count: 18, seatW: 26, gap: 4, height: 18 },
  { y: "83%", count: 16, seatW: 28, gap: 5, height: 20 },
  { y: "90%", count: 14, seatW: 30, gap: 6, height: 22 },
];

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

export default function TheaterPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = "THE THEATER";
    return () => {
      document.title = "SALARYMAN";
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0203",
        overflow: "hidden",
        fontFamily: "'VT323', 'Share Tech Mono', monospace",
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
          {/* Subtle scanline overlay on screen */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)",
              zIndex: 5,
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

      {/* ── Back button ── */}
      <button
        onClick={() => navigate("/game")}
        style={{
          position: "absolute",
          top: 64,
          left: 16,
          zIndex: 40,
          background: "rgba(20,5,5,0.85)",
          border: "1px solid rgba(180,120,30,0.4)",
          color: "#c8900a",
          fontFamily: "'VT323', monospace",
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
      `}</style>
    </div>
  );
}
