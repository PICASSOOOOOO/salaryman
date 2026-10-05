export function getOwnerEmailRecipients(): string[] {
  return [...new Set(
    (process.env.OWNER_EMAILS ?? "")
      .split(",")
      .map((recipient) => recipient.trim())
      .filter(Boolean),
  )];
}
