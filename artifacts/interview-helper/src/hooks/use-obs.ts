import { useSyncExternalStore } from "react";
import {
  obsClient,
  type ObsConnectOptions,
  type ObsStatus,
} from "@/lib/obs-websocket";

// React binding for the module-level OBS WebSocket client. The status object is
// driven by the client's external store so any mounted component (the Streaming
// settings tab today) re-renders on connect / record / stream state changes
// without owning the socket lifecycle itself.
export function useObs() {
  const status: ObsStatus = useSyncExternalStore(
    obsClient.subscribe,
    obsClient.getSnapshot,
    obsClient.getServerSnapshot,
  );

  return {
    status,
    connect: (opts: ObsConnectOptions) => obsClient.connect(opts),
    disconnect: () => obsClient.disconnect(),
    reconnect: () => obsClient.reconnect(),
    startRecording: () => obsClient.startRecording(),
    stopRecording: () => obsClient.stopRecording(),
    startStreaming: () => obsClient.startStreaming(),
    stopStreaming: () => obsClient.stopStreaming(),
  };
}
