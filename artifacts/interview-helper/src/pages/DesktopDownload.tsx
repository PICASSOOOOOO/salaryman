import { useEffect, useState } from "react";
import { ArrowRight, Download, ExternalLink, Headphones, Laptop, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, apiUrl } from "@/lib/api-client";
import "./desktop-download.css";

const platforms = [
  {
    name: "Windows",
    detail: "Windows 10+ · x64",
    command: "Native package pending",
    tone: "lime",
    status: "pending",
  },
  {
    name: "macOS",
    detail: "macOS 12+ · Apple Silicon / Intel",
    command: "Native package pending",
    tone: "aqua",
    status: "pending",
  },
  {
    name: "Linux",
    detail: "Ubuntu 22.04+ · x64",
    command: "salaryman-office-linux-x86_64.tar.gz",
    tone: "sun",
    status: "available",
  },
] as const;

export default function DesktopDownload() {
  const [downloadAllowed, setDownloadAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/desktop/access")
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { allowed?: boolean };
        if (!cancelled) setDownloadAllowed(result.allowed === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadHref = apiUrl("/api/desktop/download");

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
            A native office client for focused work away from the browser.
          </p>
          <div className="desktop-download-actions">
            {downloadAllowed ? (
              <a className="desktop-download-primary" href={downloadHref} download="salaryman-office-linux-x86_64.tar.gz">
                <Download size={16} aria-hidden /> Download Linux client <ArrowRight size={15} aria-hidden />
              </a>
            ) : (
              <span className="desktop-download-locked"><ShieldCheck size={15} aria-hidden /> Admin / moderator test access</span>
            )}
            <Link className="desktop-download-secondary" href="/device-link?mode=desktop">
              <ShieldCheck size={15} aria-hidden /> Connect a desktop
            </Link>
          </div>
          <p className="desktop-download-note">
            Linux is live. macOS and Windows packages are next.
          </p>
        </div>
        <div className="desktop-download-stage" aria-label="Desktop office preview">
          <div className="desktop-game-capture">
            <video
              className="desktop-game-capture-video"
              src={`${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-gameplay.mp4`}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
            <div className="desktop-game-capture-label">DIRECT CAPTURE / PYGAME CLIENT / FLOOR 01</div>
          </div>
        </div>
      </section>

      <section className="desktop-download-platforms" id="install">
        <div className="desktop-download-section-heading">
          <div>
            <p className="desktop-download-eyebrow">ONE CLIENT / THREE PLATFORMS</p>
            <h2>Choose your station.</h2>
          </div>
          <p>The client and simulation contract stay the same on every operating system. Native packages are built on their target OS.</p>
        </div>
        <div className="desktop-download-platform-grid">
          {platforms.map((platform) => (
            <article className={`desktop-download-platform ${platform.tone}`} key={platform.name}>
              <div className="desktop-download-platform-icon"><Laptop size={19} aria-hidden /></div>
              <h3>{platform.name}</h3>
              <p>{platform.detail}</p>
              <code>{platform.command}</code>
              {platform.name === "Linux" && downloadAllowed ? (
                <a href={downloadHref} download="salaryman-office-linux-x86_64.tar.gz">
                  Download package <ArrowRight size={14} aria-hidden />
                </a>
              ) : (
                <span className="desktop-download-platform-locked">
                  {platform.name === "Linux" ? "Admin / moderator access required" : "Native build not published yet"}
                </span>
              )}
            </article>
          ))}
        </div>
        <p className="desktop-download-build-note" id="builds">
          Linux is the only published package today. macOS and Windows builds must be
          produced and smoke-tested on their target operating systems because PyInstaller
          does not cross-compile.
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