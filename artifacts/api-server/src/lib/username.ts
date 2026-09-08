import { db, usersTable } from "@workspace/db";
import { eq, sql, ne, and } from "drizzle-orm";

// Account-level @username rules. The handle is stored WITHOUT the leading "@".
// It is globally unique (case-insensitive), 3-32 chars, lowercase letters,
// digits and underscores, and must start with a letter.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 60;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export function isValidUsername(handle: string): boolean {
  return USERNAME_RE.test(handle);
}

export function usernameFormatError(): string {
  return `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters, start with a letter, and use only lowercase letters, numbers, and underscores`;
}

// Derive a base candidate from a user's name/email, then strip to legal chars.
function baseCandidate(firstName: string | null, lastName: string | null, email: string | null): string {
  const fromName = [firstName, lastName].filter(Boolean).join("").toLowerCase();
  const fromEmail = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  let base = (fromName || fromEmail || "user").replace(/[^a-z0-9]/g, "");
  if (!base) base = "user";
  if (!/^[a-z]/.test(base)) base = "u" + base;
  base = base.slice(0, USERNAME_MAX - 4);
  if (base.length < USERNAME_MIN) base = (base + "user").slice(0, USERNAME_MIN);
  return base;
}

// True if some OTHER user already owns this handle (case-insensitive).
export async function isUsernameTaken(handle: string, excludeUserId?: string): Promise<boolean> {
  const conds = [sql`lower(${usersTable.username}) = ${handle}`];
  if (excludeUserId) conds.push(ne(usersTable.id, excludeUserId));
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}

// Find an unused username starting from a derived base (base, base2, base3...).
export async function generateUniqueUsername(
  firstName: string | null,
  lastName: string | null,
  email: string | null,
): Promise<string> {
  const base = baseCandidate(firstName, lastName, email);
  let candidate = base;
  let suffix = 1;
  // Cap attempts; fall back to a random suffix if we somehow can't find one.
  for (let i = 0; i < 50; i++) {
    if (!(await isUsernameTaken(candidate))) return candidate;
    suffix += 1;
    candidate = `${base.slice(0, USERNAME_MAX - String(suffix).length)}${suffix}`;
  }
  return `${base.slice(0, USERNAME_MAX - 6)}${Math.floor(Math.random() * 100000)}`;
}

export type UsernameState = {
  username: string | null;
  usernameChangedAt: Date | null;
  canChangeAt: Date | null;
  canChangeNow: boolean;
};

function computeCanChange(usernameChangedAt: Date | null): { canChangeAt: Date | null; canChangeNow: boolean } {
  if (!usernameChangedAt) return { canChangeAt: null, canChangeNow: true };
  const unlock = new Date(usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  return { canChangeAt: unlock, canChangeNow: Date.now() >= unlock.getTime() };
}

// Read a user's username state, lazily assigning an initial handle (no cooldown
// consumed — usernameChangedAt stays null so the first explicit change is free).
export async function getOrInitUsername(userId: string): Promise<UsernameState> {
  const [row] = await db
    .select({
      username: usersTable.username,
      usernameChangedAt: usersTable.usernameChangedAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) {
    return { username: null, usernameChangedAt: null, canChangeAt: null, canChangeNow: true };
  }

  let username = row.username;
  if (!username) {
    const generated = await generateUniqueUsername(row.firstName, row.lastName, row.email);
    try {
      const [updated] = await db
        .update(usersTable)
        .set({ username: generated })
        .where(and(eq(usersTable.id, userId), sql`${usersTable.username} IS NULL`))
        .returning({ username: usersTable.username });
      username = updated?.username ?? generated;
    } catch {
      // Unique race: re-read whatever landed.
      const [re] = await db
        .select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      username = re?.username ?? null;
    }
  }

  const { canChangeAt, canChangeNow } = computeCanChange(row.usernameChangedAt);
  return { username, usernameChangedAt: row.usernameChangedAt, canChangeAt, canChangeNow };
}

export type ChangeUsernameResult =
  | { ok: true; state: UsernameState }
  | { ok: false; status: number; error: string; canChangeAt?: Date | null };

// Set or change a user's username, enforcing format, uniqueness and the
// 60-day cooldown. The first set (usernameChangedAt null) is always allowed.
export async function changeUsername(userId: string, rawHandle: string): Promise<ChangeUsernameResult> {
  const handle = normalizeUsername(rawHandle);
  if (!isValidUsername(handle)) {
    return { ok: false, status: 400, error: usernameFormatError() };
  }

  const [row] = await db
    .select({ username: usersTable.username, usernameChangedAt: usersTable.usernameChangedAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "User not found" };

  // No-op if unchanged.
  if (row.username && row.username.toLowerCase() === handle) {
    const { canChangeAt, canChangeNow } = computeCanChange(row.usernameChangedAt);
    return { ok: true, state: { username: row.username, usernameChangedAt: row.usernameChangedAt, canChangeAt, canChangeNow } };
  }

  // Cooldown only applies once a username has been explicitly changed before.
  if (row.usernameChangedAt) {
    const { canChangeAt, canChangeNow } = computeCanChange(row.usernameChangedAt);
    if (!canChangeNow) {
      return {
        ok: false,
        status: 429,
        error: `You can change your username again on ${canChangeAt?.toISOString().slice(0, 10)}`,
        canChangeAt,
      };
    }
  }

  if (await isUsernameTaken(handle, userId)) {
    return { ok: false, status: 409, error: "That username is already taken" };
  }

  const changedAt = new Date();
  try {
    await db.update(usersTable).set({ username: handle, usernameChangedAt: changedAt }).where(eq(usersTable.id, userId));
  } catch {
    return { ok: false, status: 409, error: "That username is already taken" };
  }

  const { canChangeAt, canChangeNow } = computeCanChange(changedAt);
  return { ok: true, state: { username: handle, usernameChangedAt: changedAt, canChangeAt, canChangeNow } };
}

// Resolve a user id from an @username (without the leading @). Returns null if
// no such user. Case-insensitive.
export async function resolveUserByUsername(rawHandle: string): Promise<{ id: string } | null> {
  const handle = normalizeUsername(rawHandle);
  if (!handle) return null;
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${handle}`)
    .limit(1);
  return row ?? null;
}
