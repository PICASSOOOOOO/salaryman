import { useEffect, useState } from "react";
import { ArrowRight, Download, ExternalLink, Headphones, Laptop, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, apiUrl } from "@/lib/api-client";
import "./desktop-download.css";

type DesktopPlatform = "windows" | "macos" | "linux" | "other";

function detectDesktopPlatform(): DesktopPlatform {
  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  if (platform.includes("linux") && !platform.includes("android")) return "linux";
  return "other";
}

const platforms = [
  {
    id: "windows",
    name: "Windows",
    detail: "Windows 10+ · x64",
    command: "Extract → double-click START-SALARYMAN.cmd",
    tone: "lime",
    archiveName: "salaryman-office-windows-x86_64.zip",
  },
  {
    id: "macos",
    name: "macOS",
    detail: "macOS 12+ · Apple Silicon",
    command: "Extract → open SALARYMAN Office.app",
    tone: "aqua",
    archiveName: "salaryman-office-macos-arm64.zip",
  },
  {
    id: "linux",
    name: "Linux",
    detail: "Ubuntu 22.04+ · x64",
    command: "Extract → double-click START-SALARYMAN",
    tone: "sun",
    archiveName: "salaryman-office-linux-x86_64.tar.gz",
  },
] as const;

type AvailablePlatform = Exclude<DesktopPlatform, "other">;

export default function DesktopDownload() {
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [clientPlatform, setClientPlatform] = useState<DesktopPlatform>("other");
  const [availablePlatforms, setAvailablePlatforms] = useState<AvailablePlatform[]>([]);

  useEffect(() => {
    setClientPlatform(detectDesktopPlatform());
    let cancelled = false;
    apiFetch("/api/desktop/access")
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { allowed?: boolean; availablePlatforms?: AvailablePlatform[] };
        if (!cancelled) {
          setDownloadAllowed(result.allowed === true);
          setAvailablePlatforms(result.availablePlatforms ?? []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const clientBuildAvailable = clientPlatform !== "other"
    && downloadAllowed
    && availablePlatforms.includes(clientPlatform);
  const clientRelease = clientPlatform === "other"
    ? undefined
    : platforms.find((platform) => platform.id === clientPlatform);
  const downloadHref = clientRelease
    ? apiUrl(`/api/desktop/download?platform=${clientRelease.id}`)
    : "";
  const platformMessage = !downloadAllowed
    ? "Desktop test builds are available to approved administrators and moderators."
    : clientPlatform === "other"
      ? "A verified desktop build is not available for this operating system."
      : !clientBuildAvailable
        ? `A verified ${clientRelease?.name ?? "desktop"} build is not available on this server.`
        : `${clientRelease?.name}: ${clientRelease?.command}.`;

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
            {clientBuildAvailable && clientRelease ? (
              <a className="desktop-download-primary" href={downloadHref} download={clientRelease.archiveName} data-testid="link-download-detected-desktop-client">
                <Download size={16} aria-hidden /> Download {clientRelease.name} client <ArrowRight size={15} aria-hidden />
              </a>
            ) : downloadAllowed ? (
              <span className="desktop-download-locked"><Laptop size={15} aria-hidden /> Native client unavailable for this device</span>
            ) : (
              <span className="desktop-download-locked"><ShieldCheck size={15} aria-hidden /> Admin / moderator test access</span>
            )}
            <Link className="desktop-download-secondary" href="/device-link?mode=desktop">
              <ShieldCheck size={15} aria-hidden /> Connect a desktop
            </Link>
          </div>
          <p className="desktop-download-note">
            {platformMessage}
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
            <p className="desktop-download-eyebrow">NATIVE CLIENT AVAILABILITY</p>
            <h2>Use the build for your operating system.</h2>
          </div>
          <p>The client and simulation contract stay the same on every operating system. Native packages are built on their target OS.</p>
        </div>
        <div className="desktop-download-platform-grid">
          {platforms.filter((platform) => availablePlatforms.includes(platform.id)).map((platform) => (
            <article className={`desktop-download-platform ${platform.tone}`} key={platform.name}>
              <div className="desktop-download-platform-icon"><Laptop size={19} aria-hidden /></div>
              <h3>{platform.name}</h3>
              <p>{platform.detail}</p>
              <code>{platform.command}</code>
              {clientBuildAvailable && clientPlatform === platform.id ? (
                <a href={downloadHref} download={platform.archiveName} data-testid={`link-download-${platform.id}-desktop-client`}>
                  Download package <ArrowRight size={14} aria-hidden />
                </a>
              ) : (
                <span className="desktop-download-platform-locked">
                  {downloadAllowed
                    ? `Use this package on ${platform.name}.`
                    : "Admin / moderator access required"}
                </span>
              )}
            </article>
          ))}
        </div>
        <p className="desktop-download-build-note" id="builds">
          Download the package that matches your operating system. Linux: extract the archive
          and run START-SALARYMAN. Windows: run START-SALARYMAN.cmd. macOS: open
          SALARYMAN Office.app after extraction.
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