export function isFreeFeatureTesterEmail(
  email: string | undefined | null,
  rawAllowlist = process.env.SALARYMAN_FREE_FEATURE_EMAILS ?? "",
): boolean {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return rawAllowlist
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}

export function isOwnerEmailAddress(
  email: string | undefined | null,
  configuredOwnerEmails: string[],
  rawFeatureTesterAllowlist = process.env.SALARYMAN_FREE_FEATURE_EMAILS ?? "",
): boolean {
  if (!email || isFreeFeatureTesterEmail(email, rawFeatureTesterAllowlist)) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return configuredOwnerEmails.some(ownerEmail => ownerEmail.trim().toLowerCase() === normalizedEmail);
}
