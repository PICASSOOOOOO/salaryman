import { useEffect, useState } from "react";
import { X } from "lucide-react";
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

  const displayedPlatforms = availablePlatforms.length > 0
    ? platforms.filter((platform) => availablePlatforms.includes(platform.id))
    : platforms;

  return (
    <main className="desktop-download">
      <section className="desktop-download-hero h-full min-h-[80dvh] flex flex-col justify-center items-center text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-4xl sm:text-6xl font-sans font-bold tracking-tight mb-8">
            SALARYMAN<br />Office Client
          </h1>
          <p className="text-sm sm:text-base opacity-60 mb-12 max-w-md mx-auto leading-relaxed">
            The immersive 2.5D virtual office environment for your remote team.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {clientBuildAvailable && clientRelease ? (
              <a className="desktop-download-primary inline-flex items-center justify-center gap-2 h-12 px-8 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 transition-colors" href={downloadHref} download={clientRelease.archiveName} data-testid={`link-download-${clientRelease.id}-desktop-client`}>
                Download {clientRelease.name}
              </a>
            ) : downloadAllowed ? (
              <button className="desktop-download-primary inline-flex items-center justify-center gap-2 h-12 px-8 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 transition-colors" type="button" onClick={() => setDownloadsOpen(true)}>
                Choose download
              </button>
            ) : (
              <Link
                className="desktop-download-primary inline-flex items-center justify-center gap-2 h-12 px-8 bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/80 transition-colors"
                href="/sign-in?returnTo=/desktop"
              >
                Sign in to download
              </Link>
            )}
            <button className="text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity px-6 h-12" type="button" onClick={() => setDownloadsOpen(true)}>
              All Platforms
            </button>
          </div>
        </div>
      </section>

      {downloadsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/10 backdrop-blur-sm" onClick={() => setDownloadsOpen(false)}>
          <section
            className="w-full max-w-md bg-[#FAFAF7] border border-black/10 p-8 shadow-2xl flex flex-col gap-6"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold tracking-tight">Downloads</h2>
              <button type="button" onClick={() => setDownloadsOpen(false)} className="opacity-40 hover:opacity-100">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {displayedPlatforms.map((platform) => (
                <div className="flex items-center justify-between p-4 border border-black/10" key={platform.name}>
                  <div>
                    <h3 className="font-bold text-sm mb-1">{platform.name}</h3>
                    <p className="text-xs opacity-60">{platform.detail}</p>
                  </div>
                  {downloadAllowed && availablePlatforms.includes(platform.id) ? (
                    <a className="text-xs font-bold uppercase tracking-widest hover:underline" href={apiUrl(`/api/desktop/download?platform=${platform.id}`)} download={platform.archiveName} data-testid={`link-download-${platform.id}-desktop-client`}>
                      Download
                    </a>
                  ) : (
                    <Link className="text-xs font-bold uppercase tracking-widest opacity-40" href="/sign-in?returnTo=/desktop">
                      Locked
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}