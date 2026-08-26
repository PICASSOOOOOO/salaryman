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
