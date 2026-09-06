import { ArrowRight, Download, ExternalLink, Headphones, Laptop, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import "./desktop-download.css";

const platforms = [
  {
    name: "Windows",
    detail: "Windows 10+ · x64",
    command: "python -m pygame_sim",
    tone: "lime",
  },
  {
    name: "macOS",
    detail: "macOS 12+ · Apple Silicon / Intel",
    command: "python3 -m pygame_sim",
    tone: "aqua",
  },
  {
    name: "Linux",
    detail: "Ubuntu 22.04+ · x64",
    command: "python3 -m pygame_sim",
    tone: "sun",
  },
];

export default function DesktopDownload() {
  return (
    <main className="desktop-download">
      <header className="desktop-download-topbar">
        <Link href="/" className="desktop-download-brand" aria-label="SALARYMAN home">
          <span className="desktop-download-mark">SM</span>
          <span>SALARYMAN</span>
        </Link>
        <nav className="desktop-download-nav" aria-label="Desktop client navigation">
          <a href="#client">CLIENT</a>
          <a href="#connection">CONNECTION</a>
          <Link href="/phone">PHONE SYSTEM</Link>
          <Link href="/settings">SETTINGS</Link>
        </nav>
      </header>

      <section className="desktop-download-hero" id="client">
        <div className="desktop-download-hero-copy">
          <p className="desktop-download-eyebrow">FREE DESKTOP CLIENT / OFFICE ECOLOGY</p>
          <h1>Run the office<br /><em>where you work.</em></h1>
          <p className="desktop-download-lede">
            The SALARYMAN office is moving out of the browser and onto your desktop.
            Manage a living solar-punk team, watch funds move, and let each workday unfold
            at its own pace.
          </p>
          <div className="desktop-download-actions">
            <a className="desktop-download-primary" href="#install">
              <Download size={16} aria-hidden /> Get the free client <ArrowRight size={15} aria-hidden />
            </a>
            <Link className="desktop-download-secondary" href="/device-link?mode=desktop">
              <ShieldCheck size={15} aria-hidden /> Connect a desktop
            </Link>
          </div>
          <p className="desktop-download-note">
            Free to download. The desktop client never connects directly to the database.
          </p>
        </div>
        <div className="desktop-download-stage" aria-label="Desktop office preview">
          <div className="desktop-download-sun" />
          <div className="desktop-download-canopy canopy-left" />
          <div className="desktop-download-canopy canopy-right" />
          <div className="desktop-download-window">
            <div className="desktop-download-window-bar"><span /><span /><span /><strong>OFFICE ECOLOGY</strong></div>
            <div className="desktop-download-window-body">
              <div className="desktop-download-metric"><small>WORKDAY</small><strong>10:00</strong><span>DAY 14 · ACTIVE</span></div>
              <div className="desktop-download-people">
                <i className="person person-one" /><i className="person person-two" /><i className="person person-three" />
              </div>
              <div className="desktop-download-window-floor" />
            </div>
          </div>
          <div className="desktop-download-leaf leaf-one">✦</div>
          <div className="desktop-download-leaf leaf-two">✦</div>
        </div>
      </section>

      <section className="desktop-download-platforms" id="install">
        <div className="desktop-download-section-heading">
          <div>
            <p className="desktop-download-eyebrow">ONE CLIENT / THREE PLATFORMS</p>
            <h2>Choose your station.</h2>
          </div>
          <p>Native packaging follows the same Python client and simulation contract on every operating system.</p>
        </div>
        <div className="desktop-download-platform-grid">
          {platforms.map((platform) => (
            <article className={`desktop-download-platform ${platform.tone}`} key={platform.name}>
              <div className="desktop-download-platform-icon"><Laptop size={19} aria-hidden /></div>
              <h3>{platform.name}</h3>
              <p>{platform.detail}</p>
              <code>{platform.command}</code>
              <a href="#builds">Build package <ArrowRight size={14} aria-hidden /></a>
            </article>
          ))}
        </div>
        <p className="desktop-download-build-note" id="builds">
          Release packages are built from the checked-in client with the same command on each platform.
          Until a signed binary is published, the source launcher is the portable download path.
        </p>
      </section>

      <section className="desktop-download-connection" id="connection">
        <div className="desktop-download-connection-copy">
          <p className="desktop-download-eyebrow">THE DESKTOP IS A CLIENT / NOT A SECOND DATABASE</p>
          <h2>Bring the SALARYMAN tools with you.</h2>
          <p>
            Pair once in the browser, then let the desktop client request scoped office,
            finance, employee, COMMS, notification, and document snapshots from SALARYMAN.
            Server-owned balances and phone actions stay authoritative.
          </p>
          <Link className="desktop-download-primary" href="/device-link?mode=desktop">
            <ShieldCheck size={16} aria-hidden /> Open secure pairing <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
        <div className="desktop-download-connection-grid">
          <div><MessageSquare size={18} aria-hidden /><strong>COMMS</strong><span>Messages and notifications stay live.</span></div>
          <div><Headphones size={18} aria-hidden /><strong>PHONE SYSTEM</strong><span>Open the browser call surface for live audio.</span></div>
          <div><ShieldCheck size={18} aria-hidden /><strong>SCOPED ACCESS</strong><span>Revoke the desktop from account settings.</span></div>
        </div>
      </section>

      <footer className="desktop-download-footer">
        <span>DESKTOP OFFICE / 01</span>
        <span>THE WEB REMAINS THE CONTROL PLANE</span>
        <Link href="/">RETURN TO PABLO <ArrowRight size={13} aria-hidden /></Link>
      </footer>
    </main>
  );
}