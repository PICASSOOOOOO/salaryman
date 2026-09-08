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
