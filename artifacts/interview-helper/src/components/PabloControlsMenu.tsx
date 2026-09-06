import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ChevronDown, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { HummingBirdAttachStrip } from '@/components/HummingBirdAttachStrip';
import { useAudioSettings } from '@/hooks/use-audio-settings';
import { useLowGfx } from '@/lib/lowGfx';
import { useAuth } from '@/hooks/use-auth';

interface PabloControlsMenuProps {
  showHummingbird: boolean;
}

export function PabloControlsMenu({ showHummingbird }: PabloControlsMenuProps) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 8, width: 288 });
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

  useEffect(() => {
    if (!open) return;

    const positionPopover = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(288, Math.max(0, window.innerWidth - viewportPadding * 2));
      const left = Math.min(
        Math.max(viewportPadding, rect.right - width),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      const estimatedHeight = Math.min(window.innerHeight * 0.7, 480);
      const top = Math.min(
        rect.bottom + 8,
        Math.max(viewportPadding, window.innerHeight - estimatedHeight - viewportPadding),
      );

      setPopoverPosition({ top, left, width });
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid="pablo-controls-menu">
      <button
        type="button"
        ref={triggerRef}
        aria-label="Open settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="app-action app-control mobile-tap-target bg-black/45 backdrop-blur-md"
      >
        <SlidersHorizontal className="app-control-icon" aria-hidden />
        <span className="hidden min-[520px]:inline">SETTINGS</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pablo settings"
          data-testid="pablo-controls-popover"
          className="fixed z-[80] max-h-[min(70svh,30rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#090812]/95 p-3 text-left shadow-2xl shadow-black/60 backdrop-blur-xl"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
            width: popoverPosition.width,
          }}
        >
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-2.5">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-white/85">AUDIO</p>
              <p className="mt-0.5 text-[10px] text-white/45">{settings.muted ? 'Muted' : 'Pablo and interface audio'}</p>
            </div>
            <button
              type="button"
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
            aria-pressed={lowGfx}
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

          {isAuthenticated && (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="app-action app-control mt-3 w-full border-white/10 bg-white/[0.035] text-white/70 hover:bg-white/[0.08] hover:text-white"
            >
              <SlidersHorizontal className="app-control-icon" aria-hidden />
              OPEN SETTINGS
            </Link>
          )}
        </div>
      )}
    </div>
  );
}