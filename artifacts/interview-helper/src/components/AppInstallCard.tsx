import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, MonitorDown, MoreVertical, Share2, Smartphone } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function AppInstallCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(() => {
    if (typeof window === "undefined") return null;
    return ((window as Window & { __salarymanInstallPrompt?: Event }).__salarymanInstallPrompt as InstallPromptEvent | undefined) ?? null;
  });
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone());
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  const platform = useMemo(() => {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/android/.test(ua)) return "android";
    if (/firefox/.test(ua)) return "firefox";
    if (/safari/.test(ua) && !/chrome|chromium|crios|edg/.test(ua)) return "safari";
    return "desktop";
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onPromptReady = () => {
      const pending = (window as Window & { __salarymanInstallPrompt?: Event }).__salarymanInstallPrompt;
      if (pending) setPromptEvent(pending as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      delete (window as Window & { __salarymanInstallPrompt?: Event }).__salarymanInstallPrompt;
      setMessage("SALARYMAN is installed and ready.");
    };
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayMode = () => setInstalled(isStandalone());
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("salaryman-install-ready", onPromptReady);
    window.addEventListener("appinstalled", onInstalled);
    if (displayMode?.addEventListener) displayMode.addEventListener("change", onDisplayMode);
    else displayMode?.addListener?.(onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("salaryman-install-ready", onPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
      if (displayMode?.removeEventListener) displayMode.removeEventListener("change", onDisplayMode);
      else displayMode?.removeListener?.(onDisplayMode);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent || installing) return;
    setInstalling(true);
    setMessage("");
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setMessage("Finishing installation…");
      } else {
        setMessage("Installation cancelled. You can try again anytime.");
      }
      setPromptEvent(null);
      delete (window as Window & { __salarymanInstallPrompt?: Event }).__salarymanInstallPrompt;
    } catch {
      setMessage("Use your browser menu and choose Install SALARYMAN.");
    } finally {
      setInstalling(false);
    }
  }, [installing, promptEvent]);

  const instructions = platform === "ios"
    ? <><Share2 className="h-4 w-4 shrink-0 text-violet-300" /> In Safari, tap Share, then Add to Home Screen.</>
    : platform === "safari"
      ? <><Share2 className="h-4 w-4 shrink-0 text-violet-300" /> In Safari, choose File, then Add to Dock.</>
      : platform === "firefox"
        ? <><MoreVertical className="h-4 w-4 shrink-0 text-violet-300" /> Firefox does not offer desktop PWA installation. Use Chrome or Edge for an installed app window.</>
        : <><MoreVertical className="h-4 w-4 shrink-0 text-violet-300" /> Open the browser menu and choose Install SALARYMAN or Install app.</>;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid="app-install-card">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/15">
            {installed ? <Check className="h-5 w-5 text-emerald-300" /> : <MonitorDown className="h-5 w-5 text-violet-300" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {installed ? "SALARYMAN is installed" : "Install SALARYMAN"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Run it in its own app window on Windows, macOS, Linux, Android, iPhone, or iPad. No app store required.
            </p>
          </div>
        </div>
        {!installed && promptEvent && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-violet-500/15 px-4 text-xs font-bold text-violet-100 transition hover:bg-violet-500/25 disabled:opacity-50"
            data-testid="button-install-app"
          >
            <Download className="h-4 w-4" />
            {installing ? "INSTALLING…" : "INSTALL APP"}
          </button>
        )}
      </div>

      {!installed && !promptEvent && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          {instructions}
        </div>
      )}
      {message && <p className="mt-3 text-xs text-muted-foreground" role="status">{message}</p>}

      <a
        href={`${import.meta.env.BASE_URL}mobile`}
        className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 transition-colors hover:bg-sky-500/10"
      >
        <Smartphone className="h-4 w-4 shrink-0 text-sky-400" />
        <div>
          <p className="text-xs font-semibold text-foreground">Open mobile dashboard</p>
          <p className="text-[10px] text-muted-foreground">Adaptive navigation and touch controls for smaller screens</p>
        </div>
      </a>
    </section>
  );
}