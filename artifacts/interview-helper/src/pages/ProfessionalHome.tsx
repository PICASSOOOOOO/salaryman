import { useState } from "react";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  FileText,
  FolderKanban,
  Menu,
  Phone,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  X,
} from "lucide-react";
import { Link } from "wouter";
import "./ProfessionalHome.css";

const paths = [
  {
    number: "01",
    title: "Run the workspace",
    description: "Keep customers, calls, files, and daily operations in one place.",
    href: "/business",
    label: "Open business workspace",
    icon: BriefcaseBusiness,
    tone: "blue",
  },
  {
    number: "02",
    title: "Meet Pablo",
    description: "Start with a conversation and turn a vague next step into a plan.",
    href: "/pablo",
    label: "Meet Pablo",
    icon: Bot,
    tone: "mint",
  },
  {
    number: "03",
    title: "Open the terminal",
    description: "See the live command center for work, finance, agents, and systems.",
    href: "/console",
    label: "Open terminal",
    icon: TerminalSquare,
    tone: "warm",
  },
] as const;

const features = [
  ["Phone system", "Calls, routing, and shared numbers", Phone, "/phone"],
  ["CRM & sales", "Keep every relationship moving", Users, "/business/contacts"],
  ["Agents & automation", "Let routine work run itself", Bot, "/bots"],
  ["Business operations", "The daily view of your company", FolderKanban, "/business"],
  ["Knowledge & files", "One home for the work", FileText, "/console/vault"],
] as const;

