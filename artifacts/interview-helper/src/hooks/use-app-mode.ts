import { useState, useEffect, useCallback } from 'react';

export type AppMode = 'branded' | 'discreet';

export const BRANDED_CONFIG = {
  name: 'SALARYMAN',
  sub: 'PABLO CORP. DEVICE v1.0',
  navLabel: 'PABLO',
  emailSender: 'Salaryman',
  description: 'PABLO AI — Executive Field Unit',
} as const;

export const DISCREET_CONFIG = {
  name: 'DEVDOCS',
  sub: 'v3.1.2 — reference',
  navLabel: 'DEVDOCS',
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
