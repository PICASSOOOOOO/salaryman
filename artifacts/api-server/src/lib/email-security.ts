import { db, blockedEmailDomainsTable, flaggedUsersTable, loginAttemptsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const BUILTIN_BLOCKED_DOMAINS = new Set([
  "privaterelay.appleid.com",
  "icloud.com.privaterelay",

  "guerrillamail.com", "guerrillamail.de", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "grr.la", "sharklasers.com", "guerrillamail.info",
  "mailinator.com", "mailinator2.com", "maildrop.cc",
  "tempmail.com", "temp-mail.org", "temp-mail.io",
  "throwaway.email", "throwawaymail.com",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "dispostable.com",
  "mailnesia.com",
  "trashmail.com", "trashmail.me", "trashmail.net", "trashmail.org",
  "fakeinbox.com",
  "mailcatch.com",
  "tempail.com",
  "tempr.email",
  "discard.email",
  "discardmail.com",
  "tempinbox.com",
  "mytemp.email",
  "mohmal.com",
  "burnermail.io",
  "10minutemail.com", "10minutemail.net",
  "minutemail.com",
  "emailondeck.com",
  "getnada.com",
  "mailsac.com",
  "harakirimail.com",
  "tmail.ws",
  "crazymailing.com",
  "mailnator.com",
  "emailfake.com",
  "tempmailer.com",
  "tempmailaddress.com",
  "emailtemporario.com.br",
  "sharklasers.com",
  "spam4.me",
  "binkmail.com",
  "bobmail.info",
  "chammy.info",
  "devnullmail.com",
  "letthemeatspam.com",
  "maildrop.cc",
  "mailexpire.com",
  "mailmoat.com",
  "nomail.xl.cx",
  "nospam.ze.tc",
  "spamgourmet.com",
  "tempomail.fr",
  "thankyou2010.com",
  "trashinbox.com",
  "trashymail.com",
  "uggsrock.com",
  "mailnull.com",
  "spamhole.com",
  "spamfree24.org",
  "jetable.org",
  "anonbox.net",
  "anonymbox.com",
  "emkei.cz",
  "mail-temporaire.fr",
  "courrieltemporaire.com",
  "getairmail.com",
  "filzmail.com",
  "inboxalias.com",
  "mytrashmail.com",
  "safetymail.info",
  "tempemail.net",
  "tempsky.com",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "einrot.com",
  "0-mail.com",
  "s0ny.net",
  "baxomale.ht.cx",
  "hulapla.de",
  "teleworm.us",
  "dayrep.com",
  "superrito.com",
  "armyspy.com",
  "cuvox.de",
  "jourrapide.com",
  "fleckens.hu",
  "gustr.com",
  "rhyta.com",
]);

const SUSPICIOUS_PATTERNS = [
  /^[a-z0-9]{16,}@/i,
  /privaterelay/i,
  /^temp[0-9]/i,
  /^test[0-9]{4,}/i,
  /noreply.*@/i,
  /^disposable/i,
  /^trash[0-9]/i,
  /^spam[0-9]/i,
  /^fake[0-9]/i,
  /^junk[0-9]/i,
];

let customBlockedDomains: Set<string> | null = null;
let lastDomainFetch = 0;
const DOMAIN_CACHE_TTL = 60_000;

async function getBlockedDomains(): Promise<Set<string>> {
  const now = Date.now();
  if (customBlockedDomains && now - lastDomainFetch < DOMAIN_CACHE_TTL) {
    return customBlockedDomains;
  }
  try {
    const rows = await db.select().from(blockedEmailDomainsTable).where(eq(blockedEmailDomainsTable.active, true));
    customBlockedDomains = new Set(rows.map(r => r.domain.toLowerCase()));
    lastDomainFetch = now;
    return customBlockedDomains;
  } catch (err: any) {
    console.error("[EmailSecurity] Failed to fetch blocked domains:", err.message);
    if (customBlockedDomains) return customBlockedDomains;
    return new Set();
  }
}

export function invalidateBlockedDomainsCache() {
  customBlockedDomains = null;
  lastDomainFetch = 0;
}

export interface EmailScreenResult {
  allowed: boolean;
  reason: string | null;
  severity: "block" | "flag" | "pass";
}

export async function screenEmail(email: string | null | undefined): Promise<EmailScreenResult> {
  if (!email) {
    return { allowed: false, reason: "no_email", severity: "block" };
  }

  const normalized = email.toLowerCase().trim();
  const parts = normalized.split("@");
  if (parts.length !== 2) {
    return { allowed: false, reason: "invalid_format", severity: "block" };
  }

  const domain = parts[1];

  if (BUILTIN_BLOCKED_DOMAINS.has(domain)) {
    return { allowed: false, reason: `blocked_domain:${domain}`, severity: "block" };
  }

  const customDomains = await getBlockedDomains();
  if (customDomains.has(domain)) {
    return { allowed: false, reason: `custom_blocked_domain:${domain}`, severity: "block" };
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: true, reason: `suspicious_pattern:${pattern.source}`, severity: "flag" };
    }
  }

  return { allowed: true, reason: null, severity: "pass" };
}

export async function logLoginAttempt(email: string | null, ip: string | null, blocked: boolean, reason: string | null) {
  try {
    await db.insert(loginAttemptsTable).values({
      email: email ?? null,
      ipAddress: ip ?? null,
      blocked,
      blockReason: reason,
    });
  } catch (err: any) {
    console.error("[EmailSecurity] Failed to log login attempt:", err.message);
  }
}

export async function flagUser(userId: string, email: string | null, reason: string, details: string | null) {
  try {
    const existing = await db.select().from(flaggedUsersTable)
      .where(and(eq(flaggedUsersTable.userId, userId), eq(flaggedUsersTable.reason, reason), eq(flaggedUsersTable.resolved, false)))
      .limit(1);
    if (existing.length > 0) return;
    await db.insert(flaggedUsersTable).values({
      userId,
      email,
      reason,
      details,
    });
  } catch (err: any) {
    console.error("[EmailSecurity] Failed to flag user:", err.message);
  }
}

export function getBuiltinBlockedDomainCount(): number {
  return BUILTIN_BLOCKED_DOMAINS.size;
}

export function isBuiltinBlocked(domain: string): boolean {
  return BUILTIN_BLOCKED_DOMAINS.has(domain.toLowerCase());
}
