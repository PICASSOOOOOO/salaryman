import { useLocation } from "wouter";

/**
 * Pablo silhouette shortcut for the top nav. Sits next to the Hummingbird
 * button. Clicking takes the user back into the Pablo Nebula at /pablo so
 * they can re-enter the intro / Q&A experience at any time. Renders the
 * sprinting ad-man PNG via CSS mask so it tints to currentColor cleanly
 * regardless of the source background.
 */
export function PabloNavButton({ size = 22 }: { size?: number }) {
  const [location, navigate] = useLocation();
  const here = location === "/pablo";

  return (
    <button
      onClick={() => navigate("/pablo")}
      title="PABLO — your guide. Tap any time."
      aria-label="Open Pablo"
      aria-current={here ? "page" : undefined}
      className={`relative p-1.5 rounded-md transition-colors ${
        here
          ? "text-pink-300 bg-pink-500/10"
          : "text-zinc-400 hover:text-pink-300 hover:bg-pink-500/8"
      }`}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: size,
          height: size,
          backgroundColor: "currentColor",
          WebkitMaskImage: "url(/pablo-running.png)",
          maskImage: "url(/pablo-running.png)",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    </button>
  );
}

export default PabloNavButton;
