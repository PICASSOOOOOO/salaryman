# Hummingbird Core Source Code

This file is a copyable source bundle. Each section starts with the original workspace path.


---

## `artifacts/interview-helper/src/components/HummingBirdAttachStrip.tsx`

```tsx
import { useEffect, useState, useCallback } from "react";
import { useTrackPicker } from "@/components/TrackPicker";
import { useMusicPlayer, type Track } from "@/contexts/MusicPlayerContext";
import { HummingbirdIcon } from "@/components/HummingbirdIcon";
import { Play, Pause, X } from "lucide-react";

type Props = {
  toolKey: string;
  label?: string;
  onChange?: (track: Track | null) => void;
  buttonLabel?: string;
  buttonStyle?: "pill" | "ghost" | "icon";
  color?: string;
  compact?: boolean;
  pickerTitle?: string;
};

export function HummingBirdAttachStrip({
  toolKey,
  label = "BACKING TRACK",
  onChange,
  buttonLabel = "HUMMING BIRD",
  buttonStyle = "pill",
  color = "#a855f7",
  compact = false,
  pickerTitle = "PICK A TRACK",
}: Props) {
  const { tracks, current, playing, playPause, previewTrack } = useMusicPlayer();
  const { pick, picker } = useTrackPicker(pickerTitle);
  const [trackId, setTrackId] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(`humbird:${toolKey}`);
      return raw ? Number(raw) || null : null;
    } catch { return null; }
  });

  const track = trackId != null ? tracks.find((t) => t.id === trackId) || null : null;

  useEffect(() => { onChange?.(track); }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      if (trackId == null) localStorage.removeItem(`humbird:${toolKey}`);
      else localStorage.setItem(`humbird:${toolKey}`, String(trackId));
    } catch {}
  }, [toolKey, trackId]);

  const open = useCallback(() => {
    pick((t) => setTrackId(t.id));
  }, [pick]);

  const isCurrentlyPlaying = !!track && current?.id === track.id && playing;

  const btn = (() => {
    if (buttonStyle === "icon") {
      return (
        <button onClick={open} title={buttonLabel} aria-label={buttonLabel}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 6,
            background: "rgba(168,85,247,0.12)", border: `1px solid ${color}`,
            color, cursor: "pointer",
          }}>
          <HummingbirdIcon size={16} color={color} />
        </button>
      );
    }
    if (buttonStyle === "ghost") {
      return (
        <button onClick={open}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: `1px solid ${color}`,
            color, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: ".15em",
          }}>
          <HummingbirdIcon size={14} color={color} />
          {buttonLabel}
        </button>
      );
    }
    return (
      <button onClick={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `linear-gradient(180deg, ${color}, #5b21b6)`,
          border: "1px solid #000", color: "#fff",
          padding: "5px 12px", borderRadius: 4, cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: ".15em",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)",
        }}>
        <HummingbirdIcon size={14} color="#fff" />
        {buttonLabel}
      </button>
    );
  })();

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: 4, minWidth: 0 }}>
      {btn}
      {track && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: compact ? "3px 6px" : "4px 8px",
          background: "rgba(168,85,247,0.08)",
          border: `1px solid rgba(168,85,247,0.4)`,
          borderRadius: 3,
          fontFamily: "var(--font-sans)",
          fontSize: compact ? 9 : 10,
          color: "#e9d5ff",
          letterSpacing: ".08em",
          maxWidth: 320,
        }}>
          <span style={{ color, fontWeight: 700 }}>● {label}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {track.artist} — {track.title}
          </span>
          <button
            onClick={() => isCurrentlyPlaying ? playPause() : previewTrack(track.id)}
            title={isCurrentlyPlaying ? "Pause" : "Play"}
            style={{
              background: "transparent", border: `1px solid rgba(168,85,247,0.5)`,
              color: "#e9d5ff", padding: "1px 6px", cursor: "pointer", borderRadius: 2,
              display: "inline-flex", alignItems: "center",
            }}>
            {isCurrentlyPlaying ? <Pause size={10} /> : <Play size={10} />}
          </button>
          <button
            onClick={() => setTrackId(null)}
            title="Eject"
            style={{
              background: "transparent", border: `1px solid rgba(168,85,247,0.3)`,
              color: "#a78bfa", padding: "1px 4px", cursor: "pointer", borderRadius: 2,
              display: "inline-flex", alignItems: "center",
            }}>
            <X size={10} />
          </button>
        </div>
      )}
      {picker}
    </div>
  );
}

export default HummingBirdAttachStrip;

```

---

## `artifacts/interview-helper/src/components/HummingbirdIcon.tsx`

```tsx
type Props = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

// Hummingbird silhouette by Lorc / GameIcons.net (CC BY 3.0)
// https://game-icons.net/1x1/lorc/hummingbird.html
export function HummingbirdIcon({ size = 16, color = "currentColor", className, style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="hummingbird"
    >
      <path
        fill={color}
        d="M139.7 23.52c-9.1 30.54-16.5 61.64-12.7 91.58c4.2 32.7 21 64.9 65.7 95.7c-53.6 74.8-86.1 204.4-59.3 277.7c10.9-54 14.2-97.8 53.5-144.6c77.5-25.6 123.9-37.6 140.3-125.7c6.2-14.7 12.6-19.3 31.9-24.7c10.6-2.9 22.2-7.5 22.1-19.2c-.2-49.3-28.3-68.4-57.6-67.9c-29.4.5-60 20.6-65.4 49.8c-6 1.8-11.9 4.5-17.7 8c-62.9-43.7-82.1-85.86-100.8-140.68M32.03 107c10.8 27.2 26.44 54.6 49.2 76.1c24.27 22.9 56.47 39.3 100.87 42.2c-34.5-24.2-54.8-50.3-65.2-77.2c-29.4-10.9-56.47-25-84.87-41.1m300.07 26.3a12.24 12.24 0 0 1 12.2 12.2a12.24 12.24 0 0 1-12.2 12.2a12.24 12.24 0 0 1-12.2-12.2a12.24 12.24 0 0 1 12.2-12.2m60 56.1c-3.5 5.1-7.1 10.2-16.1 13.2c33.9 25.3 79.1 76.5 104 105c-11.2-33.2-55.8-88.6-87.9-118.2"
      />
    </svg>
  );
}

export default HummingbirdIcon;

```

---

## `artifacts/interview-helper/src/components/HummingbirdNavButton.tsx`

```tsx
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

```

---

## `artifacts/interview-helper/src/components/GlobalMusicMiniIndicator.tsx`

```tsx
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

```

---

## `artifacts/interview-helper/src/components/PabloWinampPlayer.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { PortalDropdown } from "./PortalDropdown";
import { apiFetch } from "@/lib/api-client";
import { Play, Pause, SkipBack, SkipForward, Square, Volume2, Trash2, Upload, Music2, X, Headphones, Wand2, Save, FileAudio2, Download, Phone, Shuffle, Repeat, Repeat1, ListMusic, Plus, Edit2, Check, Disc3, Loader2 } from "lucide-react";
import { useMusicPlayer, isPlayableMime } from "@/contexts/MusicPlayerContext";
import { isPhoneBusy, subscribePhoneBusy } from "@/lib/phone-busy";

const ACCEPTED = ".mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.mp4,.aiff,.aif,audio/*";

type ConnectStatus = {
  spotify: { configured: boolean; message: string };
  apple: { configured: boolean; message: string };
};

