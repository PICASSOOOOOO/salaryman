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

export function getDefaultBoomerMode(): boolean {
  try {
    const stored = localStorage.getItem('sm_boomer');
    if (stored !== null) return stored === '1';
    const mobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (mobile) {
      localStorage.setItem('sm_boomer', '1');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
