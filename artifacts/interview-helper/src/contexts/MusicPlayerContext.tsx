import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { convertFileToMp3, canBrowserDecode } from "@/lib/audioConvert";
import { isPhoneBusy, subscribePhoneBusy } from "@/lib/phone-busy";

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = tracks[currentIdx];

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
    if (isPhoneBusy()) {
      setErr("Phone call in progress — music paused");
      return;
    }
    a.play().catch(() => {});
  }, [tracks]);

  const playPause = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      if (tracks.length > 0) { playIdx(0); }
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
      updateStaged(id, { status: "saved", progress: 1 });
      await refresh();
      // Auto-clean saved item after a short delay so the UI can show the success state
      setTimeout(() => discardStaged(id), 1500);
    } catch (e: any) {
      updateStaged(id, { status: "error", error: e?.message || "Save failed" });
    }
  }, [staged, refresh, discardStaged]);

  const previewTrack = useCallback((trackId: number) => {
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx >= 0) playIdx(idx);
  }, [tracks, playIdx]);

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
    tracks, currentIdx, current, playing, pos, dur, vol, busy, err,
    refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack,
    staged, stageFiles, discardStaged, previewStaged, convertStaged, saveStaged, previewTrack,
    downloadTrack, downloadStaged,
  }), [tracks, currentIdx, current, playing, pos, dur, vol, busy, err,
       refresh, playIdx, playPause, stop, next, prev, seek, setVol, uploadFiles, removeTrack,
       staged, stageFiles, discardStaged, previewStaged, convertStaged, saveStaged, previewTrack,
       downloadTrack, downloadStaged]);

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function isPlayableMime(mime: string | null | undefined): boolean {
  return !mime || NATIVE_PLAYABLE.test(mime);
}