function fmtTime(s: number) {
  if (!isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function EqBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-5 w-9 px-[2px]">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          style={{
            width: 2,
            background: "linear-gradient(to top,#0f0,#cf0,#fc0)",
            height: playing ? `${30 + ((i * 17) % 65)}%` : "12%",
            transition: "height 120ms ease",
            animation: playing ? `winamp-eq-${i % 4} ${0.5 + (i % 3) * 0.18}s ease-in-out infinite alternate` : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes winamp-eq-0 { from{height:20%} to{height:90%} }
        @keyframes winamp-eq-1 { from{height:60%} to{height:25%} }
        @keyframes winamp-eq-2 { from{height:35%} to{height:80%} }
        @keyframes winamp-eq-3 { from{height:75%} to{height:30%} }
      `}</style>
    </div>
  );
}

export function PabloWinampPlayer({ size = "compact" }: { size?: "compact" | "full" }) {
  const {
    tracks, queue, currentIdx, current, playing, pos, dur, vol, busy, err,
    playIdx, playPause, stop, next, prev, seek, setVol, removeTrack, autoTagTrack,
    staged, stageFiles, discardStaged, previewStaged, convertStaged, saveStaged,
    downloadTrack, downloadStaged,
    shuffle, repeat, toggleShuffle, cycleRepeat,
    playlists, activePlaylistId, setActivePlaylist, createPlaylist, renamePlaylist,
    deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist,
  } = useMusicPlayer();

  const [collapsed, setCollapsed] = useState(false);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [showConnect, setShowConnect] = useState<null | "spotify" | "apple">(null);
  const [phoneMuted, setPhoneMuted] = useState<boolean>(() => isPhoneBusy());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Playlist UI state — local-only. `playlistMenuOpen` toggles the dropdown
  // showing the list of playlists. `addMenuTrackId` is the id of the track
  // whose "+ add to playlist" mini-menu is open (only one row at a time).
  // `renaming` holds the id of the playlist being renamed inline + draft.
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [addMenuTrackId, setAddMenuTrackId] = useState<number | null>(null);
  const addMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [addToast, setAddToast] = useState<string | null>(null);
  const [taggingId, setTaggingId] = useState<number | null>(null);

  const handleAutoTag = async (id: number) => {
    if (taggingId !== null) return;
    setTaggingId(id);
    try {
      const m = await autoTagTrack(id);
      setAddToast(
        m
          ? `Tagged: ${m.artist ?? "?"} — ${m.title ?? "?"}${m.year ? ` (${m.year})` : ""}${m.hasArtwork ? " + art" : ""}`
          : "No MusicBrainz match",
      );
    } finally {
      setTaggingId(null);
    }
  };
  const activePlaylist = activePlaylistId ? playlists.find(p => p.id === activePlaylistId) : null;
  const activePlaylistName = activePlaylist?.name ?? "All Tracks";

  // Tiny ephemeral toast for "added to ___" / "already in ___" feedback.
  // Reuses the bottom err line styling but with positive tint.
  useEffect(() => {
    if (!addToast) return;
    const t = setTimeout(() => setAddToast(null), 1600);
    return () => clearTimeout(t);
  }, [addToast]);

  // Surface the phone-precedence rule to the user. The actual auto-pause
  // happens inside MusicPlayerContext; we just mirror the busy bus so the
  // header can flash a visible "MUTED BY PHONE" pill while a call is live.
  useEffect(() => subscribePhoneBusy(setPhoneMuted), []);

  useEffect(() => {
    apiFetch("/api/music/connect-status")
      .then(r => r.ok ? r.json() : null)
      .then(j => j && setConnect(j))
      .catch(() => {});
  }, []);

  const progressFrac = dur > 0 ? pos / dur : 0;
  const playable = !current || isPlayableMime(current.mimeType);
  const wide = size === "full";

  return (
    <div
      className="font-mono text-[11px] select-none"
      style={{
        width: "100%",
        maxWidth: wide ? 720 : 360,
        background: "linear-gradient(180deg,#3a3a4a 0%,#1c1c24 100%)",
        border: "1px solid #000",
        borderTop: "1px solid #6a6a7a",
        borderLeft: "1px solid #6a6a7a",
        boxShadow: "0 0 0 1px #000, 0 6px 18px rgba(0,0,0,0.6), inset 0 0 0 1px #2a2a36",
        color: "#cfcfd6",
        borderRadius: 2,
      }}
      data-testid="winamp-player"
    >
      <div className="flex items-center justify-between px-2 py-[3px]"
        style={{ background: "linear-gradient(180deg,#5a5a6e 0%,#22222c 100%)", borderBottom: "1px solid #000", color: "#cfcfff" }}>
        <div className="flex items-center gap-1.5">
          <Music2 className="w-3 h-3 text-purple-300" />
          <span className="text-[10px] tracking-[0.25em] font-bold">PABLO · WINAMP</span>
          {phoneMuted && (
            <span
              title="Phone takes priority — music auto-paused so the line stays clean."
              className="ml-1 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm border border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
              style={{ fontSize: 9, letterSpacing: "0.18em", animation: "winamp-phone-pulse 1.4s ease-in-out infinite" }}
            >
              <Phone className="w-2.5 h-2.5" />
              MUTED · PHONE
            </span>
          )}
          <style>{`@keyframes winamp-phone-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }`}</style>
        </div>
        <button onClick={() => setCollapsed(c => !c)} className="text-[9px] tracking-widest text-zinc-300 hover:text-white px-1" aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "[+]" : "[—]"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="px-2 py-2" style={{ background: "#000", borderBottom: "1px solid #000", boxShadow: "inset 0 0 0 1px #1c1c24" }}>
            <div className="flex items-center gap-2">
              <EqBars playing={playing} />
              <div className="flex-1 overflow-hidden whitespace-nowrap" style={{ color: "#39ff14", textShadow: "0 0 4px rgba(57,255,20,0.6)" }}>
                <span className="inline-block" style={{
                  animation: current ? "winamp-marquee 14s linear infinite" : "none",
                  paddingLeft: current ? "100%" : 0,
                }}>
                  {current ? `${current.artist} — ${current.title}` : "NO MEDIA — DROP FILES OR UPLOAD"}
                </span>
                <style>{`@keyframes winamp-marquee { from{transform:translateX(0)} to{transform:translateX(-100%)} }`}</style>
              </div>
              <span style={{ color: "#39ff14", textShadow: "0 0 4px rgba(57,255,20,0.6)" }}>{fmtTime(pos)}</span>
            </div>
            {!playable && current && (
              <div className="text-[9px] text-amber-400 mt-1">⚠ {current.mimeType} may not play in this browser. Try MP3/M4A/WAV.</div>
            )}
          </div>

          <div className="px-2 py-1" style={{ background: "#1c1c24", borderBottom: "1px solid #000" }}>
            <div className="relative h-2 cursor-pointer"
              style={{ background: "linear-gradient(180deg,#0a0a0e,#222)", border: "1px solid #000", boxShadow: "inset 0 0 0 1px #2a2a36" }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - r.left) / r.width);
              }}>
              <div className="absolute inset-y-0 left-0" style={{ width: `${progressFrac * 100}%`, background: "linear-gradient(180deg,#a78bfa,#7c3aed)" }} />
            </div>
            <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-0.5">
              <span>{fmtTime(pos)}</span>
              <span>{fmtTime(dur)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 py-1.5"
            style={{ background: "linear-gradient(180deg,#3a3a4a,#222230)", borderBottom: "1px solid #000" }}>
            <TransportBtn onClick={prev} label="Previous"><SkipBack className="w-3 h-3" /></TransportBtn>
            <TransportBtn onClick={playPause} label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </TransportBtn>
            <TransportBtn onClick={stop} label="Stop"><Square className="w-3 h-3" /></TransportBtn>
            <TransportBtn onClick={next} label="Next"><SkipForward className="w-3 h-3" /></TransportBtn>
            <TransportBtn
              onClick={toggleShuffle}
              label={shuffle ? "Shuffle on" : "Shuffle off"}
              active={shuffle}
              testId="winamp-shuffle"
              title={shuffle ? "SHUFFLE ON — next/prev pick random tracks (no history stack)" : "SHUFFLE OFF"}
            >
              <Shuffle className="w-3 h-3" />
            </TransportBtn>
            <TransportBtn
              onClick={cycleRepeat}
              label={`Repeat: ${repeat}`}
              active={repeat !== "off"}
              testId="winamp-repeat"
              title={
                repeat === "off"
                  ? "REPEAT OFF — stop at end of playlist"
                  : repeat === "all"
                  ? "REPEAT ALL — loop the playlist"
                  : "REPEAT ONE — loop this track"
              }
            >
              {repeat === "one" ? <Repeat1 className="w-3 h-3" /> : <Repeat className="w-3 h-3" />}
            </TransportBtn>
            <div className="flex-1" />
            <Volume2 className="w-3 h-3 text-zinc-400" />
            <input type="range" min={0} max={1} step={0.01} value={vol}
              onChange={(e) => setVol(parseFloat(e.target.value))}
              style={{ width: 70, accentColor: "#a78bfa" }} aria-label="Volume" />
          </div>

          {staged.length > 0 && (
            <div className="px-2 py-1.5" style={{ background: "#1a0d24", borderBottom: "1px solid #000", maxHeight: wide ? 240 : 160, overflowY: "auto" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <FileAudio2 className="w-3 h-3 text-purple-300" />
                <span className="text-[9px] tracking-[0.25em] text-purple-300 font-bold">STAGING — PREVIEW BEFORE SAVE</span>
              </div>
              <ul className="space-y-1">
                {staged.map((s) => (
                  <li key={s.id} className="px-1.5 py-1 rounded-sm" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)" }}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => previewStaged(s.id)} className="text-purple-200 hover:text-white shrink-0" title="Preview">
                        <Headphones className="w-3 h-3" />
                      </button>
                      <span className="flex-1 truncate text-[10px] text-zinc-200" title={s.origName}>{s.origName}</span>
                      <span className="text-[9px] text-zinc-500 shrink-0">
                        {fmtBytes(s.convertedSize ?? s.origSize)}{s.convertedFile && <span className="text-purple-300"> → MP3</span>}
                      </span>
                      <button onClick={() => downloadStaged(s.id)} className="text-zinc-500 hover:text-purple-200 shrink-0" title={s.convertedFile ? "Download MP3" : "Download original"}>
                        <Download className="w-3 h-3" />
                      </button>
                      <button onClick={() => discardStaged(s.id)} className="text-zinc-600 hover:text-red-400 shrink-0" title="Discard">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => convertStaged(s.id)}
                        disabled={s.status === "converting" || s.status === "saving"}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] tracking-wider text-purple-100 hover:text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(180deg,#5b2da6,#3a1a6e)", border: "1px solid #000", borderRadius: 2 }}
                        title="Convert to MP3"
                      >
                        <Wand2 className="w-2.5 h-2.5" />
                        {s.status === "converting" ? `CONVERTING ${Math.round((s.progress || 0) * 100)}%` : (s.convertedFile ? "RE-CONVERT" : "→ MP3")}
                      </button>
                      <button
                        onClick={() => saveStaged(s.id)}
                        disabled={s.status === "saving" || s.status === "converting"}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] tracking-wider text-emerald-100 hover:text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(180deg,#0f7a36,#0a4a22)", border: "1px solid #000", borderRadius: 2 }}
                        title="Save to Hummingbird + Media library"
                      >
                        <Save className="w-2.5 h-2.5" />
                        {s.status === "saving" ? "SAVING…" : s.status === "saved" ? "SAVED ✓" : (s.convertedFile ? "SAVE MP3" : "SAVE ORIG")}
                      </button>
                      {s.convertedFile && (
                        <button
                          onClick={() => saveStaged(s.id, { useConverted: false })}
                          disabled={s.status === "saving"}
                          className="px-1.5 py-0.5 text-[9px] tracking-wider text-zinc-300 hover:text-white"
                          style={{ background: "linear-gradient(180deg,#444,#222)", border: "1px solid #000", borderRadius: 2 }}
                          title="Save the original (not converted) file"
                        >
                          SAVE ORIG
                        </button>
                      )}
                    </div>
                    {s.error && <div className="text-[9px] text-red-400 mt-0.5">⚠ {s.error}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PLAYLIST SELECTOR HEADER
              Shows the active playlist name as a dropdown. Clicking opens a
              menu of all playlists + "All Tracks" + "+ New playlist". When a
              custom playlist is active, an inline rename / delete affordance
              appears next to the title. */}
          <div className="px-2 py-1 relative" style={{ background: "#15151f", borderBottom: "1px solid #000" }}>
            <div className="flex items-center gap-1.5">
              <ListMusic className="w-3 h-3 text-purple-300 shrink-0" />
              {renaming && activePlaylist && renaming.id === activePlaylist.id ? (
                <>
                  <input
                    autoFocus
                    value={renaming.draft}
                    onChange={(e) => setRenaming({ id: renaming.id, draft: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renamePlaylist(renaming.id, renaming.draft); setRenaming(null); }
                      else if (e.key === "Escape") setRenaming(null);
                    }}
                    maxLength={60}
                    className="flex-1 px-1 py-0.5 text-[10px] bg-black/50 border border-purple-700 text-purple-100 rounded-sm outline-none"
                    data-testid="winamp-playlist-rename-input"
                  />
                  <button
                    onClick={() => { renamePlaylist(renaming.id, renaming.draft); setRenaming(null); }}
                    className="text-emerald-400 hover:text-emerald-200 shrink-0" title="Save name"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setPlaylistMenuOpen((o) => !o)}
                    className="flex-1 flex items-center gap-1 text-left text-[10px] tracking-wider text-purple-100 hover:text-white truncate"
                    data-testid="winamp-playlist-toggle"
                    title="Switch playlist"
                  >
                    <span className="truncate font-bold">{activePlaylistName.toUpperCase()}</span>
                    <span className="text-[9px] text-zinc-500 shrink-0">
                      ({activePlaylist ? activePlaylist.trackIds.length : tracks.length})
                    </span>
                    <span className="text-[9px] text-zinc-500 shrink-0">{playlistMenuOpen ? "▴" : "▾"}</span>
                  </button>
                  {activePlaylist && (
                    <>
                      <button
                        onClick={() => setRenaming({ id: activePlaylist.id, draft: activePlaylist.name })}
                        className="text-zinc-500 hover:text-purple-300 shrink-0" title="Rename playlist"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete playlist "${activePlaylist.name}"? Tracks remain in your library.`)) {
                            deletePlaylist(activePlaylist.id);
                          }
                        }}
                        className="text-zinc-500 hover:text-red-400 shrink-0" title="Delete playlist"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {playlistMenuOpen && (
              <div
                className="absolute left-2 right-2 top-full mt-0.5 z-40 max-h-56 overflow-y-auto rounded-sm"
                style={{ background: "#1a1a26", border: "1px solid #000", boxShadow: "0 6px 16px rgba(0,0,0,0.6)" }}
                data-testid="winamp-playlist-menu"
              >
                <button
                  onClick={() => { setActivePlaylist(null); setPlaylistMenuOpen(false); }}
                  className={`w-full text-left px-2 py-1 text-[10px] flex items-center justify-between hover:bg-purple-900/40 ${!activePlaylistId ? "bg-purple-900/30 text-purple-100" : "text-zinc-300"}`}
                >
                  <span>All Tracks</span>
                  <span className="text-[9px] text-zinc-500">{tracks.length}</span>
                </button>
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setActivePlaylist(p.id); setPlaylistMenuOpen(false); }}
                    className={`w-full text-left px-2 py-1 text-[10px] flex items-center justify-between hover:bg-purple-900/40 ${activePlaylistId === p.id ? "bg-purple-900/30 text-purple-100" : "text-zinc-300"}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[9px] text-zinc-500 shrink-0 ml-2">{p.trackIds.length}</span>
                  </button>
                ))}
                <button
                  onClick={() => {
                    const name = prompt("Playlist name?");
                    if (name && name.trim()) {
                      const id = createPlaylist(name);
                      setActivePlaylist(id);
                    }
                    setPlaylistMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 text-[10px] flex items-center gap-1 text-emerald-300 hover:bg-emerald-900/30 border-t border-zinc-800"
                  data-testid="winamp-playlist-new"
                >
                  <Plus className="w-3 h-3" /> New playlist…
                </button>
              </div>
            )}
          </div>

          <div className="px-2 py-1.5" style={{ background: "#0e0e14", maxHeight: wide ? 360 : 180, overflowY: "auto" }}>
            {queue.length === 0 ? (
              <div className="text-zinc-500 text-[10px] py-2 text-center">
                {activePlaylist
                  ? <>Playlist <span className="text-purple-300">{activePlaylist.name}</span> is empty. Switch to <button onClick={() => setActivePlaylist(null)} className="underline text-purple-300">All Tracks</button> and use the + button to add songs.</>
                  : "Empty library. Drop audio files to preview, convert, and save."}
              </div>
            ) : (
              <ol className="space-y-[2px]">
                {queue.map((t, i) => (
                  <li key={t.id}
                    className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded-sm cursor-pointer ${i === currentIdx ? "bg-purple-900/50 text-purple-100" : "hover:bg-zinc-800/60 text-zinc-300"}`}
                    onClick={() => playIdx(i)}
                    data-testid={`winamp-track-${t.id}`}>
                    <span className="text-[9px] text-zinc-500 w-5 shrink-0">{(i + 1).toString().padStart(2, "0")}.</span>
                    {t.artworkUrl ? (
                      <img src={t.artworkUrl} alt="" loading="lazy"
                        className="w-4 h-4 rounded-[2px] object-cover shrink-0 border border-black/40" />
                    ) : (
                      <Disc3 className="w-4 h-4 text-zinc-700 shrink-0" />
                    )}
                    <span className="flex-1 truncate">
                      <span className="text-zinc-400">{t.artist}</span>
                      <span className="mx-1 text-zinc-600">—</span>
                      <span>{t.title}</span>
                      {t.year ? <span className="ml-1 text-[9px] text-zinc-600">({t.year})</span> : null}
                    </span>
                    <span className="text-[9px] text-zinc-600 shrink-0">{fmtTime(t.durationSec)}</span>
                    {/* Add-to-playlist affordance. Only meaningful when there
                        is at least one user playlist; otherwise hidden so the
                        row stays uncluttered. Opens an inline mini-menu. */}
                    {playlists.length > 0 && (
                      <div className="relative shrink-0">
                        <button
                          ref={addMenuTrackId === t.id ? addMenuAnchorRef : undefined}
                          onClick={(e) => { e.stopPropagation(); setAddMenuTrackId((cur) => cur === t.id ? null : t.id); }}
                          className="text-zinc-600 hover:text-emerald-300"
                          aria-label="Add to playlist" title="Add to playlist"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <PortalDropdown
                          open={addMenuTrackId === t.id}
                          anchorRef={addMenuAnchorRef}
                          onClose={() => setAddMenuTrackId(null)}
                          align="right"
                          className="min-w-[140px] max-h-48 overflow-y-auto rounded-sm"
                          style={{ background: "#1a1a26", border: "1px solid #000", boxShadow: "0 6px 16px rgba(0,0,0,0.6)" }}
                        >
                          <div onClick={(e) => e.stopPropagation()} data-testid={`winamp-add-menu-${t.id}`}>
                            {playlists.map((p) => (
                              <button
                                key={p.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const added = addTrackToPlaylist(p.id, t.id);
                                  setAddToast(added ? `Added to ${p.name}` : `Already in ${p.name}`);
                                  setAddMenuTrackId(null);
                                }}
                                className="w-full text-left px-2 py-1 text-[10px] text-zinc-300 hover:bg-purple-900/40 hover:text-purple-100"
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        </PortalDropdown>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAutoTag(t.id); }}
                      disabled={taggingId !== null}
                      className="text-zinc-600 hover:text-cyan-300 shrink-0 disabled:opacity-50"
                      aria-label="Auto-tag from MusicBrainz" title="Fetch tags + cover art (MusicBrainz)">
                      {taggingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Disc3 className="w-3 h-3" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); downloadTrack(t.id); }} className="text-zinc-600 hover:text-purple-300 shrink-0" aria-label="Download" title="Download">
                      <Download className="w-3 h-3" />
                    </button>
                    {/* Trash semantics: when viewing a custom playlist, the
                        button removes the track from that playlist only
                        (library is preserved). When on All Tracks, it deletes
                        from the library entirely (existing behavior). */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activePlaylist) {
                          removeTrackFromPlaylist(activePlaylist.id, t.id);
                        } else {
                          removeTrack(t.id);
                        }
                      }}
                      className="text-zinc-600 hover:text-red-400 shrink-0"
                      aria-label={activePlaylist ? "Remove from playlist" : "Delete from library"}
                      title={activePlaylist ? `Remove from ${activePlaylist.name}` : "Delete from library"}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="px-2 py-1.5 flex items-center gap-1.5 flex-wrap"
            style={{ background: "linear-gradient(180deg,#22222c,#15151c)", borderTop: "1px solid #000" }}>
            <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden"
              onChange={(e) => { if (e.target.files) { stageFiles(e.target.files); e.target.value = ""; } }}
              data-testid="winamp-upload-input" />
            <button onClick={() => fileInputRef.current?.click()} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 text-[10px] tracking-wider text-zinc-200 hover:text-white disabled:opacity-50"
              style={{ background: "linear-gradient(180deg,#4a4a5e,#222230)", border: "1px solid #000", borderTop: "1px solid #6a6a7a", borderLeft: "1px solid #6a6a7a", borderRadius: 2 }}
              data-testid="winamp-upload-btn"
              title="Stage files for preview, conversion, then save">
              <Upload className="w-3 h-3" /> IMPORT / SAMPLE
            </button>
            <button onClick={() => setShowConnect("spotify")} className="px-2 py-1 text-[10px] tracking-wider"
              style={{ background: "linear-gradient(180deg,#1db954,#0f7a36)", color: "#fff", border: "1px solid #000", borderRadius: 2 }}>
              SPOTIFY
            </button>
            <button onClick={() => setShowConnect("apple")} className="px-2 py-1 text-[10px] tracking-wider"
              style={{ background: "linear-gradient(180deg,#fa57c1,#8e2dc4)", color: "#fff", border: "1px solid #000", borderRadius: 2 }}>
              APPLE MUSIC
            </button>
            <span className="ml-auto text-[9px] text-zinc-500">
              {activePlaylist ? `${queue.length} in ${activePlaylist.name} · ` : ""}{tracks.length}/50 · {fmtBytes(tracks.reduce((s, t) => s + t.sizeBytes, 0))}
            </span>
          </div>

          {addToast && <div className="px-2 py-1 text-[9px] text-emerald-300 border-t border-emerald-900/40" data-testid="winamp-add-toast">{addToast}</div>}
          {err && <div className="px-2 py-1 text-[9px] text-red-400 border-t border-red-900/40">{err}</div>}
        </>
      )}

      {showConnect && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowConnect(null)}>
          <div className="max-w-sm w-full p-4 rounded-lg border border-zinc-700"
            style={{ background: "#15151c", color: "#e4e4e7" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-sm tracking-widest">
                {showConnect === "spotify" ? "CONNECT SPOTIFY" : "CONNECT APPLE MUSIC"}
              </h3>
              <button onClick={() => setShowConnect(null)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {showConnect === "spotify"
                ? (connect?.spotify.configured
                    ? "Spotify is configured on the server. Click below to authorize your account and stream from your library."
                    : "Spotify Web Playback requires a Spotify Premium account and a Developer App (Client ID + Secret). Once you provide those credentials, this button will launch OAuth.")
                : (connect?.apple.configured
                    ? "Apple Music is configured. Click below to authorize MusicKit and stream from your library."
                    : "Apple Music requires an Apple Developer membership and a MusicKit JS developer token. Once provided, this button will authorize playback.")}
            </p>
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              {showConnect === "spotify" ? "Needs: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET" : "Needs: APPLE_MUSIC_DEVELOPER_TOKEN"}
            </div>
            <button onClick={() => setShowConnect(null)} className="mt-3 w-full py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded font-mono tracking-wider">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransportBtn({
  children,
  onClick,
  label,
  active = false,
  title,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={title}
      data-testid={testId}
      className={`w-7 h-6 flex items-center justify-center active:translate-y-px ${
        active ? "text-purple-200" : "text-zinc-200 hover:text-white"
      }`}
      style={{
        background: active
          ? "linear-gradient(180deg,#7a4ed4 0%,#3a1a6e 100%)"
          : "linear-gradient(180deg,#5a5a6e 0%,#2a2a36 100%)",
        border: "1px solid #000",
        borderTop: active ? "1px solid #1c1c24" : "1px solid #7a7a8e",
        borderLeft: active ? "1px solid #1c1c24" : "1px solid #7a7a8e",
        borderRadius: 2,
        boxShadow: active
          ? "inset 0 0 0 1px #1c1c24, inset 0 1px 2px rgba(0,0,0,0.6), 0 0 6px rgba(168,85,247,0.4)"
          : "inset 0 0 0 1px #1c1c24",
      }}
    >
      {children}
    </button>
  );
}

export default PabloWinampPlayer;

```

---

## `artifacts/interview-helper/src/components/TrackPicker.tsx`

```tsx
import { useState, useCallback, type ReactNode } from "react";
import { useMusicPlayer, type Track } from "@/contexts/MusicPlayerContext";
import { useLocation } from "wouter";

const C = "#a855f7";
const C2 = "rgba(168,85,247,";
const VT: React.CSSProperties = { fontFamily: "var(--font-sans)" };
const MONO: React.CSSProperties = { fontFamily: "var(--font-sans)" };

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (t: Track) => void;
  title?: string;
};

export function TrackPickerModal({ open, onClose, onPick, title = "PICK A TRACK" }: Props) {
  const { tracks, previewTrack, playing, current, playPause } = useMusicPlayer();
  const [, navigate] = useLocation();
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.85)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px,96vw)", maxHeight: "85vh", display: "flex", flexDirection: "column",
          background: "#0a0710", border: `1px solid ${C2}.4)`, borderRadius: 8,
          boxShadow: `0 0 60px ${C2}.3)`, overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C2}.2)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...VT, color: C, fontSize: 18, letterSpacing: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${C2}.4)`, color: C, padding: "2px 10px", cursor: "pointer", ...MONO, fontSize: 11 }}>CLOSE</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {tracks.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", ...MONO, color: "#888", fontSize: 12 }}>
              <div>NO TRACKS IN YOUR LIBRARY</div>
              <button
                onClick={() => { onClose(); navigate("/creative/music"); }}
                style={{ marginTop: 14, background: C, border: "none", color: "#000", padding: "6px 14px", cursor: "pointer", ...MONO, fontSize: 11 }}
              >GO TO HUMMING BIRD</button>
            </div>
          ) : tracks.map((t) => {
            const isCur = current?.id === t.id;
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", padding: "8px 10px", marginBottom: 4, gap: 8,
                background: isCur ? `${C2}.12)` : "transparent",
                border: `1px solid ${isCur ? `${C2}.4)` : "transparent"}`,
                borderRadius: 4,
              }}>
                <button
                  onClick={() => isCur ? playPause() : previewTrack(t.id)}
                  style={{ width: 28, height: 28, border: `1px solid ${C2}.4)`, background: "transparent", color: C, cursor: "pointer", ...MONO, fontSize: 11 }}
                  title={isCur && playing ? "Pause preview" : "Preview"}
                >{isCur && playing ? "❚❚" : "▶"}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...VT, color: "#eee", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ ...MONO, color: "#888", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.artist} · {fmtSec(t.durationSec)} · {(t.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
                <button
                  onClick={() => { onPick(t); onClose(); }}
                  style={{ background: C, border: "none", color: "#000", padding: "6px 12px", cursor: "pointer", ...MONO, fontSize: 11, fontWeight: 700 }}
                >USE</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fmtSec(s: number) {
  if (!isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

/**
 * Convenience hook:
 *   const { open, pick, picker } = useTrackPicker();
 *   ...
 *   <button onClick={() => pick((t) => doSomething(t))}>Pick a track</button>
 *   {picker}
 */
export function useTrackPicker(title?: string): {
  pick: (cb: (track: Track) => void) => void;
  picker: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [cb, setCb] = useState<((t: Track) => void) | null>(null);
  const pick = useCallback((onPick: (t: Track) => void) => {
    setCb(() => onPick);
    setOpen(true);
  }, []);
  const picker = (
    <TrackPickerModal
      open={open}
      title={title}
      onClose={() => setOpen(false)}
      onPick={(t) => { cb?.(t); setOpen(false); }}
    />
  );
  return { pick, picker };
}

```

