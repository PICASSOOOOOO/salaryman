import { useState } from "react";
import "./OrbitEngine.css";

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: "green" | "ink" | "paper";
  size?: "large" | "small";
};

const nodes: Node[] = [
  { id: "calls", label: "CALLS", x: 18, y: 31, tone: "paper" },
  { id: "crm", label: "CRM", x: 47, y: 19, tone: "green", size: "large" },
  { id: "files", label: "FILES", x: 76, y: 30, tone: "paper" },
  { id: "agents", label: "AGENTS", x: 80, y: 65, tone: "ink" },
  { id: "ops", label: "OPS", x: 49, y: 79, tone: "paper" },
  { id: "finance", label: "FINANCE", x: 18, y: 66, tone: "green" },
];

export function OrbitEngine() {
  const [focused, setFocused] = useState("crm");

  return (
    <main className="orbit-page" data-testid="orbit-engine-preview">
      <header className="orbit-nav">
        <div className="orbit-brand" data-testid="text-brand">
          <span className="orbit-mark">S</span>
          <span className="orbit-brand-name">SALARYMAN</span>
          <span className="orbit-brand-sub">by Picasso AI · business OS</span>
        </div>
        <nav className="orbit-links" aria-label="Main navigation">
          <button type="button" data-testid="button-features">Features <span>⌄</span></button>
          <span>Web workspace</span>
          <span>Meet Pablo ↗</span>
          <span className="orbit-privacy">Privacy</span>
        </nav>
      </header>

      <section className="orbit-hero" aria-labelledby="orbit-title">
        <div className="orbit-copy">
          <div className="orbit-kicker"><i /> THE BUSINESS OPERATING SYSTEM</div>
          <h1 id="orbit-title">Make work feel <em>possible.</em></h1>
          <p>Calls, customers, files, and daily operations in one clear workspace.</p>
          <button className="orbit-cta" type="button" data-testid="button-open-workspace">
            OPEN CALLL HOME <span>→</span>
          </button>
        </div>

        <div className="orbit-art" data-testid="visual-orbit-engine">
          <div className="art-meta art-meta-top"><span>OPERATING RHYTHM</span><b>LIVE</b></div>
          <div className="art-meta art-meta-bottom"><span>06 SYSTEMS</span><b>CONNECTED</b></div>
          <svg className="orbit-lines" viewBox="0 0 760 560" aria-hidden="true">
            <ellipse cx="380" cy="278" rx="292" ry="133" className="ring ring-one" />
            <ellipse cx="380" cy="278" rx="206" ry="216" className="ring ring-two" />
            <ellipse cx="380" cy="278" rx="143" ry="266" className="ring ring-three" />
            <path d="M136 171 C267 92 470 112 633 202" className="connector" />
            <path d="M111 382 C269 467 502 448 650 346" className="connector connector-soft" />
            <path d="M206 107 C265 227 271 358 206 451" className="connector connector-soft" />
            <path d="M554 104 C488 220 490 363 559 456" className="connector" />
            <circle cx="380" cy="278" r="61" className="core-ring" />
            <circle cx="380" cy="278" r="7" className="core-dot" />
          </svg>
          <div className="orbit-node-list">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`orbit-node node-${node.id} node-${node.tone} ${node.size === "large" ? "node-large" : ""} ${focused === node.id ? "is-focused" : ""}`}
                onClick={() => setFocused(node.id)}
                data-testid={`button-node-${node.id}`}
                aria-label={`Focus ${node.label}`}
              >
                <span className="node-dot" />
                <span className="node-label">{node.label}</span>
              </button>
            ))}
          </div>
          <div className="orbit-center-label">
            <span>ONE CLEAR</span>
            <strong>{focused.toUpperCase()}</strong>
            <small>next move</small>
          </div>
          <div className="art-tick tick-left">01</div>
          <div className="art-tick tick-right">06</div>
        </div>
      </section>
      <div className="orbit-rule" />
      <div className="orbit-caption"><span>01 / ORBIT ENGINE</span><span>COORDINATE THE WORK, NOT THE TABS</span></div>
    </main>
  );
}

export default OrbitEngine;