import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  timeEntriesTable,
  businessTasksTable,
  announcementsTable,
  estimatesTable,
  vendorsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  updateBusinessTask,
  updateTimeEntry,
  createAnnouncement,
} from "../lib/business-ops-service";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

function uid(req: Request): string {
  return (req.user as { id: string }).id;
}

router.get("/business/time-entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.userId, uid(req))).orderBy(desc(timeEntriesTable.date), desc(timeEntriesTable.clockIn));
  res.json({ entries: rows });
});

router.post("/business/time-entries", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { employeeName, date, clockIn, clockOut, hoursWorked, hourlyRate, project, description, billable } = req.body;
  if (!employeeName || !date || !clockIn) return res.status(400).json({ error: "Missing required fields" });
  const [row] = await db.insert(timeEntriesTable).values({
    userId: uid(req), employeeName, date, clockIn, clockOut: clockOut || null,
    hoursWorked: hoursWorked || "0", hourlyRate: hourlyRate || "0",
    project: project || "", description: description || "", billable: billable !== false, status: clockOut ? "completed" : "active",
  }).returning();
  return res.json({ entry: row });
});

router.put("/business/time-entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const row = await updateTimeEntry(uid(req), Number(req.params.id), req.body);
  res.json({ entry: row });
});

router.delete("/business/time-entries/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db.delete(timeEntriesTable).where(and(eq(timeEntriesTable.id, Number(req.params.id)), eq(timeEntriesTable.userId, uid(req))));
  res.json({ ok: true });
});

router.get("/business/tasks", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(businessTasksTable).where(eq(businessTasksTable.userId, uid(req))).orderBy(desc(businessTasksTable.createdAt));
  res.json({ tasks: rows });
});

router.post("/business/tasks", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { title, description, status, priority, assignee, dueDate, project, tags } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  const [row] = await db.insert(businessTasksTable).values({
    userId: uid(req), title, description: description || "", status: status || "todo",
    priority: priority || "medium", assignee: assignee || "", dueDate: dueDate || null,
    project: project || "", tags: tags || "",
  }).returning();
  return res.json({ task: row });
});

router.put("/business/tasks/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const row = await updateBusinessTask(uid(req), Number(req.params.id), req.body);
  res.json({ task: row });
});

router.delete("/business/tasks/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db.delete(businessTasksTable).where(and(eq(businessTasksTable.id, Number(req.params.id)), eq(businessTasksTable.userId, uid(req))));
  res.json({ ok: true });
});

router.get("/business/announcements", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(announcementsTable).where(eq(announcementsTable.userId, uid(req))).orderBy(desc(announcementsTable.pinned), desc(announcementsTable.createdAt));
  res.json({ announcements: rows });
});

router.post("/business/announcements", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { title, content, category, pinned, authorName } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  const row = await createAnnouncement(uid(req), { title, content, category, pinned, authorName });
  return res.json({ announcement: row });
});

router.put("/business/announcements/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const k of ["title", "content", "category", "pinned", "authorName"]) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const [row] = await db.update(announcementsTable).set(updates).where(and(eq(announcementsTable.id, id), eq(announcementsTable.userId, uid(req)))).returning();
  res.json({ announcement: row });
});

router.delete("/business/announcements/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db.delete(announcementsTable).where(and(eq(announcementsTable.id, Number(req.params.id)), eq(announcementsTable.userId, uid(req))));
  res.json({ ok: true });
});

router.get("/business/estimates", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(estimatesTable).where(eq(estimatesTable.userId, uid(req))).orderBy(desc(estimatesTable.createdAt));
  res.json({ estimates: rows });
});

router.post("/business/estimates", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { clientName, clientEmail, estimateNumber, status, issueDate, expiryDate, subtotal, taxRate, total, notes, lineItems } = req.body;
  if (!clientName?.trim() || !issueDate) return res.status(400).json({ error: "Client name and issue date required" });
  const [row] = await db.insert(estimatesTable).values({
    userId: uid(req), clientName, clientEmail: clientEmail || "", estimateNumber: estimateNumber || "",
    status: status || "draft", issueDate, expiryDate: expiryDate || null,
    subtotal: subtotal || "0", taxRate: taxRate || "0", total: total || "0",
    notes: notes || "", lineItems: lineItems || "[]",
  }).returning();
  return res.json({ estimate: row });
});

router.put("/business/estimates/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const k of ["clientName", "clientEmail", "estimateNumber", "status", "issueDate", "expiryDate", "subtotal", "taxRate", "total", "notes", "lineItems"]) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const [row] = await db.update(estimatesTable).set(updates).where(and(eq(estimatesTable.id, id), eq(estimatesTable.userId, uid(req)))).returning();
  res.json({ estimate: row });
});

router.delete("/business/estimates/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db.delete(estimatesTable).where(and(eq(estimatesTable.id, Number(req.params.id)), eq(estimatesTable.userId, uid(req))));
  res.json({ ok: true });
});

router.get("/business/vendors", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.userId, uid(req))).orderBy(desc(vendorsTable.createdAt));
  res.json({ vendors: rows });
});

router.post("/business/vendors", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { name, contactName, email, phone, address, category, website, taxId, paymentTerms, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Vendor name required" });
  const [row] = await db.insert(vendorsTable).values({
    userId: uid(req), name, contactName: contactName || "", email: email || "", phone: phone || "",
    address: address || "", category: category || "general", website: website || "",
    taxId: taxId || "", paymentTerms: paymentTerms || "net-30", notes: notes || "",
  }).returning();
  return res.json({ vendor: row });
});

router.put("/business/vendors/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const k of ["name", "contactName", "email", "phone", "address", "category", "website", "taxId", "paymentTerms", "notes", "status"]) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const [row] = await db.update(vendorsTable).set(updates).where(and(eq(vendorsTable.id, id), eq(vendorsTable.userId, uid(req)))).returning();
  res.json({ vendor: row });
});

router.delete("/business/vendors/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  await db.delete(vendorsTable).where(and(eq(vendorsTable.id, Number(req.params.id)), eq(vendorsTable.userId, uid(req))));
  res.json({ ok: true });
});

export default router;
