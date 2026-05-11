import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Alpha-stage warning banner.
 *
 * Frequent updates during alpha may wipe player data. We show this banner once
 * per build version so the warning re-appears after every deploy. Dismissal is
 * keyed by `__BUILD_VERSION__` in localStorage.
 */
export default function AlphaWipeBanner() {
  const version = (typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev');
  const storageKey = `sm_alpha_wipe_dismissed_${version}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setVisible(true);
    } catch { /* localStorage may be blocked */ }
  }, [storageKey]);

  const dismiss = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="hidden sm:flex w-full bg-amber-500/15 border-b border-amber-500/40 text-amber-100 px-4 py-2 items-center gap-3 text-xs sm:text-sm font-mono">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-300" />
      <p className="flex-1 leading-snug">
        <span className="font-bold tracking-wider text-amber-200">ALPHA NOTICE —</span>{' '}
        We ship updates frequently. Your in-game data may be wiped at any time without warning.
        Please back up anything important. Build <span className="text-amber-300">{version}</span>.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss alpha warning"
        className="flex-shrink-0 p-1 rounded hover:bg-amber-500/20 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
