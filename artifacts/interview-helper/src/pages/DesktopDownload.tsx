import { useEffect, useState } from "react";
import { ArrowRight, Download, Laptop, X } from "lucide-react";
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
  const [downloadsOpen, setDownloadsOpen] = useState(false);

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
  const gameplayVideoHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-alpha-showcase.mp4`;
  const gameplayDetailVideoHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-gameplay.mp4`;
  const gameplayPosterHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-alpha-showcase-poster.jpg`;
  const salarymanLogoHref = `${import.meta.env.BASE_URL}icon-192.png`;
  const platformMessage = !downloadAllowed
    ? "Desktop alpha · approved testers"
    : clientPlatform === "other"
      ? "Desktop only · choose a build below"
      : !clientBuildAvailable
        ? `${clientRelease?.name ?? "Desktop"} build unavailable`
        : `${clientRelease?.name} build ready`;
  const displayedPlatforms = availablePlatforms.length > 0
    ? platforms.filter((platform) => availablePlatforms.includes(platform.id))
    : platforms;

  return (
    <main className="desktop-download">
      <header className="desktop-download-topbar">
        <Link href="/" className="desktop-download-brand" aria-label="SALARYMAN home">
          <img className="desktop-download-mark" src={salarymanLogoHref} alt="" />
          <span>SALARYMAN</span>
        </Link>
        <nav className="desktop-download-nav" aria-label="Desktop client navigation">
          <button type="button" onClick={() => setDownloadsOpen(true)}>DOWNLOADS</button>
          <Link href="/phone">CALLL HOME</Link>
          <Link href="/settings">SETTINGS</Link>
        </nav>
      </header>

      <section className="desktop-download-hero" id="client">
        <div className="desktop-download-hero-copy">
          <p className="desktop-download-eyebrow">NATIVE 2.5D OFFICE / WINDOWS · MACOS · LINUX</p>
          <h1>Your remote team.<br /><em>In the room.</em></h1>
          <p className="desktop-download-lede">
            Move through a shared office, communicate with remote teammates interactively, and keep the work connected without living inside browser tabs.
          </p>
          <div className="desktop-download-actions">
            {clientBuildAvailable && clientRelease ? (
              <a className="desktop-download-primary" href={downloadHref} download={clientRelease.archiveName} data-testid="link-download-detected-desktop-client">
                <Download size={16} aria-hidden /> Download {clientRelease.name} desktop alpha <ArrowRight size={15} aria-hidden />
              </a>
            ) : downloadAllowed ? (
              <button className="desktop-download-primary" type="button" onClick={() => setDownloadsOpen(true)} data-testid="link-choose-desktop-build">
                <Download size={16} aria-hidden /> Choose desktop download <ArrowRight size={15} aria-hidden />
              </button>
            ) : (
              <button
                className="desktop-download-primary"
                type="button"
                onClick={() => setDownloadsOpen(true)}
                data-testid="link-sign-in-download-gameplay-alpha"
              >
                <Download size={16} aria-hidden /> Desktop downloads <ArrowRight size={15} aria-hidden />
              </button>
            )}
          </div>
          <p className="desktop-download-note">
            {platformMessage}
          </p>
        </div>
        <figure className="desktop-download-gameplay">
          <video
            controls
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            src={gameplayVideoHref}
            poster={gameplayPosterHref}
            aria-label="Current SALARYMAN desktop client preview"
          />
          <span className="desktop-download-promo-tag">DESKTOP PROMO</span>
          <figcaption>
            CURRENT ALPHA / REAL DESKTOP CAPTURE / WINDOWS · MACOS · LINUX
          </figcaption>
        </figure>
      </section>

      <section className="desktop-download-promo" aria-labelledby="desktop-team-title">
        <div className="desktop-download-section-heading">
          <p className="desktop-download-eyebrow">REMOTE WORK SHOULD FEEL PRESENT</p>
          <h2 id="desktop-team-title">Not another chat window.<br />A shared place to work.</h2>
          <p>
            The web workspace organizes the business. The desktop client turns your remote team into an interactive office you can move through, communicate inside, and return to each day.
          </p>
        </div>

        <div className="desktop-download-footage-grid">
          <figure className="desktop-download-footage desktop-download-footage-wide">
            <video
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              src={gameplayDetailVideoHref}
              poster={gameplayPosterHref}
              controls
              aria-label="SALARYMAN shared office desktop preview"
            />
            <figcaption><span>01</span><strong>MOVE TOGETHER</strong><small>Navigate the same 2.5D office instead of disappearing into separate tabs.</small></figcaption>
          </figure>
          <article className="desktop-download-signal-card">
            <span>LIVE TEAM SIGNAL</span>
            <strong>SEE WHO IS THERE.<br />TALK WHERE THE WORK HAPPENS.</strong>
            <p>Presence, communication, and the office environment become one continuous team experience.</p>
            <div aria-hidden>
              <i>YOU</i><b />
              <i>TEAM</i><b />
              <i>PABLO</i>
            </div>
          </article>
        </div>
      </section>

      <section className="desktop-download-compare" aria-labelledby="desktop-better-title">
        <div className="desktop-download-section-heading">
          <p className="desktop-download-eyebrow">WHY DESKTOP</p>
          <h2 id="desktop-better-title">The web runs the company.<br />Desktop brings the team to life.</h2>
        </div>
        <div className="desktop-download-compare-grid">
          <article>
            <span>WEB WORKSPACE</span>
            <h3>Operate the business.</h3>
            <p>Manage customers, calls, files, settings, and structured workflows from any browser.</p>
            <Link href="/business">START WORK <ArrowRight size={14} aria-hidden /></Link>
          </article>
          <article className="is-desktop">
            <span>2.5D DESKTOP CLIENT</span>
            <h3>Operate as a team.</h3>
            <p>Share an interactive office with remote teammates, communicate in context, and experience the company as a place—not a stack of pages.</p>
            <button type="button" onClick={() => setDownloadsOpen(true)}>CHOOSE YOUR BUILD <ArrowRight size={14} aria-hidden /></button>
          </article>
        </div>
      </section>

      <section className="desktop-download-final-cta">
        <div>
          <p className="desktop-download-eyebrow">THE OFFICE IS OPEN</p>
          <h2>Bring your remote team inside.</h2>
        </div>
        <button className="desktop-download-primary" type="button" onClick={() => setDownloadsOpen(true)}>
          <Download size={16} aria-hidden /> DESKTOP DOWNLOADS <ArrowRight size={15} aria-hidden />
        </button>
      </section>

      <footer className="desktop-download-footer">
        <span>SALARYMAN / PICASSO AI LLC</span>
        <Link href="/">BACK TO SALARYMAN</Link>
      </footer>
      {downloadsOpen && (
        <div className="desktop-download-modal-backdrop" role="presentation" onMouseDown={() => setDownloadsOpen(false)}>
          <section
            className="desktop-download-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="desktop-download-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>DESKTOP ONLY</span>
                <h2 id="desktop-download-modal-title">Choose a build.</h2>
              </div>
              <button type="button" onClick={() => setDownloadsOpen(false)} aria-label="Close downloads">
                <X size={19} aria-hidden />
              </button>
            </header>
            <div className="desktop-download-platform-grid">
              {displayedPlatforms.map((platform) => (
                <article className="desktop-download-platform" key={platform.name}>
                  <div className="desktop-download-platform-icon"><Laptop size={19} aria-hidden /></div>
                  <div className="desktop-download-platform-copy">
                    <h3>{platform.name}</h3>
                    <p>{platform.detail}</p>
                  </div>
                  {downloadAllowed && availablePlatforms.includes(platform.id) ? (
                    <a href={apiUrl(`/api/desktop/download?platform=${platform.id}`)} download={platform.archiveName} data-testid={`link-download-${platform.id}-desktop-client`}>
                      Download <ArrowRight size={14} aria-hidden />
                    </a>
                  ) : (
                    <Link className="desktop-download-platform-locked" href="/sign-in?returnTo=/desktop">
                      Sign in <ArrowRight size={14} aria-hidden />
                    </Link>
                  )}
                </article>
              ))}
            </div>
            <p>Extract the package, then open START-SALARYMAN.</p>
          </section>
        </div>
      )}
    </main>
  );
}