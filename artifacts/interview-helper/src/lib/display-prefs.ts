// Display preferences that must apply globally (even on screens that never mount
// the Settings page) are kept here. They read from the shared game-settings blob
// `sm_game_settings_v1` and toggle a class on <html>, mirroring lib/lowGfx.ts.

const KEY = "sm_game_settings_v1";

export function isCrtEnabled(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return true;
    const p = JSON.parse(raw) as { crtEffect?: unknown };
    return p.crtEffect !== false;
  } catch {
    return true;
  }
}

// Toggles the global CRT grade (scanlines + grain laid over scene artwork by
// SceneFX). `no-crt` is stripped in index.css.
export function applyCrt(on: boolean) {
  try {
    document.documentElement.classList.toggle("no-crt", !on);
  } catch {}
}

export function initDisplayPrefs() {
  applyCrt(isCrtEnabled());
}
