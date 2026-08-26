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
