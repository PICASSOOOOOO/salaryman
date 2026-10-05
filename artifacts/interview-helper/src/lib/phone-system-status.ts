export type PhoneSystemStatus =
  | 'checking'
  | 'online'
  | 'no_subscription'
  | 'restricted'
  | 'unconfigured'
  | 'unavailable';

export type PhoneSystemStatusDecision = {
  status: Exclude<PhoneSystemStatus, 'checking'>;
  retry: boolean;
};

const RETRY_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 60_000] as const;

export function getPhoneSystemStatusRetryDelay(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return RETRY_DELAYS_MS[Math.min(safeAttempt, RETRY_DELAYS_MS.length - 1)];
}

export function classifyPhoneSystemResponse(
  httpStatus: number,
  payload: unknown,
): PhoneSystemStatusDecision {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};

  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: 'online', retry: false };
  }
  if (httpStatus === 403 && body.code === 'TWILIO_ORG_RESTRICTED') {
    return { status: 'restricted', retry: false };
  }
  if (httpStatus === 403) {
    return { status: 'no_subscription', retry: false };
  }
  if (httpStatus === 503 && body.status === 'unconfigured') {
    return { status: 'unconfigured', retry: true };
  }
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) {
    return { status: 'unavailable', retry: true };
  }
  return { status: 'unavailable', retry: httpStatus !== 401 };
}