---

## `artifacts/interview-helper/src/contexts/MusicPlayerContext.tsx`

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { isPhoneBusy, subscribePhoneBusy } from "@/lib/phone-busy";
import { getAudioSettings, subscribeAudioSettings } from "@/lib/audio-settings";
import { BG_OWNERS, claimBackgroundAudio, registerBackgroundAudio } from "@/lib/audio-bus";

export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  year?: number | null;
  artworkUrl?: string | null;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  objectPath: string;
  source: "upload" | "spotify" | "apple";
};

export type StagedItem = {
  id: string;
  file: File;
  origName: string;
  origSize: number;
  origMime: string;
  durationSec: number;
  // After conversion:
  convertedFile?: File;
  convertedSize?: number;
  // UI state:
  status: "ready" | "converting" | "converted" | "saving" | "saved" | "error";
  progress?: number; // 0..1 during convert / save
  error?: string;
};

export type RepeatMode = "off" | "all" | "one";

// A named playlist is purely client-side (localStorage) — the server still
// owns the *library* (all tracks). Each playlist is just an ordered list of
// trackIds plus a name. The pseudo-playlist with id `null` means "All Tracks"
// (i.e. the full library), which is the default queue and cannot be deleted.
export type Playlist = {
  id: string;
  name: string;
  trackIds: number[];
  createdAt: number;
};

type Ctx = {
  // tracks = the *full library* from the server, always. Pickers and other
  // consumers that want to show every available track read this. The active
  // playback queue is `queue` below.
  tracks: Track[];
  // queue = the active playback queue: either `tracks` (when activePlaylistId
  // is null) or the resolved/ordered subset for the active named playlist.
  // currentIdx, current, next/prev/repeat/shuffle, playIdx all index into
  // `queue` — NOT `tracks`.
  queue: Track[];
  currentIdx: number;
  current: Track | undefined;
  playing: boolean;
  pos: number;
  dur: number;
  vol: number;
  busy: boolean;
  err: string | null;
  // Playlist behavior
  shuffle: boolean;
  repeat: RepeatMode;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  // Named playlists (CRUD; persisted to localStorage)
  playlists: Playlist[];
  activePlaylistId: string | null; // null = "All Tracks"
  setActivePlaylist: (id: string | null) => void;
  createPlaylist: (name: string) => string; // returns new id
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: number) => boolean; // false if already present
  removeTrackFromPlaylist: (playlistId: string, trackId: number) => void;
  refresh: () => Promise<void>;
  playIdx: (i: number) => void;
  playPause: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (frac: number) => void;
  setVol: (v: number) => void;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  removeTrack: (id: number) => Promise<void>;
  // Enrich a track's metadata + cover art from MusicBrainz (beets-style).
  // Resolves to the matched summary, or null if nothing was found/failed.
  autoTagTrack: (id: number) => Promise<{ artist: string | null; title: string | null; album: string | null; year: number | null; hasArtwork: boolean } | null>;
  // --- Staging / preview / convert flow ---
  staged: StagedItem[];
  stageFiles: (files: FileList | File[]) => Promise<void>;
  discardStaged: (id: string) => void;
  previewStaged: (id: string) => void;
  convertStaged: (id: string) => Promise<void>;
  saveStaged: (id: string, opts?: { useConverted?: boolean }) => Promise<void>;
  // --- Reusable preview-from-track-id (for picker) ---
  previewTrack: (trackId: number) => void;
  // --- Download / export ---
  downloadTrack: (trackId: number) => Promise<void>;
  downloadStaged: (id: string, opts?: { useConverted?: boolean }) => void;
};

const MusicPlayerContext = createContext<Ctx | null>(null);

export function useMusicPlayer(): Ctx {
  const c = useContext(MusicPlayerContext);
  if (!c) throw new Error("useMusicPlayer must be used inside <MusicPlayerProvider>");
  return c;
}

const NATIVE_PLAYABLE = /^audio\/(mpeg|mp3|mp4|aac|ogg|webm|wav|x-wav|flac|x-flac|opus)|^video\/mp4/i;

