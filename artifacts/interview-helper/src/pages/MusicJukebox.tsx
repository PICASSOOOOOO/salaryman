import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { PabloWinampPlayer } from "@/components/PabloWinampPlayer";
import { HummingbirdIcon } from "@/components/HummingbirdIcon";
import { useAuth } from "@workspace/replit-auth-web";
import { SignInPage } from "@/components/SignInPrompt";

export default function MusicJukebox() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <SignInPage />;

  return (
    <div className="min-h-screen w-full" style={{
      background: "radial-gradient(circle at 30% 20%, rgba(160,120,255,0.12) 0%, transparent 60%), radial-gradient(circle at 70% 80%, rgba(255,100,180,0.10) 0%, transparent 60%), #07080d",
      paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
      paddingBottom: "calc(env(safe-area-inset-bottom) + 4rem)",
    }}>
      <header className="max-w-5xl mx-auto px-4 sm:px-6 mb-6 flex items-start justify-between">
        <Link href="/creative/darkroom" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider mt-2">
          <ChevronLeft className="w-4 h-4" /> CREATIVE
        </Link>
        <div className="flex flex-col items-center gap-1">
          <HummingbirdIcon size={48} color="#c084fc" />
          <h1 className="text-[11px] font-mono tracking-[0.4em] text-zinc-400">HUMMING BIRD</h1>
        </div>
        <div className="w-16" />
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col items-center">
          <div className="w-full max-w-2xl">
            <PabloWinampPlayer size="full" />
          </div>
          <p className="mt-4 text-[10px] font-mono text-zinc-600 tracking-wider text-center max-w-md">
            PERSONAL SOUNDTRACK · KEEPS PLAYING WHEN YOU LEAVE THIS TAB · 50 TRACKS / 500 MB CAP
          </p>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-purple-300 mb-2">SAMPLE BENCH</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Drop a file in <span className="text-purple-300">IMPORT / SAMPLE</span> — it lands in <span className="text-purple-300">STAGING</span> first. Preview it, convert to MP3 if you want, then SAVE only what you keep. Discard with one click. Nothing hits your data bank until you say so.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-fuchsia-300 mb-2">FORMAT CONVERTER</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Hit <span className="text-fuchsia-300">→ MP3</span> on any staged file. WAV, FLAC, M4A, OGG, OPUS — all decoded and re-encoded in your browser at 192 kbps stereo. Original stays untouched until you SAVE.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-emerald-300 mb-2">USE ANYWHERE</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Saved tracks are available across all creative tools — load as a backing track in <span className="text-emerald-300">1999 SOUND LAB</span>, or pick as the soundtrack when exporting an MP4 from <span className="text-emerald-300">DARKROOM</span> / <span className="text-emerald-300">DESIGN STUDIO</span>.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-amber-300 mb-2">FORMATS</h2>
            <ul className="text-[11px] text-zinc-400 space-y-1 leading-relaxed">
              <li>✓ MP3 / M4A / AAC / OGG / WAV / FLAC / OPUS — play & convert</li>
              <li>✓ MP4 audio — play & convert</li>
              <li>⚠ AIFF — saves but cannot be browser-converted</li>
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-cyan-300 mb-2">STREAMING SOURCES</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Spotify and Apple Music buttons launch OAuth once developer credentials are configured.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
