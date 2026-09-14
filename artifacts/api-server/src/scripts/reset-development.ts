/**
 * Destructive development reset.
 *
 * This intentionally requires an explicit command guard. Replit-managed
 * identities remain with the provider; clearing local sessions and application
 * data makes the next login provision a fresh local account.
 */
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

function requireDevelopmentReset(): void {
  if (process.env.RESET_DEVELOPMENT !== "CONFIRM") {
    throw new Error("Refusing reset: set RESET_DEVELOPMENT=CONFIRM explicitly.");
  }
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
  requireDevelopmentReset();
  const database = await clearApplicationTables();
  console.log(JSON.stringify({
    ok: true,
    applicationTablesCleared: database.tables,
    estimatedRowsCleared: database.rows,
    preservedCatalogs: [...PRESERVED_TABLES].sort(),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});