export default function ProfessionalHome() {
  const [featuresOpen, setFeaturesOpen] = useState(false);

  return (
    <main className="sm-home" id="top">
      <header className="sm-nav">
        <Link className="sm-brand" href="/" aria-label="SALARYMAN home">
          <img className="sm-mark" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
          <span>
            <strong>SALARYMAN</strong>
            <small>by Picasso AI · business OS</small>
          </span>
        </Link>

        <nav className="sm-navlinks" aria-label="Main navigation">
          <div className="sm-feature-wrap">
            <button
              className="sm-feature-btn"
              type="button"
              onClick={() => setFeaturesOpen((open) => !open)}
              aria-expanded={featuresOpen}
            >
              Features <ChevronDown size={14} />
            </button>
            {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
          </div>
          <Link href="/business">Web workspace</Link>
          <Link className="sm-pablo" href="/pablo">Meet Pablo ↗</Link>
        </nav>

        <div className="sm-mobile-menu">
          <button
            className="sm-menu-btn"
            type="button"
            onClick={() => setFeaturesOpen((open) => !open)}
            aria-expanded={featuresOpen}
          >
            {featuresOpen ? <X size={16} /> : <Menu size={16} />} Features
          </button>
          {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
        </div>
      </header>

      <section className="sm-hero" aria-labelledby="home-title">
        <div className="sm-hero-copy">
          <div className="sm-kicker"><span className="sm-status" /> The business operating system</div>
          <h1 id="home-title">Make work feel <span>possible.</span></h1>
          <p className="sm-lede">
            SALARYMAN brings calls, customers, files, and daily operations into one
            calm workspace so you can keep moving.
          </p>
          <div className="sm-actions">
            <Link className="sm-primary" href="/business">
              Open web workspace <ArrowRight size={15} />
            </Link>
            <Link className="sm-secondary" href="/pablo">
              Meet Pablo <ExternalLink size={15} />
            </Link>
          </div>
          <p className="sm-note">The visual desktop game is in development and is intentionally not shown here yet.</p>
        </div>

        <div className="sm-workspace-card" aria-label="SALARYMAN workspace preview">
          <div className="sm-window-bar">
            <span className="sm-window-dots"><i /><i /><i /></span>
            <span>WORKSPACE · READY</span>
          </div>
          <div className="sm-workspace-body">
            <div className="sm-workspace-topline">
              <strong>SALARYMAN</strong>
              <span>ONE CONNECTED WORKSPACE</span>
              <b>ACTIVE</b>
            </div>
            <div className="sm-workspace-grid">
              <div className="sm-workspace-stat"><small>OPEN TASKS</small><strong>12</strong><span className="sm-stat-blue" /></div>
              <div className="sm-workspace-stat"><small>FOLLOW-UPS</small><strong>08</strong><span className="sm-stat-mint" /></div>
              <div className="sm-workspace-stat"><small>TEAM PULSE</small><strong>92%</strong><span className="sm-stat-warm" /></div>
            </div>
            <div className="sm-workspace-list">
              <span><i className="sm-list-dot sm-list-blue" /> Customer follow-up queue <b>Today</b></span>
              <span><i className="sm-list-dot sm-list-mint" /> Weekly operations review <b>In progress</b></span>
              <span><i className="sm-list-dot sm-list-warm" /> Pablo briefing <b>Ready</b></span>
            </div>
          </div>
          <div className="sm-workspace-caption"><strong>Web workspace</strong><span>One clear view of the working day.</span></div>
        </div>
      </section>

      <div className="sm-strip">
        <div className="sm-strip-inner">
          <span><strong>One connected workspace</strong> for the whole company</span>
          <span>Phone · CRM · Agents · Files · Operations</span>
          <span>Built by Picasso AI</span>
        </div>
      </div>

      <section className="sm-section sm-path-section" aria-labelledby="paths-title">
        <div className="sm-section-head">
          <div>
            <div className="sm-kicker">Choose your way in</div>
            <h2 id="paths-title">Three paths.<br />One working world.</h2>
          </div>
          <p className="sm-section-intro">
            Start where it is useful today. These are live destinations, not unfinished game scenes.
          </p>
        </div>
        <div className="sm-path-grid">
          {paths.map(({ number, title, description, href, label, icon: Icon, tone }) => (
            <Link className={`sm-path-card sm-path-${tone}`} href={href} key={href}>
              <span className="sm-path-number">{number}</span>
              <span className="sm-path-icon"><Icon size={20} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="sm-path-link">{label} <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="sm-section sm-essentials" aria-labelledby="essentials-title">
        <div className="sm-section-head">
          <div>
            <div className="sm-kicker">The essentials</div>
            <h2 id="essentials-title">High-return tools<br />for the working day.</h2>
          </div>
          <p className="sm-section-intro">Clear jobs, shared context, and fewer tabs to keep open.</p>
        </div>
        <div className="sm-feature-grid">
          {features.map(([name, desc, Icon, href], index) => (
            <article className={`sm-feature-card sm-feature-${index}`} key={href}>
              <div className="sm-feature-icon"><Icon size={19} /></div>
              <span className="sm-feature-index">0{index + 1}</span>
              <h3>{name}</h3>
              <p>{desc}</p>
              <Link href={href}>Open {name} <ArrowRight size={13} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-section sm-ops">
        <div className="sm-ops-card">
          <div>
            <div className="sm-kicker">A clearer operating rhythm</div>
            <h2>Less hunting.<br />More doing.</h2>
            <p>Bring the conversations, next steps, and documents around a customer into one practical view.</p>
          </div>
          <div className="sm-ops-list">
            <span><ShieldCheck size={16} /> Secure by design</span>
            <span><CalendarDays size={16} /> Time-aware planning</span>
            <span><Sparkles size={16} /> Automation where it helps</span>
          </div>
        </div>
      </section>

      <footer className="sm-footer">
        <span>SALARYMAN / PICASSO AI</span>
        <span>Meet Pablo · Privacy · Status</span>
      </footer>
    </main>
  );
}

function FeatureMenu({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="sm-menu" role="menu">
      {features.map(([name, desc, Icon, href]) => (
        <Link href={href} key={href} role="menuitem" onClick={onSelect}>
          <Icon size={16} />
          <span>{name}</span>
          <small>{desc}</small>
        </Link>
      ))}
    </div>
  );
}