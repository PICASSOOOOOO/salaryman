import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, Download, FileText, FolderKanban, ExternalLink, Menu, Phone, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import "./ProfessionalHome.css";

const features = [
  ["Phone System", "Calls, routing, and shared numbers", Phone, true],
  ["CRM & Sales", "Keep every relationship moving", Users, true],
  ["Pixel Agents & Automation", "Let routine work run itself", Sparkles, true],
  ["Business Operations", "The daily view of your company", FolderKanban, true],
  ["Knowledge & Files", "One home for the work", FileText, false],
  ["Calendar", "Time that works with your team", CalendarDays, false],
  ["Marketing", "Campaigns with a clear next step", Sparkles, true],
  ["Finance", "Know what is moving and why", ShieldCheck, true],
] as const;

function Capture({ src, title, copy }: { src: string; title: string; copy: string }) {
  return <article className="sm-clip">
    <img className="sm-capture" src={src} alt={`${title} — current desktop-client capture`} />
    <h3>{title}</h3><p>{copy}</p>
  </article>;
}

export default function ProfessionalHome() {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  return <main className="sm-home">
    <header className="sm-nav">
      <a className="sm-brand" href="#top" aria-label="SALARYMAN home">
        <img src="/__mockup/images/salaryman-home/icon-192.png" alt="" />
        <span><strong>SALARYMAN</strong><small>by Picasso AI · business OS</small></span>
      </a>
      <nav className="sm-navlinks" aria-label="Main navigation">
        <div className="sm-feature-wrap">
          <button className="sm-feature-btn" onClick={() => setFeaturesOpen(v => !v)} aria-expanded={featuresOpen}>Features <ChevronDown size={14} /></button>
          {featuresOpen && <FeatureMenu />}
        </div>
        <a href="#desktop">Desktop office</a><a href="#how-it-works">How it works</a><a className="sm-pablo" href="#pablo">Meet Pablo ↗</a>
      </nav>
      <div className="sm-mobile-menu">
        <button className="sm-menu-btn" onClick={() => setFeaturesOpen(v => !v)} aria-expanded={featuresOpen}>{featuresOpen ? <X size={16} /> : <Menu size={16} />} Features</button>
        {featuresOpen && <FeatureMenu />}
      </div>
    </header>
    <section className="sm-hero" id="top">
      <div>
        <div className="sm-kicker"><span className="sm-status" /> The business operating system</div>
        <h1>Make work<br />more possible.</h1>
        <p className="sm-lede">SALARYMAN brings your calls, customers, files, and daily operations into one calm place — with a desktop office you can keep open all day.</p>
        <div className="sm-actions">
          <a className="sm-primary" href="#desktop"><Download size={16} /> Download desktop app <ArrowRight size={15} /></a>
          <a className="sm-secondary" href="#workspace"><ExternalLink size={14} /> Open web workspace</a>
        </div>
        <p className="sm-note">Free desktop client · secure browser pairing · Windows, macOS, and Linux</p>
      </div>
      <div className="sm-stage" id="desktop">
        <div className="sm-window">
          <div className="sm-windowbar"><i /><i /><i /><strong>OFFICE ECOLOGY · ACTIVE</strong></div>
          <img className="sm-capture" src="/__mockup/images/salaryman-home/pygame/operations.png" alt="Operations room — current downloadable desktop-client capture" />
          <div className="sm-window-footer"><span><b>Desktop office</b> · current client capture</span><span>OPERATIONS · ACTIVE</span></div>
        </div>
      </div>
    </section>
    <div className="sm-strip"><div className="sm-strip-inner"><span><strong>One connected workspace</strong> for the whole company</span><span>Phone · CRM · Files · Finance · Operations</span><span>Built by Picasso AI</span></div></div>
    <section className="sm-section" id="how-it-works">
      <div className="sm-section-head"><div><div className="sm-kicker">A closer look</div><h2>Current views of a<br />working office.</h2></div><p className="sm-section-intro">These are direct captures from the downloadable Pygame client. Keep a pulse on the day, move between rooms, and leave the office open when work gets busy.</p></div>
      <div className="sm-clips">
        <Capture src="/__mockup/images/salaryman-home/pygame/lobby.png" title="Lobby · current client capture" copy="A clear starting point for the downloadable office." />
        <Capture src="/__mockup/images/salaryman-home/pygame/recreation.png" title="Recreation · current client capture" copy="A room for the moments between meetings." />
        <Capture src="/__mockup/images/salaryman-home/pygame/executive.png" title="Executive · current client capture" copy="A focused view for decisions and direction." />
      </div>
    </section>
    <section className="sm-section" id="workspace">
      <div className="sm-tools"><div><div className="sm-kicker">One place, not eight tabs</div><h2>Everything your team needs to keep moving.</h2><p className="sm-section-intro">Start with the tools that return the most time. Add the rest when your business is ready.</p></div><div className="sm-tool-list">{features.slice(0, 6).map(([name, desc, Icon, paid]) => <div className="sm-tool" key={name}><Icon size={17} color="#1e765c" /><b>{name}{paid && <span className="sm-badge">Prime</span>}</b><span>{desc}</span></div>)}</div></div>
    </section>
    <section className="sm-cta" id="pablo"><div className="sm-cta-card"><div><div className="sm-kicker" style={{ color: "#acd4bd" }}>Start with the desktop office</div><h2>Your workday has a home.</h2><p>Download the client, pair it once, and get to work.</p></div><a className="sm-primary" href="#desktop"><Download size={16} /> Download the app</a></div></section>
    <footer className="sm-footer"><span>SALARYMAN / PICASSO AI</span><span>Meet Pablo · Privacy · Status</span></footer>
  </main>;
}

function FeatureMenu() {
  return <div className="sm-menu" role="menu">{features.map(([name, desc, Icon, paid]) => <a href={`#${name.toLowerCase().replaceAll(" ", "-")}`} key={name} role="menuitem"><Icon size={16} color="#1e765c" /><span>{name}{paid && <small className="sm-badge">Prime</small>}</span><small>{desc}</small></a>)}</div>;
}