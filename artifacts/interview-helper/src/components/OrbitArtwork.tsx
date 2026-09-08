import "./OrbitArtwork.css";

const inputTracks = [
  { id: "calls", color: "#5ea6ce", y: 40, path: "M -50 40 H 280 Q 300 40 300 60 V 170 Q 300 190 320 190 H 350", label: "CALLS", dur: 4.6 },
  { id: "crm", color: "#73bd9f", y: 120, path: "M -50 120 H 240 Q 260 120 260 140 V 200 Q 260 220 280 220 H 350", label: "CRM", dur: 4.1 },
  { id: "files", color: "#8fa3ae", y: 200, path: "M -50 200 H 200 Q 220 200 220 220 V 230 Q 220 250 240 250 H 350", label: "FILES", dur: 3.6 },
  { id: "agents", color: "#e5aa42", y: 360, path: "M -50 360 H 200 Q 220 360 220 340 V 330 Q 220 310 240 310 H 350", label: "AGENTS", dur: 3.6 },
  { id: "ops", color: "#8fc4dc", y: 440, path: "M -50 440 H 240 Q 260 440 260 420 V 360 Q 260 340 280 340 H 350", label: "OPS", dur: 4.1 },
  { id: "finance", color: "#69c59f", y: 520, path: "M -50 520 H 280 Q 300 520 300 500 V 390 Q 300 370 320 370 H 350", label: "FINANCE", dur: 4.6 },
];

const busNodes = [190, 220, 250, 310, 340, 370];

/**
 * A non-interactive hero illustration representing the "Impossible Machine".
 * Scattered fragmented work enters on the left, travels through a precise
 * mechanical sequence, and exits as one unified clear outcome on the right.
 */
