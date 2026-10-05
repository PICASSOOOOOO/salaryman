import { db, leadNotesTable } from "@workspace/db";
import { and, eq, like, sql } from "drizzle-orm";

export async function createLeadNote(input: {
  leadId: number;
  userId: string;
  userName: string;
  note: string;
  dedupeKey?: string;
}) {
  const dedupeKey = input.dedupeKey?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  const marker = dedupeKey ? `[autopilot:${dedupeKey}]` : "";
  const values = {
    leadId: input.leadId,
    userId: input.userId,
    userName: input.userName,
    note: `${marker ? `${marker}\n` : ""}${input.note.trim()}`,
  };
  if (!dedupeKey) {
    const [created] = await db.insert(leadNotesTable).values(values).returning();
    if (!created) throw new Error("Lead note was not saved");
    return created;
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crm-lead-note:${dedupeKey}`}))`);
    const [existing] = await tx.select().from(leadNotesTable).where(and(
      eq(leadNotesTable.leadId, input.leadId),
      eq(leadNotesTable.userId, input.userId),
      like(leadNotesTable.note, `${marker}%`),
    )).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(leadNotesTable).values(values).returning();
    if (!created) throw new Error("Lead note was not saved");
    return created;
  });
}
