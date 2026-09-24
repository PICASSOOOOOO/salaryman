import { useEffect, useRef } from "react";

const PUBLISHER_ID = "ca-pub-5927169933397652";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

function isContentPage(pathname: string): boolean {
  return pathname === "/"
    || pathname === "/desktop"
    || pathname === "/legal"
    || pathname.startsWith("/legal/");
}

type AdSenseBannerProps = {
  pathname: string;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isEmbed: boolean;
};

export default function AdSenseBanner({
  pathname,
  isAuthenticated,
  isAuthLoading,
  isEmbed,
}: AdSenseBannerProps) {
  const slotId = (import.meta.env.VITE_ADSENSE_SLOT_ID ?? "").trim();
  const adRef = useRef<HTMLModElement | null>(null);
  const eligible = !isAuthLoading && !isAuthenticated && !isEmbed && isContentPage(pathname) && Boolean(slotId);

  useEffect(() => {
    if (!eligible) return;

    const selector = 'script[data-salaryman-adsense="true"]';
    let script = document.querySelector<HTMLScriptElement>(selector);
    let active = true;

    const requestAd = () => {
      if (!active || !adRef.current) return;
      try {
        (window.adsbygoogle ??= []).push({});
      } catch (error) {
        console.warn("[AdSense] Ad slot could not be initialized.", error);
      }
    };
    const onLoad = () => {
      if (script) script.dataset.loaded = "true";
      requestAd();
    };
    const onError = () => {
      if (script) script.remove();
    };

    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
      script.dataset.salarymanAdsense = "true";
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else if (script.dataset.loaded === "true") {
      requestAd();
    } else {
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
    }

    return () => {
      active = false;
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
      // A failed script is removed above; successful scripts remain cached so
      // eligible public pages do not reload Google's library on every visit.
    };
  }, [eligible, pathname, slotId]);

  if (!eligible) return null;

  return (
    <aside className="adsense-banner" aria-label="Advertisement">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <span className="adsense-banner-label">Advertisement</span>
    </aside>
  );
}