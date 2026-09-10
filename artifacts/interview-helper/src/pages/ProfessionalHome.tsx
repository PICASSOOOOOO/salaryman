import { useState } from "react";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  FolderKanban,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { OrbitArtwork } from "@/components/OrbitArtwork";
import "./ProfessionalHome.css";

const paths = [
  {
    number: "01",
    title: "START WORK",
    description: "Keep customers, calls, files, and daily operations in one place.",
    href: "/business",
    label: "Open workspace",
    icon: BriefcaseBusiness,
    tone: "blue",
  },
  {
    number: "02",
    title: "PABLO AI",
    description: "Start with a conversation and turn a vague next step into a plan.",
    href: "/pablo",
    label: "Open Pablo AI",
    icon: Bot,
    tone: "mint",
  },
  {
    number: "03",
    title: "DESKTOP CLIENT",
    description: "Preview the interactive office and get the native SALARYMAN client.",
    href: "/desktop",
    label: "View desktop promo",
    icon: Download,
    tone: "warm",
  },
] as const;

const features = [
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
        <Link className="sm-brand" href="/" aria-label="SALARYMAN home" data-testid="link-brand-home">
          <img className="sm-mark" src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
          <span>
            <strong>SALARYMAN</strong>
          </span>
          <small className="sm-alpha-badge">
            ALPHA {typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "DEV"}
          </small>
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
              MORE <ChevronDown size={14} />
            </button>
            {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
          </div>
          <Link className="sm-navbox" href="/pablo" data-testid="link-meet-pablo">PABLO AI</Link>
          <Link className="sm-navbox" href="/phone">CALLL HOME</Link>
          <Link className="sm-navbox" href="/desktop" data-testid="link-home-gameplay">APP DOWNLOAD</Link>
        </nav>

        <div className="sm-mobile-menu">
          <button
            className="sm-menu-btn"
            type="button"
            onClick={() => setFeaturesOpen((open) => !open)}
            aria-expanded={featuresOpen}
            data-testid="button-features-mobile"
          >
            {featuresOpen ? <X size={16} /> : <Menu size={16} />} MORE
          </button>
          {featuresOpen && <FeatureMenu onSelect={() => setFeaturesOpen(false)} />}
        </div>
        <nav className="sm-mobile-direct" aria-label="Main navigation">
          <Link href="/pablo">PABLO AI</Link>
          <Link href="/phone">CALLL HOME</Link>
          <Link href="/desktop">APP DOWNLOAD</Link>
        </nav>
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
               START WORK <ArrowRight size={15} />
            </Link>
             <Link className="sm-secondary" href="/desktop" data-testid="link-hero-gameplay">
               Desktop promo / downloads <Download size={15} />
             </Link>
          </div>
        </div>
        <OrbitArtwork />

      </section>

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

      <footer className="sm-footer">
        <span>SALARYMAN / PICASSO AI LLC</span>
        <nav aria-label="Legal and compliance">
          <Link href="/legal">Legal</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/legal/restrictions">Restrictions</Link>
          <Link href="/legal/contact">Contact</Link>
          <Link href="/sms-opt-in">SMS Terms &amp; Opt-In · salaryman.io/sms-opt-in</Link>
        </nav>
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