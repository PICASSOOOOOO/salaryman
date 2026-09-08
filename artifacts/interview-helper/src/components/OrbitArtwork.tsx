import "./OrbitArtwork.css";

const nodes = [
  ["calls", "CALLS"],
  ["crm", "CRM"],
  ["files", "FILES"],
  ["agents", "AGENTS"],
  ["ops", "OPS"],
  ["finance", "FINANCE"],
] as const;

/**
 * A non-interactive hero illustration. It intentionally has no controls or
 * semantic content so the page's existing heading and calls to action remain
 * the complete accessible hero experience.
 */
export function OrbitArtwork() {
  return (
    <div className="sm-orbit-art" aria-hidden="true">
      <div className="sm-orbit-meta sm-orbit-meta-top"><span>OPERATING RHYTHM</span><b>LIVE</b></div>
      <div className="sm-orbit-meta sm-orbit-meta-bottom"><span>06 SYSTEMS</span><b>CONNECTED</b></div>
      <svg className="sm-orbit-lines" viewBox="0 0 760 560" focusable="false">
        <ellipse cx="380" cy="278" rx="292" ry="133" className="sm-orbit-ring sm-orbit-ring-one" />
        <ellipse cx="380" cy="278" rx="206" ry="216" className="sm-orbit-ring sm-orbit-ring-two" />
        <ellipse cx="380" cy="278" rx="143" ry="266" className="sm-orbit-ring sm-orbit-ring-three" />
        <path d="M136 171 C267 92 470 112 633 202" className="sm-orbit-connector" />
        <path d="M111 382 C269 467 502 448 650 346" className="sm-orbit-connector sm-orbit-connector-soft" />
        <path d="M206 107 C265 227 271 358 206 451" className="sm-orbit-connector sm-orbit-connector-soft" />
        <path d="M554 104 C488 220 490 363 559 456" className="sm-orbit-connector" />
        <circle cx="380" cy="278" r="61" className="sm-orbit-core-ring" />
        <circle cx="380" cy="278" r="7" className="sm-orbit-core-dot" />
      </svg>
      <div className="sm-orbit-nodes">
        {nodes.map(([id, label]) => (
          <span className={`sm-orbit-node sm-orbit-node-${id}`} key={id}>
            <i />{label}
          </span>
        ))}
      </div>
      <div className="sm-orbit-center">
        <span>ONE CLEAR</span>
        <strong>MOVE</strong>
        <small>next move</small>
      </div>
      <span className="sm-orbit-tick sm-orbit-tick-left">01</span>
      <span className="sm-orbit-tick sm-orbit-tick-right">06</span>
    </div>
  );
}