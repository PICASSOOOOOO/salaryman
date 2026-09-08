import { useState } from "react";
import { ArrowRight, ChevronDown, Crosshair, MoveUpRight, Radio, ScanLine } from "lucide-react";
import "./KineticBlueprint.css";

const navItems = ["Features", "Web workspace", "Meet Pablo"];

function BlueprintStage() {
  const [showSpecs, setShowSpecs] = useState(true);

  return (
    <div className="kb-stage" data-testid="visual-blueprint-stage">
      <div className="kb-stage-top">
        <span className="kb-stage-title"><span className="kb-live-dot" /> SALARYMAN / OPERATING VIEW</span>
        <button className="kb-spec-toggle" type="button" onClick={() => setShowSpecs((value) => !value)} aria-pressed={showSpecs} data-testid="button-toggle-specs">
          <ScanLine size={13} /> {showSpecs ? "Hide specs" : "Show specs"}
        </button>
      </div>
      <div className="kb-corner kb-corner-tl" /><div className="kb-corner kb-corner-br" />
      <div className="kb-measure kb-measure-x"><span>01</span><i /><span>02</span><i /><span>03</span></div>
      <div className="kb-measure kb-measure-y"><span>00</span><i /><span>20</span><i /><span>40</span></div>
      <div className="kb-crosshair"><Crosshair size={18} /></div>
      <div className="kb-path kb-path-one" /><div className="kb-path kb-path-two" />
      <div className="kb-node kb-node-a" /><div className="kb-node kb-node-b" /><div className="kb-node kb-node-c" />

      <div className="kb-panel kb-panel-main">
        <div className="kb-panel-head"><span>COMMAND / 004</span><b>LIVE</b></div>
        <div className="kb-main-title">The working<br /><em>system.</em></div>
        <div className="kb-main-rule" />
        <div className="kb-main-meta"><span>ACTIVE SIGNAL</span><strong>74.8%</strong><small>+ 4.2 / WK</small></div>
        <div className="kb-graph" aria-hidden="true">
          <div className="kb-graph-line kb-graph-line-one" /><div className="kb-graph-line kb-graph-line-two" />
          <span className="kb-graph-marker" /><span className="kb-graph-marker marker-two" />
        </div>
        <div className="kb-panel-footer"><span>08:42:19 UTC</span><span>SYNCED <i /></span></div>
      </div>
      {showSpecs && (
        <>
          <div className="kb-panel kb-panel-float kb-panel-float-a"><span className="kb-label">INBOX / OPEN</span><strong>12</strong><small>next clear moves</small></div>
          <div className="kb-panel kb-panel-float kb-panel-float-b"><span className="kb-label">ROUTING</span><div className="kb-routing"><i /><i /><i /><i /></div><small>every signal has a home</small></div>
          <div className="kb-annotation kb-annotation-a">A / SINGLE SOURCE <i /></div>
          <div className="kb-annotation kb-annotation-b">B / NEXT ACTION <i /></div>
        </>
      )}
      <div className="kb-stage-footer"><span>FIG. 01 — OPERATING RHYTHM</span><span>SCROLL TO CONNECT</span></div>
    </div>
  );
}

export default function KineticBlueprint() {
  return (
    <main className="kb-home" data-testid="kinetic-blueprint-preview">
      <header className="kb-nav">
        <a className="kb-brand" href="#top" data-testid="link-kb-brand"><span className="kb-brand-mark">S</span><span><b>SALARYMAN</b><small>by Picasso AI · business OS</small></span></a>
        <nav aria-label="Main navigation">
          {navItems.map((item, index) => <a href={index === 1 ? "#workspace" : "#features"} key={item} data-testid={`link-kb-nav-${index}`}>{item}{index === 0 && <ChevronDown size={13} />}{index === 2 && <MoveUpRight size={13} />}</a>)}
          <a href="#privacy" className="kb-privacy-link" data-testid="link-kb-privacy">Privacy</a>
        </nav>
      </header>
      <section className="kb-hero" id="top" aria-labelledby="kb-title">
        <div className="kb-copy">
          <div className="kb-kicker"><span className="kb-kicker-line" /> THE BUSINESS OPERATING SYSTEM</div>
          <h1 id="kb-title">Make work feel <em>possible.</em></h1>
          <p>Calls, customers, files, and daily operations in one clear workspace.</p>
          <div className="kb-actions"><a href="#workspace" className="kb-primary" data-testid="link-kb-cta">Open CALLL HOME <ArrowRight size={15} /></a></div>
          <div className="kb-note"><Radio size={12} /> A precise place for the next clear move.</div>
        </div>
        <BlueprintStage />
      </section>
      <div className="kb-underbar"><span><b>01</b> KINETIC BLUEPRINT</span><span>Outline system / measured motion / no noise</span><span>EST. 2024</span></div>
    </main>
  );
}