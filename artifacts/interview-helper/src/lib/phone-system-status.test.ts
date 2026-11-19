import { describe, expect, it } from 'vitest';
import {
  classifyPhoneSystemResponse,
  formatPhoneSystemDiagnostic,
  getPhoneSystemStatusRetryDelay,
} from './phone-system-status';

describe('formatPhoneSystemDiagnostic', () => {
  it('includes safe provider error codes without exposing arbitrary response text', () => {
    expect(formatPhoneSystemDiagnostic(503, {
      status: 'unavailable',
      code: 'TWILIO_AUTH_REJECTED',
    })).toBe('HTTP 503 · TWILIO_AUTH_REJECTED');
    expect(formatPhoneSystemDiagnostic(401, {
      error: 'Login required',
      detail: 'private response content',
    })).toBe('HTTP 401 · Login required');
    expect(formatPhoneSystemDiagnostic(500, {
      code: 'error: private detail',
      error: 'private response content',
    })).toBe('HTTP 500');
  });
});

describe('classifyPhoneSystemResponse', () => {
  it('marks successful checks online', () => {
    expect(classifyPhoneSystemResponse(200, {})).toEqual({ status: 'online', retry: false });
  });

  it('keeps subscription and organization restrictions distinct', () => {
    expect(classifyPhoneSystemResponse(403, {})).toEqual({ status: 'no_subscription', retry: false });
    expect(classifyPhoneSystemResponse(403, { code: 'TWILIO_ORG_RESTRICTED' }))
      .toEqual({ status: 'restricted', retry: false });
  });

  it('routes paid-feature onboarding requirements to setup without retrying the phone service', () => {
    expect(classifyPhoneSystemResponse(428, { onboardingRequired: true }))
      .toEqual({ status: 'onboarding_required', retry: false });
  });

  it('retries an explicit missing-configuration response', () => {
    expect(classifyPhoneSystemResponse(503, { status: 'unconfigured' }))
      .toEqual({ status: 'unconfigured', retry: true });
  });

  it('retries transient API and gateway responses without calling them configuration errors', () => {
    expect(classifyPhoneSystemResponse(502, null)).toEqual({ status: 'unavailable', retry: true });
    expect(classifyPhoneSystemResponse(503, '<html>gateway unavailable</html>'))
      .toEqual({ status: 'unavailable', retry: true });
    expect(classifyPhoneSystemResponse(429, {})).toEqual({ status: 'unavailable', retry: true });
  });

  it('retries missing routes and transient auth handoff failures', () => {
    expect(classifyPhoneSystemResponse(404, {})).toEqual({ status: 'unavailable', retry: true });
    expect(classifyPhoneSystemResponse(401, {})).toEqual({ status: 'unavailable', retry: true });
  });
});

describe('getPhoneSystemStatusRetryDelay', () => {
  it('backs off to a one-minute retry ceiling', () => {
    expect([0, 1, 2, 3, 4, 8].map(getPhoneSystemStatusRetryDelay))
      .toEqual([3_000, 6_000, 12_000, 24_000, 60_000, 60_000]);
  });
});
