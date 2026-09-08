import { db, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Special, named characters that keep their identity and are NEVER given a
 * "Prime" surname. Matched case-insensitively by either marketplace slug or
 * the bot's display name.
 */
const SPECIAL_SLUGS = new Set(["pablo-assistant", "claw-bot", "rick-underboss"]);
const SPECIAL_NAMES = new Set(["PABLO", "JEAN CLAW", "RICK"]);

/**
 * Normalize any bot name to the SALARYMAN house format: a single first name
 * followed by the "Prime" surname (e.g. "PENNY" -> "Penny Prime",
 * "Sales Closer" -> "Sales Prime"). Idempotent — re-running on an already
 * primed name is a no-op. Special characters (Pablo, Jean Claw, Rick) are
 * returned unchanged.
 */
export function primeName(raw: string | null | undefined, slug?: string | null): string {
  const name = (raw ?? "").trim();
  if (!name) return name;
  if (slug && SPECIAL_SLUGS.has(slug.toLowerCase())) return name;
  if (SPECIAL_NAMES.has(name.toUpperCase())) return name;
  if (/\bprime$/i.test(name)) return name;

  const first = name.split(/\s+/)[0] ?? name;
  const titled = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `${titled} Prime`;
}

/**
 * One-time, idempotent normalization of existing live bots so every unit
 * (except the special characters) carries the "Prime" surname. Runs at boot
 * after the marketplace seed/activation chain.
 */
export async function normalizeBotPrimeNames(): Promise<void> {
  const bots = await db.select({ id: botsTable.id, name: botsTable.name }).from(botsTable);
  let renamed = 0;
  for (const bot of bots) {
    const next = primeName(bot.name);
    if (next && next !== bot.name) {
      await db.update(botsTable).set({ name: next }).where(eq(botsTable.id, bot.id));
      renamed++;
    }
  }
  if (renamed > 0) {
    console.log(`[Bot Naming] Normalized ${renamed} bot name(s) to "Firstname Prime".`);
  }
}