function probeDuration(file: File): Promise<number> {
  return new Promise((res) => {
    try {
      const a = document.createElement("audio");
      a.preload = "metadata";
      const url = URL.createObjectURL(file);
      a.src = url;
      a.onloadedmetadata = () => { const d = isFinite(a.duration) ? a.duration : 0; URL.revokeObjectURL(url); res(Math.floor(d)); };
      a.onerror = () => { URL.revokeObjectURL(url); res(0); };
    } catch { res(0); }
  });
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVolState] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const stagedUrlsRef = useRef<Map<string, string>>(new Map());

  // Playlist behavior — persisted across reloads via localStorage so the
  // user doesn't have to re-toggle shuffle / loop every session. All
  // localStorage access is wrapped because privacy-mode browsers throw
  // on read/write and would otherwise crash provider initialization.
  const [shuffle, setShuffle] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false;
      return window.localStorage.getItem("hummingbird:shuffle") === "1";
    } catch { return false; }
  });
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    try {
      if (typeof window === "undefined") return "off";
      const v = window.localStorage.getItem("hummingbird:repeat");
      return v === "all" || v === "one" ? v : "off";
    } catch { return "off"; }
  });
  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem("hummingbird:shuffle", shuffle ? "1" : "0"); } catch {}
  }, [shuffle]);
  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem("hummingbird:repeat", repeat); } catch {}
  }, [repeat]);

  // Named playlists — purely client-side (localStorage). The server has no
  // playlists table; it just holds the *library* (every track). A playlist
  // is just a saved {name, [trackIds]} that filters the playback queue.
  // Persisted under "hummingbird:playlists". Read on init, written on any
  // mutation. All localStorage access wrapped — privacy-mode browsers throw.
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem("hummingbird:playlists");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Defensive normalize — drop bad entries silently rather than throw
      // and crash the entire provider on a malformed entry from a prior
      // build. Each playlist must have id+name, trackIds defaults to [].
      return parsed
        .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string")
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          trackIds: Array.isArray(p.trackIds) ? p.trackIds.filter((n: any) => typeof n === "number") : [],
          createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        }));
    } catch { return []; }
  });
  const [activePlaylistId, setActivePlaylistIdState] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const v = window.localStorage.getItem("hummingbird:active-playlist");
      return v && v !== "__all" ? v : null;
    } catch { return null; }
  });
  useEffect(() => {
    try { if (typeof window !== "undefined") window.localStorage.setItem("hummingbird:playlists", JSON.stringify(playlists)); } catch {}
  }, [playlists]);
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("hummingbird:active-playlist", activePlaylistId ?? "__all");
      }
    } catch {}
  }, [activePlaylistId]);

  // Normalize activePlaylistId against the live `playlists` array. If it
  // points to a playlist that has been deleted (or was a corrupt/stale id
  // from a prior session), force it back to null so the selector and the
  // queue agree on "All Tracks". Without this, queue silently falls back
  // to the full library while the highlight logic keeps a ghost id.
  useEffect(() => {
    if (activePlaylistId && !playlists.some(p => p.id === activePlaylistId)) {
      setActivePlaylistIdState(null);
    }
  }, [playlists, activePlaylistId]);

  // Deterministic shuffle pick — guaranteed to return an index different
  // from `excludeIdx` whenever `tracks.length > 1`. Picks uniformly from
  // the (length-1) sized space of "other tracks" by drawing in [0, len-1)
  // and skipping over the excluded slot. Eliminates the random-retry
  // loop that could (rarely) return the same index and stall playback.
  const pickShuffleIdx = useCallback((excludeIdx: number, len: number): number => {
    if (len <= 0) return 0;
    if (len === 1) return 0;
    const r = Math.floor(Math.random() * (len - 1));
    return r >= excludeIdx ? r + 1 : r;
  }, []);

  const toggleShuffle = useCallback(() => setShuffle(s => !s), []);
  const cycleRepeat = useCallback(() => {
    setRepeat(r => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  // Live refs so the audio "ended" listener (registered once) reads the
  // latest shuffle / repeat state without forcing a listener re-bind.
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  // When the audio engine auto-advances to the next track (onEnd shuffle /
  // repeat-all), it just bumps `currentIdx`. The src useEffect then swaps
  // the audio element's src — but it does NOT call play() on its own
  // (deliberately — we don't want library refreshes or initial mount to
  // start playback). Without this flag, auto-advance would silently load
  // the next track and stop. Setting `autoPlayPendingRef = true` before
  // bumping the index tells the src effect "this swap was intentional,
  // please start playback once the new src is loaded".
  const autoPlayPendingRef = useRef(false);

  // Mirror repeat="one" onto the native HTMLMediaElement.loop attribute.
  // The browser handles seamless looping much more reliably than catching
  // `ended` and calling play() ourselves — the latter is racy across
  // Safari/Firefox/Chrome and can leave the player stuck at currentTime=0.
  // We still keep the onEnd handler for the qLen===1 + repeat="all" case
  // and as a fallback if `loop` is ever unset by another code path.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.loop = repeat === "one";
  }, [repeat]);

  // Derive the playback queue from the active playlist. When activePlaylistId
  // is null (or points to a deleted playlist), queue == full library. When a
  // named playlist is active, queue == playlist trackIds resolved to Track
  // objects in playlist order, dropping any ids whose tracks have been
  // deleted from the library since. Empty queue is allowed and the engine
  // handles it (next/prev/playPause are no-ops).
  const queue = useMemo<Track[]>(() => {
    if (!activePlaylistId) return tracks;
    const pl = playlists.find(p => p.id === activePlaylistId);
    if (!pl) return tracks;
    const byId = new Map(tracks.map(t => [t.id, t] as const));
    const out: Track[] = [];
    for (const id of pl.trackIds) {
      const t = byId.get(id);
      if (t) out.push(t);
    }
    return out;
  }, [tracks, playlists, activePlaylistId]);

  // queueRef mirrors `queue` so the once-bound `ended` listener inside the
  // audio useEffect (registered with deps [queue.length, vol]) can read the
  // *latest* queue without forcing a listener re-bind on every reorder.
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Clamp currentIdx whenever queue shrinks past it (e.g., user removed a
  // track from the active playlist, or switched to a shorter playlist).
  // Without this, `current` would silently become undefined and next/prev
  // would behave oddly. We deliberately do NOT auto-play after reset —
  // the user can hit play themselves.
  useEffect(() => {
    if (currentIdx >= queue.length && queue.length > 0) {
      setCurrentIdx(0);
    }
  }, [queue.length, currentIdx]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = queue[currentIdx];

  const updateStaged = (id: string, patch: Partial<StagedItem>) => {
    setStaged((arr) => arr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  // Lazy-create the singleton <audio> element attached to document.body.
  // This survives all route changes because it lives outside React's component tree.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!audioRef.current) {
      let el = document.getElementById("__pablo-global-audio") as HTMLAudioElement | null;
      if (!el) {
        el = document.createElement("audio");
        el.id = "__pablo-global-audio";
        el.preload = "metadata";
        el.crossOrigin = "anonymous";
        document.body.appendChild(el);
      }
      audioRef.current = el;
    }
    const a = audioRef.current!;
    // Hummingbird's own slider (`vol`) is scaled by the central master volume
    // (and silenced on global mute) so the audio hub controls it too.
    { const s = getAudioSettings(); a.volume = s.muted ? 0 : vol * s.master; }

    const onTime = () => setPos(a.currentTime);
    const onDur = () => setDur(a.duration || 0);
    const onPlay = () => {
      setPlaying(true);
      // Hummingbird is a background-music tier. The instant it actually starts
      // playing, claim ownership so any page-level tier (world score, office
      // bed, radio) that was running gets paused — single chokepoint.
      claimBackgroundAudio(BG_OWNERS.hummingbird);
    };
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      // Honor repeat / shuffle. Reads from refs so we don't have to
      // re-register the listener every time the modes flip. Reads queue
      // length from queueRef so playlist swaps mid-song don't strand the
      // listener pointing at a stale length.
      const r = repeatRef.current;
      const sh = shuffleRef.current;
      const qLen = queueRef.current.length;
      if (qLen === 0) return;

      // Helper — autoplay only if phone/voice priority isn't active.
      // Without this, repeat-one would steal audio from a live call,
      // breaking the "phone takes precedence" contract documented in
      // MusicPlayerProvider above.
      const safePlay = () => {
        if (isPhoneBusy()) {
          setErr("Phone call in progress — music paused");
          return;
        }
        try { a.play().catch(() => {}); } catch {}
      };

      // Repeat-one is normally handled by `a.loop = true` set in the
      // useEffect above, so this branch shouldn't fire — but keep it as
      // a defensive fallback in case `loop` got cleared by another path.
      if (r === "one") {
        try { a.currentTime = 0; } catch {}
        safePlay();
        return;
      }

      // Single-track playlist: with repeat-all, loop the lone track;
      // otherwise stop. (Shuffle is meaningless on a 1-track playlist.)
      if (qLen === 1) {
        if (r === "all") {
          try { a.currentTime = 0; } catch {}
          setPos(0);
          safePlay();
        } else {
          try { a.pause(); a.currentTime = 0; } catch {}
          setPos(0);
        }
        return;
      }

      if (sh) {
        // Random different track — guaranteed to change idx. Mark
        // auto-play pending so the src useEffect actually starts the
        // next track instead of silently loading it.
        autoPlayPendingRef.current = true;
        setCurrentIdx((idx) => pickShuffleIdx(idx, qLen));
        return;
      }

      // Linear advance. Stop at the end of the playlist when repeat is off.
      setCurrentIdx((idx) => {
        const atEnd = idx >= qLen - 1;
        if (atEnd && r !== "all") {
          try { a.pause(); a.currentTime = 0; } catch {}
          setPos(0);
          return idx;
        }
        autoPlayPendingRef.current = true;
        return (idx + 1) % qLen;
      });
    };
    const onError = () => { setPlaying(false); setErr("Browser cannot play this file"); };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onError);
    };
  }, [queue.length, vol]);

  // Register Hummingbird as a background-music tier. When another tier (world
  // score, office bed, radio) claims ownership, the coordinator calls this to
  // pause us. We do NOT auto-resume on the next handoff — the user presses play
  // again — mirroring the phone/voice "no auto-resume" UX above.
  useEffect(() => {
    return registerBackgroundAudio(BG_OWNERS.hummingbird, () => {
      const a = audioRef.current;
      if (a && !a.paused) {
        try { a.pause(); } catch {}
      }
    });
  }, []);

  // Phone takes precedence over the media player. The instant the phone bus
  // reports an incoming ring or any active call, pause the audio. We do NOT
  // auto-resume when the call ends — the user can press play again.
  useEffect(() => {
    return subscribePhoneBusy((busy) => {
      if (!busy) return;
      const a = audioRef.current;
      if (a && !a.paused) {
        try { a.pause(); } catch {}
      }
    });
  }, []);

  // VOICE PRIORITY — Pablo / NPC TTS must always be audible. When any voice
  // line is in flight, duck the music (true pause, not just lower volume —
  // the user has reported TTS being eaten by the mix). We don't auto-resume:
  // the user can hit play again, mirroring the phone-busy behavior above.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const { subscribeVoicePriority } = await import("@/lib/audio-bus");
      unsub = subscribeVoicePriority((active) => {
        if (!active) return;
        const a = audioRef.current;
        if (a && !a.paused) {
          try { a.pause(); } catch {}
        }
      });
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  // When currentIdx changes, point the audio src at the new track and try to play.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      // Queue became empty (last track removed from active playlist, or
      // entire library cleared). Detach the audio element so it doesn't
      // keep playing a now-orphaned src — this is the edge case the
      // architect flagged where audio could continue past queue invalidation.
      try {
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch {}
      setPos(0);
      setPlaying(false);
      return;
    }
    const url = `/api/music/stream/${current.id}`;
    if (a.src.endsWith(url)) return;
    a.src = url;
    setPos(0);
    setErr(null);
    // Auto-play only when an auto-advance (onEnd shuffle / repeat-all)
    // explicitly requested it. Without this gate, library refreshes or
    // the initial mount would unwantedly start playback.
    if (autoPlayPendingRef.current) {
      autoPlayPendingRef.current = false;
      if (isPhoneBusy()) {
        setErr("Phone call in progress — music paused");
      } else {
        a.play().catch(() => {});
      }
    }
  }, [current?.id]);

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch("/api/music/tracks");
      if (!r.ok) { setTracks([]); return; }
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) { setTracks([]); return; }
      const j = await r.json();
      setTracks(Array.isArray(j?.tracks) ? j.tracks : []);
    } catch {
      setTracks([]);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const playIdx = useCallback((i: number) => {
    if (i < 0 || i >= queue.length) return;
    const a = audioRef.current;
    if (!a) return;
    setCurrentIdx(i);
    setErr(null);
    const url = `/api/music/stream/${queue[i].id}`;
    if (!a.src.endsWith(url)) a.src = url;
    if (isPhoneBusy()) {
      setErr("Phone call in progress — music paused");
      return;
    }
    a.play().catch(() => {});
  }, [queue]);

  const playPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      if (queue.length > 0) { playIdx(0); }
      return;
    }
    if (a.paused) {
      if (isPhoneBusy()) {
        setErr("Phone call in progress — music paused");
        return;
      }
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [current, queue.length, playIdx]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPos(0);
  }, []);

  const next = useCallback(() => {
    if (!queue.length) return;
    if (shuffle && queue.length > 1) {
      playIdx(pickShuffleIdx(currentIdx, queue.length));
      return;
    }
    playIdx((currentIdx + 1) % queue.length);
  }, [queue.length, currentIdx, playIdx, shuffle, pickShuffleIdx]);
  // Prev under shuffle: there is no history stack, so PREV picks another
  // random track — same behavior as Winamp / iPod / classic players.
  // Tooltip in the UI documents this so users aren't surprised.
  const prev = useCallback(() => {
    if (!queue.length) return;
    if (shuffle && queue.length > 1) {
      playIdx(pickShuffleIdx(currentIdx, queue.length));
      return;
    }
    playIdx((currentIdx - 1 + queue.length) % queue.length);
  }, [queue.length, currentIdx, playIdx, shuffle, pickShuffleIdx]);

  const seek = useCallback((frac: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(dur, dur * frac));
  }, [dur]);

  const setVol = useCallback((v: number) => {
    setVolState(v);
    if (audioRef.current) {
      const s = getAudioSettings();
      audioRef.current.volume = s.muted ? 0 : v * s.master;
    }
  }, []);

  // Re-apply the effective volume whenever the central audio store changes
  // (master volume slider or global mute), keeping Hummingbird in lockstep.
  useEffect(() => {
    const apply = () => {
      const a = audioRef.current;
      if (!a) return;
      const s = getAudioSettings();
      a.volume = s.muted ? 0 : vol * s.master;
    };
    apply();
    return subscribeAudioSettings(apply);
  }, [vol]);

  // Spacebar = global play/pause toggle for Hummingbird, mirroring desktop
  // media players (Winamp, Spotify desktop, iTunes). Skipped while the user
  // is typing into an input/textarea/contenteditable so we don't eat space
  // characters in chat boxes, search fields, or the terminal. Buttons keep
  // their default activation behavior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Respect anyone who already handled this event (modals, custom
      // hotkeys) and ignore key-repeat so holding space doesn't strobe
      // play/pause dozens of times per second.
      if (e.defaultPrevented || e.repeat) return;
      // Skip IME composition — pressing space to confirm a candidate in
      // Japanese/Chinese/Korean input must not toggle playback.
      if (e.isComposing || e.keyCode === 229) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = (t.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
        if (tag === "BUTTON" || t.getAttribute("role") === "button") return;
      }
      e.preventDefault();
      playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playPause]);

  const uploadFiles = useCallback(async (filesIn: FileList | File[]) => {
    const list = Array.from(filesIn);
    if (list.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const file of list) {
        const sigRes = await apiFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!sigRes.ok) throw new Error("Could not get upload URL");
        const sig = await sigRes.json();
        const put = await fetch(sig.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed");
        const durationSec = await probeDuration(file);
        const base = file.name.replace(/\.[^.]+$/, "");
        let title = base;
        let artist = "Unknown Artist";
        const dash = base.split(/\s+-\s+/);
        if (dash.length >= 2) { artist = dash[0].trim(); title = dash.slice(1).join(" - ").trim(); }
        const save = await apiFetch("/api/music/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, artist,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size, durationSec,
            objectPath: sig.objectPath,
            source: "upload",
          }),
        });
        if (!save.ok) {
          const j = await save.json().catch(() => ({}));
          throw new Error(j?.error || "Save failed");
        }
      }
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const removeTrack = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/music/tracks/${id}`, { method: "DELETE" });
      // If the removed track is the current track, stop playback.
      const cur = current;
      if (cur && cur.id === id) {
        const a = audioRef.current;
        if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
        setPlaying(false);
        setPos(0);
      }
      await refresh();
    } catch {}
  }, [current, refresh]);

  const autoTagTrack = useCallback(async (id: number) => {
    try {
      const r = await apiFetch(`/api/music/tracks/${id}/autotag`, { method: "POST" });
      if (!r.ok) return null;
      const j = await r.json();
      await refresh();
      return j?.matched ?? null;
    } catch {
      return null;
    }
  }, [refresh]);

  // ===== STAGING / PREVIEW / CONVERT =====

  const stageFiles = useCallback(async (filesIn: FileList | File[]) => {
    const list = Array.from(filesIn);
    const items: StagedItem[] = [];
    for (const file of list) {
      const durationSec = await probeDuration(file);
      const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      items.push({
        id,
        file,
        origName: file.name,
        origSize: file.size,
        origMime: file.type || "application/octet-stream",
        durationSec,
        status: "ready",
      });
    }
    setStaged((cur) => [...cur, ...items]);
  }, []);

  const discardStaged = useCallback((id: string) => {
    setStaged((cur) => cur.filter((s) => s.id !== id));
    const url = stagedUrlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); stagedUrlsRef.current.delete(id); }
  }, []);

  const previewStaged = useCallback((id: string) => {
    const a = audioRef.current;
    if (!a) return;
    const item = staged.find((s) => s.id === id);
    if (!item) return;
    const sourceFile = item.convertedFile || item.file;
    let url = stagedUrlsRef.current.get(id);
    if (!url) {
      url = URL.createObjectURL(sourceFile);
      stagedUrlsRef.current.set(id, url);
    }
    a.src = url;
    setPos(0);
    setErr(null);
    a.play().catch(() => setErr("Browser cannot play this format — try CONVERT TO MP3"));
  }, [staged]);

  const convertStaged = useCallback(async (id: string) => {
    const item = staged.find((s) => s.id === id);
    if (!item) return;
    const { convertFileToMp3, canBrowserDecode } = await import("@/lib/audioConvert");
    if (!canBrowserDecode(item.origMime)) {
      updateStaged(id, { status: "error", error: "Browser cannot decode this format. Save the original or convert externally." });
      return;
    }
    updateStaged(id, { status: "converting", progress: 0, error: undefined });
    try {
      const mp3 = await convertFileToMp3(item.file, (p) => updateStaged(id, { progress: p }));
      // Drop any cached preview URL so future preview uses the converted file
      const oldUrl = stagedUrlsRef.current.get(id);
      if (oldUrl) { URL.revokeObjectURL(oldUrl); stagedUrlsRef.current.delete(id); }
      updateStaged(id, { status: "converted", convertedFile: mp3, convertedSize: mp3.size, progress: 1 });
    } catch (e: any) {
      updateStaged(id, { status: "error", error: e?.message || "Conversion failed" });
    }
  }, [staged]);

  const saveStaged = useCallback(async (id: string, opts?: { useConverted?: boolean }) => {
    const item = staged.find((s) => s.id === id);
    if (!item) return;
    const useConv = opts?.useConverted !== false && !!item.convertedFile;
    const file = useConv ? item.convertedFile! : item.file;
    updateStaged(id, { status: "saving", progress: 0, error: undefined });
    try {
      const sigRes = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!sigRes.ok) throw new Error("Could not get upload URL");
      const sig = await sigRes.json();
      const put = await fetch(sig.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");
      const base = file.name.replace(/\.[^.]+$/, "");
      let title = base;
      let artist = "Unknown Artist";
      const dash = base.split(/\s+-\s+/);
      if (dash.length >= 2) { artist = dash[0].trim(); title = dash.slice(1).join(" - ").trim(); }
      const save = await apiFetch("/api/music/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, artist,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size, durationSec: item.durationSec,
          objectPath: sig.objectPath,
          source: "upload",
        }),
      });
      if (!save.ok) {
        const j = await save.json().catch(() => ({}));
        throw new Error(j?.error || "Save failed");
      }
      // Also surface the saved/converted file in the Media Library (the
      // "media file tab", VAULT-X) so a single save lands in BOTH Hummingbird
      // and the media library. Reuses the same uploaded object — no second
      // upload. Best-effort: a media-library registration failure must not
      // fail the primary Hummingbird save.
      try {
        await apiFetch("/api/tools/documents/files/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            objectPath: sig.objectPath,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
          }),
        });
      } catch { /* non-fatal — track is already saved to Hummingbird */ }
      updateStaged(id, { status: "saved", progress: 1 });
      await refresh();
      // Auto-clean saved item after a short delay so the UI can show the success state
      setTimeout(() => discardStaged(id), 1500);
    } catch (e: any) {
      updateStaged(id, { status: "error", error: e?.message || "Save failed" });
    }
  }, [staged, refresh, discardStaged]);

  // Preview a specific track from the *library*. If the track is in the
  // current queue, play it from there (preserves the playlist context). If
  // it's NOT in the current queue (user viewing playlist A but pickers
  // offer any library track), exit to All Tracks AND start playback by
  // setting the audio src directly by trackId. We deliberately bypass
  // playIdx here because playIdx's bounds-check is closure-bound to the
  // *old* queue — using a microtask race to wait for the new queue is not
  // safe. Setting src by id + setting currentIdx to the library position
  // (which is what queue == tracks will mirror after the state commits)
  // gives us deterministic playback without depending on render timing.
  const previewTrack = useCallback((trackId: number) => {
    const inQ = queue.findIndex((t) => t.id === trackId);
    if (inQ >= 0) { playIdx(inQ); return; }
    const inLib = tracks.findIndex((t) => t.id === trackId);
    if (inLib < 0) return;
    setActivePlaylistIdState(null);
    setCurrentIdx(inLib);
    setErr(null);
    const a = audioRef.current;
    if (!a) return;
    const url = `/api/music/stream/${trackId}`;
    if (!a.src.endsWith(url)) a.src = url;
    if (isPhoneBusy()) {
      setErr("Phone call in progress — music paused");
      return;
    }
    a.play().catch(() => {});
  }, [queue, tracks, playIdx]);

  // ===== PLAYLIST ACTIONS =====
  // All localStorage persistence happens in the useEffect above (writes
  // `playlists` / `activePlaylistId` on every change). These callbacks just
  // mutate state.

  const setActivePlaylist = useCallback((id: string | null) => {
    setActivePlaylistIdState(id);
    // Reset playback to the start of the new queue. We don't auto-play —
    // the user can hit play. (Auto-playing on every playlist switch would
    // be jarring, especially for someone who just clicked the wrong list.)
    setCurrentIdx(0);
    setPos(0);
  }, []);

  const createPlaylist = useCallback((name: string): string => {
    const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trimmed = (name || "").trim().slice(0, 60) || "Untitled Playlist";
    setPlaylists((arr) => [...arr, { id, name: trimmed, trackIds: [], createdAt: Date.now() }]);
    return id;
  }, []);

  const renamePlaylist = useCallback((id: string, name: string) => {
    const trimmed = (name || "").trim().slice(0, 60);
    if (!trimmed) return;
    setPlaylists((arr) => arr.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((arr) => arr.filter((p) => p.id !== id));
    // If the deleted playlist was active, fall back to "All Tracks" so the
    // queue stays valid instead of pointing at a ghost id.
    setActivePlaylistIdState((cur) => (cur === id ? null : cur));
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, trackId: number): boolean => {
    let added = false;
    setPlaylists((arr) => arr.map((p) => {
      if (p.id !== playlistId) return p;
      if (p.trackIds.includes(trackId)) return p;
      added = true;
      return { ...p, trackIds: [...p.trackIds, trackId] };
    }));
    return added;
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: number) => {
    setPlaylists((arr) => arr.map((p) => (p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p)));
  }, []);

  const downloadTrack = useCallback(async (trackId: number) => {
    const t = tracks.find((x) => x.id === trackId);
    if (!t) return;
    try {
      const r = await apiFetch(`/api/music/stream/${trackId}`);
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const ext = (() => {
        const m = (t.mimeType || "").toLowerCase();
        if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
        if (m.includes("wav")) return "wav";
        if (m.includes("flac")) return "flac";
        if (m.includes("ogg")) return "ogg";
        if (m.includes("opus")) return "opus";
        if (m.includes("aac")) return "aac";
        if (m.includes("mp4") || m.includes("m4a")) return "m4a";
        return "audio";
      })();
      const safe = `${t.artist} - ${t.title}`.replace(/[\\/:*?"<>|]+/g, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setErr(e?.message || "Download failed");
    }
  }, [tracks]);

  const downloadStaged = useCallback((id: string, opts?: { useConverted?: boolean }) => {
    const item = staged.find((s) => s.id === id);
    if (!item) return;
    const useConv = opts?.useConverted !== false && !!item.convertedFile;
    const file = useConv ? item.convertedFile! : item.file;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [staged]);

  // Cleanup all staged object URLs on unmount
  useEffect(() => {
    return () => {
      stagedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      stagedUrlsRef.current.clear();
    };
  }, []);

  const value = useMemo<Ctx>(() => ({
    tracks, queue, currentIdx, current, playing, pos, dur, vol, busy, err,
    shuffle, repeat, toggleShuffle, cycleRepeat,
    playlists, activePlaylistId, setActivePlaylist, createPlaylist, renamePlaylist,
    deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist,
    refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack, autoTagTrack,
    staged, stageFiles, discardStaged, previewStaged, convertStaged, saveStaged, previewTrack,
    downloadTrack, downloadStaged,
  }), [tracks, queue, currentIdx, current, playing, pos, dur, vol, busy, err,
       shuffle, repeat, toggleShuffle, cycleRepeat,
       playlists, activePlaylistId, setActivePlaylist, createPlaylist, renamePlaylist,
       deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist,
       refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack, autoTagTrack,
       staged, stageFiles, discardStaged, previewStaged, convertStaged, saveStaged, previewTrack,
       downloadTrack, downloadStaged]);

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function isPlayableMime(mime: string | null | undefined): boolean {
  return !mime || NATIVE_PLAYABLE.test(mime);
}

```

