import { useEffect, useState } from "react";

const KEY = "salaryman_low_gfx";
const EVENT = "salaryman:lowgfx-changed";

export function isLowGfx(): boolean {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function applyClass(on: boolean) {
  try {
    const root = document.documentElement;
    if (on) root.classList.add("low-gfx");
    else root.classList.remove("low-gfx");
  } catch {}
}

export function setLowGfx(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {}
  applyClass(on);
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: on })); } catch {}
}

export function initLowGfx() {
  applyClass(isLowGfx());
}

export function useLowGfx(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => isLowGfx());
  useEffect(() => {
    const sync = () => {
      const v = isLowGfx();
      // Re-apply class too: when the change came from another tab via the
      // 'storage' event, our in-page setLowGfx() never ran, so the <html>
      // class would otherwise stay stale and the global CSS rules would
      // not reflect the new preference until a reload.
      applyClass(v);
      setOn(v);
    };
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
  return [on, (v: boolean) => { setLowGfx(v); setOn(v); }];
}
