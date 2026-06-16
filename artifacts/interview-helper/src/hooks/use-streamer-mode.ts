import { useSyncExternalStore } from "react";
import { isStreamerMode } from "@/lib/streamer-mode";

// Reactively read the Streamer Mode flag from the synced settings blob. Re-reads
// whenever settings change in-tab (the shared "sm-settings-changed" event the
// Settings page already dispatches) or in another tab ("storage").
function subscribe(cb: () => void): () => void {
  window.addEventListener("sm-settings-changed", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("sm-settings-changed", cb);
    window.removeEventListener("storage", cb);
  };
}

export function useStreamerMode(): boolean {
  return useSyncExternalStore(subscribe, isStreamerMode, () => false);
}