---

## `artifacts/interview-helper/src/lib/hummingbird-bridge.ts`

```tsx
import { useCallback, useState } from "react";
import { useMusicPlayer, type Track } from "@/contexts/MusicPlayerContext";

export type ExportOpts = {
  name: string;
  mime?: string;
  artist?: string;
  album?: string;
};

function safeName(n: string, ext: string) {
  const base = n.replace(/[^\w\-. ]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "untitled";
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

function extFromMime(m?: string): string {
  if (!m) return "wav";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("flac")) return "flac";
  return "bin";
}

export function useHummingbirdBridge() {
  const mp = useMusicPlayer();
  const [exporting, setExporting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const exportBlob = useCallback(
    async (blob: Blob, opts: ExportOpts) => {
      setExporting(true);
      setLastError(null);
      try {
        const mime = opts.mime || blob.type || "audio/wav";
        const ext = extFromMime(mime);
        const fname = safeName(opts.name, ext);
        const file = new File([blob], fname, { type: mime });
        await mp.uploadFiles([file]);
        await mp.refresh();
        return true;
      } catch (e: any) {
        setLastError(e?.message || "Export failed");
        return false;
      } finally {
        setExporting(false);
      }
    },
    [mp],
  );

  const tracks: Track[] = mp.tracks;

  return {
    exportBlob,
    exporting,
    lastError,
    tracks,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
  };
}

```

---

## `artifacts/interview-helper/src/lib/audio-bus.ts`

```tsx
/**
 * Tiny pub-sub used to enforce a global "voice priority" rule:
 * whenever Pablo / NPC TTS is speaking (or the phone is ringing/active),
 * background music ducks itself. This is a major UX pain-point — TTS
 * frequently fails silently when music drowns it out, so the rule is
 * always-on: voice wins.
 *
 * Anyone can call setVoicePriority(true) on speech start and (false) on
 * end / cancel. Listeners (currently MusicPlayerContext) react by pausing
 * playback. Multiple concurrent voice sources increment a refcount so the
 * music doesn't resume mid-line when one finishes before another.
 */

type Listener = (active: boolean) => void;

let voiceCount = 0;
const listeners = new Set<Listener>();

function notify() {
  const active = voiceCount > 0;
  for (const fn of listeners) {
    try { fn(active); } catch { /* swallow */ }
  }
}

export function acquireVoicePriority(): () => void {
  voiceCount += 1;
  if (voiceCount === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    voiceCount = Math.max(0, voiceCount - 1);
    if (voiceCount === 0) notify();
  };
}

export function isVoicePriorityActive(): boolean { return voiceCount > 0; }

export function subscribeVoicePriority(fn: Listener): () => void {
  listeners.add(fn);
  // Sync the new subscriber to current state immediately.
  try { fn(voiceCount > 0); } catch { /* swallow */ }
  return () => { listeners.delete(fn); };
}

// ── Background-music-tier coordinator ────────────────────────────────────────
// On top of voice ducking, the app enforces a second rule: at most ONE sustained
// "background music tier" source may be audible at a time. The tiers are the
// procedural world score, the office ambient bed, Shadow Radio, and the
// Hummingbird global player. (Crowd murmur is a
// deliberate SFX-channel sub-layer of the world score and is NOT a tier, so it
// does not participate here.) One-shot SFX never participate either.
//
// Each tier registers a stop callback under a stable owner id. When a tier
// starts playing it calls claimBackgroundAudio(owner): ownership transfers to it
// and EVERY OTHER registered tier is stopped/paused. The previously-owning tier
// does not auto-resume on the next handoff — cross-tier handoff is user/page
// driven, mirroring the existing phone/voice "no auto-resume" UX. Voice ducking
// (above) still layers on top: a speaking voice ducks whichever tier is active.

export const BG_OWNERS = {
  worldScore: "world-score",
  officeAmbient: "office-ambient",
  radioPablo: "radio-pablo",
  hummingbird: "hummingbird",
} as const;

type BgStop = () => void;
const bgStoppers = new Map<string, BgStop>();
let bgOwner: string | null = null;

// Register a tier's stop callback. Returns an unregister fn. Re-registering the
// same owner replaces its stopper (idempotent for module-singleton sources).
export function registerBackgroundAudio(owner: string, stop: BgStop): () => void {
  bgStoppers.set(owner, stop);
  return () => { if (bgStoppers.get(owner) === stop) bgStoppers.delete(owner); };
}

// A tier announces it is now playing. Ownership is set FIRST (so a stopper that
// re-entrantly calls releaseBackgroundAudio for its own id can't clobber the new
// owner), then every OTHER registered tier is stopped.
export function claimBackgroundAudio(owner: string): void {
  bgOwner = owner;
  for (const [id, stop] of bgStoppers) {
    if (id === owner) continue;
    try { stop(); } catch { /* swallow */ }
  }
}

// A tier announces it has stopped. Only clears ownership if it still holds it
// (so a stale release from a tier that already lost the claim is a no-op).
export function releaseBackgroundAudio(owner: string): void {
  if (bgOwner === owner) bgOwner = null;
}

export function getBackgroundAudioOwner(): string | null { return bgOwner; }

// Route-change backstop helper: stop every registered tier except an optional
// keeper (the tier the destination route legitimately owns). Used by the App
// router listener so a page that forgot to clean up cannot leak audio forward.
export function stopBackgroundAudioExcept(keep?: string): void {
  for (const [id, stop] of bgStoppers) {
    if (keep && id === keep) continue;
    try { stop(); } catch { /* swallow */ }
  }
  bgOwner = keep ?? null;
}

```

---

## `artifacts/interview-helper/src/lib/audio-settings.ts`

