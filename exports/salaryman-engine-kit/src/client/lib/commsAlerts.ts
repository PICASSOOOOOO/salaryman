import { useEffect, useState } from "react";

const KEY = "salaryman_comms_alerts";
const EVENT = "salaryman:comms-alerts-changed";

// Comms pop-up alerts (toasts for new DM/company/Pablo messages and associate
// requests) are ON by default. The preference is stored as an explicit opt-out:
// only when the user turns alerts OFF do we write "0" to localStorage. Any other
// value (including a missing key) means alerts are enabled.
export function commsAlertsEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setCommsAlertsEnabled(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "0");
  } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: on })); } catch {}
}

export function useCommsAlerts(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => commsAlertsEnabled());
  useEffect(() => {
    const sync = () => setOn(commsAlertsEnabled());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== KEY) return;
      sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [on, (v: boolean) => { setCommsAlertsEnabled(v); setOn(v); }];
}

// --- "Do Not Disturb while playing" preference -------------------------------
// A more granular companion to the master alerts toggle: when ON, comms pop-up
// toasts are suppressed *only* while the user is in an immersive city/
// full-screen view (e.g. WorldPlay), so play stays distraction-free while
// alerts keep firing normally everywhere else. Unlike the master toggle this is
// an explicit opt-IN — only "1" means enabled; a missing key (or any other
// value) means disabled. Badge/unread counts are unaffected either way.
const CITY_DND_KEY = "salaryman_comms_city_dnd";
const CITY_DND_EVENT = "salaryman:comms-city-dnd-changed";

export function commsCityDndEnabled(): boolean {
  try {
    return window.localStorage.getItem(CITY_DND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCommsCityDndEnabled(on: boolean) {
  try {
    if (on) window.localStorage.setItem(CITY_DND_KEY, "1");
    else window.localStorage.removeItem(CITY_DND_KEY);
  } catch {}
  try { window.dispatchEvent(new CustomEvent(CITY_DND_EVENT, { detail: on })); } catch {}
}

export function useCommsCityDnd(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => commsCityDndEnabled());
  useEffect(() => {
    const sync = () => setOn(commsCityDndEnabled());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== CITY_DND_KEY) return;
      sync();
    };
    window.addEventListener(CITY_DND_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CITY_DND_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [on, (v: boolean) => { setCommsCityDndEnabled(v); setOn(v); }];
}

// --- Live immersive-view tracker --------------------------------------------
// Reflects whether the user is *currently* inside an immersive city/full-screen
// view. Unlike the preferences above this is live session state, NOT persisted:
// immersive views (e.g. WorldPlay) call setImmersiveViewActive(true) on mount
// and (false) on unmount. A ref-count tolerates brief overlaps when one such
// view mounts before the previous one finishes unmounting. The comms toast
// logic reads this together with commsCityDnd to decide whether to suppress
// pop-ups while keeping badge counts up to date.
const IMMERSIVE_EVENT = "salaryman:immersive-view-changed";
let immersiveViewCount = 0;

export function isImmersiveViewActive(): boolean {
  return immersiveViewCount > 0;
}

export function setImmersiveViewActive(active: boolean) {
  const wasActive = immersiveViewCount > 0;
  immersiveViewCount = active
    ? immersiveViewCount + 1
    : Math.max(0, immersiveViewCount - 1);
  const nowActive = immersiveViewCount > 0;
  if (wasActive !== nowActive) {
    try { window.dispatchEvent(new CustomEvent(IMMERSIVE_EVENT, { detail: nowActive })); } catch {}
  }
}

export function useImmersiveViewActive(): boolean {
  const [active, setActive] = useState<boolean>(() => isImmersiveViewActive());
  useEffect(() => {
    const sync = () => setActive(isImmersiveViewActive());
    sync();
    window.addEventListener(IMMERSIVE_EVENT, sync);
    return () => window.removeEventListener(IMMERSIVE_EVENT, sync);
  }, []);
  return active;
}
