import { useLocation } from "wouter";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { HummingbirdIcon } from "@/components/HummingbirdIcon";

/**
 * Always-visible Hummingbird shortcut for the top nav. Pulses cyan whenever
 * music is actively playing so the user gets a passive "something is live in
 * the background" cue — same illuminated-tab convention used elsewhere for
 * automated/persistent activity.
 */
export function HummingbirdNavButton({ size = 18 }: { size?: number }) {
  const [, navigate] = useLocation();
  const { playing, current } = useMusicPlayer();
  const live = playing && !!current;

  return (
    <button
      onClick={() => navigate("/creative/music")}
      title={live ? `HUMMING BIRD — NOW PLAYING: ${current?.title ?? ""}` : "HUMMING BIRD"}
      aria-label="Open Hummingbird music player"
      className={`relative p-1.5 rounded-md transition-colors ${
        live
          ? "text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15"
          : "text-zinc-500 hover:text-purple-300 hover:bg-purple-500/8"
      }`}
    >
      <HummingbirdIcon size={size} color={live ? "#67e8f9" : "currentColor"} />
      {live && (
        <>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400" />
        </>
      )}
    </button>
  );
}

export default HummingbirdNavButton;
