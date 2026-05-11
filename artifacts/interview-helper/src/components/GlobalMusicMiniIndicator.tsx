import { Link, useLocation } from "wouter";
import { Music2, Pause, Play, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

export function GlobalMusicMiniIndicator() {
  const { current, playing, playPause, shuffle, repeat, toggleShuffle, cycleRepeat } = useMusicPlayer();
  const [loc] = useLocation();

  // Don't render on the jukebox page itself
  if (loc.startsWith("/creative/music")) return null;
  // Only show when something is loaded (playing or paused mid-track)
  if (!current) return null;

  return (
    <div
      className="hidden sm:flex fixed z-30 bottom-4 left-16 items-center gap-2 px-2.5 py-1.5 rounded-full font-mono text-[10px] tracking-wider"
      style={{
        background: "rgba(15,15,22,0.92)",
        border: "1px solid rgba(160,120,255,0.45)",
        boxShadow: playing
          ? "0 0 18px rgba(160,120,255,0.5), inset 0 0 0 1px rgba(160,120,255,0.2)"
          : "0 4px 14px rgba(0,0,0,0.5)",
        backdropFilter: "blur(6px)",
        animation: playing ? "music-pulse 2.2s ease-in-out infinite" : "none",
      }}
      data-testid="music-mini-indicator"
    >
      <button
        onClick={playPause}
        aria-label={playing ? "Pause" : "Play"}
        className="w-5 h-5 flex items-center justify-center rounded-full bg-purple-600/30 hover:bg-purple-500/50 text-purple-200 shrink-0"
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <button
        onClick={toggleShuffle}
        aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
        title={shuffle ? "SHUFFLE ON" : "SHUFFLE OFF"}
        data-testid="mini-shuffle"
        className={`w-5 h-5 flex items-center justify-center rounded-full shrink-0 transition-colors ${
          shuffle
            ? "bg-cyan-500/30 hover:bg-cyan-400/50 text-cyan-200"
            : "bg-zinc-700/40 hover:bg-zinc-600/50 text-zinc-400"
        }`}
      >
        <Shuffle className="w-3 h-3" />
      </button>
      <button
        onClick={cycleRepeat}
        aria-label={`Repeat: ${repeat}`}
        title={
          repeat === "off"
            ? "REPEAT OFF — click for REPEAT ALL"
            : repeat === "all"
              ? "REPEAT ALL — click for REPEAT ONE"
              : "REPEAT ONE — click to turn off"
        }
        data-testid="mini-repeat"
        className={`w-5 h-5 flex items-center justify-center rounded-full shrink-0 transition-colors ${
          repeat !== "off"
            ? "bg-cyan-500/30 hover:bg-cyan-400/50 text-cyan-200"
            : "bg-zinc-700/40 hover:bg-zinc-600/50 text-zinc-400"
        }`}
      >
        {repeat === "one" ? <Repeat1 className="w-3 h-3" /> : <Repeat className="w-3 h-3" />}
      </button>
      <Link
        href="/creative/music"
        className="flex items-center gap-1.5 text-zinc-200 hover:text-white max-w-[200px] truncate"
      >
        <Music2 className="w-3 h-3 text-purple-300 shrink-0" />
        <span className="truncate">{current.artist} — {current.title}</span>
      </Link>
      <style>{`
        @keyframes music-pulse {
          0%,100% { box-shadow: 0 0 12px rgba(160,120,255,0.35), inset 0 0 0 1px rgba(160,120,255,0.2); }
          50%     { box-shadow: 0 0 22px rgba(160,120,255,0.7),  inset 0 0 0 1px rgba(160,120,255,0.35); }
        }
      `}</style>
    </div>
  );
}

export default GlobalMusicMiniIndicator;
