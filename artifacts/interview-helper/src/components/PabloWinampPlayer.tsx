import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import { Play, Pause, SkipBack, SkipForward, Square, Volume2, Trash2, Upload, Music2, X } from "lucide-react";

type Track = {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  objectPath: string;
  source: "upload" | "spotify" | "apple";
};

type ConnectStatus = {
  spotify: { configured: boolean; message: string };
  apple: { configured: boolean; message: string };
};

const ACCEPTED =
  ".mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.mp4,.aiff,.aif,audio/*";

const NATIVE_PLAYABLE = /^audio\/(mpeg|mp3|mp4|aac|ogg|webm|wav|x-wav|flac|x-flac|opus)|^video\/mp4/i;

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

// Tiny CSS-only equalizer bars — no Web Audio analyser dependency
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

export function PabloWinampPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [showConnect, setShowConnect] = useState<null | "spotify" | "apple">(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const current = tracks[currentIdx];

  const refresh = useCallback(async () => {
    try {
      const r = await apiFetch("/api/music/tracks");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("non-JSON");
      const j = await r.json();
      setTracks(Array.isArray(j?.tracks) ? j.tracks : []);
    } catch (e) {
      // Silent — empty list is OK
      setTracks([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    apiFetch("/api/music/connect-status")
      .then(r => r.ok ? r.json() : null)
      .then(j => j && setConnect(j))
      .catch(() => {});
  }, [refresh]);

  // Audio events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onDur = () => setDur(a.duration || 0);
    const onEnd = () => playNext();
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      setErr(current ? `Browser cannot play ${current.mimeType || "this file"}.` : null);
      setPlaying(false);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onError);
    a.volume = vol;
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  const playIdx = useCallback((i: number) => {
    if (i < 0 || i >= tracks.length) return;
    setCurrentIdx(i);
    setErr(null);
    setTimeout(() => { audioRef.current?.play().catch(() => {}); }, 50);
  }, [tracks.length]);

  const playPause = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [current]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPos(0);
  }, []);

  const playNext = useCallback(() => {
    if (!tracks.length) return;
    const next = (currentIdx + 1) % tracks.length;
    playIdx(next);
  }, [tracks.length, currentIdx, playIdx]);

  const playPrev = useCallback(() => {
    if (!tracks.length) return;
    const prev = (currentIdx - 1 + tracks.length) % tracks.length;
    playIdx(prev);
  }, [tracks.length, currentIdx, playIdx]);

  const seek = (frac: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(dur, dur * frac));
  };

  const probeDuration = (file: File): Promise<number> => new Promise((res) => {
    try {
      const a = document.createElement("audio");
      a.preload = "metadata";
      const url = URL.createObjectURL(file);
      a.src = url;
      a.onloadedmetadata = () => {
        const d = isFinite(a.duration) ? a.duration : 0;
        URL.revokeObjectURL(url);
        res(Math.floor(d));
      };
      a.onerror = () => { URL.revokeObjectURL(url); res(0); };
    } catch { res(0); }
  });

  const onUpload = async (filesIn: FileList | null) => {
    if (!filesIn || filesIn.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const file of Array.from(filesIn)) {
        // 1) Get presigned URL
        const sigRes = await apiFetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type || "application/octet-stream",
          }),
        });
        if (!sigRes.ok) throw new Error("Could not get upload URL");
        const sig = await sigRes.json();

        // 2) PUT direct to GCS
        const put = await fetch(sig.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed");

        // 3) Probe duration locally before saving metadata
        const durationSec = await probeDuration(file);

        // 4) Derive title/artist from filename
        const base = file.name.replace(/\.[^.]+$/, "");
        let title = base;
        let artist = "Unknown Artist";
        const dash = base.split(/\s+-\s+/);
        if (dash.length >= 2) { artist = dash[0].trim(); title = dash.slice(1).join(" - ").trim(); }

        // 5) Persist metadata
        const save = await apiFetch("/api/music/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, artist,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            durationSec,
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeTrack = async (id: number) => {
    try {
      await apiFetch(`/api/music/tracks/${id}`, { method: "DELETE" });
      await refresh();
    } catch {}
  };

  const streamUrl = current ? `/api/music/stream/${current.id}` : "";
  const progressFrac = dur > 0 ? pos / dur : 0;

  // Detect native playability — for unsupported formats we still try, but warn
  const playable = useMemo(() => !current || NATIVE_PLAYABLE.test(current.mimeType || ""), [current]);

  return (
    <div
      className="font-mono text-[11px] select-none"
      style={{
        width: "100%",
        maxWidth: 360,
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
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-2 py-[3px]"
        style={{
          background: "linear-gradient(180deg,#5a5a6e 0%,#22222c 100%)",
          borderBottom: "1px solid #000",
          color: "#cfcfff",
        }}
      >
        <div className="flex items-center gap-1.5">
          <Music2 className="w-3 h-3 text-purple-300" />
          <span className="text-[10px] tracking-[0.25em] font-bold">PABLO · WINAMP</span>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-[9px] tracking-widest text-zinc-300 hover:text-white px-1"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "[+]" : "[—]"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* LCD readout */}
          <div
            className="px-2 py-2"
            style={{
              background: "#000",
              borderBottom: "1px solid #000",
              boxShadow: "inset 0 0 0 1px #1c1c24",
            }}
          >
            <div className="flex items-center gap-2">
              <EqBars playing={playing} />
              <div
                className="flex-1 overflow-hidden whitespace-nowrap"
                style={{ color: "#39ff14", textShadow: "0 0 4px rgba(57,255,20,0.6)" }}
              >
                <span className="inline-block" style={{
                  animation: current ? "winamp-marquee 14s linear infinite" : "none",
                  paddingLeft: current ? "100%" : 0,
                }}>
                  {current ? `${current.artist} — ${current.title}` : "NO MEDIA — DROP FILES OR UPLOAD"}
                </span>
                <style>{`@keyframes winamp-marquee { from{transform:translateX(0)} to{transform:translateX(-100%)} }`}</style>
              </div>
              <span style={{ color: "#39ff14", textShadow: "0 0 4px rgba(57,255,20,0.6)" }}>
                {fmtTime(pos)}
              </span>
            </div>
            {!playable && current && (
              <div className="text-[9px] text-amber-400 mt-1">
                ⚠ {current.mimeType} may not play in this browser. Try MP3/M4A/WAV.
              </div>
            )}
          </div>

          {/* Seek bar */}
          <div
            className="px-2 py-1"
            style={{ background: "#1c1c24", borderBottom: "1px solid #000" }}
          >
            <div
              className="relative h-2 cursor-pointer"
              style={{
                background: "linear-gradient(180deg,#0a0a0e,#222)",
                border: "1px solid #000",
                boxShadow: "inset 0 0 0 1px #2a2a36",
              }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - r.left) / r.width);
              }}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${progressFrac * 100}%`,
                  background: "linear-gradient(180deg,#a78bfa,#7c3aed)",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-0.5">
              <span>{fmtTime(pos)}</span>
              <span>{fmtTime(dur)}</span>
            </div>
          </div>

          {/* Transport */}
          <div
            className="flex items-center gap-1 px-2 py-1.5"
            style={{ background: "linear-gradient(180deg,#3a3a4a,#222230)", borderBottom: "1px solid #000" }}
          >
            <TransportBtn onClick={playPrev} label="Previous"><SkipBack className="w-3 h-3" /></TransportBtn>
            <TransportBtn onClick={playPause} label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </TransportBtn>
            <TransportBtn onClick={stop} label="Stop"><Square className="w-3 h-3" /></TransportBtn>
            <TransportBtn onClick={playNext} label="Next"><SkipForward className="w-3 h-3" /></TransportBtn>
            <div className="flex-1" />
            <Volume2 className="w-3 h-3 text-zinc-400" />
            <input
              type="range" min={0} max={1} step={0.01}
              value={vol}
              onChange={(e) => setVol(parseFloat(e.target.value))}
              style={{ width: 70, accentColor: "#a78bfa" }}
              aria-label="Volume"
            />
          </div>

          {/* Playlist */}
          <div
            className="px-2 py-1.5"
            style={{ background: "#0e0e14", maxHeight: 180, overflowY: "auto" }}
          >
            {tracks.length === 0 ? (
              <div className="text-zinc-500 text-[10px] py-2 text-center">
                Empty playlist. Upload audio to begin.
              </div>
            ) : (
              <ol className="space-y-[2px]">
                {tracks.map((t, i) => (
                  <li
                    key={t.id}
                    className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded-sm cursor-pointer ${
                      i === currentIdx ? "bg-purple-900/50 text-purple-100" : "hover:bg-zinc-800/60 text-zinc-300"
                    }`}
                    onClick={() => playIdx(i)}
                    data-testid={`winamp-track-${t.id}`}
                  >
                    <span className="text-[9px] text-zinc-500 w-5 shrink-0">{(i + 1).toString().padStart(2, "0")}.</span>
                    <span className="flex-1 truncate">
                      <span className="text-zinc-400">{t.artist}</span>
                      <span className="mx-1 text-zinc-600">—</span>
                      <span>{t.title}</span>
                    </span>
                    <span className="text-[9px] text-zinc-600 shrink-0">{fmtTime(t.durationSec)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }}
                      className="text-zinc-600 hover:text-red-400 shrink-0"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Upload + Sources */}
          <div
            className="px-2 py-1.5 flex items-center gap-1.5 flex-wrap"
            style={{ background: "linear-gradient(180deg,#22222c,#15151c)", borderTop: "1px solid #000" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => onUpload(e.target.files)}
              data-testid="winamp-upload-input"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 px-2 py-1 text-[10px] tracking-wider text-zinc-200 hover:text-white disabled:opacity-50"
              style={{
                background: "linear-gradient(180deg,#4a4a5e,#222230)",
                border: "1px solid #000",
                borderTop: "1px solid #6a6a7a",
                borderLeft: "1px solid #6a6a7a",
                borderRadius: 2,
              }}
              data-testid="winamp-upload-btn"
            >
              <Upload className="w-3 h-3" /> {busy ? "UPLOADING…" : "ADD FILES"}
            </button>
            <button
              onClick={() => setShowConnect("spotify")}
              className="px-2 py-1 text-[10px] tracking-wider"
              style={{
                background: "linear-gradient(180deg,#1db954,#0f7a36)",
                color: "#fff",
                border: "1px solid #000",
                borderRadius: 2,
              }}
            >
              SPOTIFY
            </button>
            <button
              onClick={() => setShowConnect("apple")}
              className="px-2 py-1 text-[10px] tracking-wider"
              style={{
                background: "linear-gradient(180deg,#fa57c1,#8e2dc4)",
                color: "#fff",
                border: "1px solid #000",
                borderRadius: 2,
              }}
            >
              APPLE MUSIC
            </button>
            <span className="ml-auto text-[9px] text-zinc-500">
              {tracks.length}/50 · {fmtBytes(tracks.reduce((s, t) => s + t.sizeBytes, 0))}
            </span>
          </div>

          {err && (
            <div className="px-2 py-1 text-[9px] text-red-400 border-t border-red-900/40">{err}</div>
          )}
        </>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={streamUrl || undefined}
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Connect modal */}
      {showConnect && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowConnect(null)}
        >
          <div
            className="max-w-sm w-full p-4 rounded-lg border border-zinc-700"
            style={{ background: "#15151c", color: "#e4e4e7" }}
            onClick={(e) => e.stopPropagation()}
          >
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
              {showConnect === "spotify"
                ? "Needs: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET"
                : "Needs: APPLE_MUSIC_DEVELOPER_TOKEN"}
            </div>
            <button
              onClick={() => setShowConnect(null)}
              className="mt-3 w-full py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded font-mono tracking-wider"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TransportBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-7 h-6 flex items-center justify-center text-zinc-200 hover:text-white active:translate-y-px"
      style={{
        background: "linear-gradient(180deg,#5a5a6e 0%,#2a2a36 100%)",
        border: "1px solid #000",
        borderTop: "1px solid #7a7a8e",
        borderLeft: "1px solid #7a7a8e",
        borderRadius: 2,
        boxShadow: "inset 0 0 0 1px #1c1c24",
      }}
    >
      {children}
    </button>
  );
}

export default PabloWinampPlayer;
