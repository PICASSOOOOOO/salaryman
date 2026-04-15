import { createContext, useContext } from 'react';

type TabKey = 'contacts' | 'cmd' | 'dial' | 'live' | 'log' | 'vm' | 'conf' | 'auto' | 'ai' | 'cc';

interface CalllHomeCtx {
  inside: boolean;
  switchTab: (tab: TabKey) => void;
}

const CalllHomeContext = createContext<CalllHomeCtx>({ inside: false, switchTab: () => {} });

export type { TabKey };

export const CalllHomeProvider = ({ children, switchTab }: { children: React.ReactNode; switchTab: (tab: TabKey) => void }) => (
  <CalllHomeContext.Provider value={{ inside: true, switchTab }}>{children}</CalllHomeContext.Provider>
);

export const useInsideCalllHome = () => useContext(CalllHomeContext).inside;
export const useCalllHomeNav = () => {
  const ctx = useContext(CalllHomeContext);
  return ctx.inside ? ctx.switchTab : null;
};

const ROUTE_TO_TAB: Record<string, TabKey> = {
  '/phone/contacts': 'contacts',
  '/phone/dialer': 'cmd',
  '/phone/active': 'cmd',
  '/phone/cmd': 'cmd',
  '/phone/history': 'log',
  '/phone/voicemail': 'vm',
  '/phone/conference': 'conf',
  '/phone/sessions': 'cmd',
  '/phone/coach': 'ai',
  '/phone/secretary': 'ai',
  '/phone/numbers': 'contacts',
  '/phone/call-center': 'cc',
};

export function useCalllHomeNavigate() {
  const switchTab = useCalllHomeNav();
  return (route: string) => {
    if (switchTab) {
      const tab = ROUTE_TO_TAB[route];
      if (tab) { switchTab(tab); return true; }
    }
    return false;
  };
}
