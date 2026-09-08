import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  db,
  playerInventoryTable,
  playerLoadoutTable,
  playerInstalledItemsTable,
  bankAccountsTable,
  playerLedgerTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import itemsRouter from "../../routes/items";

// A throwaway player, unique per test file. The inventory / loadout / bank
// user_id columns are plain varchar with no hard FK, so we don't seed a
// `users` row — we just scope every created row by this id and delete them
// after the suite.
export const ITEMS_USER = {
  id: `test-items-${randomUUID()}`,
  email: "armory-tester@example.test",
};

// Mutable auth state the injected middleware reads on every request. Tests flip
// `authed` to false to exercise the 401 path, and swap `user` to act as the
// owner (free grants) vs. a normal player.
export const authState: { authed: boolean; user: { id: string; email: string } } = {
  authed: true,
  user: ITEMS_USER,
};

export function resetAuthState() {
  authState.authed = true;
  authState.user = ITEMS_USER;
}

// Build an Express app that mirrors the real mount: the items router lives
// under "/api" (its own paths are "/items/..."). A middleware injects the
// passport-style `req.isAuthenticated()` and `req.user` the route guards need.
export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => authState.authed;
    (req as unknown as { user: { id: string; email: string } }).user = authState.user;
    next();
  });
  app.use("/api", itemsRouter);
  return app;
}

// Give the player a single FIAT account with `balance` florins. With no
// player_ledger row the quarantine is 0, so the whole balance is spendable.
export async function seedFiat(balance: number): Promise<number> {
  const [acct] = await db
    .insert(bankAccountsTable)
    .values({
      userId: ITEMS_USER.id,
      kind: "checking",
      label: "Checking",
      balance,
      currency: "FIAT",
    })
    .returning({ id: bankAccountsTable.id });
  return acct.id;
}

// Sum the player's FIAT balance across accounts.
export async function fiatBalance(): Promise<number> {
  const accts = await db
    .select()
    .from(bankAccountsTable)
    .where(and(eq(bankAccountsTable.userId, ITEMS_USER.id), eq(bankAccountsTable.currency, "FIAT")));
  return accts.reduce((s, a) => s + (a.balance || 0), 0);
}

export async function ownedItemIds(slot = 0): Promise<string[]> {
  const rows = await db
    .select({ itemId: playerInventoryTable.itemId })
    .from(playerInventoryTable)
    .where(and(eq(playerInventoryTable.userId, ITEMS_USER.id), eq(playerInventoryTable.slotIndex, slot)));
  return rows.map((r) => r.itemId);
}

export async function loadoutRows(slot = 0) {
  return db
    .select()
    .from(playerLoadoutTable)
    .where(and(eq(playerLoadoutTable.userId, ITEMS_USER.id), eq(playerLoadoutTable.slotIndex, slot)));
}

// Current quantity of a stackable consumable (0 when the row is gone).
export async function itemQuantity(itemId: string, slot = 0): Promise<number> {
  const rows = await db
    .select({ quantity: playerInventoryTable.quantity })
    .from(playerInventoryTable)
    .where(and(
      eq(playerInventoryTable.userId, ITEMS_USER.id),
      eq(playerInventoryTable.slotIndex, slot),
      eq(playerInventoryTable.itemId, itemId),
    ));
  return rows.reduce((s, r) => s + (r.quantity || 0), 0);
}

export async function installedRows(slot = 0) {
  return db
    .select()
    .from(playerInstalledItemsTable)
    .where(and(
      eq(playerInstalledItemsTable.userId, ITEMS_USER.id),
      eq(playerInstalledItemsTable.slotIndex, slot),
    ));
}

// Wipe everything this user may have created so the suite is repeatable.
export async function cleanupTestData() {
  const id = ITEMS_USER.id;
  await Promise.allSettled([
    db.delete(playerInventoryTable).where(eq(playerInventoryTable.userId, id)),
    db.delete(playerLoadoutTable).where(eq(playerLoadoutTable.userId, id)),
    db.delete(playerInstalledItemsTable).where(eq(playerInstalledItemsTable.userId, id)),
    db.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, id)),
    db.delete(playerLedgerTable).where(eq(playerLedgerTable.userId, id)),
  ]);
}
