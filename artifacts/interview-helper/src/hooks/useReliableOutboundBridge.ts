import { useCallback } from "react";
import { useTwilioDeviceContext } from "@/contexts/TwilioDeviceContext";
import {
  cleanupOutboundCalls,
  runOutboundBridge,
  type OutboundBridgeLeg,
} from "@/lib/phone-outbound";

export function useReliableOutboundBridge(apiUrl: (path: string) => string) {
  const { ensureDeviceReady, connectToConference } = useTwilioDeviceContext();

  return useCallback(async <T,>(
    create: () => Promise<T>,
    getLegs: (created: T) => OutboundBridgeLeg[],
    options?: { allowNoLegs?: boolean },
  ): Promise<T> => runOutboundBridge({
    ensureDeviceReady,
    create,
    getLegs,
    connectToConference,
    cleanup: (callSids) => cleanupOutboundCalls(apiUrl, callSids),
    allowNoLegs: options?.allowNoLegs,
  }), [apiUrl, connectToConference, ensureDeviceReady]);
}