export function OrbitArtwork() {
  return (
    <div className="sm-orbit-art" aria-hidden="true">
      <div className="sm-orbit-meta sm-orbit-meta-top"><span>OPERATING RHYTHM</span><b>LIVE</b></div>
      <div className="sm-orbit-meta sm-orbit-meta-bottom"><span>06 SYSTEMS</span><b>CONNECTED</b></div>

      <svg className="sm-orbit-lines" viewBox="0 0 760 560" focusable="false">
        <defs>
          <filter id="mach-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#73bd9f" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#73bd9f" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Input Tracks */}
        <g className="mach-tracks">
          {inputTracks.map((track) => (
            <g key={track.id}>
              {/* Solid faint technical path */}
              <path d={track.path} className="mach-track-bg" />
              {/* Animated dashed energy flow */}
              <path d={track.path} stroke={track.color} className="mach-track-flow" />

              {/* Particles creating the continuous chain reaction */}
              <circle r="2.5" fill={track.color} filter="url(#mach-glow)" className="mach-particle">
                <animateMotion dur={`${track.dur}s`} repeatCount="indefinite" path={track.path} begin="0s" />
              </circle>
              <circle r="2.5" fill={track.color} filter="url(#mach-glow)" className="mach-particle">
                <animateMotion dur={`${track.dur}s`} repeatCount="indefinite" path={track.path} begin={`-${track.dur / 2}s`} />
              </circle>
            </g>
          ))}
        </g>

        {/* Vertical Collector Bus */}
        <g className="mach-bus">
          <line x1="350" y1="180" x2="350" y2="380" stroke="#1e2422" strokeWidth="5" strokeLinecap="round" />
          <line x1="350" y1="190" x2="350" y2="370" stroke="#73bd9f" strokeWidth="1.5" strokeLinecap="round" />
          {busNodes.map(y => (
            <circle key={y} cx="350" cy={y} r="3" fill="#fffaf0" stroke="#1e2422" strokeWidth="1.5" />
          ))}
          <circle cx="350" cy="280" r="5" fill="#73bd9f" />
          <circle cx="350" cy="280" r="2" fill="#fffaf0" />
        </g>

        {/* Bus to Core Data Transfer */}
        <g className="mach-connection">
          <line x1="350" y1="280" x2="440" y2="280" stroke="#1e2422" strokeWidth="3" />
          <path d="M 350 280 H 440" stroke="#73bd9f" strokeWidth="1.5" strokeDasharray="6 6" className="mach-track-flow" />
          <circle r="3" fill="#0b6b3a" filter="url(#mach-glow)" className="mach-particle">
            <animateMotion dur="0.9s" repeatCount="indefinite" path="M 350 280 H 440" begin="0s" />
          </circle>
          <circle r="3" fill="#0b6b3a" filter="url(#mach-glow)" className="mach-particle">
            <animateMotion dur="0.9s" repeatCount="indefinite" path="M 350 280 H 440" begin="-0.45s" />
          </circle>
        </g>

        {/* Output Outcome Move */}
        <g className="mach-output">
          <path d="M 560 280 H 850" stroke="#1e2422" strokeWidth="3" />
          <path d="M 560 280 H 850" stroke="#0b6b3a" strokeWidth="2" strokeDasharray="12 12" className="mach-track-flow" />
          <g filter="url(#mach-glow)" className="mach-particle">
            <rect x="-12" y="-4" width="24" height="8" rx="4" fill="#0b6b3a">
              <animateMotion dur="1.9s" repeatCount="indefinite" path="M 560 280 H 850" begin="0s" />
            </rect>
          </g>
          <g filter="url(#mach-glow)" className="mach-particle">
            <rect x="-12" y="-4" width="24" height="8" rx="4" fill="#0b6b3a">
              <animateMotion dur="1.9s" repeatCount="indefinite" path="M 560 280 H 850" begin="-0.95s" />
            </rect>
          </g>
        </g>

        {/* Central Processing Core */}
        <g className="mach-core">
          <circle cx="500" cy="280" r="150" fill="url(#core-glow)" />
          <circle cx="500" cy="280" r="140" fill="none" stroke="#cadce5" strokeWidth="1" />

          <circle cx="500" cy="280" r="120" fill="none" stroke="#2d6f55" strokeWidth="2" strokeDasharray="10 15" className="mach-spin" />
          <circle cx="500" cy="280" r="100" fill="none" stroke="#73bd9f" strokeWidth="1" strokeDasharray="40 10 5 10" className="mach-spin-reverse" />

          {/* Mechanical Nodes spinning on the ring */}
          <g className="mach-spin" style={{ animationDuration: '35s' }}>
            <circle cx="500" cy="180" r="3" fill="#a4ddad" />
            <circle cx="500" cy="380" r="3" fill="#a4ddad" />
            <circle cx="400" cy="280" r="3" fill="#a4ddad" />
            <circle cx="600" cy="280" r="3" fill="#a4ddad" />
          </g>

          <circle cx="500" cy="280" r="60" fill="#fffaf0" stroke="#1e2422" strokeWidth="3" />
          <circle cx="500" cy="280" r="50" fill="none" stroke="#0b6b3a" strokeWidth="1.5" className="mach-pulse-ring" />

          {/* Typography inside the core */}
          <text x="500" y="263" fill="#71858f" fontSize="7" fontFamily="Space Grotesk, sans-serif" fontWeight="700" letterSpacing="0.15em" textAnchor="middle">ONE CLEAR</text>
          <text x="500" y="287" fill="#0b6b3a" fontSize="24" fontFamily="Space Grotesk, sans-serif" fontWeight="600" letterSpacing="-0.03em" textAnchor="middle">MOVE</text>
          <text x="500" y="303" fill="#a8c7d4" fontSize="9" fontFamily="DM Sans, sans-serif" fontWeight="400" textAnchor="middle">next move</text>
        </g>

        {/* Input Labels overlay - placed last to render on top */}
        <g className="mach-labels">
          {inputTracks.map((track) => (
            <g key={`label-${track.id}`}>
              <rect x="20" y={track.y - 11} width="46" height="14" rx="4" fill="#fffaf0" stroke="#cadce5" strokeWidth="1" />
              <text x="43" y={track.y - 1} fill={track.color} fontSize="7.5" fontFamily="Space Grotesk, sans-serif" fontWeight="700" letterSpacing="0.1em" textAnchor="middle">
                {track.label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <span className="sm-orbit-tick sm-orbit-tick-left">01</span>
      <span className="sm-orbit-tick sm-orbit-tick-right">06</span>
    </div>
  );
}
