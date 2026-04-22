import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";

export type Track = {
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

type Ctx = {
  tracks: Track[];
  currentIdx: number;
  current: Track | undefined;
  playing: boolean;
  pos: number;
  dur: number;
  vol: number;
  busy: boolean;
  err: string | null;
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = tracks[currentIdx];

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
    a.volume = vol;

    const onTime = () => setPos(a.currentTime);
    const onDur = () => setDur(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      // advance to next track inline (avoids stale closure on `next`)
      setCurrentIdx((idx) => {
        if (tracks.length === 0) return idx;
        const n = (idx + 1) % tracks.length;
        return n;
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
  }, [tracks.length, vol]);

  // When currentIdx changes, point the audio src at the new track and try to play.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    const url = `/api/music/stream/${current.id}`;
    if (a.src.endsWith(url)) return;
    a.src = url;
    setPos(0);
    setErr(null);
    // Only auto-play if we were already playing OR user has interacted (handled by playIdx)
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
    if (i < 0 || i >= tracks.length) return;
    const a = audioRef.current;
    if (!a) return;
    setCurrentIdx(i);
    setErr(null);
    const url = `/api/music/stream/${tracks[i].id}`;
    if (!a.src.endsWith(url)) a.src = url;
    a.play().catch(() => {});
  }, [tracks]);

  const playPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      if (tracks.length > 0) { playIdx(0); }
      return;
    }
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, [current, tracks.length, playIdx]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPos(0);
  }, []);

  const next = useCallback(() => { if (tracks.length) playIdx((currentIdx + 1) % tracks.length); }, [tracks.length, currentIdx, playIdx]);
  const prev = useCallback(() => { if (tracks.length) playIdx((currentIdx - 1 + tracks.length) % tracks.length); }, [tracks.length, currentIdx, playIdx]);

  const seek = useCallback((frac: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(dur, dur * frac));
  }, [dur]);

  const setVol = useCallback((v: number) => {
    setVolState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

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

  const value = useMemo<Ctx>(() => ({
    tracks, currentIdx, current, playing, pos, dur, vol, busy, err,
    refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack,
  }), [tracks, currentIdx, current, playing, pos, dur, vol, busy, err,
       refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack]);

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function isPlayableMime(mime: string | null | undefined): boolean {
  return !mime || NATIVE_PLAYABLE.test(mime);
}