```tsx
// ── Central audio settings — single source of truth ──────────────────────────
// The app historically split audio across three systems with no shared volume:
//   1. soundEngine.ts        — procedural SFX + ambient score (_sfxVol/_musicVol)
//   2. MusicPlayerContext    — Hummingbird user-music stream (own vol slider)
//   3. Shadow Radio/callhome — the global Call Home broadcast
// Game/Settings.tsx persisted volumes to localStorage but never applied them to
// the engine, so the sliders did nothing live and the terminal had no controls.
//
// This module is a tiny framework-agnostic pub/sub store that is THE place audio
// settings live. It persists to the same `sm_game_settings_v1` key the game
// settings page already uses (extended with `soundtrackVolume` + `muted`), applies
// changes to soundEngine immediately, and notifies subscribers (Hummingbird, the
// Shadow Radio) so they can scale their own streams. Use it from anywhere — the
// game settings page, the terminal, and the Hummingbird hub all read/write here.

import { setSfxVolume, setMusicVolume, setMuted as setEngineMuted } from "../soundEngine";
import { subscribeVoicePriority } from "./audio-bus";

const STORE_KEY = "sm_game_settings_v1";

export interface AudioSettings {
  master: number;     // 0–1 master multiplier
  music: number;      // 0–1 AMBIANCE — procedural ambient bed (in-game only)
  sfx: number;        // 0–1 sound effects
  voice: number;      // 0–1 TTS / advisor voices
  soundtrack: number; // 0–1 SHADOW RADIO — Call Home tracks
  muted: boolean;     // master mute
  musicEnabled: boolean;    // SHADOW RADIO — default ON at low volume, global except phone
  ambianceEnabled: boolean; // AMBIANCE (low ambient bed) — default ON, in-game, toggleable off
}

// Numeric volume channels only (the booleans above are gates, not levels).
type VolumeChannel = "master" | "music" | "sfx" | "voice" | "soundtrack";

export const AUDIO_DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.14,       // AMBIANCE is intentionally EXTREMELY LOW
  sfx: 0.9,
  voice: 1.0,
  soundtrack: 0.16,  // Shadow Radio starts quietly; the physical source can adjust it
  muted: false,
  musicEnabled: true,    // radio is tuned in by default at the low source level above
  ambianceEnabled: true, // low ambient bed plays during the game by default
};

// The settings page uses verbose key names; map between the two shapes so the
// two stay in lockstep on the one localStorage key.
function readPersisted(): AudioSettings {
  if (typeof window === "undefined") return { ...AUDIO_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { ...AUDIO_DEFAULTS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    return {
      master: num(p.masterVolume, AUDIO_DEFAULTS.master),
      music: num(p.musicVolume, AUDIO_DEFAULTS.music),
      sfx: num(p.sfxVolume, AUDIO_DEFAULTS.sfx),
      voice: num(p.voiceVolume, AUDIO_DEFAULTS.voice),
      soundtrack: num(p.soundtrackVolume, AUDIO_DEFAULTS.soundtrack),
      muted: typeof p.audioMuted === "boolean" ? p.audioMuted : AUDIO_DEFAULTS.muted,
      musicEnabled: typeof p.musicEnabled === "boolean" ? p.musicEnabled : AUDIO_DEFAULTS.musicEnabled,
      ambianceEnabled: typeof p.ambianceEnabled === "boolean" ? p.ambianceEnabled : AUDIO_DEFAULTS.ambianceEnabled,
    };
  } catch {
    return { ...AUDIO_DEFAULTS };
  }
}

function persist(s: AudioSettings) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // Merge so we don't clobber non-audio game settings (resolution, fps, etc.).
    const merged = {
      ...existing,
      masterVolume: s.master,
      musicVolume: s.music,
      sfxVolume: s.sfx,
      voiceVolume: s.voice,
      soundtrackVolume: s.soundtrack,
      audioMuted: s.muted,
      musicEnabled: s.musicEnabled,
      ambianceEnabled: s.ambianceEnabled,
    };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(merged));
  } catch {
    /* storage may be unavailable; settings just won't persist */
  }
}

let state: AudioSettings = readPersisted();
const listeners = new Set<(s: AudioSettings) => void>();

// Voice ducking: while Pablo / an NPC / the phone is speaking (voice priority
// from audio-bus), ALL background music must drop to silence — voice always
// wins, because TTS frequently fails silently when music plays over it. Only
// the music-ish channels duck; voice + sfx are untouched. This is applied here,
// centrally, so every music consumer (soundEngine ambient score AND Pablo
// Radio) ducks in lockstep without each having to wire the bus.
const DUCKED_CHANNELS = new Set<VolumeChannel>(["music", "soundtrack"]);
let voiceActive = false;

function duckFactor(channel: VolumeChannel): number {
  return voiceActive && DUCKED_CHANNELS.has(channel) ? 0 : 1;
}

// Push the current state into soundEngine. Hummingbird + Shadow Radio subscribe
// separately and scale their own streams by `master` (and their own channel).
function applyToEngine() {
  const m = state.muted ? 0 : 1;
  const ambiance = state.ambianceEnabled ? 1 : 0;
  setSfxVolume(state.sfx * state.master * m);
  setMusicVolume(state.music * state.master * m * ambiance * duckFactor("music"));
  setEngineMuted(state.muted);
}

export function getAudioSettings(): AudioSettings {
  return state;
}

// Shadow Radio is on by default at a low source level and remains toggleable.
export function getMusicEnabled(): boolean {
  return state.musicEnabled;
}

// AMBIANCE (low ambient bed) plays during the game unless toggled off.
export function getAmbianceEnabled(): boolean {
  return state.ambianceEnabled;
}

// Effective per-channel gain a consumer should apply to its own stream.
export function channelGain(channel: VolumeChannel): number {
  if (state.muted) return 0;
  // The `music` channel is AMBIANCE; the `soundtrack` channel is opt-in Shadow Radio.
  if (channel === "music" && !state.ambianceEnabled) return 0;
  if (channel === "soundtrack" && !state.musicEnabled) return 0;
  return Math.max(0, Math.min(1, state[channel] * state.master * duckFactor(channel)));
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  state = { ...state, ...patch };
  persist(state);
  applyToEngine();
  for (const fn of listeners) fn(state);
}

export function toggleAudioMuted(): boolean {
  setAudioSettings({ muted: !state.muted });
  return state.muted;
}

export function subscribeAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Apply persisted settings to the engine as soon as this module loads so audio
// starts at the user's chosen levels (not the engine's raw defaults).
let _initialized = false;
export function initAudioSettings() {
  if (_initialized) return;
  _initialized = true;
  applyToEngine();
  // React to voice priority (Pablo/NPC TTS, phone): duck all music to silence
  // while a voice is speaking, restore the user's levels the instant it ends.
  subscribeVoicePriority((active) => {
    if (active === voiceActive) return;
    voiceActive = active;
    applyToEngine();                  // soundEngine ambient score
    for (const fn of listeners) fn(state); // office radio re-reads channelGain
  });
}
if (typeof window !== "undefined") initAudioSettings();

```

---

## `artifacts/interview-helper/src/lib/phone-busy.ts`

```tsx
// Tiny global "phone is busy" bus. The phone system holds multiple sources of
// busyness (an incoming Twilio ring, an active conference, an outbound call in
// progress). Each source registers itself by name; the music player listens
// and pauses any audio whenever ANY source is busy.
//
// Phone takes precedence over the media player.

type Listener = (busy: boolean) => void;

const reasons = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  const busy = reasons.size > 0;
  for (const l of listeners) {
    try { l(busy); } catch {}
  }
}

export function setPhoneBusy(reason: string, busy: boolean) {
  const had = reasons.has(reason);
  if (busy && !had) {
    reasons.add(reason);
    emit();
  } else if (!busy && had) {
    reasons.delete(reason);
    emit();
  }
}

export function isPhoneBusy(): boolean {
  return reasons.size > 0;
}

export function subscribePhoneBusy(cb: Listener): () => void {
  listeners.add(cb);
  // Fire immediately so subscribers get current state.
  try { cb(reasons.size > 0); } catch {}
  return () => { listeners.delete(cb); };
}

```

---

## `artifacts/interview-helper/src/pages/MusicJukebox.tsx`

```tsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ExternalLink, Copy, Check, Link2, Loader2, FolderOpen, Music2 } from "lucide-react";
import { PabloWinampPlayer } from "@/components/PabloWinampPlayer";
import { HummingbirdIcon } from "@/components/HummingbirdIcon";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { AudioSettingsPanel } from "@/components/AudioSettingsPanel";
import { apiFetch } from "@/lib/api-client";

export default function MusicJukebox() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const { stageFiles, refresh } = useMusicPlayer() as any;
  const [dropActive, setDropActive] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const dragDepth = useRef(0);

  // ?popout=1 → minimal layout suitable for a detached window. Lets the user
  // pop the player out and keep listening while working in any other tab.
  const popout = (location.split("?")[1] || "").includes("popout=1");

  // ---------- Audio URL converter (YouTube / SoundCloud / Bandcamp / etc.) ----------
  const [convertUrl, setConvertUrl] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const submitConvert = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const u = convertUrl.trim();
    if (!u || converting) return;
    setConverting(true);
    setConvertMsg("Pulling audio… this can take 30–90 seconds.");
    try {
      const r = await apiFetch("/api/music/convert-stream-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Conversion failed (${r.status})`);
      await refresh?.();
      setConvertMsg(`Imported "${j?.track?.title ?? "track"}" into Hummingbird.`);
      setConvertUrl("");
    } catch (err: any) {
      setConvertMsg(err?.message || "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  // ---------- Load from Media Library ----------
  type LibFile = { id: number; name: string; objectPath: string | null; mimeType: string | null; fileSize: number | null; isFolder: boolean };
  const [libOpen, setLibOpen] = useState(false);
  const [libLoading, setLibLoading] = useState(false);
  const [libFiles, setLibFiles] = useState<LibFile[]>([]);
  const [libErr, setLibErr] = useState<string | null>(null);
  const [libImporting, setLibImporting] = useState<number | null>(null);
  const openLibrary = async () => {
    setLibOpen(true); setLibLoading(true); setLibErr(null);
    try {
      const r = await apiFetch("/api/tools/documents/files");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Could not open library (${r.status})`);
      }
      const j = await r.json();
      const items: LibFile[] = (j?.items ?? []) as LibFile[];
      const audio = items.filter(i => !i.isFolder && i.objectPath && (
        (i.mimeType ?? "").startsWith("audio/") || i.mimeType === "video/mp4" || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(i.name)
      ));
      setLibFiles(audio);
    } catch (e: any) {
      setLibErr(e?.message || "Could not open library");
    } finally { setLibLoading(false); }
  };
  const importFromLibrary = async (f: LibFile) => {
    if (!f.objectPath) return;
    setLibImporting(f.id);
    try {
      const r = await apiFetch("/api/music/import-from-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: f.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Import failed (${r.status})`);
      await refresh?.();
      setImportMsg(`Loaded "${j?.track?.title ?? f.name}" from library.`);
      setLibOpen(false);
    } catch (e: any) {
      setLibErr(e?.message || "Import failed");
    } finally { setLibImporting(null); }
  };

  // Cross-site / file drag-drop. Browsers drop dragged audio elements as a
  // URL in `text/uri-list` (or text/plain). Files come through dataTransfer
  // .files. We accept both.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
    };
    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current += 1;
      setDropActive(true);
    };
    const onLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropActive(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDropActive(false);
      if (!e.dataTransfer) return;

      // 1) Real files dragged from desktop
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        try { await stageFiles(files); setImportMsg(`Staged ${files.length} file(s) — preview & save.`); }
        catch (err: any) { setImportMsg(err?.message || "Could not stage files"); }
        return;
      }

      // 2) URLs dragged from another website (audio elements, file links)
      const uri =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/x-moz-url")?.split("\n")[0] ||
        e.dataTransfer.getData("text/plain") ||
        "";
      const trimmed = uri.trim().split(/\s+/)[0];
      if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
        setImportMsg("Drop a file or an audio URL here.");
        return;
      }
      setImporting(true);
      setImportMsg(`Pulling ${trimmed.slice(0, 60)}…`);
      try {
        const r = await apiFetch("/api/music/import-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `Import failed (${r.status})`);
        await refresh?.();
        setImportMsg(`Imported "${j?.track?.title ?? "track"}" into your playlist.`);
      } catch (err: any) {
        setImportMsg(err?.message || "Import failed.");
      } finally {
        setImporting(false);
      }
    };

    window.addEventListener("dragover", onOver);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [isAuthenticated, stageFiles, refresh]);

  const popOut = () => {
    const url = `${window.location.pathname}?popout=1`;
    window.open(url, "humbird_popout", "popup=yes,width=520,height=720,resizable=yes");
  };

  if (isLoading) return null;
  if (!isAuthenticated) return <SignInPage />;

  if (popout) {
    return (
      <div className="min-h-screen w-full flex flex-col" style={{
        background: "radial-gradient(circle at 50% 0%, rgba(160,120,255,0.18) 0%, transparent 60%), #07080d",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        <header className="px-3 py-2 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <HummingbirdIcon size={18} color="#c084fc" />
            <span className="text-[10px] font-mono tracking-[0.3em] text-zinc-400">HUMMING BIRD · POPOUT</span>
          </div>
          <button onClick={() => window.close()} className="text-[10px] font-mono text-zinc-500 hover:text-red-300">CLOSE</button>
        </header>
        <div className="flex-1 flex items-start justify-center p-4">
          <div className="w-full max-w-md"><PabloWinampPlayer size="full" /></div>
        </div>
        {importMsg && (
          <div className="px-3 py-2 text-[10px] font-mono text-purple-200 bg-purple-500/10 border-t border-purple-500/30">
            {importMsg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative" style={{
      background: "radial-gradient(circle at 30% 20%, rgba(160,120,255,0.12) 0%, transparent 60%), radial-gradient(circle at 70% 80%, rgba(255,100,180,0.10) 0%, transparent 60%), #07080d",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      {/* Drop overlay — appears while dragging over the page */}
      {dropActive && (
        <div className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center"
          style={{ background: "rgba(124,58,237,0.18)", backdropFilter: "blur(2px)" }}>
          <div className="border-2 border-dashed border-purple-300 rounded-2xl px-10 py-8 bg-black/60">
            <div className="flex items-center gap-3 text-purple-200 font-mono">
              <HummingbirdIcon size={32} color="#e9d5ff" />
              <div>
                <div className="text-sm tracking-[0.3em]">DROP TO IMPORT</div>
                <div className="text-[10px] text-purple-300/80 mt-1">files · audio links · web tabs</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-5xl mx-auto px-4 sm:px-6 mb-6 flex items-start justify-between">
        <Link href="/creative/darkroom" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mt-2">
          <ChevronLeft className="w-4 h-4" /> CREATIVE
        </Link>
        <div className="flex flex-col items-center gap-1">
          <HummingbirdIcon size={48} color="#c084fc" />
          <h1 className="text-[11px] font-mono tracking-[0.4em] text-zinc-400">HUMMING BIRD</h1>
        </div>
        <button onClick={popOut} title="Detach to popup window"
          className="mt-2 flex items-center gap-1 px-2 py-1 rounded border border-purple-500/30 text-[10px] font-mono tracking-widest text-purple-300 hover:bg-purple-500/10">
          <ExternalLink className="w-3 h-3" /> POP OUT
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-2xl">
            <PabloWinampPlayer size="full" />
          </div>
          {importMsg && (
            <div className={`mt-3 w-full max-w-2xl px-3 py-2 text-[10px] font-mono rounded border ${
              importing
                ? "text-purple-200 border-purple-500/40 bg-purple-500/10"
                : "text-zinc-300 border-zinc-700 bg-zinc-900/60"
            }`}>
              {importMsg}
            </div>
          )}
          <p className="mt-4 text-[10px] font-mono text-zinc-600 tracking-wider text-center max-w-md">
            PERSONAL SOUNDTRACK · KEEPS PLAYING WHEN YOU LEAVE THIS TAB · 50 TRACKS / 500 MB CAP · PHONE TAKES PRIORITY
          </p>
        </div>

        <aside className="space-y-4">
          {/* Audio URL CONVERTER — paste a YouTube / SoundCloud / Bandcamp URL,
              we pull the audio server-side via yt-dlp, transcode to MP3, and
              drop it straight into Hummingbird. Spotify / Apple Music are
              DRM-encrypted and will return a clear error. */}
          <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/5 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-fuchsia-300 mb-2 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> URL → MP3 CONVERTER
            </h2>
            <form onSubmit={submitConvert} className="flex gap-1.5 mb-2">
              <input
                type="url"
                value={convertUrl}
                onChange={e => setConvertUrl(e.target.value)}
                placeholder="paste YouTube / SoundCloud / Bandcamp URL"
                disabled={converting}
                className="flex-1 min-w-0 bg-black/60 border border-fuchsia-500/30 rounded px-2 py-1.5 text-[11px] font-mono text-fuchsia-100 placeholder:text-fuchsia-400/30 outline-none focus:border-fuchsia-400"
              />
              <button
                type="submit"
                disabled={!convertUrl.trim() || converting}
                className="px-2.5 py-1.5 rounded border border-fuchsia-400 bg-fuchsia-500/20 hover:bg-fuchsia-500/30 disabled:opacity-40 text-[10px] font-mono tracking-widest text-fuchsia-200"
              >
                {converting ? <Loader2 className="w-3 h-3 animate-spin" /> : "PULL"}
              </button>
            </form>
            {convertMsg && (
              <div className={`text-[10px] font-mono leading-snug ${converting ? "text-fuchsia-300" : "text-zinc-300"}`}>
                {convertMsg}
              </div>
            )}
            <p className="text-[9px] font-mono text-zinc-500 mt-1.5 leading-relaxed">
              Saves to Hummingbird. 20 min max · 80 MB cap. <span className="text-amber-300/80">Spotify / Apple Music can't be extracted (DRM).</span>
            </p>
          </div>

          {/* Load from Media Library — pulls any audio file that's already in
              the user's media library / vault and registers it as a track. */}
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-emerald-300 mb-2 flex items-center gap-1.5">
              <FolderOpen className="w-3 h-3" /> MEDIA LIBRARY
            </h2>
            {!libOpen ? (
              <button
                onClick={openLibrary}
                className="w-full px-2.5 py-2 rounded border border-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] font-mono tracking-widest text-emerald-200"
              >
                LOAD FROM LIBRARY
              </button>
            ) : (
              <div>
                {libLoading && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-300">
                    <Loader2 className="w-3 h-3 animate-spin" /> reading vault…
                  </div>
                )}
                {libErr && <div className="text-[10px] font-mono text-red-300 mb-2">{libErr}</div>}
                {!libLoading && libFiles.length === 0 && !libErr && (
                  <div className="text-[10px] font-mono text-zinc-400 leading-snug">
                    No audio in your library yet. Upload audio in <Link href="/creative/media" className="text-emerald-300 underline">MEDIA</Link> first.
                  </div>
                )}
                {libFiles.length > 0 && (
                  <ul className="space-y-1 max-h-60 overflow-auto">
                    {libFiles.map(f => (
                      <li key={f.id}>
                        <button
                          onClick={() => importFromLibrary(f)}
                          disabled={libImporting === f.id}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-emerald-700/40 bg-black/30 hover:bg-emerald-500/10 text-left disabled:opacity-50"
                        >
                          {libImporting === f.id ? <Loader2 className="w-3 h-3 animate-spin text-emerald-300 shrink-0" /> : <Music2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                          <span className="flex-1 min-w-0 truncate text-[10px] font-mono text-emerald-100">{f.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setLibOpen(false)}
                  className="mt-2 text-[9px] font-mono tracking-widest text-zinc-500 hover:text-zinc-300"
                >
                  ← CLOSE
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-purple-300 mb-2 flex items-center gap-1.5">
              <HummingbirdIcon size={12} color="#c084fc" /> DRAG &amp; DROP ANYTHING
            </h2>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Drop audio files from your desktop, or drag an audio link / element straight from another browser tab onto this page. We pull it server-side, validate it, and add it to your playlist.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-fuchsia-300 mb-2">FORMAT CONVERTER</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Drop a file, then hit <span className="text-fuchsia-300">→ MP3</span> on the staged item. WAV, FLAC, M4A, OGG, OPUS — decoded and re-encoded in your browser at 192 kbps stereo. <span className="text-emerald-300">SAVE</span> lands it in Hummingbird <span className="text-emerald-300">and</span> your <Link href="/creative/media" className="text-emerald-300 underline">MEDIA</Link> library.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-cyan-300 mb-2">PHONE PRIORITY</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              When the phone rings or a call is live, music auto-pauses so the line is clean. Resume manually when you're done.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-emerald-300 mb-2">USE ANYWHERE</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Saved tracks load as backing tracks in <span className="text-emerald-300">1999</span>, or as the soundtrack when exporting MP4 from <span className="text-emerald-300">DARKROOM</span> / <span className="text-emerald-300">DESIGN STUDIO</span>.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-amber-300 mb-2">FORMATS</h2>
            <ul className="text-[11px] text-zinc-400 space-y-1 leading-relaxed">
              <li>✓ MP3 / M4A / AAC / OGG / WAV / FLAC / OPUS — play &amp; convert</li>
              <li>✓ MP4 audio — play &amp; convert</li>
              <li>⚠ AIFF — saves but cannot be browser-converted</li>
            </ul>
          </div>
          {/* Central audio hub — master/score/sfx/voice/radio + mute. Placed at
              the bottom so the URL converter stays at the top of the sidebar. */}
          <AudioSettingsPanel />
        </aside>
      </div>
    </div>
  );
}

```

---

## `artifacts/api-server/src/routes/music.ts`

```tsx
import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { eq, and, asc, sql } from "drizzle-orm";
import { db, musicTracksTable, filesFoldersTable, type MusicTrack } from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();

const MAX_TRACKS_PER_USER = 50;
const MAX_TOTAL_BYTES_PER_USER = 2 * 1024 * 1024 * 1024; // 2 GB cap per user

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

// GET /api/music/tracks — list this user's tracks
router.get("/music/tracks", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const rows = await db
      .select()
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId))
      .orderBy(asc(musicTracksTable.position), asc(musicTracksTable.id));
    res.json({ tracks: rows });
  } catch (e) {
    console.error("[music] list error", e);
    res.status(500).json({ error: "Failed to list tracks" });
  }
});

// POST /api/music/tracks — record metadata after the file has been PUT to GCS
router.post("/music/tracks", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const {
      title, artist, album, mimeType, sizeBytes, durationSec, objectPath, source,
    } = req.body ?? {};

    if (!objectPath || typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "objectPath required (from upload response)" });
      return;
    }
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title required" });
      return;
    }
    if (!mimeType || typeof mimeType !== "string") {
      res.status(400).json({ error: "mimeType required" });
      return;
    }

    // Enforce per-user limits
    const [counts] = await db
      .select({
        n: sql<number>`COUNT(*)::int`,
        bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
      })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId));

    if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
      res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` });
      return;
    }
    const incomingBytes = Number(sizeBytes) || 0;
    if ((counts?.bytes ?? 0) + incomingBytes > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }

    const normalizedPath = storage.normalizeObjectEntityPath(objectPath);
    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title: String(title).slice(0, 256),
        artist: String(artist || "Unknown Artist").slice(0, 256),
        album: album ? String(album).slice(0, 256) : null,
        mimeType: String(mimeType).slice(0, 128),
        sizeBytes: incomingBytes,
        durationSec: Math.max(0, Math.floor(Number(durationSec) || 0)),
        objectPath: normalizedPath,
        source: ["upload", "spotify", "apple"].includes(String(source)) ? String(source) : "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e) {
    console.error("[music] create error", e);
    res.status(500).json({ error: "Failed to save track" });
  }
});

// MusicBrainz / Cover Art Archive auto-tagging (the beets idea, rebuilt native).
// MusicBrainz asks for a descriptive User-Agent and ~1 req/sec; a single
// user-triggered tag is well within that. No API key required.
const MB_UA = "SALARYMAN-Hummingbird/1.0 ( https://salaryman.replit.app )";

function mbEscape(s: string): string {
  // Lucene special chars + quotes — strip to keep the query well-formed.
  return s.replace(/["\\+\-!(){}\[\]^~*?:/]/g, " ").replace(/\s+/g, " ").trim();
}

async function coverArtUrl(releaseMbid: string): Promise<string | null> {
  // Cover Art Archive 302-redirects to the actual image; a 404 means no art.
  // Bounded timeout so a stalled upstream can't pin the request open.
  try {
    const r = await fetch(`https://coverartarchive.org/release/${releaseMbid}/front-500`, {
      method: "GET", redirect: "follow", headers: { "User-Agent": MB_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) return `https://coverartarchive.org/release/${releaseMbid}/front-500`;
  } catch { /* timeout / network — treat as no art */ }
  return null;
}

// POST /api/music/tracks/:id/autotag — enrich one track's artist/album/year/art
// from MusicBrainz, matching on its current title (+ artist when known).
router.post("/music/tracks/:id/autotag", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }

    const [track] = await db
      .select()
      .from(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)));
    if (!track) { res.status(404).json({ error: "not found" }); return; }

    const titleQ = mbEscape(track.title);
    if (!titleQ) { res.status(422).json({ error: "Track has no usable title to match." }); return; }
    const artistQ = track.artist && track.artist !== "Unknown Artist" ? mbEscape(track.artist) : "";
    const query = artistQ
      ? `recording:"${titleQ}" AND artist:"${artistQ}"`
      : `recording:"${titleQ}"`;

    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    let mb: any;
    try {
      const mbRes = await fetch(url, {
        headers: { "User-Agent": MB_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!mbRes.ok) { res.status(502).json({ error: "MusicBrainz lookup failed." }); return; }
      mb = await mbRes.json();
    } catch {
      res.status(504).json({ error: "MusicBrainz timed out — try again." });
      return;
    }

    const rec = Array.isArray(mb?.recordings) ? mb.recordings[0] : null;
    if (!rec) { res.status(404).json({ error: "No match found in MusicBrainz." }); return; }

    const matchedArtist: string | undefined = Array.isArray(rec["artist-credit"]) && rec["artist-credit"][0]?.name
      ? String(rec["artist-credit"][0].name)
      : undefined;
    const matchedTitle: string | undefined = rec.title ? String(rec.title) : undefined;
    const release = Array.isArray(rec.releases) ? rec.releases[0] : null;
    const matchedAlbum: string | undefined = release?.title ? String(release.title) : undefined;
    const releaseMbid: string | undefined = release?.id ? String(release.id) : undefined;
    const dateStr: string | undefined = release?.date || rec["first-release-date"];
    const yearMatch = dateStr ? /^(\d{4})/.exec(String(dateStr)) : null;
    const matchedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

    const artworkUrl = releaseMbid ? await coverArtUrl(releaseMbid) : null;

    const [updated] = await db
      .update(musicTracksTable)
      .set({
        title: (matchedTitle || track.title).slice(0, 256),
        artist: (matchedArtist || track.artist).slice(0, 256),
        album: matchedAlbum ? matchedAlbum.slice(0, 256) : track.album,
        year: matchedYear ?? track.year,
        artworkUrl: artworkUrl ?? track.artworkUrl,
      })
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)))
      .returning();

    res.json({
      track: updated,
      matched: {
        score: typeof rec.score === "number" ? rec.score : null,
        artist: matchedArtist ?? null,
        title: matchedTitle ?? null,
        album: matchedAlbum ?? null,
        year: matchedYear,
        hasArtwork: !!artworkUrl,
      },
    });
  } catch (e) {
    console.error("[music] autotag error", e);
    res.status(500).json({ error: "Failed to auto-tag track" });
  }
});

// DELETE /api/music/tracks/:id
router.delete("/music/tracks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "bad id" }); return; }
    const [row] = await db
      .delete(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "not found" }); return; }
    res.json({ ok: true });
  } catch (e) {
    console.error("[music] delete error", e);
    res.status(500).json({ error: "Failed to delete track" });
  }
});

// GET /api/music/stream/:id — proxy stream from object storage with auth + range support
router.get("/music/stream/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) { res.status(400).end(); return; }

    const [row] = await db
      .select()
      .from(musicTracksTable)
      .where(and(eq(musicTracksTable.id, id), eq(musicTracksTable.userId, userId)));
    if (!row) { res.status(404).json({ error: "not found" }); return; }

    const file = await storage.getObjectEntityFile(row.objectPath);
    const range = req.headers.range;

    if (range) {
      const [meta] = await file.getMetadata();
      const total = Number(meta.size) || 0;
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(end - start + 1));
      res.setHeader("Content-Type", row.mimeType || "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      file.createReadStream({ start, end }).pipe(res);
      return;
    }

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", row.mimeType || "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    file.createReadStream().pipe(res);
  } catch (e) {
    if (e instanceof ObjectNotFoundError) { res.status(404).end(); return; }
    console.error("[music] stream error", e);
    res.status(500).end();
  }
});

