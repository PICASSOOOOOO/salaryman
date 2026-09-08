// Static SVG overlay showing approximate resource zone shading on the world map.
// Rendered as a semi-transparent overlay on top of the minimap canvas.
// Zones are approximate regions — does NOT show exact node positions.
import type { ReactNode } from "react";

interface Props {
  visible: boolean;
  onToggle: () => void;
  style?: React.CSSProperties;
  children?: ReactNode;
}

// World dimensions: 14400 x 12600
const WORLD_W = 14400;
const WORLD_H = 12600;

export default function ResourceMapOverlay({ visible, onToggle, style, children }: Props) {
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      {children}
      {visible && (
        <svg
          viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            borderRadius: "50%",
            overflow: "hidden",
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Ocean zones — far west coast */}
          <ellipse cx="1500" cy="3200" rx="1400" ry="2800" fill="rgba(56,189,248,0.18)" />
          <ellipse cx="2200" cy="1200" rx="2000" ry="900" fill="rgba(100,180,220,0.15)" />

          {/* Mountain zones — north highlands */}
          <ellipse cx="3800" cy="2200" rx="2200" ry="1800" fill="rgba(150,150,150,0.18)" />
          <ellipse cx="4400" cy="1600" rx="1600" ry="1200" fill="rgba(80,0,160,0.14)" />

          {/* Forest zones */}
          <circle cx="6800" cy="4200" r="1200" fill="rgba(180,140,40,0.16)" />
          <circle cx="4200" cy="6300" r="1100" fill="rgba(200,140,60,0.15)" />
          <circle cx="6800" cy="8400" r="1300" fill="rgba(180,140,40,0.16)" />
          <circle cx="9200" cy="6300" r="1150" fill="rgba(200,140,60,0.15)" />
          <circle cx="4500" cy="4500" r="1050" fill="rgba(180,140,40,0.14)" />

          {/* Wasteland zones — north */}
          <rect x="6000" y="2000" width="4000" height="2400" rx="200" fill="rgba(120,100,60,0.15)" />
          <ellipse cx="8000" cy="2800" rx="1800" ry="1200" fill="rgba(40,0,80,0.14)" />

          {/* Wasteland zones — south */}
          <rect x="1500" y="8200" width="7000" height="2000" rx="200" fill="rgba(120,100,60,0.15)" />
          <ellipse cx="3800" cy="9600" rx="1600" ry="1000" fill="rgba(40,0,80,0.14)" />

          {/* Wasteland zones — east */}
          <rect x="8500" y="6500" width="4000" height="4500" rx="200" fill="rgba(120,100,60,0.15)" />
          <ellipse cx="10200" cy="8000" rx="1400" ry="1600" fill="rgba(40,0,80,0.14)" />

          {/* Legend labels */}
          <text x="1400" y="2800" fill="rgba(56,189,248,0.7)" fontSize="160" fontFamily="monospace">OCEAN</text>
          <text x="3000" y="2200" fill="rgba(150,150,150,0.7)" fontSize="160" fontFamily="monospace">MOUNTAIN</text>
          <text x="6200" y="4100" fill="rgba(180,140,40,0.8)" fontSize="130" fontFamily="monospace">FOREST</text>
          <text x="6200" y="2600" fill="rgba(120,100,60,0.7)" fontSize="160" fontFamily="monospace">WASTELAND</text>
        </svg>
      )}
      <button
        onClick={onToggle}
        title={visible ? "Hide resource zones" : "Show resource zones"}
        style={{
          position: "absolute",
          bottom: 4,
          right: 4,
          zIndex: 1,
          background: visible ? "rgba(255,200,50,0.25)" : "rgba(0,0,0,0.55)",
          border: `1px solid ${visible ? "rgba(255,200,50,0.6)" : "rgba(255,255,255,0.2)"}`,
          color: visible ? "rgba(255,200,50,0.9)" : "rgba(255,255,255,0.5)",
          borderRadius: "3px",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: "0.42rem",
          letterSpacing: "0.08em",
          padding: "2px 5px",
          lineHeight: 1.4,
        }}
      >
        {visible ? "RES ✓" : "RES"}
      </button>
    </div>
  );
}
