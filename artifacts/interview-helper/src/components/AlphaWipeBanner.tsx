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
    <div className="alpha-wipe-banner relative z-[10000] flex min-h-[72px] w-full items-center gap-2 border-b border-[#b58500] bg-[#fff1ad] px-3 py-2 text-[11px] font-mono font-bold text-black sm:min-h-12 sm:gap-3 sm:px-4 sm:text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#8a6200]" />
      <p className="flex-1 min-w-0 leading-snug">
        <span className="font-black tracking-wider">ALPHA —</span>{' '}
        Data may be wiped anytime; back up your work. Build <span className="font-black">{version}</span>.
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
