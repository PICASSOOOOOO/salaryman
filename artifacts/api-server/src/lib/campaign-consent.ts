export interface SmsMarketingPreference {
  smsOptIn: boolean;
  smsConsentedAt: Date | string | null;
  smsOptedOutAt: Date | string | null;
}

export function hasRecordedSmsMarketingPermission(
  preference: SmsMarketingPreference | null | undefined,
): boolean {
  return Boolean(preference?.smsOptIn && preference.smsConsentedAt && !preference.smsOptedOutAt);
}
