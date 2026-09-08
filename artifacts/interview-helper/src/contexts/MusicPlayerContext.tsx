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
