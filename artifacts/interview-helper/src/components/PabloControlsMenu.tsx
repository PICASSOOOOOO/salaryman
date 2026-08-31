import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';
import { useAudioSettings } from '@/hooks/use-audio-settings';
import { useLowGfx } from '@/lib/lowGfx';

interface PabloControlsMenuProps {
  showHummingbird: boolean;
}

export function PabloControlsMenu({ showHummingbird }: PabloControlsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { settings, set, toggleMuted } = useAudioSettings();
  const [lowGfx, setLowGfx] = useLowGfx();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid="pablo-controls-menu">
      <button
        type="button"
        aria-label="Open Pablo controls"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-[10px] font-medium tracking-[0.14em] text-white/75 backdrop-blur-md transition hover:border-violet-300/35 hover:text-white"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden min-[520px]:inline">CONTROLS</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Pablo controls"
          className="absolute right-0 top-[calc(100%+0.55rem)] z-[80] w-[min(18rem,calc(100vw-1rem))] max-h-[min(70svh,30rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#090812]/95 p-3 text-left shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-2.5">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-white/85">AUDIO</p>
              <p className="mt-0.5 text-[10px] text-white/45">{settings.muted ? 'Muted' : 'Pablo and interface audio'}</p>
            </div>
            <button
              type="button"
              role="menuitem"
              aria-label={settings.muted ? 'Unmute audio' : 'Mute audio'}
              onClick={toggleMuted}
              className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {settings.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          <label className="mt-3 block px-1 text-[9px] font-medium tracking-[0.14em] text-white/55">
            MASTER VOLUME
            <input
              aria-label="Master volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.master}
              onChange={(event) => set({ master: Number(event.target.value) })}
              className="mt-2 w-full accent-violet-400"
            />
          </label>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={lowGfx}
            onClick={() => setLowGfx(!lowGfx)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
          >
            <span>
              <span className="block text-[10px] font-semibold tracking-[0.14em] text-white/80">LOW GRAPHICS</span>
              <span className="mt-0.5 block text-[10px] text-white/40">Reduce motion and visual effects</span>
            </span>
            <span className={`h-5 w-9 rounded-full p-0.5 transition ${lowGfx ? 'bg-violet-500' : 'bg-white/15'}`}>
              <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${lowGfx ? 'translate-x-4' : ''}`} />
            </span>
          </button>

          {showHummingbird && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-2 px-1 text-[9px] font-semibold tracking-[0.14em] text-white/55">HUMMINGBIRD</p>
              <HummingBirdAttachStrip
                toolKey="pablo-terminal"
                buttonStyle="ghost"
                buttonLabel="ATTACH AUDIO"
                pickerTitle="ATTACH AUDIO TO COMMAND"
                compact
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}