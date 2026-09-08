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
  const gameplayPosterHref = `${import.meta.env.BASE_URL}brand/desktop/salaryman-pygame-alpha-showcase-poster.jpg`;
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
          <span className="desktop-download-mark">SM</span>
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
          <p className="desktop-download-eyebrow">FREE DESKTOP CLIENT / OFFICE ECOLOGY</p>
          <h1>Run the office<br /><em>where you work.</em></h1>
          <p className="desktop-download-lede">
            A native office client for focused work away from the browser.
          </p>
          <div className="desktop-download-actions">
            {clientBuildAvailable && clientRelease ? (
              <a className="desktop-download-primary" href={downloadHref} download={clientRelease.archiveName} data-testid="link-download-detected-desktop-client">
                <Download size={16} aria-hidden /> Download {clientRelease.name} gameplay alpha <ArrowRight size={15} aria-hidden />
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
            playsInline
            preload="metadata"
            src={gameplayVideoHref}
            poster={gameplayPosterHref}
            aria-label="Current SALARYMAN Pygame gameplay alpha"
          />
          <figcaption>
            CURRENT ALPHA / REAL PYGAME CAPTURE / WINDOWS · MACOS · LINUX
          </figcaption>
        </figure>
      </section>
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