// POST /api/music/import-url — fetch a remote audio URL server-side, upload to
// object storage, and create a track row. This is what backs cross-site
// drag-drop on the Hummingbird player: when a user drags an audio link or
// <audio> element from another website, the browser hands us a URL string —
// the page POSTs it here, we proxy the fetch (CORS-safe), validate that the
// payload is actually audio, and persist it. We hard-cap downloads to 50 MB
// per request and reject anything that doesn't smell like audio.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
router.post("/music/import-url", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    const url = String(req.body?.url || "").trim();
    const titleHint = String(req.body?.title || "").trim();
    if (!url) { res.status(400).json({ error: "url required" }); return; }
    let parsed: URL;
    try { parsed = new URL(url); } catch { res.status(400).json({ error: "invalid url" }); return; }
    if (!/^https?:$/.test(parsed.protocol)) { res.status(400).json({ error: "only http(s) urls allowed" }); return; }
    // SSRF guard: resolve hostname and reject loopback / private / link-local
    // ranges across IPv4 + IPv6. We then disable redirect-following on the
    // fetch itself so an attacker cannot bounce us into the metadata service.
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
      res.status(400).json({ error: "host not allowed" }); return;
    }
    const { lookup } = await import("node:dns/promises");
    const isPrivateIp = (ip: string): boolean => {
      const v = ip.toLowerCase();
      if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
      // IPv4-mapped IPv6 like ::ffff:127.0.0.1 — strip prefix
      const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
      const m = mapped.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return false;
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      return false;
    };
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.some(a => isPrivateIp(a.address))) {
        res.status(400).json({ error: "host resolves to a private network" }); return;
      }
    } catch {
      res.status(400).json({ error: "host could not be resolved" }); return;
    }

    // Per-user limit check (mirror /music/tracks)
    const [counts] = await db
      .select({
        n: sql<number>`COUNT(*)::int`,
        bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
      })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId));
    if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
      res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` }); return;
    }

    const upstream = await fetch(url, {
      // 'manual' so a 3xx redirect to an internal IP cannot bypass the DNS
      // pre-check above. Anything other than a 2xx is treated as failure.
      redirect: "manual",
      headers: { "User-Agent": "Salaryman-Hummingbird/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `upstream ${upstream.status}` }); return;
    }
    const ct = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    // Accept audio/* and video/mp4 (audio extracted by browser); reject html/text.
    const looksAudio = ct.startsWith("audio/") || ct === "video/mp4" || ct === "application/ogg";
    if (!looksAudio) {
      res.status(415).json({ error: `not audio (content-type: ${ct || "unknown"})` }); return;
    }
    const claimedLen = Number(upstream.headers.get("content-length") || 0);
    if (claimedLen > MAX_IMPORT_BYTES) {
      res.status(413).json({ error: "file too large (50 MB max)" }); return;
    }

    // Buffer with hard size cap.
    const reader = (upstream.body as any as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_IMPORT_BYTES) {
        try { await reader.cancel(); } catch {}
        res.status(413).json({ error: "file too large (50 MB max)" }); return;
      }
      chunks.push(value);
    }
    if ((counts?.bytes ?? 0) + total > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." }); return;
    }
    const buf = Buffer.concat(chunks.map(c => Buffer.from(c)));

    // Push to object storage via presigned URL (mirrors the client upload flow).
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    const put = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": ct },
      body: buf,
    });
    if (!put.ok) { res.status(502).json({ error: "upload to storage failed" }); return; }

    // Derive a sensible title from URL or hint.
    const fileGuess = decodeURIComponent(parsed.pathname.split("/").pop() || "Imported Track").replace(/\.[^.]+$/, "");
    const title = (titleHint || fileGuess || "Imported Track").slice(0, 256);
    const artist = parsed.hostname.replace(/^www\./, "").slice(0, 256);

    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist,
        album: null,
        mimeType: ct,
        sizeBytes: total,
        durationSec: 0, // unknown until client probes; OK to leave 0
        objectPath,
        source: "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e: any) {
    console.error("[music] import-url error", e);
    res.status(500).json({ error: e?.message || "import failed" });
  }
});

// POST /api/music/convert-stream-url — pull audio from a streaming-site URL
// (YouTube, SoundCloud, Bandcamp, Vimeo, etc.) using yt-dlp, transcode to
// MP3 via ffmpeg, store in object storage, and create a music_tracks row.
//
// LIMITATION: Spotify and Apple Music are DRM-protected — yt-dlp can read the
// metadata page but the actual audio stream is encrypted. We detect those
// hosts up-front and return a clear error rather than failing mysteriously
// later in the pipeline.
const STREAM_MAX_BYTES = 80 * 1024 * 1024; // 80 MB, slightly larger than direct import
const STREAM_DURATION_CAP_SEC = 60 * 20;   // 20 min hard cap per track
const DRM_HOSTS = /(^|\.)(open\.spotify\.com|spotify\.com|music\.apple\.com|tidal\.com|deezer\.com)$/i;

router.post("/music/convert-stream-url", requireAuth, async (req: Request, res: Response) => {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, readFile, rm, readdir, stat } = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");

  const userId = String(req.user!.id);
  const url = String(req.body?.url || "").trim();
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).json({ error: "invalid url" }); return; }
  if (!/^https?:$/.test(parsed.protocol)) { res.status(400).json({ error: "only http(s) urls allowed" }); return; }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    res.status(400).json({ error: "host not allowed" }); return;
  }
  // SSRF defence: resolve all A/AAAA for the requested host and reject if any
  // resolve to loopback / link-local / private / CGNAT ranges. yt-dlp will
  // perform additional fetches (extractor pages, redirects, segment URLs)
  // that we cannot directly intercept — but the entry-point host being a
  // public address closes the most common abuse vector. We deliberately
  // reject hosts with mixed public/private resolutions to avoid DNS rebind.
  {
    const { lookup } = await import("node:dns/promises");
    const isPrivateIp = (ip: string): boolean => {
      const v = ip.toLowerCase();
      if (v === "::1" || v === "::" || v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
      const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
      const m = mapped.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return false;
      const [a, b] = [Number(m[1]), Number(m[2])];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      return false;
    };
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.some(a => isPrivateIp(a.address))) {
        res.status(400).json({ error: "host resolves to a private network" }); return;
      }
    } catch {
      res.status(400).json({ error: "host could not be resolved" }); return;
    }
  }

  if (DRM_HOSTS.test(host)) {
    res.status(415).json({
      error:
        "Spotify, Apple Music, Tidal, and Deezer streams are DRM-encrypted — we can't legally extract their audio. Use a YouTube, SoundCloud, Bandcamp, or direct file URL instead. (Tip: many tracks are also on YouTube.)",
      drm: true,
    });
    return;
  }

  // Per-user playlist limit before spending CPU on a download.
  const [counts] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
    })
    .from(musicTracksTable)
    .where(eq(musicTracksTable.userId, userId));
  if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
    res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` });
    return;
  }

  let workDir: string | null = null;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), "humbird-"));

    // Probe metadata first to enforce duration cap before downloading the
    // whole file. yt-dlp -j prints one JSON line.
    const meta = await new Promise<any>((resolve, reject) => {
      const proc = spawn("yt-dlp", ["-j", "--no-playlist", "--no-warnings", "--socket-timeout", "15", url], { timeout: 30_000 });
      let stdout = ""; let stderr = "";
      proc.stdout.on("data", (b) => { stdout += b.toString(); });
      proc.stderr.on("data", (b) => { stderr += b.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) return reject(new Error(stderr.trim().split("\n").pop() || `yt-dlp metadata exit ${code}`));
        try { resolve(JSON.parse(stdout.trim().split("\n").pop() || "{}")); } catch (e) { reject(e); }
      });
    }).catch((e) => { throw new Error(`Couldn't read that URL: ${e.message || e}`); });

    const duration = Number(meta?.duration) || 0;
    if (duration > STREAM_DURATION_CAP_SEC) {
      res.status(413).json({ error: `Track is ${Math.round(duration / 60)} min — 20 min max for the converter.` });
      return;
    }
    const title = String(meta?.title || meta?.fulltitle || "Imported Track").slice(0, 256);
    const artist = String(meta?.uploader || meta?.channel || meta?.creator || parsed.hostname.replace(/^www\./, "")).slice(0, 256);
    const sourceTag = host.includes("youtube") || host.includes("youtu.be") ? "youtube"
      : host.includes("soundcloud") ? "soundcloud"
      : host.includes("bandcamp") ? "bandcamp"
      : "stream";

    // Now actually download + transcode to mp3 (192k stereo) into workDir.
    const outTpl = path.join(workDir, "out.%(ext)s");
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-x", "--audio-format", "mp3", "--audio-quality", "192K",
        "--no-playlist", "--no-warnings",
        "--socket-timeout", "20",
        "--max-filesize", String(STREAM_MAX_BYTES),
        "-o", outTpl,
        url,
      ];
      const proc = spawn("yt-dlp", args, { timeout: 180_000 });
      let stderr = "";
      proc.stderr.on("data", (b) => { stderr += b.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim().split("\n").pop() || `yt-dlp exit ${code}`));
      });
    });

    // Find the produced mp3.
    const files = await readdir(workDir);
    const mp3 = files.find((f) => f.toLowerCase().endsWith(".mp3"));
    if (!mp3) throw new Error("Conversion produced no audio file.");
    const mp3Path = path.join(workDir, mp3);
    const st = await stat(mp3Path);
    if (st.size > STREAM_MAX_BYTES) {
      res.status(413).json({ error: "Converted file too large (80 MB max)." });
      return;
    }
    if ((counts?.bytes ?? 0) + st.size > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }
    const buf = await readFile(mp3Path);

    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    const put = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: buf,
    });
    if (!put.ok) throw new Error("Upload to storage failed.");

    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist,
        album: null,
        mimeType: "audio/mpeg",
        sizeBytes: st.size,
        durationSec: Math.max(0, Math.floor(duration)),
        objectPath,
        source: sourceTag === "youtube" || sourceTag === "soundcloud" || sourceTag === "bandcamp" ? "upload" : "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row, source: sourceTag });
  } catch (e: any) {
    const msg = String(e?.message || e || "conversion failed");
    // Surface a friendlier error for common yt-dlp failures.
    let userMsg = msg;
    if (/Sign in to confirm|age|consent|cookies/i.test(msg)) userMsg = "That video requires sign-in / age verification. We can't extract it.";
    else if (/Private video|members.only|geo|country/i.test(msg)) userMsg = "Video is private, members-only, or geo-blocked.";
    else if (/Unsupported URL/i.test(msg)) userMsg = "We don't recognise that streaming site. Try YouTube, SoundCloud, or Bandcamp.";
    else if (/HTTP Error 404/i.test(msg)) userMsg = "Track not found at that URL.";
    console.error("[music] convert-stream-url error", msg);
    res.status(502).json({ error: userMsg });
  } finally {
    if (workDir) {
      try { await rm(workDir, { recursive: true, force: true }); } catch {}
    }
  }
});

// POST /api/music/import-from-library — given a media-library file id from
// /api/tools/documents/files, copy/register it as a Hummingbird track.
// We don't re-upload — both surfaces share the same object-storage backend,
// so we just point a new music_tracks row at the existing object path.
router.post("/music/import-from-library", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = String(req.user!.id);
    // SECURITY: We accept either a fileId (preferred — server resolves the
    // object path itself) OR an objectPath (legacy). When objectPath is
    // supplied we MUST verify the caller actually owns a files_folders row
    // pointing at that path; otherwise a user could enumerate other users'
    // GCS objects by guessing /objects/<uuid>.
    const fileId = req.body?.fileId !== undefined ? Number(req.body.fileId) : null;
    let objectPath = String(req.body?.objectPath || "").trim();
    let title = String(req.body?.title || "Library Track").slice(0, 256);
    let mimeType = String(req.body?.mimeType || "audio/mpeg").slice(0, 128);
    let sizeBytes = Math.max(0, Math.floor(Number(req.body?.sizeBytes) || 0));

    if (fileId !== null && Number.isFinite(fileId)) {
      const [owned] = await db
        .select()
        .from(filesFoldersTable)
        .where(and(eq(filesFoldersTable.id, fileId), eq(filesFoldersTable.userId, userId as any)));
      if (!owned || owned.isFolder) {
        res.status(404).json({ error: "Library file not found in your vault." });
        return;
      }
      objectPath = String(owned.objectPath || "");
      title = (owned.name || title).replace(/\.[^.]+$/, "").slice(0, 256);
      mimeType = (owned.mimeType || mimeType) as string;
      sizeBytes = Number(owned.fileSize || sizeBytes) || 0;
    } else {
      if (!objectPath || !objectPath.startsWith("/objects/")) {
        res.status(400).json({ error: "fileId or objectPath required" });
        return;
      }
      // Ownership check: at least one files_folders row owned by this user
      // must reference this objectPath. Otherwise reject — even if the
      // GCS object exists, the caller has no business loading it.
      const normalized = storage.normalizeObjectEntityPath(objectPath);
      const [owned] = await db
        .select({ id: filesFoldersTable.id, mimeType: filesFoldersTable.mimeType, fileSize: filesFoldersTable.fileSize, name: filesFoldersTable.name })
        .from(filesFoldersTable)
        .where(and(
          eq(filesFoldersTable.userId, userId as any),
          eq(filesFoldersTable.objectPath, normalized),
        ));
      if (!owned) {
        res.status(403).json({ error: "You don't own that library file." });
        return;
      }
      mimeType = (owned.mimeType || mimeType) as string;
      sizeBytes = Number(owned.fileSize || sizeBytes) || 0;
      if (!title || title === "Library Track") title = String(owned.name || title).replace(/\.[^.]+$/, "").slice(0, 256);
    }

    if (!objectPath || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "library file has no usable object path" });
      return;
    }
    if (!mimeType.startsWith("audio/") && mimeType !== "video/mp4" && mimeType !== "application/ogg") {
      res.status(415).json({ error: `Library file isn't audio (${mimeType}).` });
      return;
    }

    const [counts] = await db
      .select({
        n: sql<number>`COUNT(*)::int`,
        bytes: sql<number>`COALESCE(SUM(${musicTracksTable.sizeBytes}),0)::int`,
      })
      .from(musicTracksTable)
      .where(eq(musicTracksTable.userId, userId));
    if ((counts?.n ?? 0) >= MAX_TRACKS_PER_USER) {
      res.status(413).json({ error: `Playlist limit reached (${MAX_TRACKS_PER_USER} tracks).` });
      return;
    }
    if ((counts?.bytes ?? 0) + sizeBytes > MAX_TOTAL_BYTES_PER_USER) {
      res.status(413).json({ error: "Personal music storage cap reached (500 MB)." });
      return;
    }

    // Verify the object actually exists & is reachable before recording it.
    try {
      await storage.getObjectEntityFile(objectPath);
    } catch {
      res.status(404).json({ error: "That library file is no longer available." });
      return;
    }

    const normalizedPath = storage.normalizeObjectEntityPath(objectPath);
    const [row] = await db
      .insert(musicTracksTable)
      .values({
        userId,
        title,
        artist: "Media Library",
        album: null,
        mimeType,
        sizeBytes,
        durationSec: 0,
        objectPath: normalizedPath,
        source: "upload",
        position: (counts?.n ?? 0),
      })
      .returning();

    res.json({ track: row });
  } catch (e: any) {
    console.error("[music] import-from-library error", e);
    res.status(500).json({ error: e?.message || "import failed" });
  }
});

// GET /api/music/connect-status — reports whether Spotify/Apple Music are configured
router.get("/music/connect-status", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    spotify: {
      configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      message: "Spotify Web Playback SDK requires Premium account + OAuth credentials.",
    },
    apple: {
      configured: Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN),
      message: "Apple Music requires an Apple Developer MusicKit token.",
    },
  });
});

export default router;

```

---

## `lib/db/src/schema/music-tracks.ts`

```tsx
import { pgTable, serial, text, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const musicTracksTable = pgTable("music_tracks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  artist: varchar("artist", { length: 256 }).notNull().default("Unknown Artist"),
  album: varchar("album", { length: 256 }),
  year: integer("year"),
  artworkUrl: text("artwork_url"),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  durationSec: integer("duration_sec").notNull().default(0),
  objectPath: text("object_path").notNull(),
  source: varchar("source", { length: 32 }).notNull().default("upload"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("music_tracks_user_idx").on(t.userId, t.position),
}));

export const insertMusicTrackSchema = createInsertSchema(musicTracksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMusicTrack = z.infer<typeof insertMusicTrackSchema>;
export type MusicTrack = typeof musicTracksTable.$inferSelect;

```
