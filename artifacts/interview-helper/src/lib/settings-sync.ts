import { apiFetch } from "./api-client";
import { setLowGfx, isLowGfx } from "./lowGfx";

// ── Cross-device settings sync ───────────────────────────────────────────────
// Display / visual-quality preferences (bloom, ground glow, night lighting, the
// low-graphics toggle, camera zoom, audio volumes, …) live in two localStorage
// blobs: STORE_KEY (sm_game_settings_v1, written by Game/Settings + the audio
// store) and LOW_GFX_KEY (salaryman_low_gfx, written by lib/lowGfx).
//
// On their own those are per-device. This module mirrors them to the signed-in
// player's account so the choices follow them to another phone/laptop:
//   • hydrateSettingsFromServer() — called once after sign-in: pulls the saved
//     blob and merges it into local (server wins where it has a key).
//   • initSettingsSync() — listens for local changes and debounce-pushes them up.
// Logged-out / offline players never call these, so the existing local-only flow
// keeps working untouched.

const STORE_KEY = "sm_game_settings_v1";
const SETTINGS_CHANGED_EVENT = "sm-settings-changed";
const PUSH_DEBOUNCE_MS = 1000;

function readLocalSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Pull the saved account preferences and merge them into the local blobs. Server
// values win where present so the device adopts the player's last-saved choices,
// while any local-only keys (and keys the server doesn't know about) survive.
export async function hydrateSettingsFromServer(): Promise<void> {
  try {
    const res = await apiFetch("/api/account/settings");
    if (!res.ok) return;
    const data = (await res.json()) as {
      settings?: Record<string, unknown> | null;
      lowGfx?: boolean | null;
    };
    let settingsChanged = false;
    if (data.settings && typeof data.settings === "object") {
      const existing = readLocalSettings();
      const merged = { ...existing, ...data.settings };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(merged));
        settingsChanged = true;
      } catch {}
    }
    // setLowGfx handles localStorage + the <html> class + its own change event,
    // so the live world renderer and the Settings toggle both react. Only touch
    // it when the value actually differs to avoid a redundant event.
    if (typeof data.lowGfx === "boolean" && data.lowGfx !== isLowGfx()) {
      setLowGfx(data.lowGfx);
    }
    if (settingsChanged) {
      // Tell the live world renderer (WorldPlay reads gfx quality off this) and
      // the open Settings page to pick up the hydrated values immediately.
      try {
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      } catch {}
    }
  } catch {
    // Offline / not signed in — keep the local-only blob as-is.
  }
}

function pushSettingsToServer(): void {
  const settings = readLocalSettings();
  const lowGfx = isLowGfx();
  // apiFetch swallows network errors at the caller; a 401 (logged out) just
  // no-ops, so the local-only flow is never disturbed.
  void apiFetch("/api/account/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings, lowGfx }),
  }).catch(() => {});
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncStarted = false;

// Immediately mirror the current local settings to the account, bypassing the
// debounce. Used by the Settings "reset to defaults" button: after the page has
// written the default values back into the local blobs, this overwrites the
// server-side copy right away. Without it, the cleared device — or another
// device — would re-hydrate the old (pre-reset) values from the account on next
// load. A 401 (logged out) just no-ops, so the local-only reset is untouched.
export function flushSettingsToServer(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  pushSettingsToServer();
}

// Begin mirroring local settings changes up to the account. Idempotent; safe to
// call again on re-auth. Returns a teardown for completeness.
export function initSettingsSync(): () => void {
  if (syncStarted) return () => {};
  syncStarted = true;

  const schedulePush = () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushSettingsToServer, PUSH_DEBOUNCE_MS);
  };

  // Both the game/display settings and the low-graphics toggle fan out their own
  // same-tab change events; listen to both so every visual-quality change syncs.
  window.addEventListener(SETTINGS_CHANGED_EVENT, schedulePush);
  window.addEventListener("salaryman:lowgfx-changed", schedulePush);

  return () => {
    window.removeEventListener(SETTINGS_CHANGED_EVENT, schedulePush);
    window.removeEventListener("salaryman:lowgfx-changed", schedulePush);
    if (pushTimer) clearTimeout(pushTimer);
    syncStarted = false;
  };
}
