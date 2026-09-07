import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Download,
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
import { apiFetch, apiUrl } from "@/lib/api-client";
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
  const [desktopDownloadAllowed, setDesktopDownloadAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/desktop/access")
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { allowed?: boolean };
        if (!cancelled) setDesktopDownloadAllowed(result.allowed === true);
      })
      .catch(() => {
        // Anonymous visitors and non-staff users simply do not see the test build.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="sm-home" id="top">
      <header className="sm-nav">
        <Link className="sm-brand" href="/" aria-label="SALARYMAN home" data-testid="link-brand-home">
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
              data-testid="button-features-desktop"
            >
              Features <ChevronDown size={14} />
            </button>
            {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
          </div>
          <Link href="/business" data-testid="link-web-workspace">Web workspace</Link>
          <Link className="sm-pablo" href="/pablo" data-testid="link-meet-pablo">Meet Pablo <ExternalLink size={13} /></Link>
           <Link className="sm-privacy-nav" href="/#privacy" data-testid="link-home-privacy">Privacy</Link>
        </nav>

        <div className="sm-mobile-menu">
          <button
            className="sm-menu-btn"
            type="button"
            onClick={() => setFeaturesOpen((open) => !open)}
            aria-expanded={featuresOpen}
            data-testid="button-features-mobile"
          >
            {featuresOpen ? <X size={16} /> : <Menu size={16} />} Features
          </button>
          {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
        </div>
      </header>

      <section className="sm-hero" aria-labelledby="home-title" data-testid="section-hero">
        <div className="sm-hero-wash" aria-hidden="true" />
        <div className="sm-hero-copy">
          <div className="sm-kicker"><span className="sm-status" /> The business operating system</div>
          <h1 id="home-title">Make work feel <span>possible.</span></h1>
          <p className="sm-lede">
             Calls, customers, files, and daily operations in one clear workspace.
          </p>
          <div className="sm-actions">
            <Link className="sm-primary" href="/business" data-testid="link-hero-workspace">
              Open web workspace <ArrowRight size={15} />
            </Link>
            <Link className="sm-secondary" href="/pablo" data-testid="link-hero-pablo">
              Meet Pablo <ExternalLink size={15} />
            </Link>
          </div>
           <div className="sm-proof-row" aria-label="SALARYMAN highlights">
             <span>PHONE</span>
             <span>CRM</span>
             <span>AGENTS</span>
             <span>FILES</span>
           </div>
          {desktopDownloadAllowed && (
            <a
              className="sm-desktop-download"
              href={apiUrl("/api/desktop/download")}
              download="salaryman-office-linux-x86_64.tar.gz"
              data-testid="link-desktop-download"
            >
              <Download size={14} /> Download desktop test build <ArrowRight size={14} />
            </a>
          )}
        </div>

        <div className="sm-hero-stage" aria-label="SALARYMAN workspace preview" data-testid="preview-workspace">
          <div className="sm-stage-grid" aria-hidden="true" />
          <div className="sm-stage-orbit sm-stage-orbit-one" aria-hidden="true" />
          <div className="sm-stage-orbit sm-stage-orbit-two" aria-hidden="true" />
          <span className="sm-stage-label">LIVE BROWSER SURFACE <b>01</b></span>
          <div className="sm-stage-float sm-stage-float-top" aria-hidden="true">
            <span>CONNECTED</span><strong>05</strong>
          </div>
          <div className="sm-stage-float sm-stage-float-bottom" aria-hidden="true">
            <span>WORKING RHYTHM</span><strong>CALM / CLEAR</strong>
          </div>
          <div className="sm-workspace-card">
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
            <div className="sm-workspace-grid" data-testid="preview-workspace-stats">
              <div className="sm-workspace-stat" data-testid="stat-open-tasks"><small>OPEN TASKS</small><strong>12</strong><span className="sm-stat-blue" /></div>
              <div className="sm-workspace-stat" data-testid="stat-follow-ups"><small>FOLLOW-UPS</small><strong>08</strong><span className="sm-stat-mint" /></div>
              <div className="sm-workspace-stat" data-testid="stat-team-pulse"><small>TEAM PULSE</small><strong>92%</strong><span className="sm-stat-warm" /></div>
            </div>
            <div className="sm-workspace-list">
              <span><i className="sm-list-dot sm-list-blue" /> Customer follow-up queue <b>Today</b></span>
              <span><i className="sm-list-dot sm-list-mint" /> Weekly operations review <b>In progress</b></span>
              <span><i className="sm-list-dot sm-list-warm" /> Pablo briefing <b>Ready</b></span>
            </div>
          </div>
          <div className="sm-workspace-caption"><strong>Web workspace</strong><span>One clear view of the working day.</span></div>
          </div>
        </div>
      </section>

      <div className="sm-strip">
        <div className="sm-strip-inner">
           <span><strong>One connected workspace</strong></span>
           <span>Phone · CRM · Agents · Files</span>
           <span>Built by Picasso AI</span>
        </div>
      </div>

      <section className="sm-story" aria-labelledby="story-title" data-testid="section-operating-rhythm">
        <div className="sm-story-inner">
          <div className="sm-story-topline"><span>02</span><span>THE OPERATING RHYTHM</span><span>SCROLL TO CONNECT</span></div>
          <div className="sm-story-layout">
            <h2 id="story-title">From the first call<br /><em>to the next clear move.</em></h2>
            <div className="sm-story-rail" aria-label="SALARYMAN work flow">
              <div className="sm-story-step" data-testid="story-step-capture"><span>01</span><strong>Capture</strong><p>Keep the signal.</p></div>
              <div className="sm-story-line" aria-hidden="true" />
              <div className="sm-story-step" data-testid="story-step-connect"><span>02</span><strong>Connect</strong><p>Share the context.</p></div>
              <div className="sm-story-line" aria-hidden="true" />
              <div className="sm-story-step" data-testid="story-step-move"><span>03</span><strong>Move</strong><p>Make the next step.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="sm-section sm-path-section" aria-labelledby="paths-title">
        <div className="sm-section-head">
          <div>
            <div className="sm-kicker">Choose your way in</div>
            <h2 id="paths-title">Three paths.<br />One working world.</h2>
          </div>
          <p className="sm-section-intro">
             Start with the work you need today.
          </p>
        </div>
        <div className="sm-path-grid">
          {paths.map(({ number, title, description, href, label, icon: Icon, tone }) => (
            <Link className={`sm-path-card sm-path-${tone}`} href={href} key={href} data-testid={`link-path-${number}`}>
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
           <p className="sm-section-intro">The essentials, without the tab sprawl.</p>
        </div>
        <div className="sm-feature-grid">
          {features.map(([name, desc, Icon, href], index) => (
            <article className={`sm-feature-card sm-feature-${index}`} key={href} data-testid={`card-feature-${index + 1}`}>
              <div className="sm-feature-icon"><Icon size={19} /></div>
              <span className="sm-feature-index">0{index + 1}</span>
              <h3>{name}</h3>
              <p>{desc}</p>
              <Link href={href} data-testid={`link-feature-${index + 1}`}>Open {name} <ArrowRight size={13} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-section sm-ops">
        <div className="sm-ops-card" data-testid="panel-operating-rhythm">
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

      <section className="sm-privacy" id="privacy" aria-labelledby="privacy-title">
        <div>
          <div className="sm-kicker"><ShieldCheck size={13} /> Privacy in plain sight</div>
          <h2 id="privacy-title">Your data. Your call.</h2>
          <p>We do not sell personal information. See what we collect, why, and how to request deletion.</p>
        </div>
        <Link className="sm-privacy-link" href="/legal/privacy" data-testid="link-home-privacy-card">
          Read privacy policy <ArrowRight size={14} />
        </Link>
      </section>

      <footer className="sm-footer">
        <span>SALARYMAN / PICASSO AI</span>
        <span>
          <Link href="/pablo">Meet Pablo</Link>
          <Link href="/#privacy">Privacy</Link>
          <Link href="/legal/contact">Contact</Link>
        </span>
      </footer>
    </main>
  );
}

function FeatureMenu({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="sm-menu" role="menu">
      {features.map(([name, desc, Icon, href]) => (
        <Link href={href} key={href} role="menuitem" onClick={onSelect} data-testid={`link-feature-menu-${href.replace(/\//g, "-").replace(/^-/, "")}`}>
          <Icon size={16} />
          <span>{name}</span>
          <small>{desc}</small>
        </Link>
      ))}
    </div>
  );
}