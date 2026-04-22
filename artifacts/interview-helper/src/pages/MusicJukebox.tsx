import { Link } from "wouter";
import { ChevronLeft, Music2 } from "lucide-react";
import { PabloWinampPlayer } from "@/components/PabloWinampPlayer";
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
      <header className="max-w-5xl mx-auto px-4 sm:px-6 mb-6 flex items-center justify-between">
        <Link href="/creative/darkroom" className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs font-mono tracking-wider">
          <ChevronLeft className="w-4 h-4" /> CREATIVE
        </Link>
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-purple-400" />
          <h1 className="text-sm font-mono tracking-[0.3em] text-zinc-300">JUKEBOX</h1>
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
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-purple-300 mb-2">ABOUT</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Drop in your own music — MP3, WAV, M4A, AAC, OGG, FLAC, MP4 audio. Files stay private to your account. Playback continues across pages, calls, and tabs.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-emerald-300 mb-2">STREAMING SOURCES</h2>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Spotify and Apple Music connect buttons are wired to launch OAuth once you provide developer credentials. Until then, your local library plays.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <h2 className="text-[10px] font-mono tracking-[0.25em] text-amber-300 mb-2">FORMATS</h2>
            <ul className="text-[11px] text-zinc-400 space-y-1 leading-relaxed">
              <li>✓ MP3 / M4A / AAC / OGG / WAV / FLAC / OPUS</li>
              <li>✓ MP4 audio (no conversion needed)</li>
              <li>⚠ AIFF — uploads, but most browsers can't decode</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
