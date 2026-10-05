import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useLocation } from "wouter";

interface OpenOptions {
  reason?: string;
}

interface PledgePopupContextValue {
  openPledgePopup: (opts?: OpenOptions) => void;
  closePledgePopup: () => void;
}

const PledgePopupContext = createContext<PledgePopupContextValue>({
  openPledgePopup: () => {},
  closePledgePopup: () => {},
});

export function usePledgePopup(): PledgePopupContextValue {
  return useContext(PledgePopupContext);
}

/** Keep legacy callers working while routing all price gates to the full page. */
export function PledgeStorePopupProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const openPledgePopup = useCallback(
    (_opts?: OpenOptions) => navigate("/pricing"),
    [navigate],
  );
  const closePledgePopup = useCallback(() => {}, []);

  return (
    <PledgePopupContext.Provider value={{ openPledgePopup, closePledgePopup }}>
      {children}
    </PledgePopupContext.Provider>
  );
}
