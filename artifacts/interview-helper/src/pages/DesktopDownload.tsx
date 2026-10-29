import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Laptop, X } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, apiUrl } from "@/lib/api-client";
import { trackEvent } from "@/lib/analytics";
import "./desktop-download.css";

type DesktopPlatform = "windows" | "macos" | "linux" | "other";

function detectDesktopPlatform(): DesktopPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  const touchMac = platform.includes("mac") && navigator.maxTouchPoints > 1;
  if (
    touchMac
    || /android|iphone|ipad|ipod|mobile|tablet/.test(userAgent)
  ) return "other";
  if (platform.includes("win") || userAgent.includes("windows")) return "windows";
  if (platform.includes("mac") || userAgent.includes("macintosh")) return "macos";
  if (platform.includes("linux")) return "linux";
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
  const platformMessage = clientPlatform === "other"
    ? "Computer only · macOS, Windows, or Linux · no phone app"
    : !downloadAllowed
      ? "Desktop alpha · approved testers"
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
          <p className="desktop-download-eyebrow">DESKTOP OS ONLY / MACOS · WINDOWS · LINUX / NO PHONE APP</p>
          <h1>A living office.<br /><em>Inside SALARYMAN OS.</em></h1>
          <p className="desktop-download-lede">
            The browser is built for professional workflows. SALARYMAN OS is bringing the full SALARYMAN toolkit into native gameplay screens, starting with a free office simulation.
          </p>
          <div className="desktop-download-actions">
            {clientBuildAvailable && clientRelease ? (
              <a className="desktop-download-primary" href={downloadHref} download={clientRelease.archiveName} data-testid="link-download-detected-desktop-client" onClick={() => trackEvent("desktop_download_started", { platform: clientRelease.id })}>
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
            aria-label="Archived Pygame prototype footage, not the current Godot client"
          />
          <span className="desktop-download-promo-tag">ARCHIVED PYGAME PROTOTYPE</span>
          <figcaption>
             Earlier Pygame prototype — not the current Godot client.
          </figcaption>
        </figure>
      </section>

      <section className="desktop-download-promo" aria-labelledby="desktop-team-title">
        <div className="desktop-download-section-heading">
          <p className="desktop-download-eyebrow">A GAME-NATIVE WAY TO EXPLORE WORK</p>
          <h2 id="desktop-team-title">Meet the office from the inside.</h2>
          <p>
            Enter the Tower, meet its characters, and explore connected systems through native game screens—not browser pages dressed up as gameplay.
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
              aria-label="Archived Pygame office prototype"
            />
            <figcaption><span>01</span><strong>ARCHIVED PROTOTYPE</strong><small>Earlier Pygame footage. Current Godot footage is not yet available here.</small></figcaption>
          </figure>
          <article className="desktop-download-signal-card">
            <span>FREE GAME FEATURE</span>
            <strong>EXPLORE.<br />DISCOVER.<br />WORK A NEW WAY.</strong>
            <p>The office simulation is free. SALARYMAN OS is being built to bring professional tools into game-native screens.</p>
            <div aria-hidden>
              <i>YOU</i><b />
              <i>TEAM</i><b />
              <i>PABLO</i>
            </div>
          </article>
        </div>
      </section>

      <section className="desktop-download-final-cta">
        <div>
          <p className="desktop-download-eyebrow">THE OFFICE IS OPEN</p>
          <h2>Step into the office.</h2>
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
                <span>COMPUTER ONLY · NO PHONE APP</span>
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
                    <a href={apiUrl(`/api/desktop/download?platform=${platform.id}`)} download={platform.archiveName} data-testid={`link-download-${platform.id}-desktop-client`} onClick={() => trackEvent("desktop_download_started", { platform: platform.id })}>
                      Download <ArrowRight size={14} aria-hidden />
                    </a>
                   ) : downloadAllowed ? (
                     <span className="desktop-download-platform-locked">
                       {platform.id === "macos" ? "Awaiting verified, signed release" : "Awaiting verified release"}
                     </span>
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