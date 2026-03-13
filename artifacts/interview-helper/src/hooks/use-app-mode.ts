import { useState, useEffect, useCallback } from 'react';

export type AppMode = 'branded' | 'discreet';

export const BRANDED_CONFIG = {
  name: 'Frontman',
  sub: 'by Picassoo.ai',
  navLabel: 'Frontman',
  emailSender: 'Frontman',
  description: 'Your executive AI suite',
} as const;

export const DISCREET_CONFIG = {
  name: 'DevDocs',
  sub: 'v3.1.2 — reference',
  navLabel: 'DevDocs',
  emailSender: 'DevDocs',
  description: 'Developer reference tools',
} as const;

const STORAGE_KEY = 'devdocs_app_mode';

export function useAppMode() {
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as AppMode) ?? 'branded';
    } catch {
      return 'branded';
    }
  });

  const config = mode === 'discreet' ? DISCREET_CONFIG : BRANDED_CONFIG;

  useEffect(() => {
    document.title = config.name;
  }, [config.name]);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next: AppMode = prev === 'discreet' ? 'branded' : 'discreet';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const setModeTo = useCallback((m: AppMode) => {
    setMode(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
  }, []);

  return { mode, config, toggleMode, setModeTo, isDiscreet: mode === 'discreet' };
}
