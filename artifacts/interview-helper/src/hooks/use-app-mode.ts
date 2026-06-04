import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type AppMode = 'branded' | 'discreet';

const buildVersion = __BUILD_VERSION__;

export const BRANDED_CONFIG = {
  name: 'SALARYMAN' as const,
  sub: `PABLO TERMINAL MX-75 · ALPHA ${buildVersion}`,
  navLabel: 'PABLO' as const,
  emailSender: 'Salaryman' as const,
  description: 'PABLO — Executive Field Unit' as const,
};

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

  const { t } = useTranslation();

  const config = mode === 'discreet'
    ? {
        name: t('discreet.name', DISCREET_CONFIG.name),
        sub: t('discreet.sub', DISCREET_CONFIG.sub),
        navLabel: t('discreet.navLabel', DISCREET_CONFIG.navLabel),
        emailSender: DISCREET_CONFIG.emailSender,
        description: t('discreet.description', DISCREET_CONFIG.description),
      }
    : {
        name: t('branded.name', BRANDED_CONFIG.name),
        sub: BRANDED_CONFIG.sub,
        navLabel: BRANDED_CONFIG.navLabel,
        emailSender: BRANDED_CONFIG.emailSender,
        description: t('branded.description', BRANDED_CONFIG.description),
      };

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
