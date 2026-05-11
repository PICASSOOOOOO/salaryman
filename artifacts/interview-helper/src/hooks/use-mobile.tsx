import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

// Default boomer mode is ON for everyone now — keeps the office UI tight
// and short-labelled by default, and gates verbose marketing/promo copy
// behind an explicit opt-out (toggle in NavBar / settings flips this and
// writes '0' to localStorage). Honors any previously-saved choice.
export function getDefaultBoomerMode(): boolean {
  try {
    const stored = localStorage.getItem('sm_boomer');
    if (stored !== null) return stored === '1';
    localStorage.setItem('sm_boomer', '1');
    return true;
  } catch {
    return true;
  }
}

export function useBoomerMode(): [boolean, (on: boolean) => void] {
  const [boomerMode, setBoomerMode] = React.useState(() => getDefaultBoomerMode());
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'sm_boomer') setBoomerMode(e.newValue === '1'); };
    window.addEventListener('storage', onStorage);
    const id = setInterval(() => { try { setBoomerMode(localStorage.getItem('sm_boomer') === '1'); } catch {} }, 2000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);
  const setBoomer = React.useCallback((on: boolean) => {
    setBoomerMode(on);
    try { localStorage.setItem('sm_boomer', on ? '1' : '0'); } catch {}
  }, []);
  return [boomerMode, setBoomer];
}
