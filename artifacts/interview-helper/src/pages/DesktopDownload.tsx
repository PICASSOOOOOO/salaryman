import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, BriefcaseBusiness, CircleDollarSign, Download, FileText, Laptop, Phone, Settings, Users, X } from "lucide-react";
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

const desktopFeatures = [
  ["PABLO PRIME / PABLO AI", "Plan, decide, and move work forward with one assistant.", Bot, "/pablo", null],
  ["CALLL HOME", "Calls, shared numbers, routing, and remote conversations.", Phone, "/phone", `${import.meta.env.BASE_URL}brand/callhome/calll-home-logo-2.png`],
  ["CRM & SALES", "Keep customers, leads, and every relationship moving.", Users, "/business/contacts", null],
  ["AGENTS", "Put repeatable work into motion with automation.", Bot, "/bots", null],
  ["BUSINESS", "Run daily operations, teams, and company workflows.", BriefcaseBusiness, "/business", null],
  ["KNOWLEDGE", "Keep working files and company context in one place.", FileText, "/console/vault", null],
  ["ECONOMY", "See the financial systems connected to the company.", CircleDollarSign, "/business/accounts", null],
  ["SETTINGS", "Control identity, devices, audio, and desktop preferences.", Settings, "/settings", null],
] as const;

type AvailablePlatform = Exclude<DesktopPlatform, "other">;

export default function DesktopDownload() {
  const [downloadAllowed, setDownloadAllowed] = useState(false);
  const [clientPlatform, setClientPlatform] = useState<DesktopPlatform>("other");
  const [availablePlatforms, setAvailablePlatforms] = useState<AvailablePlatform[]>([]);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const heroGameplayVideoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    const video = heroGameplayVideoRef.current;
    if (!video) return;

    const resumeGameplay = () => {
      video.muted = true;
      video.defaultMuted = true;
      void video.play().catch(() => {
        // Browser data-saver and battery policies may still require a manual play.
      });
    };

    resumeGameplay();
    video.addEventListener("canplay", resumeGameplay);
    window.addEventListener("pageshow", resumeGameplay);
    return () => {
      video.removeEventListener("canplay", resumeGameplay);
      window.removeEventListener("pageshow", resumeGameplay);
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
  const trailerAssetVersion = "office-four-workstations-fast-3";
  const gameplayVideoWebmHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-trailer.webm?v=${trailerAssetVersion}`;
  const gameplayVideoMp4Href = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-trailer.mp4?v=${trailerAssetVersion}`;
  const gameplayDetailVideoWebmHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-gameplay.webm`;
  const gameplayDetailVideoMp4Href = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-gameplay-web.mp4`;
  const supportsVp9Webm = typeof document !== "undefined"
    && document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "";
  const gameplayVideoHref = supportsVp9Webm ? gameplayVideoWebmHref : gameplayVideoMp4Href;
  const gameplayDetailVideoHref = supportsVp9Webm ? gameplayDetailVideoWebmHref : gameplayDetailVideoMp4Href;
  const gameplayPosterHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-trailer-poster.jpg?v=${trailerAssetVersion}`;
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
            ref={heroGameplayVideoRef}
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
             36-SECOND FAST CUT / LIVE GAMEPLAY / CALL HOME SOUNDTRACK
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

      <section className="desktop-download-features" aria-labelledby="desktop-features-title">
        <div className="desktop-download-section-heading">
          <p className="desktop-download-eyebrow">THE WHOLE SALARYMAN SYSTEM</p>
          <h2 id="desktop-features-title">Every main feature.<br />One connected company.</h2>
          <p>Start in the browser, continue through the interactive desktop office, and keep the same business systems within reach.</p>
        </div>
        <div className="desktop-download-feature-grid">
          {desktopFeatures.map(([title, description, Icon, href, logoSrc], index) => (
            <Link href={href} className="desktop-download-feature" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt=""
                  className="desktop-download-feature-logo"
                />
              ) : (
                <Icon size={22} aria-hidden />
              )}
              <h3>{title}</h3>
              <p>{description}</p>
              <b>OPEN <ArrowRight size={13} aria-hidden /></b>
            </Link>
          ))}
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