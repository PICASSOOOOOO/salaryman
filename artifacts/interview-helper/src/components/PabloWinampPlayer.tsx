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
