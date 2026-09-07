import { useState } from "react";
import { ArrowRight, Bot, CalendarDays, ChevronDown, ExternalLink, FileText, FolderKanban, Lock, Menu, Phone, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import "./ProfessionalHome.css";

const features = [
  ["Phone System", "Calls, routing, and shared numbers", Phone, "phone-system"],
  ["CRM & Sales", "Keep every relationship moving", Users, "crm-sales"],
  ["Pixel Agents & Automation", "Let routine work run itself", Bot, "pixel-agents"],
  ["Business Operations", "The daily view of your company", FolderKanban, "business-operations"],
  ["Knowledge & Files", "One home for the work", FileText, "knowledge-files"],
] as const;

export default function ProfessionalHome() {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const closeFeatures = () => setFeaturesOpen(false);
  return <main className="sm-home">
    <header className="sm-nav">
      <a className="sm-brand" href="#top" aria-label="SALARYMAN home"><span className="sm-mark">S</span><span><strong>SALARYMAN</strong><small>by Picasso AI · business OS</small></span></a>
      <nav className="sm-navlinks" aria-label="Main navigation">
        <div className="sm-feature-wrap"><button className="sm-feature-btn" onClick={() => setFeaturesOpen(v => !v)} aria-expanded={featuresOpen}>Features <ChevronDown size={14} /></button>{featuresOpen && <FeatureMenu onSelect={closeFeatures} />}</div>
        <a href="#workspace">Web workspace</a><a className="sm-pablo" href="#pablo">Meet Pablo ↗</a>
      </nav>
      <div className="sm-mobile-menu"><button className="sm-menu-btn" onClick={() => setFeaturesOpen(v => !v)} aria-expanded={featuresOpen}>{featuresOpen ? <X size={16} /> : <Menu size={16} />} Features</button>{featuresOpen && <FeatureMenu onSelect={closeFeatures} />}</div>
    </header>
    <section className="sm-hero" id="top">
      <div className="sm-hero-copy">
        <div className="sm-kicker"><span className="sm-status" /> The business operating system</div>
        <h1>Business tools that<br /><span>work together.</span></h1>
        <p className="sm-lede">SALARYMAN brings calls, customers, files, and daily operations into one clear workspace so your team can keep moving.</p>
        <div className="sm-actions">
          <a className="sm-primary" href="#workspace">Open web workspace <ArrowRight size={15} /></a>
          <button className="sm-primary sm-disabled" type="button" disabled aria-disabled="true"><Lock size={16} /> Desktop game in development</button>
        </div>
        <p className="sm-note">Preview and downloads unlock when the visual game build is ready.</p>
      </div>
      <CommandCenter />
    </section>
    <div className="sm-strip"><div className="sm-strip-inner"><span><strong>One connected workspace</strong> for the whole company</span><span>Phone · CRM · Agents · Files · Operations</span><span>Built by Picasso AI</span></div></div>
    <section className="sm-section" id="workspace">
      <div className="sm-section-head"><div><div className="sm-kicker">The essentials</div><h2>High-return tools<br />for the working day.</h2></div><p className="sm-section-intro">Start with the capabilities that save the most context switching. Each tool has a clear job and a shared view of the business.</p></div>
      <div className="sm-feature-grid">{features.map(([name, desc, Icon, id], index) => <article className={`sm-feature-card sm-feature-${index}`} id={id} key={id}><div className="sm-feature-icon"><Icon size={19} /></div><span className="sm-feature-index">0{index + 1}</span><h3>{name}</h3><p>{desc}</p><a href="#workspace">Explore in workspace <ArrowRight size={13} /></a></article>)}</div>
    </section>
    <section className="sm-section sm-ops" id="operations"><div className="sm-ops-card"><div><div className="sm-kicker">A clearer operating rhythm</div><h2>Less hunting.<br />More doing.</h2><p>Bring the conversations, next steps, and documents around a customer into one practical view.</p></div><div className="sm-ops-list"><span><ShieldCheck size={16} /> Secure by design</span><span><CalendarDays size={16} /> Time-aware planning</span><span><Sparkles size={16} /> Automation where it helps</span></div></div></section>
    <section className="sm-cta" id="pablo"><div className="sm-cta-card"><div><div className="sm-kicker" style={{ color: "#f1c476" }}>Start with the workspace</div><h2>Make room for better work.</h2><p>Open the web workspace now. The visual desktop game is still in development.</p></div><a className="sm-primary sm-cta-active" href="#workspace">Open web workspace <ExternalLink size={15} /></a></div></section>
    <footer className="sm-footer"><span>SALARYMAN / PICASSO AI</span><span>Meet Pablo · Privacy · Status</span></footer>
  </main>;
}

function CommandCenter() {
  return <div className="sm-command" aria-label="Business command center preview">
    <div className="sm-command-top"><span><i /><i /><i /></span><b>WORKSPACE / TODAY</b><small>LIVE</small></div>
    <div className="sm-command-body"><div className="sm-command-side"><strong>SALARYMAN</strong><span className="is-active">Overview</span><span>Phone system</span><span>CRM & Sales</span><span>Operations</span><span>Knowledge</span></div><div className="sm-command-main"><div className="sm-command-heading"><span>Good morning, team</span><b>Tuesday · 09:42</b></div><div className="sm-command-stats"><div><small>OPEN FOLLOW-UPS</small><strong>18</strong><em>↓ 4 this week</em></div><div><small>TEAM ONLINE</small><strong>12</strong><em>Across 3 teams</em></div><div><small>CALLS TODAY</small><strong>27</strong><em>6 scheduled</em></div></div><div className="sm-command-grid"><div><b>Next up</b><span>Review Northstar renewal</span><span>Call Maya at 11:30</span></div><div><b>Team pulse</b><span className="sm-pulse"><i /> Sales is active</span><span className="sm-pulse"><i /> Ops is on track</span></div></div></div></div>
  </div>;
}

function FeatureMenu({ onSelect }: { onSelect: () => void }) {
  return <div className="sm-menu" role="menu">{features.map(([name, desc, Icon, id]) => <a href={`#${id}`} key={id} role="menuitem" onClick={onSelect}><Icon size={16} /><span>{name}</span><small>{desc}</small></a>)}</div>;
}