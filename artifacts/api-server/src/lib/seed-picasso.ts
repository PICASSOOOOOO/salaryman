import { db, organizationsTable, orgMembersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const PICASSO_ORG_NAME = "PICASSO";
const SHADOW_TOWER = "Shadow Tower";

export async function seedPicassoOrg(): Promise<void> {
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(sql`lower(${organizationsTable.name}) = 'picasso'`);

  if (existing) {
    const updates: { isDeveloper?: boolean } = {};
    if (!existing.isDeveloper) {
      updates.isDeveloper = true;
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(organizationsTable)
        .set(updates)
        .where(eq(organizationsTable.id, existing.id));
      console.log("[Picasso Seed] Flagged existing Picasso org as developer org.");
    } else {
      console.log("[Picasso Seed] Picasso org already configured correctly.");
    }

    await db
      .update(orgMembersTable)
      .set({ spawnLocation: SHADOW_TOWER })
      .where(
        sql`${orgMembersTable.orgId} = ${existing.id} AND (${orgMembersTable.spawnLocation} IS NULL OR ${orgMembersTable.spawnLocation} != ${SHADOW_TOWER})`
      );
    return;
  }

  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: PICASSO_ORG_NAME,
      ownerUserId: "system",
      isDeveloper: true,
    })
    .returning();

  console.log(`[Picasso Seed] Created Picasso developer org (id=${org.id}).`);
}
