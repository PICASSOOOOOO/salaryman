/**
 * Destructive development reset.
 *
 * This intentionally refuses live Clerk keys and requires an explicit command
 * guard. It deletes every development Clerk identity first, then clears local
 * application data while preserving boot catalogs and security configuration.
 */
import { createClerkClient } from "@clerk/backend";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const PRESERVED_TABLES = new Set([
  "art_assets",
  "blocked_email_domains",
  "bot_marketplace",
  "cities",
  "city_buildings",
  "cosmetic_catalog",
  "insurance_carriers",
  "merch_products",
  "music_tracks",
  "pledge_stock",
  "resource_nodes",
  "salaryman_seasons",
  "subway_stations",
  "system_config",
]);

function requireDevelopmentReset(): string {
  if (process.env.RESET_DEVELOPMENT !== "CONFIRM") {
    throw new Error("Refusing reset: set RESET_DEVELOPMENT=CONFIRM explicitly.");
  }
  const secretKey = process.env.CLERK_SECRET_KEY ?? "";
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Refusing reset: development reset requires a Clerk sk_test_ key.");
  }
  return secretKey;
}

async function deleteDevelopmentClerkUsers(secretKey: string): Promise<number> {
  const clerk = createClerkClient({ secretKey });
  let deleted = 0;

  // Always read page zero because deleting the current page shifts the next
  // users into its place.
  for (;;) {
    const page = await clerk.users.getUserList({ limit: 100, offset: 0 });
    if (page.data.length === 0) break;
    for (const user of page.data) {
      await clerk.users.deleteUser(user.id);
      deleted++;
    }
  }
  return deleted;
}

async function clearApplicationTables(): Promise<{ tables: number; rows: number }> {
  const result = await db.execute(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const tableNames = (result.rows as Array<{ tablename: string }>)
    .map((row) => row.tablename)
    .filter((name) => !PRESERVED_TABLES.has(name))
    .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));

  if (tableNames.length === 0) return { tables: 0, rows: 0 };

  const quoted = tableNames.map((name) => `"${name}"`).join(", ");
  const counts = await db.execute(sql.raw(
    `SELECT COALESCE(SUM(n_live_tup), 0)::bigint AS rows ` +
    `FROM pg_stat_user_tables WHERE schemaname = 'public' ` +
    `AND relname IN (${tableNames.map((name) => `'${name}'`).join(", ")})`,
  ));
  const rowsBefore = Number((counts.rows[0] as { rows?: string | number } | undefined)?.rows ?? 0);

  // All non-catalog tables are application/user state. CASCADE handles the
  // remaining FK graph in one transaction; preserved catalogs only reference
  // stable catalog values and are not in this truncate set.
  await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
  return { tables: tableNames.length, rows: rowsBefore };
}

async function main(): Promise<void> {
  const secretKey = requireDevelopmentReset();
  const clerkUsers = await deleteDevelopmentClerkUsers(secretKey);
  const database = await clearApplicationTables();
  console.log(JSON.stringify({
    ok: true,
    clerkUsersDeleted: clerkUsers,
    applicationTablesCleared: database.tables,
    estimatedRowsCleared: database.rows,
    preservedCatalogs: [...PRESERVED_TABLES].sort(),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});