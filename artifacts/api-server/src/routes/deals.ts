import { Router, type IRouter } from "express";
import { db, dealsTable, contactsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: any, res: any): string | null {
  if (!req.isAuthenticated?.()) { res.status(401).json({ error: "Login required" }); return null; }
  return req.user?.id ?? null;
}

router.get("/tools/deals", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  try {
    const rows = await db.select().from(dealsTable)
      .where(eq(dealsTable.userId, userId))
      .orderBy(sql`${dealsTable.createdAt} DESC`);
    res.json({ deals: rows });
  } catch (e) { res.status(500).json({ error: "Failed to fetch deals" }); }
});

router.post("/tools/deals", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const { title, stage, value, contactId, expectedCloseDate, notes } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "Title required" }); return; }
  try {
    let contactName: string | null = null;
    if (contactId) {
      const [contact] = await db.select({ name: contactsTable.name })
        .from(contactsTable)
        .where(and(eq(contactsTable.id, Number(contactId)), eq(contactsTable.userId, userId)));
      contactName = contact?.name ?? null;
    }
    const [row] = await db.insert(dealsTable).values({
      userId,
      title: title.trim(),
      stage: stage ?? "Lead",
      value: value ?? null,
      contactId: contactId ? Number(contactId) : null,
      contactName,
      expectedCloseDate: expectedCloseDate ?? null,
      notes: notes ?? "",
    }).returning();
    res.status(201).json({ deal: row });
  } catch (e) { res.status(500).json({ error: "Failed to create deal" }); }
});

router.put("/tools/deals/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  const { title, stage, value, contactId, expectedCloseDate, notes, currentValue } = req.body;
  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (stage !== undefined) updates.stage = stage;
    if (value !== undefined) updates.value = value;
    if (expectedCloseDate !== undefined) updates.expectedCloseDate = expectedCloseDate;
    if (notes !== undefined) updates.notes = notes;
    if (contactId !== undefined) {
      updates.contactId = contactId ? Number(contactId) : null;
      if (contactId) {
        const [contact] = await db.select({ name: contactsTable.name })
          .from(contactsTable)
          .where(and(eq(contactsTable.id, Number(contactId)), eq(contactsTable.userId, userId)));
        updates.contactName = contact?.name ?? null;
      } else {
        updates.contactName = null;
      }
    }
    const [row] = await db.update(dealsTable).set(updates)
      .where(and(eq(dealsTable.id, id), eq(dealsTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json({ deal: row });
  } catch (e) { res.status(500).json({ error: "Failed to update deal" }); }
});

router.delete("/tools/deals/:id", async (req, res) => {
  const userId = requireAuth(req, res); if (!userId) return;
  const id = Number(req.params.id);
  try {
    await db.delete(dealsTable).where(and(eq(dealsTable.id, id), eq(dealsTable.userId, userId)));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Failed to delete deal" }); }
});

export default router;
