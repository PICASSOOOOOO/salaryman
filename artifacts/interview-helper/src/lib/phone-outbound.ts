import { apiFetch } from '@/lib/api-client';
export interface OutboundBridgeLeg {
  callSid: string;
  conferenceName?: string;
}

export interface OutboundBridgeOptions<T> {
  ensureDeviceReady: () => Promise<void>;
  create: () => Promise<T>;
  getLegs: (created: T) => OutboundBridgeLeg[];
  connectToConference: (conferenceName: string) => Promise<unknown>;
  cleanup: (callSids: string[]) => Promise<void>;
  allowNoLegs?: boolean;
}

export class PhoneBridgeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PhoneBridgeError";
  }
}

export function actionablePhoneError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "Unknown phone error");
  const lower = raw.toLowerCase();
  if (lower.includes("permission") || lower.includes("microphone") || lower.includes("notallowed")) {
    return "Microphone access is required. Allow microphone permission in your browser, then reconnect the phone and try again.";
  }
  if (lower.includes("token") || lower.includes("401") || lower.includes("403")) {
    return "The browser phone could not authenticate. Reconnect the phone, then try again.";
  }
  if (lower.includes("register") || lower.includes("registration") || lower.includes("ready") || lower.includes("offline")) {
    return "The browser phone is offline. Use RECONNECT and wait for READY before calling.";
  }
  return `The browser could not join the call audio conference: ${raw}. No active call was kept.`;
}

export async function cleanupOutboundCalls(
  apiUrl: (path: string) => string,
  callSids: string[],
): Promise<void> {
  const unique = [...new Set(callSids.filter(Boolean))];
  if (unique.length === 0) return;
  const response = await apiFetch(apiUrl("twilio/hangup-all"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ callSids: unique }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Could not clean up failed call (${response.status})`);
  }
}

/**
 * The only valid outbound ordering:
 * browser device READY -> create PSTN leg(s) -> join returned conference.
 * Created PSTN legs are rolled back if the browser bridge cannot join.
 */
export async function runOutboundBridge<T>(options: OutboundBridgeOptions<T>): Promise<T> {
  try {
    await options.ensureDeviceReady();
  } catch (error) {
    throw new PhoneBridgeError(actionablePhoneError(error), error);
  }

  const created = await options.create();
  const legs = options.getLegs(created).filter((leg) => !!leg.callSid);
  const bridgeLegs = legs.filter((leg) => !!leg.conferenceName);
  if (legs.length === 0 && options.allowNoLegs) return created;
  if (bridgeLegs.length !== legs.length || bridgeLegs.length === 0) {
    try {
      await options.cleanup(legs.map((leg) => leg.callSid));
    } catch {}
    throw new PhoneBridgeError("The phone provider did not return an audio conference. The call was canceled; reconnect and try again.");
  }

  try {
    for (const leg of bridgeLegs) {
      await options.connectToConference(leg.conferenceName!);
    }
    return created;
  } catch (error) {
    let cleanupFailed = false;
    try {
      await options.cleanup(legs.map((leg) => leg.callSid));
    } catch {
      cleanupFailed = true;
    }
    const message = actionablePhoneError(error);
    throw new PhoneBridgeError(
      cleanupFailed
        ? `${message} Automatic cleanup also failed; use END CALL if the recipient is still ringing.`
        : message,
      error,
    );
  }
}

export function reconcilePolledCalls<T extends { callSid: string; status: string }>(
  calls: T[],
  statuses: Array<{ callSid: string; status?: string; error?: string }>,
  terminalStatuses: readonly string[],
): T[] {
  return calls.flatMap((call) => {
    const found = statuses.find((status) => status.callSid === call.callSid);
    if (!found?.status || found.error) return [call];
    if (terminalStatuses.includes(found.status)) return [];
    return [{ ...call, status: found.status }];
  });
}