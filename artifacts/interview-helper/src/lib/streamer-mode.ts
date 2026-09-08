// ── Streamer Mode ────────────────────────────────────────────────────────────
// A single display flag that, when on, hides personal / sensitive info from the
// screen so it's safe to broadcast — account email and exact real-money / USD
// balances. It is stored inside the same synced game-settings blob
// (sm_game_settings_v1) so the choice follows the player across devices via the
// existing settings-sync flow, and changes broadcast on the shared
// "sm-settings-changed" event that the rest of the app already listens to.

const STORE_KEY = "sm_game_settings_v1";

export function isStreamerMode(): boolean {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.streamerMode === true;
  } catch {
    return false;
  }
}

// Placeholder shown in place of any masked sensitive readout while streaming.
export const STREAMER_MASK = "••••••";

// Convenience for render sites: returns the masked placeholder when streaming,
// otherwise the real value.
export function maskWhenStreaming(value: string, on: boolean): string {
  return on ? STREAMER_MASK : value;
}
