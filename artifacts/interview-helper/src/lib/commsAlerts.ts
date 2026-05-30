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
