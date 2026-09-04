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

// Plain-language labels are the product default. Keep this as a compatibility
// hook because many surfaces consume the shared label mode, but do not expose a
// user-facing switch or honor stale local preferences.
export function getDefaultBoomerMode(): boolean {
  return true;
}

export function useBoomerMode(): [boolean, (on: boolean) => void] {
  const setBoomer = React.useCallback((_on: boolean) => {}, []);
  return [true, setBoomer];
}
