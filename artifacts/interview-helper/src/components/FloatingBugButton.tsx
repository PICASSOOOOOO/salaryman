import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';

// Always-visible floating button so devs/testers can file a bug from ANY
// page — including the fullscreen / game routes where the NavBar (and its
// bug icon) is hidden for immersion. Sits bottom-left so it never collides
// with the GlobalErrorReporter toast (bottom-right) or the floating chat.
//
// Hidden behaviour:
// - Opt-out persisted in localStorage so a user who really hates it can
//   kill it from the console: localStorage.setItem('sm_hide_bug_btn','1')
// - Auto-fades to 30% opacity after 4s of no hover so it doesn't shout
//   over cinematic content; full opacity returns on hover/focus.
const HIDE_KEY = 'sm_hide_bug_btn';

export function FloatingBugButton() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const [dim, setDim] = useState(false);

  // Re-check the hide flag if another tab toggles it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === HIDE_KEY) setHidden(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Fade to low opacity after 4s of inactivity so it stays unobtrusive.
  useEffect(() => {
    if (open) { setDim(false); return; }
    const t = window.setTimeout(() => setDim(true), 4000);
    return () => window.clearTimeout(t);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setDim(false); setOpen(true); }}
        onMouseEnter={() => setDim(false)}
        onFocus={() => setDim(false)}
        onMouseLeave={() => setDim(true)}
        title="Report a bug"
        aria-label="Report a bug"
        data-testid="floating-bug-button"
        className={[
          'fixed left-3 bottom-3 z-[9998]',
          'flex items-center gap-1.5 px-2.5 py-2 rounded-full',
          'bg-zinc-950/85 backdrop-blur border border-pink-500/30',
          'text-pink-300 hover:text-pink-200 hover:border-pink-400/60 hover:bg-zinc-950/95',
          'shadow-[0_0_18px_rgba(236,72,153,0.25)]',
          'transition-opacity duration-500',
          'font-mono text-[10px] tracking-widest uppercase',
          dim ? 'opacity-30 hover:opacity-100' : 'opacity-100',
        ].join(' ')}
      >
        <Bug className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Report bug</span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
